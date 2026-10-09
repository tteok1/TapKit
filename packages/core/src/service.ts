import { unavailableExecution, type ExecutionCapabilities } from '@tapkit/contracts';
import { z } from '@tapkit/contracts';
import {
  RequestSchema,
  SettingsGetSchema,
  SettingsSetSchema,
  SettingsDocumentSchema,
  RegisterCredentialSchema,
  resolveApiConfig,
  ReplaySchema,
  IdSchema,
  ReplySchema,
  WorkspaceViewSchema,
  SessionCreateSchema,
  ProjectCreateSchema,
  PinSessionSchema,
  type Reply,
} from '@tapkit/contracts';
import { Store, JobQueue, StorageError, failure, newId } from '@tapkit/storage';
export class CoreService {
  readonly jobs: JobQueue;
  constructor(
    readonly store: Store,
    readonly executionCapabilities: ExecutionCapabilities = unavailableExecution('PROBE_REQUIRED'),
  ) {
    this.jobs = new JobQueue(store);
  }
  dispatch(raw: unknown): Reply {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const request = parsed.data,
      ok = (data: unknown, revision?: number): Reply =>
        ReplySchema.parse({
          ok: true,
          requestId: request.requestId,
          data,
          ...(revision === undefined ? {} : { revision }),
        });
    try {
      switch (request.command) {
        case 'desktop.workspace': {
          z.strictObject({}).parse(request.payload);
          const sessions = this.store.db
            .prepare(
              'SELECT id,title,mode,revision,pinned_at,unread_event_seq,updated_at FROM sessions WHERE profile_id=? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY pinned_at DESC,last_activity_at DESC,id LIMIT 100',
            )
            .all(this.store.profileId) as {
            id: string;
            title: string;
            mode: string;
            revision: number;
            pinned_at: number | null;
            unread_event_seq: number;
            updated_at: number;
          }[];
          const projects = this.store.db
            .prepare(
              'SELECT id,name,revision,pinned_at FROM projects WHERE profile_id=? AND deleted_at IS NULL ORDER BY pinned_at DESC,updated_at DESC,id LIMIT 100',
            )
            .all(this.store.profileId)
            .map((row) => {
              const p = row as {
                id: string;
                name: string;
                revision: number;
                pinned_at: number | null;
              };
              return { id: p.id, name: p.name, revision: p.revision, pinned: p.pinned_at !== null };
            });
          const files = this.store.db
            .prepare(
              'SELECT id,display_name AS name,status FROM files WHERE profile_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 100',
            )
            .all(this.store.profileId);
          const pending = this.store.db
            .prepare(
              "SELECT count(*) AS count FROM approvals WHERE profile_id=? AND deleted_at IS NULL AND decision='pending' AND expires_at>?",
            )
            .get(this.store.profileId, this.store.now()) as { count: number };
          const eventSeq = (
            this.store.db
              .prepare(
                "SELECT coalesce(max(seq),0) AS seq FROM events WHERE profile_id=? AND stream_id='profile'",
              )
              .get(this.store.profileId) as { seq: number }
          ).seq;
          return ok(
            WorkspaceViewSchema.parse({
              eventSeq,
              sessions: sessions.map((s) => ({
                id: s.id,
                title: s.title,
                mode: s.mode,
                revision: s.revision,
                pinned: s.pinned_at !== null,
                unread: s.unread_event_seq > 0,
                updatedAt: s.updated_at,
              })),
              projects,
              files,
              pendingApprovals: pending.count,
            }),
          );
        }
        case 'sessions.create': {
          const p = SessionCreateSchema.parse(request.payload);
          return this.store.receipt(request, () => {
            const id = newId(),
              branch = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,active_branch_id,settings_json,last_activity_at) VALUES(?,?,?,?,?,?,?,?,?)',
              )
              .run(
                id,
                this.store.profileId,
                now,
                now,
                p.title,
                p.mode,
                branch,
                JSON.stringify({ schemaVersion: 1, values: {} }),
                now,
              );
            this.store.db
              .prepare(
                'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label) VALUES(?,?,?,?,?,?)',
              )
              .run(branch, this.store.profileId, now, now, id, '主分支');
            this.store.emit(
              'workspace.updated',
              { kind: 'workspace', entityId: id },
              request.requestId,
            );
            return ok({ entityId: id }, 1);
          });
        }
        case 'projects.create': {
          const p = ProjectCreateSchema.parse(request.payload);
          return this.store.receipt(request, () => {
            const id = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                'INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)',
              )
              .run(id, this.store.profileId, now, now, p.name);
            this.store.emit(
              'workspace.updated',
              { kind: 'workspace', entityId: id },
              request.requestId,
            );
            return ok({ entityId: id }, 1);
          });
        }
        case 'sessions.pin': {
          const p = PinSessionSchema.parse(request.payload);
          if (request.expectedRevision === undefined) throw new StorageError('VALIDATION_ERROR');
          return this.store.receipt(request, () => {
            const row = this.store.db
              .prepare(
                'SELECT revision FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
              )
              .get(p.sessionId, this.store.profileId) as { revision: number } | undefined;
            if (!row) throw new StorageError('NOT_FOUND');
            if (row.revision !== request.expectedRevision)
              throw new StorageError('CONFLICT', row.revision);
            this.store.db
              .prepare(
                'UPDATE sessions SET pinned_at=?,updated_at=?,revision=revision+1 WHERE id=? AND profile_id=? AND revision=?',
              )
              .run(
                p.pinned ? this.store.now() : null,
                this.store.now(),
                p.sessionId,
                this.store.profileId,
                row.revision,
              );
            this.store.emit(
              'workspace.updated',
              { kind: 'workspace', entityId: p.sessionId },
              request.requestId,
            );
            return ok({ entityId: p.sessionId }, row.revision + 1);
          });
        }
        case 'app.bootstrap':
          z.strictObject({}).parse(request.payload);
          return ok({ ...this.store.bootstrap(), runtimeCapabilities: this.executionCapabilities });
        case 'settings.get': {
          const p = SettingsGetSchema.parse(request.payload);
          this.scope(p.scope.id);
          return ok(this.store.settings, this.store.settings.revision);
        }
        case 'events.replay': {
          const p = ReplaySchema.parse(request.payload);
          return ok(this.store.replay(p.afterSeq, p.limit));
        }
        case 'settings.set': {
          const p = SettingsSetSchema.parse(request.payload);
          this.scope(p.scope.id);
          if (request.expectedRevision === undefined) throw new StorageError('VALIDATION_ERROR');
          return this.store.receipt(request, () => {
            const current = this.store.settings;
            if (request.expectedRevision !== current.revision)
              throw new StorageError('CONFLICT', current.revision);
            const values = SettingsDocumentSchema.parse({
                schemaVersion: 1,
                values: { ...current.values, ...p.patch },
              }).values,
              revision = current.revision + 1;
            this.store.db
              .prepare(
                "UPDATE settings SET value_json=?,revision=?,updated_at=? WHERE profile_id=? AND scope_type='profile' AND key='preferences' AND revision=?",
              )
              .run(
                JSON.stringify(SettingsDocumentSchema.parse({ schemaVersion: 1, values })),
                revision,
                this.store.now(),
                this.store.profileId,
                current.revision,
              );
            this.store.emit(
              'settings.updated',
              { kind: 'settings', entity: { revision } },
              request.requestId,
            );
            if (p.patch.personal)
              this.store.db
                .prepare(
                  'UPDATE profiles SET display_name=?,updated_at=?,revision=revision+1 WHERE id=?',
                )
                .run(values.personal.nickname, this.store.now(), this.store.profileId);
            return ok({ values, revision }, revision);
          });
        }
        case 'providers.saveApiKey': {
          // Host has removed the secret before this private message reaches Core.
          const p = RegisterCredentialSchema.parse(request.payload);
          const config = resolveApiConfig(p.providerId, {
            ...(p.apiFormat ? { apiFormat: p.apiFormat } : {}),
            ...(p.baseURL ? { baseURL: p.baseURL } : {}),
            ...(p.modelId ? { modelId: p.modelId } : {}),
          });
          return this.store.receipt(request, () => {
            const id = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id,credential_hint) VALUES (?,?,?,?,?,?,'api_key',?,'unconfigured',?,?,?,?)",
              )
              .run(
                id,
                this.store.profileId,
                now,
                now,
                p.providerId,
                p.label,
                p.credentialId,
                config.apiFormat,
                config.baseURL,
                config.modelId,
                p.credentialHint ?? null,
              );
            const view = { accountId: id, status: 'unconfigured' as const };
            this.store.emit(
              'provider.updated',
              { kind: 'provider', entity: view },
              request.requestId,
            );
            return ok(view);
          });
        }
        case 'data.backup':
          z.strictObject({}).parse(request.payload);
          return this.store.receipt(request, () =>
            ok({
              jobId: this.jobs.enqueue(
                { schemaVersion: 1, kind: 'data.backup' },
                'backup:' + request.requestId,
              ),
            }),
          );
        case 'jobs.cancel': {
          const p = z.strictObject({ jobId: IdSchema }).parse(request.payload);
          return this.store.receipt(request, () => ok({ status: this.jobs.cancel(p.jobId) }));
        }
        default:
          return failure(request.requestId, 'FEATURE_NOT_AVAILABLE');
      }
    } catch (error) {
      return failure(
        request.requestId,
        error instanceof StorageError
          ? error.code
          : error instanceof z.ZodError
            ? 'VALIDATION_ERROR'
            : 'INTERNAL_ERROR',
        error instanceof StorageError ? error.currentRevision : undefined,
      );
    }
  }
  private scope(id: string) {
    if (id !== this.store.profileId) throw new StorageError('PERMISSION_DENIED');
  }
}
