import {
  AccountCredentialStore,
  CodexAdapter,
  CodexLogin,
  CodexCredentialSchema,
  CODEX_ADAPTER_VERSION,
  classifyCodexError,
  codexCatalog,
  configureProviderNetwork,
  ApiKeyAdapter,
  apiFetchForNetwork,
  API_ADAPTER_VERSION,
  type NativeStateStore,
} from '@tapkit/providers';
import { Store, newId, failure, StorageError } from '@tapkit/storage';
import {
  z,
  RequestSchema,
  ReplySchema,
  StartLoginSchema,
  AnswerLoginSchema,
  LoginIdSchema,
  AccountIdSchema,
  CheckProviderSchema,
  AccountViewSchema,
  ApiConfigSchema,
  resolveApiConfig,
  type Reply,
  type Request,
  type ModelView,
} from '@tapkit/contracts';

export type PrivateVault = (
  operation:
    | 'credential.read'
    | 'credential.write'
    | 'native.save'
    | 'native.load'
    | 'native.purge'
    | 'browser.open'
    | 'api-key.read'
    | 'api-key.delete',
  accountId: string,
  payload: unknown,
) => Promise<unknown>;
export class ProviderService {
  private networkKey = '';
  private restoreNetwork: (() => void) | undefined;
  private prepareNetwork() {
    const network = this.store.settings.values.network,
      key = JSON.stringify(network);
    if (this.networkKey !== key) {
      this.restoreNetwork?.();
      this.networkKey = '';
      this.restoreNetwork = configureProviderNetwork(
        network.mode === 'environment'
          ? process.env
          : network.mode === 'manual'
            ? { TAPKIT_HTTP_PROXY: network.proxyURL }
            : { TAPKIT_HTTP_PROXY: '' },
      );
      this.networkKey = key;
    }
  }
  private readonly channels = new Map<string, CodexAdapter | ApiKeyAdapter>();
  private readonly logins = new Map<string, CodexLogin>();
  private readonly loginCleanup = new Map<string, Promise<void>>();
  private readonly accountLogins = new Map<string, string>();
  private readonly disconnecting = new Set<string>();
  private readonly probes = new Map<
    string,
    { controller: AbortController; done: Promise<Reply> }
  >();
  constructor(
    readonly store: Store,
    readonly vault: PrivateVault,
  ) {}
  private account(accountId: string) {
    const row = this.store.db
      .prepare(
        'SELECT id AS accountId,provider_id AS providerId,label,status,revision,last_error_code AS lastErrorCode,api_format AS apiFormat,base_url AS baseURL,model_id AS modelId,credential_hint AS credentialHint FROM provider_accounts WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(accountId, this.store.profileId);
    if (!row) throw new StorageError('NOT_FOUND');
    return AccountViewSchema.parse(
      Object.fromEntries(
        Object.entries(row).filter(([key, value]) => value !== null || key === 'lastErrorCode'),
      ),
    );
  }
  private apiBinding(accountId: string) {
    const account = this.account(accountId);
    const row = this.store.db
      .prepare(
        'SELECT credential_id FROM provider_accounts WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(accountId, this.store.profileId) as { credential_id: string };
    const config = resolveApiConfig(ApiConfigSchema.shape.providerId.parse(account.providerId), {
      ...(account.apiFormat ? { apiFormat: account.apiFormat } : {}),
      ...(account.baseURL ? { baseURL: account.baseURL } : {}),
      ...(account.modelId ? { modelId: account.modelId } : {}),
    });
    return { ...config, credentialId: row.credential_id };
  }
  private catalogVersion(accountId: string) {
    const account = this.account(accountId);
    return (
      (account.providerId === 'codex-subscription'
        ? CODEX_ADAPTER_VERSION
        : API_ADAPTER_VERSION + ':' + account.apiFormat) +
      ':' +
      accountId
    );
  }
  private channel(accountId: string) {
    this.prepareNetwork();
    const account = this.account(accountId);
    let channel = this.channels.get(accountId);
    if (!channel) {
      const credentials = new AccountCredentialStore({
        read: async () => {
          const value = z
            .strictObject({
              version: z.number().int().nonnegative(),
              credential: CodexCredentialSchema.optional(),
            })
            .parse(await this.vault('credential.read', accountId, {}));
          return {
            version: value.version,
            ...(value.credential ? { credential: value.credential } : {}),
          };
        },
        write: async (expectedVersion, credential) => {
          await this.vault('credential.write', accountId, {
            expectedVersion,
            ...(credential ? { credential } : {}),
          });
        },
      });
      const native: NativeStateStore = {
        save: async (binding, value) => {
          const ref = newId();
          const { contentHash } = z
            .strictObject({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) })
            .parse(await this.vault('native.save', accountId, { ref, binding, value }));
          const now = this.store.now();
          this.store.db
            .prepare(
              'INSERT INTO opaque_states(id,profile_id,created_at,updated_at,account_id,model_ref,adapter_version,branch_id,cipher_blob_ref,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              ref,
              this.store.profileId,
              now,
              now,
              accountId,
              binding.modelId,
              binding.adapterVersion,
              binding.branchId,
              ref,
              contentHash,
            );
          return ref;
        },
        load: async (ref, binding) => {
          const row = this.store.db
            .prepare(
              'SELECT account_id,model_ref,adapter_version,branch_id,content_hash FROM opaque_states WHERE id=? AND profile_id=? AND deleted_at IS NULL',
            )
            .get(ref, this.store.profileId) as
            | {
                account_id: string;
                model_ref: string;
                adapter_version: string;
                branch_id: string;
                content_hash: string;
              }
            | undefined;
          if (
            !row ||
            row.account_id !== accountId ||
            row.model_ref !== binding.modelId ||
            row.adapter_version !== binding.adapterVersion ||
            row.branch_id !== binding.branchId
          )
            throw new StorageError('PERMISSION_DENIED');
          return this.vault('native.load', accountId, {
            ref,
            binding,
            contentHash: row.content_hash,
          });
        },
      };
      channel =
        account.providerId === 'codex-subscription'
          ? new CodexAdapter(accountId, credentials, native)
          : new ApiKeyAdapter(
              accountId,
              resolveApiConfig(ApiConfigSchema.shape.providerId.parse(account.providerId), {
                ...(account.apiFormat ? { apiFormat: account.apiFormat } : {}),
                ...(account.baseURL ? { baseURL: account.baseURL } : {}),
                ...(account.modelId ? { modelId: account.modelId } : {}),
              }),
              async () => {
                const result = z
                  .strictObject({ key: z.string().optional() })
                  .parse(await this.vault('api-key.read', accountId, this.apiBinding(accountId)));
                return result.key;
              },
              native,
              (input, init) => apiFetchForNetwork(this.store.settings.values.network)(input, init),
            );
      this.channels.set(accountId, channel);
    }
    return channel;
  }
  adapter(accountId: string) {
    if (this.disconnecting.has(accountId)) throw new StorageError('AUTH_REQUIRED');
    this.prepareNetwork();
    return this.channel(accountId);
  }
  private update(
    accountId: string,
    status: 'unconfigured' | 'ready' | 'expired' | 'unavailable',
    errorCode: string | null,
    checked = false,
  ) {
    this.store.db.transaction(() => {
      this.store.db
        .prepare(
          'UPDATE provider_accounts SET status=?,last_error_code=?,last_check_at=CASE WHEN ? THEN ? ELSE last_check_at END,updated_at=?,revision=revision+1 WHERE id=? AND profile_id=?',
        )
        .run(
          status,
          errorCode,
          checked ? 1 : 0,
          this.store.now(),
          this.store.now(),
          accountId,
          this.store.profileId,
        );
      this.store.emit('provider.updated', { kind: 'provider', entity: { accountId, status } });
    })();
  }
  private ok(request: Request, data: unknown): Reply {
    return ReplySchema.parse({ ok: true, requestId: request.requestId, data });
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const request = parsed.data;
    try {
      switch (request.command) {
        case 'providers.list': {
          z.strictObject({}).parse(request.payload);
          const rows = this.store.db
            .prepare(
              'SELECT id FROM provider_accounts WHERE profile_id=? AND deleted_at IS NULL ORDER BY created_at,id',
            )
            .all(this.store.profileId) as { id: string }[];
          const accounts = await Promise.all(
            rows.map(async (row) => ({
              ...this.account(row.id),
              hasCredential: await this.channel(row.id).hasCredential(),
            })),
          );
          const models = (
            await Promise.all(
              accounts.map((account) =>
                this.channel(account.accountId).listModels(
                  account.accountId,
                  new AbortController().signal,
                ),
              ),
            )
          ).flat();
          for (const model of models) {
            const account = this.account(model.accountId!);
            const row = this.store.db
              .prepare(
                'SELECT verification FROM model_catalog WHERE provider_id=? AND model_id=? AND catalog_version=?',
              )
              .get(account.providerId, model.modelId, this.catalogVersion(account.accountId)) as
              { verification: 'documented' | 'probed' | 'failed' } | undefined;
            model.verification =
              account.status === 'ready' ? (row?.verification ?? 'documented') : 'documented';
            if (model.verification === 'probed') model.toolCalls = 'documented';
          }
          return this.ok(request, { accounts, models: models.length ? models : codexCatalog() });
        }
        case 'providers.startLogin': {
          const input = StartLoginSchema.parse(request.payload);
          this.prepareNetwork();
          return this.store.receipt(request, () => {
            if ([...this.logins.values()].some((login) => login.view.status === 'waiting'))
              throw new StorageError('CONFLICT');
            const accountId = newId(),
              loginId = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription',?,'oauth',?,'unconfigured')",
              )
              .run(accountId, this.store.profileId, now, now, input.label, accountId);
            const channel = this.channel(accountId);
            if (!(channel instanceof CodexAdapter)) throw new StorageError('VALIDATION_ERROR');
            const login = new CodexLogin(
              loginId,
              input,
              channel.models,
              newId,
              async (url) => {
                await this.vault('browser.open', accountId, { url });
              },
              async () => {
                login.view.accountId = accountId;
                this.update(accountId, 'unconfigured', null);
              },
            );
            this.logins.set(loginId, login);
            this.accountLogins.set(accountId, loginId);
            const cleanup = login.completed
              .then(async () => {
                if (login.view.status !== 'completed')
                  await channel.credentials.delete('openai-codex');
              })
              .catch(() => {
                this.update(accountId, 'unavailable', 'AUTH_REQUIRED');
              })
              .finally(() => {
                if (this.accountLogins.get(accountId) === loginId)
                  this.accountLogins.delete(accountId);
              });
            this.loginCleanup.set(loginId, cleanup);
            return this.ok(request, login.snapshot());
          });
        }
        case 'providers.loginStatus': {
          const { loginId } = LoginIdSchema.parse(request.payload);
          const login = this.logins.get(loginId);
          if (!login) throw new StorageError('NOT_FOUND');
          return this.ok(request, login.snapshot());
        }
        case 'providers.answerLogin': {
          const input = AnswerLoginSchema.parse(request.payload);
          const login = this.logins.get(input.loginId);
          if (!login) throw new StorageError('NOT_FOUND');
          try {
            login.answer(input.promptId, input.value);
          } catch {
            throw new StorageError('VALIDATION_ERROR');
          }
          return this.ok(request, login.snapshot());
        }
        case 'providers.cancelLogin': {
          const { loginId } = LoginIdSchema.parse(request.payload);
          const login = this.logins.get(loginId);
          if (!login) throw new StorageError('NOT_FOUND');
          if (login.view.status === 'completed') throw new StorageError('CONFLICT');
          login.cancel();
          await login.completed;
          await this.loginCleanup.get(loginId);
          return this.ok(request, login.snapshot());
        }
        case 'providers.disconnect': {
          const { accountId } = AccountIdSchema.parse(request.payload);
          const account = this.account(accountId);
          if (request.expectedRevision !== account.revision)
            throw new StorageError('CONFLICT', account.revision);
          if (this.disconnecting.has(accountId)) throw new StorageError('CONFLICT');
          this.disconnecting.add(accountId);
          try {
            const loginId = this.accountLogins.get(accountId);
            const login = loginId ? this.logins.get(loginId) : undefined;
            const probe = this.probes.get(accountId);
            login?.cancel();
            probe?.controller.abort();
            if (login) await login.completed;
            if (loginId) await this.loginCleanup.get(loginId);
            if (probe) await probe.done.catch(() => {});
            // Last delete wins even if a cancelled login was already committing its token.
            const channel = this.channel(accountId);
            if (account.providerId === 'codex-subscription')
              await (channel as CodexAdapter).models.logout('openai-codex');
            else await this.vault('api-key.delete', accountId, this.apiBinding(accountId));
            this.store.db.transaction(() => {
              this.update(accountId, 'unconfigured', null);
              const now = this.store.now();
              this.store.db
                .prepare('UPDATE provider_accounts SET deleted_at=? WHERE id=? AND profile_id=?')
                .run(now, accountId, this.store.profileId);
              this.store.db
                .prepare(
                  'UPDATE opaque_states SET deleted_at=? WHERE account_id=? AND profile_id=?',
                )
                .run(now, accountId, this.store.profileId);
            })();
            this.channels.delete(accountId);
            return this.ok(request, { accountId, status: 'unconfigured' });
          } finally {
            this.disconnecting.delete(accountId);
          }
        }
        case 'providers.check': {
          const { accountId, modelId } = CheckProviderSchema.parse(request.payload);
          this.prepareNetwork();
          const account = this.account(accountId);
          if (request.expectedRevision !== account.revision)
            throw new StorageError('CONFLICT', account.revision);
          if (this.probes.has(accountId) || this.disconnecting.has(accountId))
            throw new StorageError('CONFLICT');
          const channel = this.channel(accountId);
          const controller = new AbortController();
          const operation = {
            controller,
            done: Promise.resolve()
              .then(async () => {
                controller.signal.throwIfAborted();
                const candidates = await channel.listModels(accountId, controller.signal);
                controller.signal.throwIfAborted();
                const chosen =
                  modelId ??
                  ['gpt-5.6-terra', 'gpt-5.5']
                    .map((id) => candidates.find((model) => model.modelId === id))
                    .find(Boolean)?.modelId ??
                  candidates[0]?.modelId;
                if (!chosen || !candidates.some((model) => model.modelId === chosen))
                  throw new StorageError('MODEL_UNSUPPORTED');
                const current = this.account(accountId);
                if (current.revision !== request.expectedRevision)
                  throw new StorageError('CONFLICT', current.revision);
                return this.probe(
                  request,
                  accountId,
                  candidates.find((model) => model.modelId === chosen)!,
                  controller.signal,
                );
              })
              .catch((error: unknown) => {
                if (controller.signal.aborted) return failure(request.requestId, 'CANCELLED');
                throw error;
              })
              .finally(() => {
                if (this.probes.get(accountId) === operation) this.probes.delete(accountId);
              }),
          };
          // Start work in the next microtask, after claiming the account slot.
          this.probes.set(accountId, operation);
          return await operation.done;
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
            : classifyCodexError(error).code,
      );
    }
  }
  private async probe(
    request: Request,
    accountId: string,
    model: ModelView,
    signal: AbortSignal,
  ): Promise<Reply> {
    const modelId = model.modelId;
    const result = await this.channel(accountId).checkConnection({ accountId, modelId }, signal);
    if (signal.aborted) return failure(request.requestId, 'CANCELLED');
    const current = this.account(accountId);
    if (current.revision !== request.expectedRevision)
      throw new StorageError('CONFLICT', current.revision);
    this.store.db.transaction(() => {
      this.update(accountId, result.status, result.errorCode, true);
      const now = this.store.now();
      this.store.db
        .prepare(
          'INSERT INTO model_catalog(id,profile_id,created_at,updated_at,provider_id,model_id,catalog_version,capabilities_json,verification,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id,model_id,catalog_version) DO UPDATE SET updated_at=excluded.updated_at,verification=excluded.verification,verified_at=excluded.verified_at',
        )
        .run(
          newId(),
          this.store.profileId,
          now,
          now,
          current.providerId,
          modelId,
          this.catalogVersion(accountId),
          JSON.stringify({
            schemaVersion: 1,
            contextWindow: model.contextWindow ?? null,
            maxOutput: model.maxOutput ?? null,
            text: result.text,
            tools: result.tools,
          }),
          result.status === 'ready' ? 'probed' : 'failed',
          now,
        );
    })();
    return this.ok(request, result);
  }
  async stop() {
    for (const login of this.logins.values()) login.cancel();
    for (const probe of this.probes.values()) probe.controller.abort();
    await Promise.allSettled([...this.logins.values()].map((login) => login.completed));
    await Promise.allSettled(this.loginCleanup.values());
    await Promise.allSettled([...this.probes.values()].map((probe) => probe.done));
  }
}
