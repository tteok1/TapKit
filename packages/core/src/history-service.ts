import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import {
  z,
  RequestSchema,
  ReplySchema,
  HistorySessionSchema,
  HistoryLocationInputSchema,
  SessionPageInputSchema,
  SessionUpdateSchema,
  SessionBatchSchema,
  SessionCopySchema,
  MessageEditSchema,
  MessageRegenerateSchema,
  BranchSwitchSchema,
  MessageDeleteSchema,
  MessageMarkSchema,
  MessageTransformSchema,
  MessageNoteSchema,
  SectionCreateSchema,
  SectionUpdateSchema,
  SectionRemoveSchema,
  SidebarMoveSchema,
  SidebarReorderSchema,
  SearchInputSchema,
  SearchClearSchema,
  SessionRecordSchema,
  SessionDetailsSchema,
  SessionPageSchema,
  SidebarViewSchema,
  SearchPageSchema,
  SearchHistorySchema,
  IdSchema,
  type Request,
  type Reply,
} from '@tapkit/contracts';
import {
  Store,
  BlobStore,
  FileRepository,
  StorageError,
  failure,
  newId,
  eraseSessionContent,
  eraseMessageContent,
} from '@tapkit/storage';
import type { ChatService } from './chat-service';
type Session = {
  id: string;
  revision: number;
  title: string;
  mode: 'chat' | 'work';
  active_branch_id: string;
  project_id: string | null;
  archived_at: number | null;
  deleted_at: number | null;
  pinned_at: number | null;
  unread_event_seq: number;
  updated_at: number;
  tags_json: string;
  note: string;
};
type Message = {
  id: string;
  session_id: string;
  branch_id: string;
  parent_message_id: string | null;
  role: string;
  content_json: string;
  chat_json: string;
  revision: number;
  status: string;
  run_id: string | null;
  source_message_id: string | null;
};
export const messageText = (row: { content_json: string }) =>
  (JSON.parse(row.content_json).blocks as { text: string }[]).map((b) => b.text).join('\n');
