import { createHash } from 'node:crypto';
import { Store, UsageLedger, StorageError, newId, failure, knownPrice } from '@tapkit/storage';
import {
  describeModels,
  effectivePreferences,
  candidates,
  compatibility,
  ModelRouter,
} from '@tapkit/providers';
import {
  RequestSchema,
  ReplySchema,
  ProviderListSchema,
  CatalogViewSchema,
  PriceCatalogSchema,
  PreferencesGetSchema,
  PreferencesSetSchema,
  PreviewSchema,
  PreviewViewSchema,
  UsageQuerySchema,
  DiagnosticSchema,
  DiagnosticViewSchema,
  IdSchema,
  ROUTING_LIMITS,
  z,
  type Request,
  type Reply,
  type ModelDescriptor,
  type ModelOverrides,
} from '@tapkit/contracts';
import priceCatalog from '../../../resources/catalogs/prices.json';
const prices = PriceCatalogSchema.parse(priceCatalog);
import type { ProviderService } from './provider-service';

export class ModelService {
  readonly ledger: UsageLedger;
  readonly router: ModelRouter;
  private readonly diagnostics = new Map<
    string,
    { controller: AbortController; promise: Promise<unknown>; accountIds: Set<string> }
  >();
  private activeRequests = 0;
  private chatRoots = 0;
  claimRoot = () => {
    if (this.chatRoots + this.diagnostics.size >= this.store.settings.values.maxConcurrentRoots)
      throw new StorageError('BUDGET_EXCEEDED');
    this.chatRoots++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.chatRoots--;
      }
    };
  };
  private readonly perAccount = new Map<string, number>();
  constructor(
    readonly store: Store,
    readonly providers: ProviderService,
    readonly resourceOwner?: ModelService,
  ) {
    this.ledger = new UsageLedger(store);
    this.ledger.recover();
    if (!resourceOwner) this.ledger.recoverSharedDaily();
    const sharedReservations = new Map<string, (tokens: number, money: number | null) => void>();
    store.db
      .prepare(
        "UPDATE request_receipts SET state='unknown' WHERE profile_id=? AND command='models.diagnostic' AND state='pending'",
      )
      .run(store.profileId);
    this.router = new ModelRouter({
      catalog: () => this.catalog(),
      adapter: (id) => providers.adapter(id),
      id: () => newId(),
      now: store.now,
      disabled: (id) => this.ledger.isDisabled(id),
      disable: (id, e, revision) => this.ledger.disableAccount(id, e, revision),
      reserve: (request, model, input) => {
        const inputTokens = this.inputBound(request);
        if (
          compatibility(model, input.preferences, {
            ...input.need,
            inputTokens,
            outputTokens: request.outputLimit,
          }).length
        )
          throw new StorageError('MODEL_UNSUPPORTED');
        const shared = resourceOwner?.ledger.reserveSharedDaily(
          inputTokens + request.outputLimit,
          input.preferences,
          model.price,
          inputTokens,
          request.outputLimit,
        );
        try {
          const n = this.ledger.reserve({
            request,
            runId: input.runId,
            rootRunId: input.rootRunId,
            ...(input.projectId ? { projectId: input.projectId } : {}),
            inputTokens,
            preferences: input.preferences,
            price: model.price,
            mode: input.mode,
          });
          if (shared) sharedReservations.set(request.attemptId, shared);
          return n;
        } catch (error) {
          shared?.(0, 0);
          throw error;
        }
      },
      settle: (id, result) => {
        this.ledger.settle(id, result);
        const shared = sharedReservations.get(id);
        if (shared) {
          const u = this.store.db
            .prepare(
              'SELECT charged_tokens,amount_micros FROM usage_ledger WHERE provider_attempt_id=?',
            )
            .get(id) as { charged_tokens: number; amount_micros: number | null };
          shared(u.charged_tokens, u.amount_micros);
          sharedReservations.delete(id);
        }
      },
      checkpoint: (id, text) => this.ledger.checkpoint(id, text),
      switched: (...args) => this.ledger.switch(...args),
      acquire: async (id, signal, foreground = true) => {
        signal.throwIfAborted();
        const owner = this.resourceOwner ?? this;
        const settings = owner.store.settings.values;
        if (
          owner.activeRequests >=
            (foreground
              ? settings.maxModelRequests
              : Math.max(0, settings.maxModelRequests - ROUTING_LIMITS.foregroundSlots)) ||
          (owner.perAccount.get(id) ?? 0) >= settings.maxCredentialRequests
        )
          throw new StorageError('BUDGET_EXCEEDED');
        owner.activeRequests++;
        owner.perAccount.set(id, (owner.perAccount.get(id) ?? 0) + 1);
        return () => {
          owner.activeRequests--;
          owner.perAccount.set(id, owner.perAccount.get(id)! - 1);
        };
      },
    });
  }
  private inputBound(request: { messages: unknown; tools: unknown; systemModules: unknown }) {
    // Conservative UTF-8 byte bound plus framing. No unknown tokenizer is labelled actual.
    return (
      Buffer.byteLength(JSON.stringify(request.messages)) +
      Buffer.byteLength(JSON.stringify(request.tools)) +
      Buffer.byteLength(JSON.stringify(request.systemModules)) +
      1024
    );
  }
  async catalog(): Promise<ModelDescriptor[]> {
    const reply = await this.providers.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'providers.list',
      payload: {},
    });
    if (!reply.ok) throw new StorageError(reply.error.code);
    const source = ProviderListSchema.parse(reply.data);
    return describeModels(source.accounts, source.models, (model) => {
      const account = source.accounts.find((a) => a.accountId === model.accountId);
      const price =
        prices.entries.find(
          (p) =>
            p.providerId === model.providerId &&
            p.modelId === model.modelId &&
            p.baseURL === account?.baseURL &&
            p.apiFormat === account?.apiFormat,
        )?.price ?? null;
      return knownPrice(price, this.store.now()) ? price : null;
    }).map((model) =>
      this.ledger.isDisabled(model.accountId ?? '')
        ? {
            ...model,
            status: 'unavailable' as const,
            availabilityReason: this.ledger.disabledReason(model.accountId!),
          }
        : model,
    );
  }
  effective(sessionId?: string, current?: ModelOverrides) {
    const profile = this.ledger.preferences({ type: 'profile', id: this.store.profileId });
    const scope = sessionId ? { type: 'session' as const, id: sessionId } : undefined;
    if (scope) this.ledger.scope(scope);
    const session =
      scope && this.ledger.hasPreferences(scope)
        ? this.ledger.preferences(scope).values
        : undefined;
    const effective = effectivePreferences(profile.values, session, current);
    // Narrow scopes cannot raise profile budget ceilings.
    effective.values.rootTokenLimit = Math.min(
      effective.values.rootTokenLimit,
      profile.values.rootTokenLimit,
    );
    effective.values.workRootTokenLimit = Math.min(
      effective.values.workRootTokenLimit,
      profile.values.workRootTokenLimit,
    );
    effective.values.dailyTokenLimit = Math.min(
      effective.values.dailyTokenLimit,
      profile.values.dailyTokenLimit,
    );
    effective.values.moneyLimits = profile.values.moneyLimits;
    return effective;
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
        case 'models.catalog':
          z.strictObject({}).parse(request.payload);
          return this.ok(
            request,
            CatalogViewSchema.parse({
              catalog: await this.catalog(),
              priceVersion: priceCatalog.version,
              sessions: this.store.db
                .prepare(
                  'SELECT id,title FROM sessions WHERE profile_id=? AND deleted_at IS NULL ORDER BY last_activity_at DESC LIMIT 100',
                )
                .all(this.store.profileId),
            }),
          );
        case 'models.preferences.get':
          return this.ok(
            request,
            this.ledger.preferences(PreferencesGetSchema.parse(request.payload).scope),
          );
        case 'models.preferences.set': {
          const p = PreferencesSetSchema.parse(request.payload);
          if (request.expectedRevision === undefined) throw new StorageError('VALIDATION_ERROR');
          if (p.values.moneyLimits.length) {
            const catalog = await this.catalog();
            const paid = catalog.filter(
              (m) => m.status === 'ready' && m.providerId !== 'codex-subscription',
            );
            if (
              !paid.length ||
              paid.some(
                (m) =>
                  !knownPrice(m.price, this.store.now()) ||
                  !p.values.moneyLimits.some((l) => l.currency === m.price?.currency),
              )
            )
              throw new StorageError('VALIDATION_ERROR');
          }
          return this.store.receipt(request, () =>
            this.ok(
              request,
              this.ledger.setPreferences(p.scope, p.values, request.expectedRevision!),
            ),
          );
        }
        case 'models.preview': {
          const p = PreviewSchema.parse(request.payload),
            effective = this.effective(p.sessionId, p.current),
            catalog = await this.catalog();
          const need = {
            inputTokens: p.inputTokens,
            outputTokens: p.outputTokens,
            attachments: p.attachments,
            needsTools: p.needsTools,
          };
          const selected = catalog.find(
            (m) =>
              m.accountId === effective.values.selection?.accountId &&
              m.modelId === effective.values.selection?.modelId,
          );
          const options = candidates(catalog, effective.values, need);
          const issues = selected
            ? compatibility(selected, effective.values, need)
            : effective.values.selection
              ? ['指定模型已不可用，请重新选择模型。']
              : [];
          if (!options.length && !issues.length)
            issues.push('没有满足条件的已连接模型，请配置账户并检测连接。');
          if (effective.values.onlyThisModel && !effective.values.selection)
            issues.push('仅此模型需要先指定模型。');
          return this.ok(
            request,
            PreviewViewSchema.parse({
              effective: effective.values,
              scope: effective.scope,
              candidates: options.map((m) => ({ accountId: m.accountId!, modelId: m.modelId })),
              issues,
              paidNotice:
                'API 调用由供应商计费。当前价格未知时不显示金额，失败请求也可能收费；自动后备需先启用付费后备。',
            }),
          );
        }
        case 'usage.list':
          return this.ok(request, this.ledger.list(UsageQuerySchema.parse(request.payload)));
        case 'models.cancel': {
          const p = z.strictObject({ logicalCallId: IdSchema }).parse(request.payload);
          const active = this.diagnostics.get(p.logicalCallId);
          active?.controller.abort();
          return this.ok(request, { logicalCallId: p.logicalCallId, cancelled: Boolean(active) });
        }
        case 'models.diagnostic':
          return await this.diagnostic(request);
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
  private async diagnostic(request: Request): Promise<Reply> {
    const p = DiagnosticSchema.parse(request.payload);
    const hash = createHash('sha256').update(JSON.stringify(p)).digest('hex');
    const old = this.store.db
      .prepare(
        'SELECT state,payload_hash,reply_json FROM request_receipts WHERE profile_id=? AND request_id=?',
      )
      .get(this.store.profileId, p.logicalCallId) as
      { state: string; payload_hash: string; reply_json: string | null } | undefined;
    if (old) {
      if (old.payload_hash !== hash) throw new StorageError('CONFLICT');
      if (old.state === 'completed' && old.reply_json)
        return this.ok(
          request,
          ReplySchema.parse(JSON.parse(old.reply_json).reply).ok
            ? JSON.parse(old.reply_json).reply.data
            : DiagnosticViewSchema.parse({
                logicalCallId: p.logicalCallId,
                attempts: this.ledger.attempts(p.logicalCallId),
                actualModel: null,
                errorCode: 'SIDE_EFFECT_UNKNOWN',
              }),
        );
      const active = this.diagnostics.get(p.logicalCallId);
      if (active) return this.ok(request, await active.promise);
      return this.ok(request, {
        logicalCallId: p.logicalCallId,
        attempts: this.ledger.attempts(p.logicalCallId),
        actualModel: null,
        errorCode: 'SIDE_EFFECT_UNKNOWN',
      });
    }
    if (
      this.store.db
        .prepare(
          'SELECT id FROM provider_attempts WHERE profile_id=? AND logical_call_id=? LIMIT 1',
        )
        .get(this.store.profileId, p.logicalCallId)
    )
      throw new StorageError('CONFLICT');
    if (this.diagnostics.size + this.chatRoots >= this.store.settings.values.maxConcurrentRoots)
      throw new StorageError('BUDGET_EXCEEDED');
    const effective = this.effective(p.sessionId, p.current).values;
    if (effective.answer.format === 'json') throw new StorageError('MODEL_UNSUPPORTED');
    const controller = new AbortController();
    this.store.db
      .prepare(
        'INSERT INTO request_receipts(profile_id,request_id,command,payload_hash,state,reply_json,expires_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        this.store.profileId,
        p.logicalCallId,
        'models.diagnostic',
        hash,
        'pending',
        null,
        this.store.now() + 86_400_000,
      );
    // One fixed, bounded diagnostic. No renderer-supplied prompt, tools or native state reaches a provider.
    const promise = (async () => {
      const catalog = await this.catalog();
      let errorCode: string | null = null;
      for await (const event of this.router.stream(
        {
          logicalCallId: p.logicalCallId,
          runId: p.logicalCallId,
          rootRunId: p.logicalCallId,
          mode: 'chat',
          preferences: effective,
          allowedAccounts: new Set(catalog.filter((m) => m.accountId).map((m) => m.accountId!)),
          need: { inputTokens: 2048, outputTokens: 128, attachments: 0, needsTools: false },
          request: {
            branchId: p.logicalCallId,
            taskVersion: 1,
            messages: [{ role: 'user', text: 'Reply briefly with OK.' }],
            systemModules: [],
            tools: [],
            outputLimit: 128,
          },
        },
        controller.signal,
      ))
        if (event.type === 'route.error') errorCode = event.error.code;
        else if (event.type === 'attempt')
          this.diagnostics.get(p.logicalCallId)?.accountIds.add(event.model.accountId);
      const attempts = this.ledger.attempts(p.logicalCallId);
      const actual = attempts.find((a) => a.activeAnswer);
      const data = DiagnosticViewSchema.parse({
        logicalCallId: p.logicalCallId,
        attempts,
        actualModel: actual ? { accountId: actual.accountId, modelId: actual.modelId } : null,
        errorCode,
      });
      this.store.db
        .prepare(
          "UPDATE request_receipts SET state='completed',reply_json=? WHERE profile_id=? AND request_id=?",
        )
        .run(
          JSON.stringify({ schemaVersion: 1, reply: this.ok(request, data) }),
          this.store.profileId,
          p.logicalCallId,
        );
      return data;
    })();
    this.diagnostics.set(p.logicalCallId, { controller, promise, accountIds: new Set() });
    try {
      return this.ok(request, await promise);
    } finally {
      this.diagnostics.delete(p.logicalCallId);
    }
  }
  async stop() {
    for (const active of this.diagnostics.values()) active.controller.abort();
    await Promise.allSettled([...this.diagnostics.values()].map((v) => v.promise));
  }
  cancelAccount(accountId: string) {
    for (const active of this.diagnostics.values())
      if (active.accountIds.has(accountId)) active.controller.abort();
  }
}
