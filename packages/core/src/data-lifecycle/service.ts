import { createHash } from 'node:crypto';
import {
  ClearJobPayloadSchema,
  DataClearPreviewSchema,
  DataClearSchema,
  DataCommandSchemas,
  DataImpactSchema,
  DataStatusSchema,
  ReplySchema,
  z,
  type CoreCommandSchema,
  type DataCommand,
  type Reply,
  type Request,
} from '@tapkit/contracts';
import {
  backupPruneCount,
  BlobStore,
  failure,
  lastLocalRestore,
  localBackups,
  pruneBackups,
  replayClearRecord,
  SCHEMA_VERSION,
  stageLocalRestore,
  StorageError,
  writeClearRecord,
  type Job,
  type Store,
} from '@tapkit/storage';
import { PortableData } from './portable';

type Preview = z.infer<typeof DataClearPreviewSchema>;
type Transfer = Extract<z.infer<typeof CoreCommandSchema>, { type: 'data.transfer' }>;
const positive = (requestId: string, data: unknown) =>
  ReplySchema.parse({ ok: true, requestId, data });
function safeFailure(requestId: string, error: unknown) {
  return failure(
    requestId,
    error instanceof StorageError
      ? error.code
      : error instanceof z.ZodError
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR',
  );
}
export class DataLifecycle {
  private readonly portable: PortableData;
  private readonly transfers = new Map<string, AbortController>();
  private readonly active = new Set<Promise<Reply>>();
  private stopping = false;
  private stagingRestore = false;
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
  ) {
    this.portable = new PortableData(store, blobs);
  }
  private async impact(input: Preview) {
    const backups = input.includeBackups ? await backupPruneCount(this.store.dataDir) : 0;
    const db = this.store.db,
      profile = this.store.profileId;
    const categories = new Set(input.categories);
    const table = {
      session: 'sessions',
      project: 'projects',
      file: 'files',
      memory: 'memories',
    } as const;
    return db.transaction(() => {
      const read = (type: keyof typeof table, extra: string, ...args: string[]) =>
        (
          db
            .prepare(
              `SELECT id,revision FROM ${table[type]} t WHERE profile_id=? AND NOT EXISTS (SELECT 1 FROM deletion_tombstones d WHERE d.profile_id=t.profile_id AND d.entity_type=? AND d.entity_id=t.id) AND (${extra}) ORDER BY id LIMIT 100001`,
            )
            .all(profile, type, ...args) as { id: string; revision: number }[]
        ).map((row) => ({ type, ...row }));
      const projects = categories.has('projects') ? read('project', '1') : [];
      const selectedProjects = JSON.stringify(projects.map((x) => x.id));
      const sessions = categories.has('sessions')
        ? read('session', '1')
        : read('session', 'project_id IN (SELECT value FROM json_each(?))', selectedProjects);
      const files = categories.has('files') ? read('file', '1') : [];
      const memories = categories.has('memories')
        ? read('memory', '1')
        : read(
            'memory',
            "scope_type='project' AND scope_id IN (SELECT value FROM json_each(?))",
            selectedProjects,
          );
      const selected = [...projects, ...sessions, ...files, ...memories];
      if (selected.length > 100_000) throw new StorageError('QUOTA_EXHAUSTED');
      const sessionIds = JSON.stringify(sessions.map((x) => x.id)),
        fileIds = JSON.stringify(files.map((x) => x.id));
      const count = (sql: string, ...args: string[]) =>
        (db.prepare(sql).get(profile, ...args) as { n: number }).n;
      const messages = count(
        'SELECT count(*) n FROM messages WHERE profile_id=? AND session_id IN(SELECT value FROM json_each(?))',
        sessionIds,
      );
      const links = count(
        "SELECT count(*) n FROM resource_links WHERE profile_id=? AND deleted_at IS NULL AND ((resource_type='file' AND resource_id IN(SELECT value FROM json_each(?))) OR (owner_type='session' AND owner_id IN(SELECT value FROM json_each(?))) OR (owner_type='project' AND owner_id IN(SELECT value FROM json_each(?))))",
        fileIds,
        sessionIds,
        selectedProjects,
      );
      const indexes =
        count(
          'SELECT count(*) n FROM file_search_documents WHERE profile_id=? AND file_id IN(SELECT value FROM json_each(?))',
          fileIds,
        ) +
        count(
          'SELECT count(*) n FROM history_search_documents WHERE profile_id=? AND session_id IN(SELECT value FROM json_each(?))',
          sessionIds,
        );
      const previews = count(
        'SELECT count(*) n FROM file_versions WHERE profile_id=? AND preview_blob_id IS NOT NULL AND file_id IN(SELECT value FROM json_each(?))',
        fileIds,
      );
      const runs = count(
        'SELECT count(*) n FROM runs WHERE profile_id=? AND session_id IN(SELECT value FROM json_each(?))',
        sessionIds,
      );
      const caches =
        count(
          'SELECT count(*) n FROM parsed_documents p JOIN file_versions v ON v.id=p.file_version_id WHERE p.profile_id=? AND p.deleted_at IS NULL AND v.file_id IN(SELECT value FROM json_each(?))',
          fileIds,
        ) +
        count(
          'SELECT count(*) n FROM context_snapshots c JOIN runs r ON r.id=c.run_id WHERE r.profile_id=? AND r.session_id IN(SELECT value FROM json_each(?))',
          sessionIds,
        );
      const relatedMemories = count(
        `SELECT count(*) n FROM memories m WHERE m.profile_id=? AND m.status='active' AND m.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM json_each(m.source_ids_json) source JOIN messages msg
          ON msg.id=CASE WHEN source.type='object' THEN json_extract(source.value,'$.messageId') ELSE source.value END
          WHERE msg.session_id IN (SELECT value FROM json_each(?)))`,
        sessionIds,
      );
      const impact = {
        sessions: sessions.length,
        projects: projects.length,
        files: files.length,
        memories: memories.length,
        messages,
        links,
        indexes,
        previews,
        caches,
        relatedMemories,
        runs,
        backups,
        includeBackups: input.includeBackups,
      };
      const impactHash = createHash('sha256')
        .update(JSON.stringify({ selected, impact, categories: [...categories].sort() }))
        .digest('hex');
      return {
        view: DataImpactSchema.parse({ ...impact, impactHash }),
        targets: selected.map(({ type, id }) => ({ type, id })),
      };
    })();
  }
  async dispatch(request: Request): Promise<Reply> {
    try {
      if (this.store.volatile) throw new StorageError('PERMISSION_DENIED');
      const db = this.store.db,
        profile = this.store.profileId;
      switch (request.command as DataCommand) {
        case 'data.status': {
          DataCommandSchemas['data.status'].parse(request.payload);
          const backups = (await localBackups(this.store.dataDir))
            .slice(0, 100)
            .map(({ manifest: m }) => ({
              id: m.id,
              createdAt: m.createdAt,
              verified: !!m.databaseHash,
            }));
          const jobs = (
            db
              .prepare(
                "SELECT id,kind,status,attempts,result_ref FROM jobs WHERE profile_id=? AND kind IN('data.backup','data.clear') ORDER BY created_at DESC,id DESC LIMIT 30",
              )
              .all(profile) as {
              id: string;
              kind: string;
              status: string;
              attempts: number;
              result_ref: string | null;
            }[]
          ).map((job) => ({
            id: job.id,
            kind: job.kind,
            status: job.status,
            attempts: job.attempts,
            stage:
              job.status === 'completed'
                ? 'completed'
                : job.result_ref === 'backups' || job.result_ref === 'garbage'
                  ? job.result_ref
                  : 'queued',
          }));
          return positive(request.requestId, {
            dataStatus: DataStatusSchema.parse({
              dataRoot: this.store.dataDir,
              backups,
              jobs,
              lastRestore: await lastLocalRestore(this.store.dataDir),
            }),
          });
        }
        case 'data.clearPreview': {
          const p = DataClearPreviewSchema.parse(request.payload);
          return positive(request.requestId, { dataImpact: (await this.impact(p)).view });
        }
        case 'data.clear': {
          const p = DataClearSchema.parse(request.payload);
          if (this.stopping || this.stagingRestore) throw new StorageError('CONFLICT');
          const existing = db
            .prepare(
              "SELECT payload_json FROM jobs WHERE id=? AND profile_id=? AND kind='data.clear'",
            )
            .get(request.requestId, profile) as { payload_json: string } | undefined;
          if (existing) {
            const saved = ClearJobPayloadSchema.parse(JSON.parse(existing.payload_json));
            if (saved.impactHash !== p.impactHash || saved.includeBackups !== p.includeBackups)
              throw new StorageError('CONFLICT');
            return positive(request.requestId, { jobId: request.requestId });
          }
          const { view, targets } = await this.impact(p);
          if (view.impactHash !== p.impactHash || !targets.length)
            throw new StorageError('CONFLICT');
          return this.store.receipt(request, () => {
            const record = {
              schemaVersion: 1 as const,
              profileId: profile,
              deletedAt: this.store.now(),
              operationId: request.requestId,
              clear: ClearJobPayloadSchema.parse({
                schemaVersion: 1,
                kind: 'data.clear',
                targets,
                includeBackups: p.includeBackups,
                impactHash: p.impactHash,
              }),
            };
            replayClearRecord(this.store, record);
            this.store.emit(
              'workspace.updated',
              { kind: 'workspace', entityId: profile },
              request.requestId,
            );
            writeClearRecord(this.store, record);
            return positive(request.requestId, { jobId: request.requestId });
          });
        }
        case 'data.retryClear': {
          const { jobId } = DataCommandSchemas['data.retryClear'].parse(request.payload);
          return this.store.receipt(request, () => {
            const result = db
              .prepare(
                "UPDATE jobs SET status='queued',error_code=NULL,updated_at=?,next_attempt_at=?,lease_epoch=lease_epoch+1,revision=revision+1 WHERE id=? AND profile_id=? AND kind='data.clear' AND status='failed'",
              )
              .run(this.store.now(), this.store.now(), jobId, profile);
            if (!result.changes) throw new StorageError('CONFLICT');
            return positive(request.requestId, { jobId });
          });
        }
        default:
          return failure(request.requestId, 'FEATURE_NOT_AVAILABLE');
      }
    } catch (error) {
      return safeFailure(request.requestId, error);
    }
  }
  async executeClear(job: Job, signal: AbortSignal) {
    const p = ClearJobPayloadSchema.parse(JSON.parse(job.payload_json));
    const stage = (value: 'backups' | 'garbage') => {
      signal.throwIfAborted();
      if (
        !this.store.db
          .prepare(
            "UPDATE jobs SET result_ref=?,updated_at=? WHERE id=? AND status='running' AND lease_epoch=? AND lease_owner=?",
          )
          .run(value, this.store.now(), job.id, job.lease_epoch, job.lease_owner).changes
      )
        throw new StorageError('CONFLICT');
    };
    if (p.includeBackups) {
      stage('backups');
      await pruneBackups(this.store, p.targets, signal);
    }
    stage('garbage');
    await this.blobs.gc(signal);
    signal.throwIfAborted();
    return 'completed';
  }
  transfer(command: Transfer): Promise<Reply> {
    if (this.stopping || this.stagingRestore || this.transfers.size)
      return Promise.resolve(failure(command.requestId, 'CONFLICT'));
    const controller = new AbortController();
    this.transfers.set(command.windowId, controller);
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 120_000);
    timer.unref();
    const operation = (
      command.selection.action === 'export'
        ? this.portable.export(command.selection.categories, command.path, signal)
        : this.portable.importFile(command.path, signal)
    )
      .then((dataTransfer) => positive(command.requestId, { dataTransfer }))
      .catch((error) =>
        signal.aborted
          ? failure(command.requestId, 'CANCELLED')
          : safeFailure(command.requestId, error),
      )
      .finally(() => {
        clearTimeout(timer);
        this.transfers.delete(command.windowId);
        this.active.delete(operation);
      });
    this.active.add(operation);
    return operation;
  }
  async restore(requestId: string, id: string): Promise<Reply> {
    const clearing = this.store.db
      .prepare(
        "SELECT 1 FROM jobs WHERE profile_id=? AND kind='data.clear' AND status IN ('queued','running') LIMIT 1",
      )
      .get(this.store.profileId);
    if (this.stopping || this.transfers.size || this.stagingRestore || clearing)
      return failure(requestId, 'CONFLICT');
    this.stagingRestore = true;
    try {
      await stageLocalRestore(this.store, id, SCHEMA_VERSION, (backupId) =>
        this.blobs.backup(backupId),
      );
      return positive(requestId, { status: 'completed' });
    } catch (error) {
      this.stagingRestore = false;
      return safeFailure(requestId, error);
    }
  }
  checkMove(requestId: string) {
    if (this.stopping || this.transfers.size || this.stagingRestore)
      return failure(requestId, 'CONFLICT');
    // Linked Git worktrees contain paths into their external repository metadata.
    const linked = this.store.db
      .prepare(
        "SELECT 1 FROM worktrees w JOIN code_projects p ON p.id=w.code_project_id WHERE p.profile_id=? AND w.state IN('prepared','unknown') LIMIT 1",
      )
      .get(this.store.profileId);
    if (linked) return failure(requestId, 'CONFLICT');
    return positive(requestId, { status: 'completed' });
  }
  closeWindow(windowId: string) {
    this.transfers.get(windowId)?.abort();
  }
  async stop() {
    this.stopping = true;
    for (const controller of this.transfers.values()) controller.abort();
    await Promise.all(this.active);
  }
}