const liveStates = "('completed','partial','failed','budget_stopped','cancelled')";
export class HistoryService {
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
    readonly chat: ChatService,
    readonly temporary = false,
    readonly disposeNative?: (sessionId: string) => Promise<void>,
  ) {}
  private ok(r: Request, data: unknown, revision?: number): Reply {
    return ReplySchema.parse({
      ok: true,
      requestId: r.requestId,
      data,
      ...(revision ? { revision } : {}),
    });
  }
  session(id: string, deleted = false) {
    const row = this.store.db
      .prepare(
        "SELECT * FROM sessions WHERE id=? AND profile_id=? AND NOT EXISTS(SELECT 1 FROM deletion_tombstones d WHERE d.entity_type='session' AND d.entity_id=sessions.id AND d.profile_id=sessions.profile_id)" +
          (deleted ? '' : ' AND deleted_at IS NULL'),
      )
      .get(id, this.store.profileId) as Session | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private message(sessionId: string, id: string) {
    this.session(sessionId);
    const row = this.store.db
      .prepare(
        'SELECT * FROM messages WHERE id=? AND session_id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(id, sessionId, this.store.profileId) as Message | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private idle(id: string) {
    if (this.running(id)) throw new StorageError('CONFLICT');
  }
  private running(id: string) {
    return !!this.store.db
      .prepare(`SELECT id FROM runs WHERE session_id=? AND status NOT IN ${liveStates} LIMIT 1`)
      .get(id);
  }
  private revision(r: Request, s: Session) {
    if (r.expectedRevision === undefined) throw new StorageError('VALIDATION_ERROR');
    if (r.expectedRevision !== s.revision) throw new StorageError('CONFLICT', s.revision);
  }
  private changed(id: string) {
    this.store.emit('workspace.updated', { kind: 'workspace', entityId: id });
  }
  record(s: Session) {
    return SessionRecordSchema.parse({
      id: s.id,
      title: s.title,
      mode: s.mode,
      revision: s.revision,
      branchId: s.active_branch_id,
      projectId: s.project_id,
      pinned: s.pinned_at !== null,
      unread: s.unread_event_seq > 0,
      running: this.running(s.id),
      temporary: this.temporary,
      updatedAt: s.updated_at,
      archivedAt: s.archived_at,
      deletedAt: s.deleted_at,
      tags: JSON.parse(s.tags_json),
      note: s.note,
    });
  }
  private path(sessionId: string, head: string | null) {
    const rows: Message[] = [];
    const seen = new Set<string>();
    while (head) {
      if (seen.has(head) || rows.length >= 1000) throw new StorageError('BUDGET_EXCEEDED');
      seen.add(head);
      const m = this.message(sessionId, head);
      rows.unshift(m);
      head = m.parent_message_id;
    }
    return rows;
  }
  private branch(
    s: Session,
    label: string,
    rows: Message[],
    targetSession = s.id,
    attachments = true,
    candidate: string | null = null,
    forkMessageId: string | null = rows.at(-1)?.id ?? null,
  ) {
    const branch = newId(),
      now = this.store.now();
    this.store.db
      .prepare(
        'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,parent_branch_id,label,candidate_for_message_id,fork_message_id) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        branch,
        this.store.profileId,
        now,
        now,
        targetSession,
        targetSession === s.id ? s.active_branch_id : null,
        label,
        candidate,
        forkMessageId,
      );
    let parent: string | null = null;
    for (const m of rows) {
      const id = newId(),
        metadata = JSON.parse(m.chat_json);
      // Preserve display provenance, never copy client request identities/native protocol state.
      delete metadata.payloadHash;
      if (!attachments) metadata.attachments = [];
      this.store.db
        .prepare(
          'INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,parent_message_id,role,content_json,status,run_id,chat_json,source_message_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          this.store.profileId,
          now,
          now,
          targetSession,
          branch,
          parent,
          m.role,
          m.content_json,
          m.status === 'streaming' ? 'interrupted' : m.status,
          m.run_id,
          JSON.stringify(metadata),
          m.source_message_id ?? m.id,
        );
      parent = id;
    }
    this.store.db.prepare('UPDATE branches SET head_message_id=? WHERE id=?').run(parent, branch);
    this.store.db
      .prepare('UPDATE sessions SET active_branch_id=?,revision=revision+1,updated_at=? WHERE id=?')
      .run(branch, now, targetSession);
    return { branch, head: parent };
  }
  private list(raw: unknown) {
    const p = SessionPageInputSchema.parse(raw),
      clauses = [
        's.profile_id=?',
        "NOT EXISTS(SELECT 1 FROM deletion_tombstones d WHERE d.entity_type='session' AND d.entity_id=s.id AND d.profile_id=s.profile_id)",
      ],
      args: (string | number | null)[] = [this.store.profileId];
    clauses.push(p.state === 'trash' ? 's.deleted_at IS NOT NULL' : 's.deleted_at IS NULL');
    if (p.state === 'active') clauses.push('s.archived_at IS NULL');
    if (p.state === 'archived') clauses.push('s.archived_at IS NOT NULL');
    if (p.projectId) {
      this.project(p.projectId);
      clauses.push('s.project_id=?');
      args.push(p.projectId);
    }
    if (p.mode) {
      clauses.push('s.mode=?');
      args.push(p.mode);
    }
    if (p.sectionId) {
      this.section(p.sectionId);
      clauses.push('i.section_id=?');
      args.push(p.sectionId);
    }
    if (p.pinned !== undefined)
      clauses.push(p.pinned ? 's.pinned_at IS NOT NULL' : 's.pinned_at IS NULL');
    const signature = createHash('sha256')
      .update(JSON.stringify({ ...p, cursor: undefined }))
      .digest('hex');
    let offset = 0;
    if (p.cursor) {
      const c = z
        .strictObject({
          offset: z.number().int().nonnegative().max(1_000_000),
          signature: z.string(),
        })
        .parse(JSON.parse(Buffer.from(p.cursor, 'base64url').toString()));
      if (c.signature !== signature) throw new StorageError('VALIDATION_ERROR');
      offset = c.offset;
    }
    const rows = this.store.db
      .prepare(
        `SELECT s.* FROM sessions s LEFT JOIN sidebar_items i ON i.entity_id=s.id AND i.entity_type='session' AND i.profile_id=s.profile_id WHERE ${clauses.join(' AND ')} ORDER BY s.pinned_at DESC,coalesce(i.sort_key,0),s.last_activity_at DESC,s.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, p.limit + 1, offset) as Session[];
    return SessionPageSchema.parse({
      sessions: rows.slice(0, p.limit).map((s) => this.record(s)),
      nextCursor:
        rows.length > p.limit
          ? Buffer.from(JSON.stringify({ offset: offset + p.limit, signature })).toString(
              'base64url',
            )
          : null,
    });
  }
  private project(id: string) {
    const p = this.store.db
      .prepare(
        'SELECT id,instructions,revision FROM projects WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(id, this.store.profileId) as
      { id: string; instructions: string; revision: number } | undefined;
    if (!p) throw new StorageError('PERMISSION_DENIED');
    return p;
  }
  private section(id: string) {
    const p = this.store.db
      .prepare('SELECT * FROM sidebar_sections WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as { id: string; revision: number } | undefined;
    if (!p) throw new StorageError('NOT_FOUND');
    return p;
  }
  private details(id: string) {
    const s = this.session(id);
    return SessionDetailsSchema.parse({
      session: this.record(s),
      branches: this.store.db
        .prepare(
          'SELECT id,label,parent_branch_id AS parentId,candidate_for_message_id AS candidateFor FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1000',
        )
        .all(id),
      marks: (
        this.store.db
          .prepare(
            'SELECT * FROM message_marks WHERE profile_id=? AND message_id IN (SELECT id FROM messages WHERE session_id=? AND deleted_at IS NULL) LIMIT 1000',
          )
          .all(this.store.profileId, id) as {
          message_id: string;
          bookmark: number;
          rating: string | null;
          note: string;
          report: number;
        }[]
      ).map((m) => ({
        messageId: m.message_id,
        bookmark: !!m.bookmark,
        rating: m.rating,
        note: m.note,
        report: !!m.report,
      })),
      projectRules: s.project_id ? this.project(s.project_id).instructions : '',
    });
  }
  private search(raw: unknown) {
    const p = SearchInputSchema.parse(raw);
    if (this.temporary) throw new StorageError('PERMISSION_DENIED');
    if (p.scope.type === 'project') this.project(p.scope.id!);
    if (p.scope.type === 'session') this.session(p.scope.id!);
    if (p.query.length < 3 && p.scope.type === 'all') throw new StorageError('VALIDATION_ERROR');
    const filter = createHash('sha256')
      .update(JSON.stringify({ ...p, cursor: undefined }))
      .digest('hex');
    let offset = 0;
    if (p.cursor) {
      const c = z
        .strictObject({ offset: z.number().int().nonnegative().max(1_000_000), filter: z.string() })
        .parse(JSON.parse(Buffer.from(p.cursor, 'base64url').toString()));
      if (c.filter !== filter) throw new StorageError('VALIDATION_ERROR');
      offset = c.offset;
    }
    const fts = p.query.length >= 3,
      relevance = fts && p.sort === 'relevance',
      materializeMatches = fts && !relevance,
      match = '"' + p.query.replaceAll('"', '""') + '"',
      where = ['f.profile_id=?', `f.entity_type IN (${p.types.map(() => '?').join(',')})`],
      args: (string | number)[] = [this.store.profileId, ...p.types];
    if (!fts) {
      where.push('(instr(lower(f.title),lower(?))>0 OR instr(lower(f.body),lower(?))>0)');
      args.push(p.query, p.query);
    }
    if (p.scope.type === 'project') {
      where.push('f.project_id=?');
      args.push(p.scope.id!);
    }
    if (p.scope.type === 'session') {
      where.push('f.session_id=?');
      args.push(p.scope.id!);
    }
    if (p.scope.type === 'file') {
      where.push("f.entity_type='file' AND f.entity_id=?");
      args.push(p.scope.id!);
    }
    where.push(
      '(f.session_id IS NULL OR (s.id IS NOT NULL AND s.deleted_at IS NULL' +
        (p.archived ? '' : ' AND s.archived_at IS NULL') +
        '))',
    );
    where.push(
      "(f.entity_type<>'file' OR EXISTS(SELECT 1 FROM files x WHERE x.id=f.entity_id AND x.profile_id=f.profile_id AND x.deleted_at IS NULL))",
    );
    type SearchRow = {
      entity_id: string;
      entity_type: string;
      title: string;
      body: string;
      session_id: string | null;
      branch_id: string | null;
      updated_at: number;
    };
    const visible = `LEFT JOIN sessions s ON s.id=f.session_id AND s.profile_id=f.profile_id WHERE ${where.join(' AND ')}`;
    let rows: SearchRow[];
    if (relevance) {
      // Score once before joining entity metadata. Retain every tie at the
      // cutoff, then apply visibility and the original score/time/id order.
      const ranked = this.store.db.prepare(
        `WITH matches AS MATERIALIZED (SELECT rowid,bm25(history_fts) AS score FROM history_fts WHERE history_fts MATCH ?), cutoff AS MATERIALIZED (SELECT score FROM matches ORDER BY score LIMIT 1 OFFSET ?), candidates AS MATERIALIZED (SELECT rowid,score FROM matches WHERE (SELECT score FROM cutoff) IS NULL OR score <= (SELECT score FROM cutoff)) SELECT f.*,candidates.score FROM candidates CROSS JOIN history_search_documents f ON f.rowid=candidates.rowid ${visible} ORDER BY candidates.score,f.updated_at DESC,f.entity_id LIMIT ? OFFSET ?`,
      );
      rows = this.store.db.transaction(() => {
        let budget = offset + p.limit + 1;
        let total: number | undefined;
        while (true) {
          const page = ranked.all(match, budget - 1, ...args, p.limit + 1, offset) as SearchRow[];
          if (page.length > p.limit) return page;
          total ??= (
            this.store.db
              .prepare('SELECT count(*) AS n FROM history_fts WHERE history_fts MATCH ?')
              .get(match) as { n: number }
          ).n;
          if (budget >= total) return page;
          // Filtered or archived high-ranking hits must never truncate a page.
          // Read all attempts in one SQLite snapshot and grow until enough
          // visible hits exist or all matches have been considered.
          budget = Math.min(total, budget * 4);
        }
      })();
    } else {
      // Timestamp ordering walks the existing profile/time index after FTS
      // membership is materialized; this path does not need BM25 scoring.
      rows = this.store.db
        .prepare(
          `${materializeMatches ? 'WITH matches AS MATERIALIZED (SELECT rowid FROM history_fts WHERE history_fts MATCH ?) ' : ''}SELECT f.* FROM history_search_documents f ${materializeMatches ? 'JOIN matches ON matches.rowid=f.rowid' : ''} ${visible} ORDER BY f.updated_at DESC,f.entity_id LIMIT ? OFFSET ?`,
        )
        .all(...(materializeMatches ? [match, ...args] : args), p.limit + 1, offset) as SearchRow[];
    }
    const hits = rows.slice(0, p.limit).map((r) => {
      const body =
        r.entity_type === 'session' ||
        !r.body.toLocaleLowerCase().includes(p.query.toLocaleLowerCase())
          ? r.title + '\n' + r.body
          : r.body;
      const at = body.toLocaleLowerCase().indexOf(p.query.toLocaleLowerCase()),
        start = Math.max(0, at - 80),
        snippet = body.slice(start, start + 400),
        ranges = [];
      let pos = 0;
      while (
        (pos = snippet.toLocaleLowerCase().indexOf(p.query.toLocaleLowerCase(), pos)) >= 0 &&
        ranges.length < 100
      ) {
        ranges.push({ start: pos, end: pos + p.query.length });
        pos += p.query.length;
      }
      const task =
        r.entity_type === 'task'
          ? (this.store.db
              .prepare(
                'SELECT m.id,m.branch_id FROM runs r JOIN messages m ON m.id=r.user_message_id WHERE r.task_id=? AND m.deleted_at IS NULL ORDER BY r.rowid DESC LIMIT 1',
              )
              .get(r.entity_id) as { id: string; branch_id: string } | undefined)
          : undefined;
      return {
        id: r.entity_id,
        type: r.entity_type,
        title: r.title,
        snippet,
        ranges,
        sessionId: r.session_id,
        messageId: r.entity_type === 'message' ? r.entity_id : (task?.id ?? null),
        branchId: task?.branch_id ?? r.branch_id,
        updatedAt: Number(r.updated_at),
      };
    });
    this.store.db.transaction(() => {
      this.store.db
        .prepare(
          'INSERT INTO search_history(id,profile_id,query,updated_at) VALUES(?,?,?,?) ON CONFLICT(profile_id,query) DO UPDATE SET updated_at=excluded.updated_at',
        )
        .run(newId(), this.store.profileId, p.query, this.store.now());
      this.store.db
        .prepare(
          'DELETE FROM search_history WHERE profile_id=? AND id NOT IN (SELECT id FROM search_history WHERE profile_id=? ORDER BY updated_at DESC,id DESC LIMIT 20)',
        )
        .run(this.store.profileId, this.store.profileId);
    })();
    return SearchPageSchema.parse({
      hits,
      nextCursor:
        rows.length > p.limit
          ? Buffer.from(JSON.stringify({ offset: offset + p.limit, filter })).toString('base64url')
          : null,
    });
  }
  private journal(id: string, entityType: 'session' | 'message' = 'session', keepAsNote = false) {
    if (this.temporary) return;
    mkdirSync(join(this.store.dataDir, 'db'), { recursive: true });
    const path = join(this.store.dataDir, 'db/deletions.jsonl');
    appendFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        profileId: this.store.profileId,
        entityType,
        ...(entityType === 'message' ? { keepAsNote } : {}),
        entityId: id,
        deletedAt: this.store.now(),
      }) + '\n',
    );
    const fd = openSync(path, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  private purge(s: Session) {
    this.store.db
      .prepare(
        "INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES(?,?,?,?,'session',?,0) ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
      )
      .run(newId(), this.store.profileId, this.store.now(), this.store.now(), s.id);
    eraseSessionContent(this.store, s.id, this.store.now());
  }
  async maintain() {
    const stale = this.store.db
      .prepare(
        "SELECT * FROM sessions WHERE profile_id=? AND deleted_at IS NOT NULL AND deleted_at<? AND NOT EXISTS(SELECT 1 FROM deletion_tombstones d WHERE d.entity_type='session' AND d.entity_id=sessions.id)",
      )
      .all(this.store.profileId, this.store.now() - 30 * 86400000) as Session[];
    for (const s of stale) {
      if (this.titleSession === s.id) continue;
      await this.disposeNative?.(s.id);
      this.journal(s.id);
      this.store.db.transaction(() => this.purge(s))();
    }
  }
  copyProjectSessions(
    sourceProjectId: string,
    targetProjectId: string,
    includeAttachments: boolean,
  ) {
    this.project(sourceProjectId);
    this.project(targetProjectId);
    const rows = this.store.db
      .prepare('SELECT id FROM sessions WHERE project_id=? AND profile_id=? AND deleted_at IS NULL')
      .all(sourceProjectId, this.store.profileId) as { id: string }[];
    for (const row of rows) {
      const s = this.session(row.id);
      this.idle(s.id);
      const head = (
        this.store.db
          .prepare('SELECT head_message_id FROM branches WHERE id=?')
          .get(s.active_branch_id) as { head_message_id: string | null }
      ).head_message_id;
      const path = this.path(s.id, head),
        target = newId(),
        now = this.store.now();
      this.store.db
        .prepare(
          'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,project_id,settings_json,last_activity_at,title_manual,note,tags_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)',
        )
        .run(
          target,
          this.store.profileId,
          now,
          now,
          s.title,
          s.mode,
          targetProjectId,
          JSON.stringify({ schemaVersion: 1, values: {} }),
          now,
          s.note,
          s.tags_json,
        );
      this.branch(s, '主分支', path, target, includeAttachments);
      if (includeAttachments) this.copyLinks(s.id, target);
      this.changed(target);
    }
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const r = parsed.data;
    try {
      if (
        this.store.db
          .prepare('SELECT request_id FROM request_receipts WHERE profile_id=? AND request_id=?')
          .get(this.store.profileId, r.requestId)
      )
        return this.store.receipt(r, () => {
          throw new StorageError('CONFLICT');
        });
      switch (r.command) {
        case 'sessions.list':
          return this.ok(r, this.list(r.payload));
        case 'sessions.get':
          return this.ok(r, this.details(HistorySessionSchema.parse(r.payload).sessionId));
        case 'sessions.read': {
          const s = this.session(HistorySessionSchema.parse(r.payload).sessionId);
          return this.store.receipt(r, () => {
            this.store.db.prepare('UPDATE sessions SET unread_event_seq=0 WHERE id=?').run(s.id);
            return this.ok(r, { updatedIds: [s.id], failed: [] });
          });
        }
        case 'sessions.update': {
          const p = SessionUpdateSchema.parse(r.payload),
            s = this.session(p.sessionId);
          this.revision(r, s);
          if (p.patch.projectId !== undefined) {
            this.idle(s.id);
            if (p.patch.projectId) this.project(p.patch.projectId);
          }
          return this.store.receipt(r, () => {
            this.revision(r, this.session(s.id));
            this.store.db
              .prepare(
                'UPDATE sessions SET title=?,title_manual=CASE WHEN ? THEN 1 ELSE title_manual END,note=?,tags_json=?,project_id=?,revision=revision+1,updated_at=? WHERE id=?',
              )
              .run(
                p.patch.title ?? s.title,
                p.patch.title !== undefined ? 1 : 0,
                p.patch.note ?? s.note,
                p.patch.tags ? JSON.stringify([...new Set(p.patch.tags)]) : s.tags_json,
                p.patch.projectId === undefined ? s.project_id : p.patch.projectId,
                this.store.now(),
                s.id,
              );
            if (p.patch.title)
              this.store.db
                .prepare(
                  "UPDATE title_jobs SET status='cancelled' WHERE session_id=? AND status IN('queued','running')",
                )
                .run(s.id);
            this.changed(s.id);
            return this.ok(r, this.details(s.id), s.revision + 1);
          });
        }
        case 'sessions.archive':
        case 'sessions.move':
        case 'sessions.trash':
        case 'sessions.restore':
        case 'sessions.purge': {
          if (this.temporary) throw new StorageError('PERMISSION_DENIED');
          const p = SessionBatchSchema.parse(r.payload),
            updatedIds: string[] = [],
            failed: { id: string; code: string }[] = [];
          if (r.command === 'sessions.move') {
            if (p.projectId === undefined && p.sectionId === undefined)
              throw new StorageError('VALIDATION_ERROR');
            if (p.projectId) this.project(p.projectId);
            if (p.sectionId) this.section(p.sectionId);
          }
          // Validate the entire batch before journaling or mutating any entity.
          const rows = p.sessionIds.map((id) => this.session(id, true));
          for (const s of rows) {
            this.idle(s.id);
            if (r.command === 'sessions.purge' && this.titleSession === s.id)
              throw new StorageError('CONFLICT', s.revision);
            if (
              s.deleted_at &&
              ['sessions.archive', 'sessions.move', 'sessions.trash'].includes(r.command)
            )
              throw new StorageError('CONFLICT', s.revision);
            if (r.command === 'sessions.restore' && !s.deleted_at)
              throw new StorageError('VALIDATION_ERROR');
            if (r.command === 'sessions.purge' && !s.deleted_at)
              throw new StorageError('VALIDATION_ERROR');
            if (
              this.store.db
                .prepare(
                  "SELECT id FROM deletion_tombstones WHERE profile_id=? AND entity_type='session' AND entity_id=?",
                )
                .get(this.store.profileId, s.id)
            )
              throw new StorageError('NOT_FOUND');
            if (r.command === 'sessions.restore' && s.project_id) this.project(s.project_id);
          }
          if (r.command === 'sessions.purge')
            for (const s of rows) {
              await this.disposeNative?.(s.id);
              const current = this.session(s.id, true);
              this.idle(s.id);
              if (current.revision !== s.revision || !current.deleted_at)
                throw new StorageError('CONFLICT', current.revision);
              this.journal(s.id);
            }
          return this.store.receipt(r, () => {
            for (const s of rows) {
              if (r.command === 'sessions.purge') this.purge(s);
              else if (r.command === 'sessions.move') {
                if (s.deleted_at) throw new StorageError('PERMISSION_DENIED');
                if (p.projectId !== undefined)
                  this.store.db
                    .prepare(
                      'UPDATE sessions SET project_id=?,revision=revision+1,updated_at=? WHERE id=?',
                    )
                    .run(p.projectId, this.store.now(), s.id);
                if (p.sectionId !== undefined)
                  this.store.db
                    .prepare(
                      'INSERT INTO sidebar_items(profile_id,entity_type,entity_id,section_id,sort_key) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET section_id=excluded.section_id,sort_key=excluded.sort_key',
                    )
                    .run(this.store.profileId, 'session', s.id, p.sectionId, this.store.now());
              } else if (r.command === 'sessions.archive')
                this.store.db
                  .prepare(
                    'UPDATE sessions SET archived_at=?,revision=revision+1,updated_at=? WHERE id=? AND deleted_at IS NULL',
                  )
                  .run(p.archived === false ? null : this.store.now(), this.store.now(), s.id);
              else if (r.command === 'sessions.trash') {
                this.store.db
                  .prepare(
                    'UPDATE sessions SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=?',
                  )
                  .run(this.store.now(), this.store.now(), s.id);
                this.store.db
                  .prepare("DELETE FROM resource_links WHERE owner_type='session' AND owner_id=?")
                  .run(s.id);
              } else {
                this.store.db
                  .prepare(
                    'UPDATE sessions SET deleted_at=NULL,revision=revision+1,updated_at=? WHERE id=?',
                  )
                  .run(this.store.now(), s.id);
                this.reindex(s.id);
                const messages = this.store.db
                  .prepare(
                    'SELECT chat_json FROM messages WHERE session_id=? AND deleted_at IS NULL',
                  )
                  .all(s.id) as { chat_json: string }[];
                const files = new Set<string>();
                for (const m of messages)
                  for (const ref of JSON.parse(m.chat_json).attachments ?? []) {
                    if (
                      ref.kind === 'file' &&
                      this.store.db
                        .prepare(
                          'SELECT f.id FROM files f JOIN file_versions v ON v.file_id=f.id WHERE f.id=? AND v.id=? AND f.profile_id=? AND f.deleted_at IS NULL AND v.deleted_at IS NULL',
                        )
                        .get(ref.fileId, ref.versionId, this.store.profileId)
                    )
                      files.add(ref.fileId);
                  }
                for (const fileId of files)
                  this.store.db
                    .prepare(
                      "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role) VALUES(?,?,?,?,'file',?,'session',?,'input')",
                    )
                    .run(
                      newId(),
                      this.store.profileId,
                      this.store.now(),
                      this.store.now(),
                      fileId,
                      s.id,
                    );
              }
              updatedIds.push(s.id);
              this.changed(s.id);
            }
            return this.ok(r, { updatedIds, failed });
          });
        }
        case 'sessions.copy':
        case 'sessions.fork': {
          if (this.temporary) throw new StorageError('PERMISSION_DENIED');
          const p = SessionCopySchema.parse(r.payload),
            s = this.session(p.sessionId);
          this.idle(s.id);
          const source = p.fromMessageId ? this.message(s.id, p.fromMessageId) : null;
          const head =
            source?.id ??
            (
              this.store.db
                .prepare('SELECT head_message_id FROM branches WHERE id=?')
                .get(s.active_branch_id) as { head_message_id: string | null }
            ).head_message_id;
          const path = this.path(s.id, head);
          if (p.includeAttachments)
            for (const m of path)
              for (const ref of JSON.parse(m.chat_json).attachments ?? [])
                await this.chat.material(ref, s.id);
          return this.store.receipt(r, () => {
            this.idle(s.id);
            const target = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,project_id,settings_json,last_activity_at,title_manual,note,tags_json) VALUES(?,?,?,?,?,?,?,\'{"schemaVersion":1,"values":{}}\',?,1,?,?)',
              )
              .run(
                target,
                this.store.profileId,
                now,
                now,
                s.title.slice(0, 234) + ' · 副本',
                s.mode,
                s.project_id,
                now,
                s.note,
                s.tags_json,
              );
            const branch = this.branch(s, '主分支', path, target, p.includeAttachments);
            if (p.includeAttachments) this.copyLinks(s.id, target);
            this.changed(target);
            return this.ok(r, { sessionId: target, branchId: branch.branch });
          });
        }
        case 'messages.edit':
        case 'messages.regenerate': {
          const editing = r.command === 'messages.edit',
            p = editing
              ? MessageEditSchema.parse(r.payload)
              : MessageRegenerateSchema.parse(r.payload),
            s = this.session(p.sessionId),
            m = this.message(s.id, p.messageId);
          this.idle(s.id);
          this.revision(r, s);
          if (m.branch_id !== s.active_branch_id || m.role !== (editing ? 'user' : 'assistant'))
            throw new StorageError('VALIDATION_ERROR');
          const prefix = this.path(s.id, editing ? m.parent_message_id : m.parent_message_id);
          let user = prefix.at(-1);
          if (!editing) {
            while (user && user.role !== 'user') {
              prefix.pop();
              user = prefix.at(-1);
            }
            if (!user) throw new StorageError('VALIDATION_ERROR');
          }
          const catalog = await this.chat.models.catalog();
          if (
            !catalog.some(
              (c) =>
                c.status === 'ready' &&
                (!p.modelRef ||
                  (c.accountId === p.modelRef.accountId && c.modelId === p.modelRef.modelId)),
            )
          )
            throw new StorageError('AUTH_REQUIRED');
          const reply = this.store.receipt(r, () => {
            this.revision(r, this.session(s.id));
            this.idle(s.id);
            const fork = this.branch(
              s,
              editing ? '编辑分支' : '回答版本',
              prefix,
              s.id,
              true,
              editing ? null : (m.source_message_id ?? m.id),
              m.id,
            );
            const current = this.chat.session(s.id);
            let userId = fork.head;
            if (editing)
              userId = this.chat.insertMessage(
                current,
                'user',
                (p as z.infer<typeof MessageEditSchema>).text,
                'final',
                null,
                { attachments: JSON.parse(m.chat_json).attachments ?? [] },
              );
            if (!userId) throw new StorageError('VALIDATION_ERROR');
            const runId = this.chat.createRun(current, userId, p.modelRef ?? null);
            this.changed(s.id);
            return this.ok(r, { sessionId: s.id, branchId: fork.branch, runId });
          });
          this.chat.tick();
          return reply;
        }
        case 'messages.switchBranch': {
          const p = BranchSwitchSchema.parse(r.payload),
            s = this.session(p.sessionId);
          this.idle(s.id);
          this.revision(r, s);
          if (
            !this.store.db
              .prepare(
                'SELECT id FROM branches WHERE id=? AND session_id=? AND profile_id=? AND deleted_at IS NULL',
              )
              .get(p.branchId, s.id, this.store.profileId)
          )
            throw new StorageError('PERMISSION_DENIED');
          return this.store.receipt(r, () => {
            this.revision(r, this.session(s.id));
            this.store.db
              .prepare(
                'UPDATE sessions SET active_branch_id=?,revision=revision+1,updated_at=? WHERE id=?',
              )
              .run(p.branchId, this.store.now(), s.id);
            this.changed(s.id);
            return this.ok(r, { sessionId: s.id, branchId: p.branchId });
          });
        }
        case 'messages.deletePreview':
        case 'messages.delete': {
          const p = MessageDeleteSchema.parse(r.payload),
            s = this.session(p.sessionId),
            m = this.message(s.id, p.messageId);
          if (m.branch_id !== s.active_branch_id) throw new StorageError('PERMISSION_DENIED');
          const path = this.path(
              s.id,
              (
                this.store.db
                  .prepare('SELECT head_message_id FROM branches WHERE id=?')
                  .get(s.active_branch_id) as { head_message_id: string | null }
              ).head_message_id,
            ),
            at = path.findIndex((x) => x.id === m.id);
          if (at < 0) throw new StorageError('NOT_FOUND');
          const affected = path.slice(at).map((x) => x.id);
          if (r.command === 'messages.deletePreview')
            return this.ok(r, {
              affectedIds: affected,
              laterCount: affected.length - 1,
              running: this.running(s.id),
            });
          this.idle(s.id);
          this.revision(r, s);
          if (!p.descendants) throw new StorageError('VALIDATION_ERROR');
          if (this.titleSession === s.id) throw new StorageError('CONFLICT', s.revision);
          await this.disposeNative?.(s.id);
          this.idle(s.id);
          this.revision(r, this.session(s.id));
          const removed = p.descendants === 'keep-as-note' ? [m.id] : affected;
          for (const id of removed) this.journal(id, 'message', p.descendants === 'keep-as-note');
          return this.store.receipt(r, () => {
            this.revision(r, this.session(s.id));
            this.store.db.prepare('UPDATE sessions SET revision=revision+1 WHERE id=?').run(s.id);
            for (const id of removed) {
              eraseMessageContent(
                this.store,
                id,
                this.store.now(),
                p.descendants === 'keep-as-note',
              );
              this.store.db
                .prepare(
                  "INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES(?,?,?,?,'message',?,0) ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
                )
                .run(newId(), this.store.profileId, this.store.now(), this.store.now(), id);
            }
            this.changed(s.id);
            return this.ok(r, { updatedIds: [m.id], failed: [] });
          });
        }
        case 'messages.mark': {
          const p = MessageMarkSchema.parse(r.payload);
          this.message(p.sessionId, p.messageId);
          return this.store.receipt(r, () => {
            const old = this.store.db
              .prepare('SELECT * FROM message_marks WHERE message_id=?')
              .get(p.messageId) as
              { bookmark: number; rating: string | null; note: string; report: number } | undefined;
            this.store.db
              .prepare(
                'INSERT INTO message_marks(message_id,profile_id,bookmark,rating,note,report) VALUES(?,?,?,?,?,?) ON CONFLICT(message_id) DO UPDATE SET bookmark=excluded.bookmark,rating=excluded.rating,note=excluded.note,report=excluded.report',
              )
              .run(
                p.messageId,
                this.store.profileId,
                p.bookmark === undefined ? (old?.bookmark ?? 0) : +p.bookmark,
                p.rating === undefined ? (old?.rating ?? null) : p.rating,
                p.note ?? old?.note ?? '',
                p.report === undefined ? (old?.report ?? 0) : +p.report,
              );
            this.changed(p.sessionId);
            return this.ok(r, { updatedIds: [p.messageId], failed: [] });
          });
        }
        case 'messages.transform': {
          const p = MessageTransformSchema.parse(r.payload),
            m = this.message(p.sessionId, p.messageId),
            text = messageText(m);
          if (m.revision !== p.version) throw new StorageError('CONFLICT', m.revision);
          if (p.range.end > text.length || p.range.start >= p.range.end)
            throw new StorageError('VALIDATION_ERROR');
          const names = {
            translate: '翻译',
            explain: '解释',
            expand: '扩写',
            shorten: '缩写',
            rewrite: '改写',
          };
          return this.chat.dispatch({
            ...r,
            command: 'messages.send',
            payload: {
              sessionId: p.sessionId,
              clientMessageId: r.requestId,
              text: `请${names[p.action]}所引用的选中内容。`,
              attachments: [
                {
                  kind: 'message',
                  sessionId: p.sessionId,
                  messageId: m.id,
                  version: m.revision,
                  range: { start: p.range.start, end: p.range.end },
                },
              ],
              mode: 'chat',
              ...(p.modelRef ? { modelRef: p.modelRef } : {}),
            },
          });
        }
        case 'messages.saveNote': {
          if (this.temporary) throw new StorageError('PERMISSION_DENIED');
          const p = MessageNoteSchema.parse(r.payload),
            m = this.message(p.sessionId, p.messageId),
            s = this.session(p.sessionId);
          if (p.projectId) {
            this.project(p.projectId);
            if (s.project_id !== p.projectId) throw new StorageError('PERMISSION_DENIED');
          }
          const text = messageText(m);
          const blob = await this.blobs.put(Buffer.from(text), 'text/markdown');
          const source = this.message(s.id, m.id);
          if (source.revision !== m.revision || source.content_json !== m.content_json)
            throw new StorageError('CONFLICT');
          return this.store.receipt(r, () => {
            const current = this.session(s.id);
            if (current.project_id !== s.project_id) throw new StorageError('CONFLICT');
            if (p.projectId) this.project(p.projectId);
            const note = this.blobs.attach(blob.id, '收藏笔记.md');
            this.store.db
              .prepare("UPDATE files SET kind='note',source_type='generated' WHERE id=?")
              .run(note.id);
            this.store.db
              .prepare(
                "UPDATE file_versions SET display_name='收藏笔记.md',extension='md',mime='text/markdown',parse_status='ready',preview_status='pending' WHERE id=?",
              )
              .run(note.versionId);
            // The exact stored message text is the generated note's known content;
            // no uploaded file is decoded here and no binary preview is claimed.
            this.store.db
              .prepare('INSERT INTO file_search_documents VALUES(?,?,?,?)')
              .run(note.versionId, note.id, this.store.profileId, text);
            const files = new FileRepository(this.store, this.blobs);
            files.link(note.id, note.versionId, { type: 'session', id: s.id });
            if (p.projectId)
              files.link(note.id, note.versionId, { type: 'project', id: p.projectId });
            this.changed(note.id);
            return this.ok(r, { entityId: note.id });
          });
        }
        case 'projects.pin': {
          const p = z.strictObject({ projectId: IdSchema, pinned: z.boolean() }).parse(r.payload),
            project = this.project(p.projectId);
          if (r.expectedRevision !== project.revision)
            throw new StorageError('CONFLICT', project.revision);
          return this.store.receipt(r, () => {
            this.store.db
              .prepare('UPDATE projects SET pinned_at=?,revision=revision+1 WHERE id=?')
              .run(p.pinned ? this.store.now() : null, p.projectId);
            this.changed(p.projectId);
            return this.ok(r, { updatedIds: [p.projectId], failed: [] });
          });
        }
        case 'sidebar.list':
          z.strictObject({}).parse(r.payload);
          return this.ok(r, this.sidebar());
        case 'sidebar.create': {
          const p = SectionCreateSchema.parse(r.payload);
          return this.store.receipt(r, () => {
            if (
              (
                this.store.db
                  .prepare('SELECT count(*) n FROM sidebar_sections WHERE profile_id=?')
                  .get(this.store.profileId) as { n: number }
              ).n >= 100
            )
              throw new StorageError('BUDGET_EXCEEDED');
            const id = newId();
            this.store.db
              .prepare('INSERT INTO sidebar_sections(id,profile_id,name,sort_key) VALUES(?,?,?,?)')
              .run(id, this.store.profileId, p.name, this.store.now());
            this.changed(id);
            return this.ok(r, { entityId: id });
          });
        }
        case 'sidebar.update':
        case 'sidebar.remove': {
          const p =
              r.command === 'sidebar.update'
                ? SectionUpdateSchema.parse(r.payload)
                : SectionRemoveSchema.parse(r.payload),
            s = this.section(p.sectionId);
          if (r.expectedRevision !== s.revision) throw new StorageError('CONFLICT', s.revision);
          return this.store.receipt(r, () => {
            if (r.command === 'sidebar.remove')
              this.store.db.prepare('DELETE FROM sidebar_sections WHERE id=?').run(s.id);
            else {
              const v = p as z.infer<typeof SectionUpdateSchema>;
              this.store.db
                .prepare(
                  'UPDATE sidebar_sections SET name=coalesce(?,name),collapsed=coalesce(?,collapsed),revision=revision+1 WHERE id=?',
                )
                .run(v.name ?? null, v.collapsed === undefined ? null : +v.collapsed, s.id);
            }
            this.changed(s.id);
            return this.ok(r, { updatedIds: [s.id], failed: [] });
          });
        }
        case 'sidebar.move': {
          const p = SidebarMoveSchema.parse(r.payload);
          p.entity.type === 'session' ? this.session(p.entity.id) : this.project(p.entity.id);
          if (p.sectionId) this.section(p.sectionId);
          return this.store.receipt(r, () => {
            this.store.db
              .prepare(
                'INSERT INTO sidebar_items(profile_id,entity_type,entity_id,section_id,sort_key) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET section_id=excluded.section_id,sort_key=excluded.sort_key',
              )
              .run(this.store.profileId, p.entity.type, p.entity.id, p.sectionId, this.store.now());
            this.changed(p.entity.id);
            return this.ok(r, { updatedIds: [p.entity.id], failed: [] });
          });
        }
        case 'sidebar.reorder': {
          const p = SidebarReorderSchema.parse(r.payload);
          if (p.sectionId) this.section(p.sectionId);
          for (const e of p.ordered) e.type === 'session' ? this.session(e.id) : this.project(e.id);
          if (new Set(p.ordered.map((e) => e.type + e.id)).size !== p.ordered.length)
            throw new StorageError('VALIDATION_ERROR');
          for (const e of p.ordered) {
            const old = this.store.db
              .prepare(
                'SELECT section_id FROM sidebar_items WHERE profile_id=? AND entity_type=? AND entity_id=?',
              )
              .get(this.store.profileId, e.type, e.id) as { section_id: string | null } | undefined;
            if (p.sectionId && (old?.section_id ?? null) !== p.sectionId)
              throw new StorageError('CONFLICT');
          }
          if (p.sectionIds) {
            if (new Set(p.sectionIds).size !== p.sectionIds.length)
              throw new StorageError('VALIDATION_ERROR');
            for (const id of p.sectionIds) this.section(id);
          }
          return this.store.receipt(r, () => {
            for (const [n, e] of p.ordered.entries())
              this.store.db
                .prepare(
                  'INSERT INTO sidebar_items(profile_id,entity_type,entity_id,section_id,sort_key) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET sort_key=excluded.sort_key',
                )
                .run(this.store.profileId, e.type, e.id, p.sectionId, n);
            for (const [n, id] of (p.sectionIds ?? []).entries())
              this.store.db
                .prepare('UPDATE sidebar_sections SET sort_key=?,revision=revision+1 WHERE id=?')
                .run(n, id);
            this.changed(p.sectionId ?? this.store.profileId);
            return this.ok(r, { updatedIds: [], failed: [] });
          });
        }
        case 'search.query':
          return this.ok(r, this.search(r.payload));
        case 'search.locate': {
          if (this.temporary) throw new StorageError('PERMISSION_DENIED');
          const p = HistoryLocationInputSchema.parse(r.payload);
          const row = this.store.db
            .prepare(
              p.type === 'file'
                ? 'SELECT id,display_name AS name,status,revision,0 AS pinned FROM files WHERE id=? AND profile_id=? AND deleted_at IS NULL'
                : "SELECT id,name,'ready' AS status,revision,pinned_at IS NOT NULL AS pinned FROM projects WHERE id=? AND profile_id=? AND deleted_at IS NULL",
            )
            .get(p.id, this.store.profileId) as
            | { id: string; name: string; status: string; revision: number; pinned: number }
            | undefined;
          if (!row) throw new StorageError('NOT_FOUND');
          return this.ok(r, { ...row, type: p.type, pinned: !!row.pinned });
        }
        case 'search.history':
          z.strictObject({}).parse(r.payload);
          return this.ok(
            r,
            SearchHistorySchema.parse({
              queries: this.temporary
                ? []
                : this.store.db
                    .prepare(
                      'SELECT id,query FROM search_history WHERE profile_id=? ORDER BY updated_at DESC,id DESC LIMIT 20',
                    )
                    .all(this.store.profileId),
            }),
          );
        case 'search.clear': {
          const p = SearchClearSchema.parse(r.payload);
          return this.store.receipt(r, () => {
            if (p.clearAll)
              this.store.db
                .prepare('DELETE FROM search_history WHERE profile_id=?')
                .run(this.store.profileId);
            else
              for (const id of p.ids ?? [])
                this.store.db
                  .prepare('DELETE FROM search_history WHERE id=? AND profile_id=?')
                  .run(id, this.store.profileId);
            return this.ok(r, { updatedIds: [], failed: [] });
          });
        }
        case 'sessions.title': {
          const s = this.session(HistorySessionSchema.parse(r.payload).sessionId);
          if (this.temporary) throw new StorageError('PERMISSION_DENIED');
          this.revision(r, s);
          return this.store.receipt(r, () => {
            const latest = this.store.db
              .prepare(
                "SELECT id FROM runs WHERE session_id=? AND status='completed' ORDER BY rowid DESC LIMIT 1",
              )
              .get(s.id) as { id: string } | undefined;
            if (!latest) throw new StorageError('VALIDATION_ERROR');
            this.store.db.prepare('DELETE FROM title_jobs WHERE session_id=?').run(s.id);
            this.queueTitle(s.id, latest.id, true);
            return this.ok(r, { updatedIds: [s.id], failed: [] });
          });
        }
        default:
          return failure(r.requestId, 'FEATURE_NOT_AVAILABLE');
      }
    } catch (e) {
      return failure(
        r.requestId,
        e instanceof StorageError
          ? e.code
          : e instanceof z.ZodError || e instanceof SyntaxError
            ? 'VALIDATION_ERROR'
            : 'INTERNAL_ERROR',
        e instanceof StorageError ? e.currentRevision : undefined,
      );
    }
  }
  private copyLinks(source: string, target: string) {
    const rows = this.store.db
      .prepare(
        "SELECT resource_type,resource_id,role FROM resource_links WHERE profile_id=? AND owner_type='session' AND owner_id=? AND deleted_at IS NULL",
      )
      .all(this.store.profileId, source) as {
      resource_type: string;
      resource_id: string;
      role: string;
    }[];
    for (const row of rows)
      this.store.db
        .prepare(
          "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role) VALUES(?,?,?,?,?,?,'session',?,?)",
        )
        .run(
          newId(),
          this.store.profileId,
          this.store.now(),
          this.store.now(),
          row.resource_type,
          row.resource_id,
          target,
          row.role,
        );
  }
  private reindex(id: string) {
    this.store.db
      .prepare(
        "INSERT INTO history_search_documents SELECT m.id,'message',m.profile_id,m.session_id,s.project_id,m.branch_id,s.title,coalesce(json_extract(m.content_json,'$.blocks[0].text'),''),m.updated_at FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.session_id=? AND m.deleted_at IS NULL AND m.role IN('user','assistant') AND m.status IN('final','interrupted')",
      )
      .run(id);
    this.store.db
      .prepare(
        "INSERT INTO history_search_documents SELECT t.id,'task',t.profile_id,t.session_id,s.project_id,NULL,s.title,t.goal,t.updated_at FROM tasks t JOIN sessions s ON s.id=t.session_id WHERE t.session_id=? AND t.deleted_at IS NULL",
      )
      .run(id);
  }
  private sidebar() {
    return SidebarViewSchema.parse({
      sections: (
        this.store.db
          .prepare('SELECT * FROM sidebar_sections WHERE profile_id=? ORDER BY sort_key,id')
          .all(this.store.profileId) as {
          id: string;
          name: string;
          revision: number;
          collapsed: number;
        }[]
      ).map((s) => {
        const totals = this.store.db
          .prepare(
            `SELECT count(*) AS count,coalesce(sum(s.unread_event_seq>0),0) AS unread,coalesce(sum(EXISTS(SELECT 1 FROM runs r WHERE r.session_id=s.id AND r.status NOT IN ${liveStates})),0) AS running FROM sidebar_items i JOIN sessions s ON s.id=i.entity_id WHERE i.section_id=? AND i.profile_id=? AND i.entity_type='session' AND s.deleted_at IS NULL`,
          )
          .get(s.id, this.store.profileId) as { count: number; unread: number; running: number };
        const projects = (
          this.store.db
            .prepare(
              "SELECT p.id,p.name,p.pinned_at,p.revision FROM sidebar_items i JOIN projects p ON p.id=i.entity_id WHERE i.section_id=? AND i.profile_id=? AND i.entity_type='project' AND p.deleted_at IS NULL ORDER BY i.sort_key LIMIT 100",
            )
            .all(s.id, this.store.profileId) as {
            id: string;
            name: string;
            pinned_at: number | null;
            revision: number;
          }[]
        ).map((p) => ({
          id: p.id,
          name: p.name,
          pinned: p.pinned_at !== null,
          revision: p.revision,
        }));
        return {
          id: s.id,
          name: s.name,
          revision: s.revision,
          collapsed: !!s.collapsed,
          ...totals,
          projects,
        };
      }),
    });
  }
  queueTitle(sessionId: string, runId: string, manual = false) {
    if (this.temporary) return;
    const s = this.session(sessionId),
      row = this.store.db.prepare('SELECT title_manual FROM sessions WHERE id=?').get(s.id) as {
        title_manual: number;
      };
    if (row.title_manual && !manual) return;
    this.store.db
      .prepare(
        "INSERT OR IGNORE INTO title_jobs(session_id,profile_id,run_id,expected_revision,status) VALUES(?,?,?,?,'queued')",
      )
      .run(s.id, this.store.profileId, runId, s.revision);
  }
  private titleActive = false;
  private titleSession: string | undefined;
  private closing = false;
  private titleAbort = new AbortController();
  private titleCompletion: Promise<void> | undefined;
  titles() {
    if (this.titleCompletion || this.closing) return this.titleCompletion ?? Promise.resolve();
    this.titleCompletion = this.runTitle().finally(() => {
      this.titleCompletion = undefined;
    });
    return this.titleCompletion;
  }
  private async runTitle() {
    if (this.titleActive || this.closing || this.temporary) return;
    const job = this.store.db
      .prepare("SELECT * FROM title_jobs WHERE status='queued' LIMIT 1")
      .get() as { session_id: string; run_id: string; expected_revision: number } | undefined;
    if (!job) return;
    this.titleActive = true;
    this.titleSession = job.session_id;
    try {
      this.store.db
        .prepare("UPDATE title_jobs SET status='running' WHERE session_id=?")
        .run(job.session_id);
      const s = this.session(job.session_id);
      if (s.revision !== job.expected_revision) throw new StorageError('CONFLICT');
      const row = this.store.db
        .prepare(
          "SELECT * FROM messages WHERE session_id=? AND role='user' AND deleted_at IS NULL ORDER BY rowid LIMIT 1",
        )
        .get(s.id) as Message;
      const title = await this.chat.generateTitle(
        s.id,
        job.run_id,
        messageText(row),
        this.titleAbort.signal,
      );
      if (this.closing) return;
      this.store.db.transaction(() => {
        const current = this.store.db
          .prepare('SELECT status FROM title_jobs WHERE session_id=?')
          .get(s.id) as { status: string };
        if (current.status !== 'running') return;
        if (this.session(s.id).revision !== job.expected_revision) {
          this.store.db
            .prepare("UPDATE title_jobs SET status='cancelled' WHERE session_id=?")
            .run(s.id);
          return;
        }
        this.store.db
          .prepare('UPDATE sessions SET title=?,revision=revision+1,updated_at=? WHERE id=?')
          .run(title, this.store.now(), s.id);
        this.store.db
          .prepare("UPDATE title_jobs SET status='completed' WHERE session_id=?")
          .run(s.id);
        this.changed(s.id);
      })();
    } catch {
      this.store.db
        .prepare("UPDATE title_jobs SET status='failed' WHERE session_id=? AND status='running'")
        .run(job.session_id);
    } finally {
      this.titleActive = false;
      this.titleSession = undefined;
    }
  }
  async stop() {
    this.closing = true;
    this.titleAbort.abort();
    await this.titleCompletion;
  }
}
