import { createHash } from 'node:crypto';
import { memoryStore, MemoryBlobStore, StorageError, failure, type Store } from '@tapkit/storage';
import { RequestSchema, ReplySchema, z, HistorySessionSchema, type Reply } from '@tapkit/contracts';
import { ProviderService } from './provider-service';
import { ModelService } from './model-service';
import { CoreService } from './service';
import { ChatService } from './chat-service';
import { HistoryService } from './history-service';
export class TemporaryService {
  private sessions = new Map<
    string,
    {
      owner: string;
      store: Store;
      blobs: MemoryBlobStore;
      chat: ChatService;
      history: HistoryService;
      models: ModelService;
      providers: ProviderService;
    }
  >();
  constructor(
    readonly store: Store,
    readonly models: ModelService,
    readonly providers: ProviderService,
    readonly configure?: (m: ModelService) => void,
  ) {}
  owns(id: string) {
    return this.sessions.has(id);
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const r = parsed.data;
    try {
      if (!r.windowId) throw new StorageError('PERMISSION_DENIED');
      if (r.command === 'sessions.temporary') {
        z.strictObject({}).parse(r.payload);
        if ([...this.sessions.values()].filter((s) => s.owner === r.windowId).length >= 4)
          throw new StorageError('BUDGET_EXCEEDED');
        const store = memoryStore(this.store),
          blobs = new MemoryBlobStore(store),
          native = new Map<string, { binding: unknown; value: unknown; hash: string }>();
        const providers = new ProviderService(store, async (op, account, payload) => {
          if (op === 'native.save') {
            const p = payload as { ref: string; binding: unknown; value: unknown };
            const hash = createHash('sha256').update(JSON.stringify(p.value)).digest('hex');
            native.set(p.ref, { binding: p.binding, value: p.value, hash });
            return { contentHash: hash };
          }
          if (op === 'native.load') {
            const p = payload as { ref: string; binding: unknown; contentHash: string };
            const value = native.get(p.ref);
            if (
              !value ||
              value.hash !== p.contentHash ||
              JSON.stringify(value.binding) !== JSON.stringify(p.binding)
            )
              throw new StorageError('PERMISSION_DENIED');
            return value.value;
          }
          if (!['credential.read', 'credential.write', 'api-key.read'].includes(op))
            throw new StorageError('PERMISSION_DENIED');
          if (
            !this.store.db
              .prepare(
                'SELECT id FROM provider_accounts WHERE id=? AND profile_id=? AND deleted_at IS NULL',
              )
              .get(account, this.store.profileId)
          )
            throw new StorageError('AUTH_REQUIRED');
          return this.providers.vault(op, account, payload);
        });
        const models = new ModelService(store, providers, this.models);
        models.claimRoot = this.models.claimRoot;
        this.configure?.(models);
        const core = new CoreService(store),
          created = core.dispatch({
            ...r,
            command: 'sessions.create',
            payload: { mode: 'chat', title: '临时聊天' },
          });
        if (!created.ok) throw new StorageError(created.error.code);
        const sessionId = (created.data as { entityId: string }).entityId,
          chat = new ChatService(store, blobs, models),
          history = new HistoryService(store, blobs, chat, true);
        this.sessions.set(sessionId, {
          owner: r.windowId,
          store,
          blobs,
          chat,
          history,
          models,
          providers,
        });
        chat.start();
        return ReplySchema.parse({
          ok: true,
          requestId: r.requestId,
          data: { sessionId, branchId: chat.session(sessionId).active_branch_id },
        });
      }
      const payload = r.payload as { sessionId?: string; runId?: string; inputId?: string },
        entry = payload.sessionId
          ? this.sessions.get(payload.sessionId)
          : [...this.sessions.values()].find((v) =>
              payload.runId
                ? !!v.store.db.prepare('SELECT id FROM runs WHERE id=?').get(payload.runId)
                : payload.inputId
                  ? !!v.store.db
                      .prepare('SELECT id FROM pending_inputs WHERE id=?')
                      .get(payload.inputId)
                  : false,
            );
      if (!entry || entry.owner !== r.windowId) throw new StorageError('PERMISSION_DENIED');
      if (r.command === 'sessions.closeTemporary') {
        const p = HistorySessionSchema.parse(r.payload);
        await this.close(p.sessionId);
        return ReplySchema.parse({
          ok: true,
          requestId: r.requestId,
          data: { updatedIds: [p.sessionId], failed: [] },
        });
      }
      const settings = this.store.settings.values;
      entry.store.db
        .prepare(
          "UPDATE settings SET value_json=? WHERE key='preferences' AND scope_type='profile'",
        )
        .run(JSON.stringify({ schemaVersion: 1, values: settings }));
      if (
        /^(sessions\.|messages\.(edit|regenerate|switchBranch|deletePreview|delete|mark|transform|saveNote)$|search\.)/.test(
          r.command,
        )
      )
        return entry.history.dispatch(r);
      return entry.chat.dispatch(r);
    } catch (e) {
      return failure(
        r.requestId,
        e instanceof StorageError
          ? e.code
          : e instanceof z.ZodError
            ? 'VALIDATION_ERROR'
            : 'INTERNAL_ERROR',
      );
    }
  }
  async close(id: string) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    s.history.stop();
    await s.chat.stop();
    await s.models.stop();
    await s.providers.stop();
    s.blobs.clear();
    s.store.close();
  }
  async closeWindow(owner: string) {
    await Promise.all(
      [...this.sessions].filter(([, v]) => v.owner === owner).map(([id]) => this.close(id)),
    );
  }
  cancelAccount(id: string) {
    for (const s of this.sessions.values()) {
      s.chat.cancelAccount(id);
      s.models.cancelAccount(id);
    }
  }
  async stop() {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
  target(raw: unknown) {
    const p = raw as { sessionId?: string; runId?: string; inputId?: string };
    return (
      (!!p?.sessionId && this.sessions.has(p.sessionId)) ||
      [...this.sessions.values()].some((s) =>
        p?.runId
          ? !!s.store.db.prepare('SELECT id FROM runs WHERE id=?').get(p.runId)
          : p?.inputId
            ? !!s.store.db.prepare('SELECT id FROM pending_inputs WHERE id=?').get(p.inputId)
            : false,
      )
    );
  }
}
