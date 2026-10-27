import { verifySourceClaims, type ClaimSource } from '@tapkit/retrieval';
import { createHash } from 'node:crypto';
import {
  WebCommandSchemas,
  WebOptionsSchema,
  WebSourceSchema,
  WebSourceInfoSchema,
  WebReadSchema,
  WebActivitySchema,
  RequestSchema,
  ReplySchema,
  ErrorCodeSchema,
  z,
  type WebSource,
  type Reply,
  type ResourceRef,
  type WebOptions,
  type HostedSearchResult,
  ROUTING_LIMITS,
  SelectionSchema,
} from '@tapkit/contracts';
import { Store, BlobStore, FileRepository, StorageError, failure, newId } from '@tapkit/storage';
import { WebTools, webEnabled } from '@tapkit/tools';
import { ProjectService } from './project-service';
import type { ModelService } from './model-service';
import { candidates } from '@tapkit/providers';

export class WebService {
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
    readonly tools: WebTools,
    readonly models?: ModelService,
  ) {}
  private async configured(sessionId: string) {
    if (this.tools.searcher) return true;
    if (!this.models) return false;
    const selected = candidates(
      await this.models.catalog(),
      this.models.effective(sessionId).values,
      { inputTokens: 0, outputTokens: 1, attachments: 0, needsTools: false },
    )[0];
    return !!selected?.accountId && this.models.providers.supportsHostedSearch(selected.accountId);
  }
  async search(
    sessionId: string,
    runId: string,
    query: string,
    options: WebOptions,
    signal: AbortSignal,
    validate = () => {},
  ): Promise<HostedSearchResult> {
    if (!this.models) throw new StorageError('SEARCH_NOT_CONFIGURED');
    const session = this.session(sessionId);
    const row = this.store.db
      .prepare(
        'SELECT model_json,task_version,root_run_id FROM runs WHERE id=? AND session_id=? AND profile_id=?',
      )
      .get(runId, sessionId, this.store.profileId) as
      { model_json: string; task_version: number; root_run_id: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    const selection = SelectionSchema.parse(JSON.parse(row.model_json).selection);
    if (!this.models.providers.supportsHostedSearch(selection.accountId))
      throw new StorageError('MODEL_UNSUPPORTED');
    const basePreferences = this.models.effective(sessionId).values;
    const descriptor = (await this.models.catalog()).find(
      (m) => m.accountId === selection.accountId && m.modelId === selection.modelId,
    );
    const off = descriptor?.reasoningLevels.includes('off');
    const preferences = {
      ...basePreferences,
      selection,
      onlyThisModel: true,
      answer: { ...basePreferences.answer, format: 'plain' as const },
      mode: off ? ('quick' as const) : ('deep' as const),
      reasoning: off ? ('off' as const) : ('low' as const),
    };
    const budget = this.store.db
      .prepare('SELECT coalesce(sum(calls),0) AS n FROM runs WHERE root_run_id=?')
      .get(row.root_run_id) as { n: number };
    if (budget.n >= ROUTING_LIMITS.chatCalls) throw new StorageError('BUDGET_EXCEEDED');
    signal.throwIfAborted();
    validate();
    this.store.db.prepare('UPDATE runs SET calls=calls+1 WHERE id=?').run(runId);
    let result: HostedSearchResult | undefined,
      finished = false;
    for await (const event of this.models.router.stream(
      {
        logicalCallId: newId(),
        runId,
        rootRunId: row.root_run_id,
        mode: 'chat',
        singleAttempt: true,
        preferences,
        allowedAccounts: new Set([selection.accountId]),
        ...(session.project_id ? { projectId: session.project_id } : {}),
        need: { inputTokens: 0, outputTokens: 2048, attachments: 0, needsTools: false },
        request: {
          messages: [{ role: 'user', text: query }],
          systemModules: [],
          tools: [],
          hostedSearch: options,
          outputLimit: 2048,
          taskVersion: row.task_version,
          branchId: (
            this.store.db
              .prepare('SELECT active_branch_id AS id FROM sessions WHERE id=?')
              .get(sessionId) as { id: string }
          ).id,
        },
      },
      signal,
    )) {
      signal.throwIfAborted();
      validate();
      if (event.type === 'route.error') throw new StorageError(event.error.code);
      if (event.type === 'model.event') {
        if (event.event.type === 'error') throw new StorageError(event.event.error.code);
        if (event.event.type === 'hosted_search') result = event.event.result;
        if (event.event.type === 'finish') finished = true;
      }
    }
    if (!finished || !result) throw new StorageError('MODEL_UNSUPPORTED');
    return result;
  }
  private session(id: string) {
    const row = this.store.db
      .prepare(
        'SELECT id,project_id,web_options_json FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(id, this.store.profileId) as
      { id: string; project_id: string | null; web_options_json: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  options(sessionId: string) {
    return WebOptionsSchema.parse(JSON.parse(this.session(sessionId).web_options_json));
  }
  projectOnly(sessionId: string) {
    const row = this.session(sessionId);
    return (
      !!row.project_id &&
      new ProjectService(new FileRepository(this.store, this.blobs)).scope(sessionId).scope
        .projectOnly
    );
  }
  enabled(sessionId: string, text: string) {
    return webEnabled(text, this.options(sessionId), this.projectOnly(sessionId));
  }
  sources(sessionId: string) {
    this.session(sessionId);
    return z
      .array(WebSourceInfoSchema)
      .parse(
        this.store.db
          .prepare(
            'SELECT id AS sourceId,source_revision AS revision,url,title,fetched_at AS fetchedAt,content_hash AS contentHash FROM web_sources WHERE session_id=? AND profile_id=? ORDER BY fetched_at DESC,id DESC LIMIT 200',
          )
          .all(sessionId, this.store.profileId),
      );
  }
  async source(sessionId: string, sourceId: string): Promise<WebSource> {
    this.session(sessionId);
    const row = this.store.db
      .prepare(
        'SELECT snapshot_blob_id FROM web_sources WHERE id=? AND session_id=? AND profile_id=?',
      )
      .get(sourceId, sessionId, this.store.profileId);
    if (!row) throw new StorageError('PERMISSION_DENIED');
    const bytes = await this.blobs.readWebSource(sourceId);
    const snapshot = WebSourceSchema.parse(JSON.parse(bytes.toString('utf8')));
    this.session(sessionId);
    if (
      !this.store.db
        .prepare('SELECT 1 FROM web_sources WHERE id=? AND session_id=?')
        .get(sourceId, sessionId)
    )
      throw new StorageError('NOT_FOUND');
    if (
      snapshot.sourceId !== sourceId ||
      createHash('sha256').update(snapshot.text).digest('hex') !== snapshot.contentHash
    )
      throw new StorageError('CONFLICT');
    return snapshot;
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const r = parsed.data,
      ok = (data: unknown) => ReplySchema.parse({ ok: true, requestId: r.requestId, data });
    try {
      const schema = WebCommandSchemas[r.command as keyof typeof WebCommandSchemas];
      if (!schema) throw new StorageError('FEATURE_NOT_AVAILABLE');
      const p = schema.parse(r.payload),
        s = this.session(p.sessionId);
      if (r.command === 'web.configure') {
        const config = WebCommandSchemas['web.configure'].parse(p);
        this.store.receipt(r, () => {
          this.store.db
            .prepare(
              'UPDATE sessions SET web_options_json=?,revision=revision+1,updated_at=? WHERE id=?',
            )
            .run(JSON.stringify(config.options), this.store.now(), s.id);
          return ok({
            webOptions: config.options,
            searchConfigured: false,
            projectOnly: this.projectOnly(s.id),
          });
        });
      }
      if (r.command === 'web.sources') return ok({ webSources: this.sources(s.id) });
      if (r.command === 'web.sourceInfo') {
        const { sourceId } = WebCommandSchemas['web.sourceInfo'].parse(p);
        const info = this.store.db
          .prepare(
            'SELECT id AS sourceId,source_revision AS revision,url,title,fetched_at AS fetchedAt,content_hash AS contentHash FROM web_sources WHERE id=? AND session_id=? AND profile_id=?',
          )
          .get(sourceId, s.id, this.store.profileId);
        if (!info) throw new StorageError('PERMISSION_DENIED');
        return ok({ webSourceInfo: WebSourceInfoSchema.parse(info) });
      }
      if (r.command === 'web.activity') {
        const rows = this.store.db
          .prepare(
            "SELECT t.call_id,t.tool_name,t.status,m.content_json FROM tool_calls t JOIN runs r ON r.id=t.run_id LEFT JOIN messages m ON m.run_id=r.id AND m.role='tool' AND json_extract(m.chat_json,'$.callId')=t.call_id AND m.deleted_at IS NULL WHERE r.session_id=? AND r.profile_id=? AND t.tool_name IN('web.read','web.search') ORDER BY t.rowid DESC LIMIT 40",
          )
          .all(s.id, this.store.profileId) as {
          call_id: string;
          tool_name: string;
          status: string;
          content_json: string | null;
        }[];
        return ok({
          webActivity: rows.map((row) => {
            let result: {
              error?: string;
              results?: unknown[];
              searches?: number;
              searchCost?: string;
            } = {};
            if (row.content_json) {
              const blocks = JSON.parse(row.content_json).blocks as { text: string }[];
              try {
                result = JSON.parse(blocks.map((b) => b.text).join(''));
              } catch {
                /* no raw diagnostic */
              }
            }
            return WebActivitySchema.parse({
              tool: row.tool_name,
              state:
                row.status === 'succeeded'
                  ? 'succeeded'
                  : row.status === 'failed'
                    ? 'failed'
                    : 'pending',
              errorCode: result.error ?? null,
              candidates: result.results ?? [],
              searches: result.searches ?? null,
              extraCostUnknown: !!result.searchCost,
            });
          }),
        });
      }
      if (r.command === 'web.source')
        return ok({
          webSource: await this.source(s.id, WebCommandSchemas['web.source'].parse(p).sourceId),
        });
      if (r.command === 'web.saveProject') {
        const input = WebCommandSchemas['web.saveProject'].parse(p),
          source = await this.source(s.id, input.sourceId);
        const projects = new ProjectService(new FileRepository(this.store, this.blobs)),
          project = projects.get(input.projectId);
        if (s.project_id && s.project_id !== project.id)
          throw new StorageError('PERMISSION_DENIED');
        return projects.dispatch({
          ...r,
          command: 'projects.addText',
          expectedRevision: project.revision,
          payload: {
            projectId: project.id,
            name: source.title.slice(0, 120).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '网页来源',
            text: `${source.title}\n${source.url}\n访问时间：${new Date(source.fetchedAt).toISOString()}\nSHA256：${source.contentHash}\n\n${source.text.slice(0, 95000)}`,
            url: source.url,
          },
        });
      }
      return ok({
        webOptions: this.options(s.id),
        searchConfigured: await this.configured(s.id),
        projectOnly: this.projectOnly(s.id),
      });
    } catch (error) {
      return failure(
        r.requestId,
        error instanceof z.ZodError
          ? 'VALIDATION_ERROR'
          : error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
            ? ErrorCodeSchema.parse(error.message)
            : 'INTERNAL_ERROR',
      );
    }
  }
  run(
    sessionId: string,
    runId: string,
    userText: string,
    signal: AbortSignal,
    fixedOptions = this.options(sessionId),
  ) {
    const returned = new Set<string>();
    const runState = () =>
      this.store.db
        .prepare(
          'SELECT task_version,status FROM runs WHERE id=? AND session_id=? AND profile_id=?',
        )
        .get(runId, sessionId, this.store.profileId) as
        { task_version: number; status: string } | undefined;
    const version = runState()?.task_version;
    const allowedUrls = new Set<string>();
    const allow = (value: string) => {
      try {
        const url = new URL(value);
        url.hash = '';
        allowedUrls.add(url.href);
      } catch {}
    };
    for (const value of userText.match(/https?:\/\/[^\s<>"`]+/g) ?? []) {
      allow(value);
      allow(value.replace(/[)。，；！？,;.}]+$/, ''));
    }
    let searches = 0,
      reads = 0,
      roundReads = 0;
    const alive = () => {
      signal.throwIfAborted();
      this.session(sessionId);
      const state = runState();
      if (
        !state ||
        state.task_version !== version ||
        ['completed', 'partial', 'failed', 'budget_stopped', 'cancelled'].includes(state.status)
      )
        throw new StorageError('CONFLICT');
      if (!this.enabled(sessionId, userText)) throw new StorageError('PERMISSION_DENIED');
      if (JSON.stringify(this.options(sessionId)) !== JSON.stringify(fixedOptions))
        throw new StorageError('CONFLICT');
    };
    return {
      beginRound: () => {
        roundReads = 0;
      },
      execute: async (name: string, args: unknown) => {
        alive();
        if (name === 'web.search') {
          if (++searches > 2) throw new StorageError('BUDGET_EXCEEDED');
          const result = await this.tools.search(
            args,
            fixedOptions,
            userText,
            signal,
            this.tools.searcher ??
              (this.models
                ? (query, options, searchSignal) =>
                    this.search(sessionId, runId, query, options, searchSignal, alive)
                : undefined),
          );
          alive();
          const results = result.candidates;
          for (const candidate of results) allow(candidate.url);
          return JSON.stringify({
            trust: 'untrusted_candidates',
            results,
            searches: result.searches,
            searchCost: 'provider_may_charge_extra_amount_unknown',
            citationReady: false,
          });
        }
        if (name !== 'web.read') throw new StorageError('PERMISSION_DENIED');
        const requested = new URL(WebReadSchema.parse(args).url);
        requested.hash = '';
        if (!allowedUrls.has(requested.href)) throw new StorageError('PERMISSION_DENIED');
        if (++reads > 16 || ++roundReads > 8) throw new StorageError('BUDGET_EXCEEDED');
        const page = await this.tools.read(args, fixedOptions, signal);
        alive();
        const { maxChars, ...snapshot } = page;
        const source = WebSourceSchema.parse({ ...snapshot, sourceId: newId(), revision: 1 });
        allow(source.url);
        for (const link of source.links) allow(link);
        const blob = await this.blobs.put(
          Buffer.from(JSON.stringify(source)),
          'application/vnd.tapkit.web+json',
        );
        alive();
        this.store.db.transaction(() => {
          this.store.db
            .prepare(
              "INSERT INTO web_sources(id,profile_id,session_id,run_id,url,canonical_url,title,fetched_at,http_status,snapshot_blob_id,content_hash,access_type) VALUES(?,?,?,?,?,?,?,?,200,?,?,'public')",
            )
            .run(
              source.sourceId,
              this.store.profileId,
              sessionId,
              runId,
              source.url,
              source.url,
              source.title,
              source.fetchedAt,
              blob.id,
              source.contentHash,
            );
        })();
        returned.add(source.sourceId);
        return JSON.stringify({
          ...source,
          text: source.text.slice(0, maxChars),
          links: source.links.slice(0, 50),
          trust: 'untrusted_web_data',
          truncated: source.text.length > maxChars,
        });
      },
      evidence: async (text: string): Promise<ClaimSource[]> => {
        const sources: ClaimSource[] = [];
        for (const marker of text.matchAll(/\[\[web:([^\]]+)\]\]/g)) {
          alive();
          if (!returned.has(marker[1]!)) throw new StorageError('VALIDATION_ERROR');
          const source = await this.source(sessionId, marker[1]!);
          sources.push({ key: 'web:' + source.sourceId, text: source.text });
        }
        return sources;
      },
      validate: async (
        text: string,
        messageId: string,
        external: ClaimSource[] = [],
      ): Promise<ResourceRef[]> => {
        const snapshots = new Map<string, WebSource>();
        for (const marker of text.matchAll(/\[\[web:([^\]]+)\]\]/g)) {
          alive();
          if (!returned.has(marker[1]!)) throw new StorageError('VALIDATION_ERROR');
          snapshots.set(marker[1]!, await this.source(sessionId, marker[1]!));
        }
        const claims = verifySourceClaims(
          text,
          [
            ...external,
            ...[...snapshots.values()].map((source) => ({
              key: 'web:' + source.sourceId,
              text: source.text,
            })),
          ],
          returned.size > 0,
        );
        const verified = claims
          .filter((claim) => claim.key.startsWith('web:'))
          .map((claim) => ({ ...claim, source: snapshots.get(claim.key.slice(4))! }));
        alive();
        for (const { source, start, end } of verified)
          this.store.db
            .prepare(
              'INSERT INTO citations(id,profile_id,message_id,web_source_id,locator_json,quote_hash,claim_range_json,evidence_json,verified) VALUES(?,?,?,?,?,?,?,?,1)',
            )
            .run(
              newId(),
              this.store.profileId,
              messageId,
              source.sourceId,
              JSON.stringify({ kind: 'web', blockId: 'body', start: 0, end: source.text.length }),
              source.contentHash,
              JSON.stringify({ start, end }),
              JSON.stringify({
                sourceId: source.sourceId,
                revision: source.revision,
                fetchedAt: source.fetchedAt,
              }),
            );
        return verified.map(({ source }) => ({
          kind: 'web',
          sourceId: source.sourceId,
          revision: source.revision,
          locator: { kind: 'web', blockId: 'body' },
        }));
      },
    };
  }
}
