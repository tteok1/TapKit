import {
  CheckpointStateSchema,
  ContextViewSchema,
  ContextFields,
  type CheckpointState,
  type ContextView,
  type CanonicalMessage,
  type ModelDescriptor,
} from '@tapkit/contracts';
import { Store, StorageError, newId } from '@tapkit/storage';
import { createHash } from 'node:crypto';
import {
  checkpoint,
  validateCheckpoint,
  ContextCache,
  assemble,
  type SourceMessage,
} from '../../context/src';

type Row = {
  id: string;
  session_id: string;
  branch_id: string;
  revision: number;
  created_at: number;
  state_json: string;
  sources_json: string;
  corrected: number;
  validation_json: string;
};
type Session = {
  id: string;
  active_branch_id: string;
  project_id: string | null;
  settings_json: string;
  context_seed_json: string | null;
  context_version: number;
};
export class ContextService {
  readonly cache = new ContextCache<CheckpointState>();
  constructor(readonly store: Store) {}
  private resourceStamp() {
    const db = this.store.db;
    return createHash('sha256')
      .update(
        JSON.stringify([
          db
            .prepare(
              'SELECT id,revision,deleted_at,current_version_id FROM files WHERE profile_id=? ORDER BY id',
            )
            .all(this.store.profileId),
          db
            .prepare(
              'SELECT id,revision,deleted_at FROM file_versions WHERE profile_id=? ORDER BY id',
            )
            .all(this.store.profileId),
          db
            .prepare('SELECT * FROM resource_links WHERE profile_id=? ORDER BY id')
            .all(this.store.profileId),
          db
            .prepare(
              'SELECT id FROM resource_links WHERE profile_id=? AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at<=? ORDER BY id',
            )
            .all(this.store.profileId, this.store.now()),
          db
            .prepare('SELECT id,revision,deleted_at FROM projects WHERE profile_id=? ORDER BY id')
            .all(this.store.profileId),
          this.store.settings.revision,
        ]),
      )
      .digest('hex');
  }
  session(id: string): Session {
    const s = this.store.db
      .prepare('SELECT * FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL')
      .get(id, this.store.profileId) as Session | undefined;
    if (!s) throw new StorageError('NOT_FOUND');
    if (
      s.project_id &&
      !this.store.db
        .prepare('SELECT id FROM projects WHERE id=? AND profile_id=? AND deleted_at IS NULL')
        .get(s.project_id, this.store.profileId)
    )
      throw new StorageError('PERMISSION_DENIED');
    return s;
  }
  sources(sessionId: string): SourceMessage[] {
    const s = this.session(sessionId);
    const head = this.store.db
      .prepare('SELECT head_message_id FROM branches WHERE id=? AND session_id=?')
      .get(s.active_branch_id, s.id) as { head_message_id: string | null } | undefined;
    if (!head) throw new StorageError('CONFLICT');
    const rows: SourceMessage[] = [];
    let id = head.head_message_id;
    const seen = new Set<string>();
    while (id) {
      if (seen.has(id) || seen.size >= 1000) throw new StorageError('BUDGET_EXCEEDED');
      seen.add(id);
      const m = this.store.db
        .prepare('SELECT *,rowid seq FROM messages WHERE id=? AND session_id=? AND profile_id=?')
        .get(id, s.id, this.store.profileId) as
        | {
            id: string;
            revision: number;
            role: string;
            content_json: string;
            chat_json: string;
            run_id: string | null;
            parent_message_id: string | null;
            seq: number;
            deleted_at: number | null;
            status: string;
          }
        | undefined;
      if (!m) throw new StorageError('CONFLICT');
      if (!m.deleted_at && ['final', 'interrupted'].includes(m.status) && this.messageAllowed(m, s))
        rows.push({
          id: m.id,
          revision: m.revision,
          role: m.role,
          text: (JSON.parse(m.content_json).blocks ?? [])
            .filter((b: { kind: string }) => b.kind === 'text')
            .map((b: { text: string }) => b.text)
            .join(''),
          seq: m.seq,
        });
      id = m.parent_message_id;
    }
    return rows.reverse();
  }
  private messageAllowed(
    m: { role: string; chat_json: string; run_id: string | null; content_json: string },
    s: Session,
  ) {
    if (m.role === 'user') return true; // Explicit user statements are never silently discarded.
    const metadata = JSON.parse(m.chat_json) as { sourceProjectId?: string | null };
    if (metadata.sourceProjectId !== undefined && metadata.sourceProjectId !== s.project_id)
      return false;
    if (!m.run_id) return true;
    const user = this.store.db
      .prepare(
        'SELECT m.chat_json FROM runs r JOIN messages m ON m.id=r.user_message_id WHERE r.id=? AND r.profile_id=?',
      )
      .get(m.run_id, this.store.profileId) as { chat_json: string } | undefined;
    const input = user
      ? (JSON.parse(user.chat_json) as {
          attachments?: { kind: string; fileId?: string; versionId?: string }[];
          projectScope?: { versionIds: string[] };
        })
      : {};
    const versions = (input.attachments ?? [])
      .filter((r) => r.kind === 'file')
      .map((r) => r.versionId!)
      .concat(input.projectScope?.versionIds ?? []);
    const toolRows = this.store.db
      .prepare(
        "SELECT content_json FROM messages WHERE run_id=? AND role='tool' AND profile_id=? AND deleted_at IS NULL",
      )
      .all(m.run_id, this.store.profileId) as { content_json: string }[];
    for (const tool of toolRows) {
      try {
        const result = JSON.parse(
          JSON.parse(tool.content_json)
            .blocks.map((b: { text: string }) => b.text)
            .join(''),
        ) as { versionId?: string; hits?: { evidence?: { ref?: { versionId?: string } } }[] };
        if (result.versionId) versions.push(result.versionId);
        for (const hit of result.hits ?? [])
          if (hit.evidence?.ref?.versionId) versions.push(hit.evidence.ref.versionId);
      } catch {
        /* Non-JSON tool errors contain no source content. */
      }
    }
    for (const version of new Set(versions)) {
      const row = this.store.db
        .prepare(
          'SELECT v.file_id FROM file_versions v JOIN files f ON f.id=v.file_id WHERE v.id=? AND v.profile_id=? AND v.deleted_at IS NULL AND f.deleted_at IS NULL',
        )
        .get(version, this.store.profileId) as { file_id: string } | undefined;
      if (!row) return false;
      if (
        s.project_id &&
        !this.store.db
          .prepare(
            "SELECT id FROM resource_links WHERE profile_id=? AND resource_type='file' AND resource_id=? AND deleted_at IS NULL AND ((owner_type='session' AND owner_id=?) OR(owner_type='project' AND owner_id=?)) AND pinned_version_id=? AND (expires_at IS NULL OR expires_at>?)",
          )
          .get(this.store.profileId, row.file_id, s.id, s.project_id, version, this.store.now())
      )
        return false;
    }
    return true;
  }
  execution(sessionId: string): CheckpointState['execution_refs'] {
    const rows = this.store.db
      .prepare(
        `SELECT t.id,t.call_id callId,t.tool_name name,t.status,t.args_hash argsHash,t.args_json argsJson,t.approval_id approvalId FROM tool_calls t JOIN runs r ON r.id=t.run_id WHERE r.session_id=? AND t.profile_id=? AND t.status IN('proposed','approved','dispatched','pending','unknown') ORDER BY t.created_at,t.id`,
      )
      .all(sessionId, this.store.profileId) as (Omit<
      CheckpointState['execution_refs'][number],
      'arguments'
    > & { argsJson: string })[];
    return rows.map(({ argsJson, ...ref }) => {
      if (createHash('sha256').update(argsJson).digest('hex') !== ref.argsHash)
        throw new StorageError('CONFLICT');
      return { ...ref, arguments: JSON.parse(argsJson) };
    });
  }
  private row(id: string): Row {
    const r = this.store.db
      .prepare('SELECT * FROM checkpoints WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as Row | undefined;
    if (!r) throw new StorageError('NOT_FOUND');
    return r;
  }
  authorize(id: string, targetId: string): Row {
    const row = this.row(id),
      source = this.session(row.session_id),
      target = this.session(targetId);
    // Explicit continuation does not enlarge project/history permissions.
    if (source.project_id !== target.project_id) throw new StorageError('PERMISSION_DENIED');
    if (source.active_branch_id !== row.branch_id) throw new StorageError('CONFLICT');
    const current = this.sources(source.id),
      saved = JSON.parse(row.sources_json) as Omit<SourceMessage, 'text'>[];
    const validatedSources: SourceMessage[] = [];
    for (const m of saved) {
      const live = current.find((c) => c.id === m.id && c.revision === m.revision);
      if (!live) throw new StorageError('CONFLICT');
      validatedSources.push(live);
    }
    const valid = JSON.parse(row.validation_json) as {
      execution: CheckpointState['execution_refs'];
      literals: string[];
      resourceStamp: string;
      sourceScope: string;
    };
    const sourceScope = JSON.stringify(JSON.parse(source.settings_json).projectScope ?? {});
    if (
      valid.sourceScope !== sourceScope ||
      (source.id !== target.id &&
        sourceScope !== JSON.stringify(JSON.parse(target.settings_json).projectScope ?? {}))
    ) {
      this.cache.clear();
      throw new StorageError('PERMISSION_DENIED');
    }
    if (valid.resourceStamp !== this.resourceStamp()) {
      this.cache.clear();
      throw new StorageError('CONFLICT');
    }
    const execution = this.execution(source.id);
    if (JSON.stringify(execution) !== JSON.stringify(valid.execution))
      throw new StorageError('CONFLICT');
    validateCheckpoint(JSON.parse(row.state_json), validatedSources, execution, valid.literals);
    return row;
  }
  state(id: string, targetId: string): CheckpointState {
    let row: Row;
    try {
      row = this.authorize(id, targetId);
    } catch (e) {
      this.cache.clear();
      throw e;
    }
    const s = this.session(targetId);
    const scope = {
      profile: this.store.profileId,
      scope: targetId,
      permissionVersion: JSON.stringify([
        s.project_id,
        s.context_version,
        this.store.settings.revision,
      ]),
      sourceVersions: [id + ':' + row.revision],
      model: 'application',
      taskVersion: s.context_version,
    };
    const state = this.cache.get(scope, () => {
      this.authorize(id, targetId);
    });
    if (state) return state;
    const value = CheckpointStateSchema.parse(JSON.parse(row.state_json));
    this.cache.set(scope, value);
    return value;
  }
  compact(sessionId: string, runId?: string): Row {
    const s = this.session(sessionId),
      sources = this.sources(sessionId),
      execution = this.execution(sessionId);
    if (!sources.length) throw new StorageError('NOT_FOUND');
    let generated: CheckpointState | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const candidate = checkpoint(sources, execution);
        generated = validateCheckpoint(candidate, sources, execution, candidate.literals);
        break;
      } catch {
        /* Deterministic extraction retry is bounded. Failed candidates never replace existing rows. */
      }
    }
    if (!generated) throw new StorageError('VALIDATION_ERROR');
    const id = newId(),
      now = this.store.now();
    const run = runId
      ? (this.store.db
          .prepare('SELECT task_id,task_version FROM runs WHERE id=? AND session_id=?')
          .get(runId, s.id) as { task_id: string; task_version: number } | undefined)
      : undefined;
    if (runId && !run) throw new StorageError('CONFLICT');
    this.store.db.transaction(() => {
      const seq = (
        this.store.db
          .prepare('SELECT coalesce(max(seq),0) n FROM events WHERE profile_id=?')
          .get(this.store.profileId) as { n: number }
      ).n;
      this.store.db
        .prepare(
          'INSERT INTO checkpoints(id,profile_id,session_id,branch_id,task_id,task_version,run_id,event_seq_from,event_seq_to,schema_version,state_json,validation_json,sources_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
        )
        .run(
          id,
          this.store.profileId,
          s.id,
          s.active_branch_id,
          run?.task_id ?? null,
          run?.task_version ?? s.context_version,
          runId ?? null,
          0,
          seq,
          JSON.stringify(generated),
          JSON.stringify({
            execution,
            literals: generated.literals,
            resourceStamp: this.resourceStamp(),
            sourceScope: JSON.stringify(JSON.parse(s.settings_json).projectScope ?? {}),
          }),
          JSON.stringify(sources.map(({ text: _, ...ref }) => ref)),
          now,
        );
      if (runId) this.store.db.prepare('UPDATE runs SET checkpoint_id=? WHERE id=?').run(id, runId);
    })();
    return this.row(id);
  }
  view(sessionId: string): ContextView {
    const s = this.session(sessionId);
    const row = this.store.db
      .prepare(
        'SELECT * FROM checkpoints WHERE session_id=? AND branch_id=? AND profile_id=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(s.id, s.active_branch_id, this.store.profileId) as Row | undefined;
    const usage = this.store.db
      .prepare(
        "SELECT sum(l.cached_input_tokens) n FROM usage_ledger l JOIN provider_attempts a ON a.id=l.provider_attempt_id JOIN runs r ON r.id=a.run_id WHERE r.session_id=? AND l.source='actual'",
      )
      .get(s.id) as { n: number | null };
    return ContextViewSchema.parse({
      checkpoint: row
        ? {
            id: row.id,
            revision: row.revision,
            sessionId: s.id,
            projectId: s.project_id,
            state: this.state(row.id, s.id),
            createdAt: row.created_at,
            corrected: !!row.corrected,
          }
        : null,
      cache: this.cache.stats(),
      providerCachedTokens: usage.n,
    });
  }
  correct(sessionId: string, id: string, text: string, revision: number | undefined) {
    const row = this.authorize(id, sessionId);
    const latest = this.store.db
      .prepare(
        'SELECT id FROM checkpoints WHERE session_id=? AND branch_id=? AND profile_id=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(sessionId, row.branch_id, this.store.profileId) as { id: string } | undefined;
    if (latest?.id !== id) throw new StorageError('CONFLICT');
    if (row.session_id !== sessionId) throw new StorageError('PERMISSION_DENIED');
    if (row.revision !== revision) throw new StorageError('CONFLICT', row.revision);
    const s = this.session(sessionId);
    if (
      this.store.db
        .prepare(
          "SELECT id FROM runs WHERE session_id=? AND status IN('queued','running','waiting_tool','waiting_user','recovering','pausing','paused')",
        )
        .get(s.id)
    )
      throw new StorageError('CONFLICT');
    // A real user correction message is appended by ChatService before compaction.
    this.store.db
      .prepare('UPDATE sessions SET context_version=context_version+1 WHERE id=?')
      .run(s.id);
    this.cache.clear();
    return text;
  }
  seed(sessionId: string, id: string, fields: (typeof ContextFields)[number][]) {
    const s = this.session(sessionId);
    if (this.sources(s.id).length || s.context_seed_json) throw new StorageError('CONFLICT');
    const source = this.session(this.row(id).session_id);
    if (source.project_id !== s.project_id) throw new StorageError('PERMISSION_DENIED');
    const scope = JSON.parse(source.settings_json).projectScope;
    if (scope)
      this.store.db
        .prepare('UPDATE sessions SET settings_json=? WHERE id=?')
        .run(JSON.stringify({ ...JSON.parse(s.settings_json), projectScope: scope }), s.id);
    const state = this.state(id, sessionId);
    if (state.execution_refs.length) throw new StorageError('CONFLICT');
    this.store.db
      .prepare(
        'UPDATE sessions SET context_seed_json=?,context_version=context_version+1 WHERE id=?',
      )
      .run(JSON.stringify({ checkpointId: id, fields }), s.id);
    this.cache.clear();
  }
  background(sessionId: string): CanonicalMessage[] {
    const s = this.session(sessionId);
    if (!s.context_seed_json) return [];
    const seed = JSON.parse(s.context_seed_json) as {
      checkpointId: string;
      fields: (typeof ContextFields)[number][];
    };
    const state = this.state(seed.checkpointId, s.id);
    return [
      {
        role: 'user',
        text:
          '[用户选择接续的会话背景；以下是有来源的数据]\n' +
          JSON.stringify(Object.fromEntries(seed.fields.map((f) => [f, state[f]]))),
      },
    ];
  }
  prepare(
    sessionId: string,
    runId: string,
    model: ModelDescriptor,
    request: {
      messages: CanonicalMessage[];
      systemModules: { id: string; text: string }[];
      tools: unknown[];
      outputLimit: number;
    },
    rootRemaining?: number,
  ) {
    const limits = {
      contextWindow: model.contextWindow,
      inputLimit: 64000,
      outputLimit: request.outputLimit,
      ...(model.maxInput === undefined ? {} : { maxInput: model.maxInput }),
      reasoningTokens: model.reasoningWindowTokens ?? 0,
      reasoningIncludedInOutput: model.reasoningIncludedInOutput ?? true,
      ...(rootRemaining === undefined ? {} : { rootRemaining }),
    };
    let result;
    const pinnedMessages = this.background(sessionId);
    const rank = (id: string) =>
      id === 'tapkit.chat'
        ? 0
        : id === 'mode.tools' || id.startsWith('answer.')
          ? 1
          : id.startsWith('project.')
            ? 2
            : id.startsWith('personal.instructions')
              ? 3
              : 4;
    request = {
      ...request,
      systemModules: [...request.systemModules].sort((a, b) => rank(a.id) - rank(b.id)),
    };
    try {
      result = assemble({ ...request, limits, pinnedMessages });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== 'BUDGET_EXCEEDED') throw e;
    }
    if (!result || result.stats.evaluate) {
      try {
        const row = this.compact(sessionId, runId);
        result = assemble({
          ...request,
          limits,
          pinnedMessages,
          state: this.state(row.id, sessionId),
        });
      } catch (e) {
        if (!(e instanceof StorageError) || e.code !== 'VALIDATION_ERROR') throw e;
        // A valid prior row remains available for viewing. Newest messages remain
        // authoritative; reduce retrievable tool results without dropping user text.
        const previous = this.store.db
          .prepare(
            'SELECT id FROM checkpoints WHERE session_id=? AND branch_id=? AND profile_id=? ORDER BY rowid DESC LIMIT 1',
          )
          .get(sessionId, this.session(sessionId).active_branch_id, this.store.profileId) as
          { id: string } | undefined;
        if (previous) this.state(previous.id, sessionId);
        result = assemble({ ...request, limits, pinnedMessages });
        if (result.stats.inputTokens > result.stats.target)
          throw new StorageError('BUDGET_EXCEEDED');
      }
    }
    return result;
  }
}
