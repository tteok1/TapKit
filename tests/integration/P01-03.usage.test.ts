import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  openStore,
  UsageLedger,
  migrate,
  migrations,
  Store,
  newId,
  pricedMicros,
} from '../../packages/storage/src';
import { ModelService } from '../../packages/core/src/model-service';
import { ProviderService } from '../../packages/core/src/provider-service';
import { CoreService } from '../../packages/core/src/service';
import {
  DEFAULT_MODEL_PREFERENCES,
  PreferencesViewSchema,
  UsageViewSchema,
  PreviewViewSchema,
  DiagnosticViewSchema,
  resolveApiConfig,
  type ModelRequest,
  type ModelPrice,
  type ModelPreferences,
  type Reply,
  type CanonicalMessage,
} from '../../packages/contracts/src';
import { ApiKeyAdapter, describeModels, ModelRouter } from '../../packages/providers/src';
import { memoryNative, events, sseFrames } from '../fixtures/P01-02.api';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) if (s.db.open) s.close();
});
async function fresh(now?: () => number) {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P01-03-usage-'));
  const s = await openStore(dir, now);
  stores.push(s);
  return s;
}
const req = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
});
const data = (reply: Reply) => {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
};
function account(store: Store, provider = 'deepseek') {
  const id = newId();
  store.db
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,model_id,api_format,base_url) VALUES(?,?,?,?,?,?,'api_key',?,'ready',?,'openai-chat',?)",
    )
    .run(
      id,
      store.profileId,
      store.now(),
      store.now(),
      provider,
      'fixture',
      newId(),
      'fixture-model',
      'https://api.deepseek.com',
    );
  return id;
}
function request(accountId: string, logicalCallId = newId()): ModelRequest {
  return {
    accountId,
    model: { providerId: 'deepseek', modelId: 'fixture-model' },
    logicalCallId,
    attemptId: newId(),
    systemModules: [],
    messages: [{ role: 'user', text: 'fixture' }],
    tools: [],
    outputLimit: 100,
    reasoning: 'off',
    taskVersion: 1,
    branchId: newId(),
  };
}
function reserve(
  ledger: UsageLedger,
  r: ModelRequest,
  rootRunId = newId(),
  preferences: ModelPreferences = DEFAULT_MODEL_PREFERENCES,
  price: ModelPrice | null = null,
) {
  return ledger.reserve({
    request: r,
    runId: rootRunId,
    rootRunId,
    inputTokens: 100,
    preferences,
    price,
    mode: 'chat',
  });
}
const actual = {
  inputTotal: 100,
  inputCachedSubset: 80,
  outputTotal: 50,
  reasoningSubset: 30,
  source: 'actual' as const,
};
const settled = { status: 'completed' as const, text: 'OK', usage: actual, activeMs: 20 };
const query = { groupBy: 'date' as const, cursor: 0, limit: 50 };
describe('P01-03 durable usage, budgets, migration and Core routing', () => {
  it('T03 settles a pending approved fixture write once before switching and keeps the original evidence/approval', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      ids = [account(store, 'codex-subscription'), account(store)],
      root = newId();
    const callId = newId(),
      approvalId = newId(),
      path = resolve(store.dataDir, 'approved-fixture.txt');
    const args = { path, text: 'committed fixture content' },
      hash = createHash('sha256').update(JSON.stringify(args)).digest('hex');
    store.db
      .prepare(
        "INSERT INTO approvals(id,profile_id,created_at,updated_at,tool_call_id,task_version,args_hash,resource_hash,content_version_hash,decision,expires_at) VALUES(?,?,?,?,?,1,?,?,?,'approved',?)",
      )
      .run(
        approvalId,
        store.profileId,
        store.now(),
        store.now(),
        callId,
        hash,
        hash,
        hash,
        store.now() + 60000,
      );
    const messages: CanonicalMessage[] = [
      { role: 'user', text: 'fixture authorized write' },
      {
        role: 'assistant',
        text: '',
        calls: [{ id: callId, name: 'write_fixture', arguments: args }],
      },
    ];
    let writes = 0;
    const settlePendingTools = async () => {
      if (!writes) {
        const approval = store.db
          .prepare('SELECT decision,args_hash FROM approvals WHERE id=?')
          .get(approvalId) as { decision: string; args_hash: string };
        expect(approval).toEqual({ decision: 'approved', args_hash: hash });
        // The test caller owns its execution ledger. Router never executes OS tools.
        await writeFile(path, args.text);
        writes++;
        messages.push({
          role: 'tool',
          callId,
          name: 'write_fixture',
          text: 'written; original approval retained',
          isError: false,
        });
      }
      return structuredClone(messages);
    };
    const models = describeModels(
      ids.map((id, i) => ({
        accountId: id,
        providerId: i ? ('deepseek' as const) : ('codex-subscription' as const),
        label: 'fixture',
        status: 'ready' as const,
        revision: 1,
        lastErrorCode: null,
        hasCredential: true,
      })),
      ids.map((id, i) => ({
        accountId: id,
        providerId: i ? ('deepseek' as const) : ('codex-subscription' as const),
        modelId: 'fixture-model',
        displayName: 'fixture',
        contextWindow: null,
        maxOutput: null,
        toolCalls: 'documented' as const,
        verification: 'probed' as const,
      })),
    );
    const sent: ModelRequest[] = [];
    const router = new ModelRouter({
      catalog: async () => models,
      id: () => newId(),
      now: store.now,
      disabled: (id) => ledger.isDisabled(id),
      disable: (id, e, revision) => ledger.disableAccount(id, e, revision),
      switched: (...a) => ledger.switch(...a),
      acquire: async () => () => {},
      reserve: (r, m, input) =>
        ledger.reserve({
          request: r,
          runId: root,
          rootRunId: root,
          inputTokens: 100,
          preferences: input.preferences,
          price: m.price,
          mode: 'chat',
        }),
      settle: (id, r) => ledger.settle(id, r),
      adapter: (id) => ({
        id: id === ids[0] ? 'codex-subscription' : 'deepseek',
        listModels: async () => [],
        checkConnection: async () => {
          throw new Error('unused');
        },
        classifyError: () => ({ code: 'INTERNAL_ERROR', retryable: false }),
        async *stream(r) {
          sent.push(r);
          if (id === ids[0])
            yield {
              type: 'error',
              error: { code: 'QUOTA_EXHAUSTED', retryable: false },
              partial: false,
            };
          else {
            yield { type: 'text_delta', blockId: '0', text: 'Already written' };
            yield { type: 'finish', reason: 'stop', nativeStateRef: newId() };
          }
        },
      }),
    });
    for await (const _ of router.stream(
      {
        logicalCallId: newId(),
        rootRunId: root,
        runId: root,
        mode: 'chat',
        preferences: { ...DEFAULT_MODEL_PREFERENCES, allowPaidFallback: true },
        allowedAccounts: new Set(ids),
        need: { inputTokens: 100, outputTokens: 100, attachments: 0, needsTools: false },
        settlePendingTools,
        request: {
          branchId: newId(),
          taskVersion: 1,
          messages,
          tools: [],
          systemModules: [],
          outputLimit: 100,
        },
      },
      new AbortController().signal,
    )) {
      /* consume */
    }
    expect(writes).toBe(1);
    expect(await readFile(path, 'utf8')).toBe(args.text);
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent[1]?.messages)).toContain(callId);
    expect(sent[1]?.messages.some((m) => m.role === 'tool')).toBe(false);
    expect(
      store.db.prepare('SELECT decision,args_hash FROM approvals WHERE id=?').get(approvalId),
    ).toEqual({ decision: 'approved', args_hash: hash });
  });
  it('model slots reserve foreground capacity and usage filters/pagination do not hide estimated failures', async () => {
    const store = await fresh(),
      providers = new ProviderService(store, async () => ({ key: 'fixture-only' })),
      service = new ModelService(store, providers),
      id = account(store);
    const release1 = await service.router.deps.acquire(id, new AbortController().signal, false);
    const release2 = await service.router.deps.acquire(
      newId(),
      new AbortController().signal,
      false,
    );
    await expect(
      service.router.deps.acquire(newId(), new AbortController().signal, false),
    ).rejects.toThrow('BUDGET_EXCEEDED');
    const foreground = await service.router.deps.acquire(
      newId(),
      new AbortController().signal,
      true,
    );
    foreground();
    release1();
    release2();
    const project = newId(),
      root = newId();
    const r = request(id);
    service.ledger.reserve({
      request: r,
      runId: root,
      rootRunId: root,
      projectId: project,
      inputTokens: 100,
      preferences: DEFAULT_MODEL_PREFERENCES,
      price: null,
      mode: 'work',
    });
    service.ledger.settle(r.attemptId, settled);
    const r2 = request(id);
    reserve(service.ledger, r2);
    service.ledger.settle(r2.attemptId, { status: 'failed', text: '', activeMs: 0 });
    const filtered = service.ledger.list({
      ...query,
      projectId: project,
      runId: root,
      modelId: 'fixture-model',
      from: store.now() - 10000,
      to: store.now() + 10000,
      groupBy: 'project',
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.groups[0]?.key).toBe(project);
    const first = service.ledger.list({ ...query, limit: 1 });
    expect(first.nextCursor).toBe(1);
    expect(
      service.ledger.list({ ...query, limit: 1, cursor: first.nextCursor! }).items[0]?.attemptId,
    ).not.toBe(first.items[0]?.attemptId);
    await service.stop();
    await providers.stop();
  });
  it('logout cancels the active diagnostic; late quota failure cannot disable a newly checked account', async () => {
    const store = await fresh(),
      providers = new ProviderService(store, async () => ({ key: 'fixture-only' })),
      service = new ModelService(store, providers),
      id = account(store);
    let started!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    const config = resolveApiConfig('deepseek', { modelId: 'fixture-model' });
    const channel = new ApiKeyAdapter(
      id,
      config,
      async () => 'fixture-only',
      memoryNative().store,
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          started();
          init!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          });
        }),
    );
    providers.adapter = () => channel;
    const logicalCallId = newId();
    const pending = service.dispatch(
      req('models.diagnostic', {
        logicalCallId,
        current: { selection: { accountId: id, modelId: 'fixture-model' } },
      }),
    );
    await dispatched;
    service.cancelAccount(id);
    const result = DiagnosticViewSchema.parse(data(await pending));
    expect(result.errorCode).toBe('CANCELLED');
    expect(result.attempts[0]).toMatchObject({ status: 'cancelled', source: 'estimated' });
    expect(service.ledger.list(query).dailyReserved).toBe(0);
    store.db.prepare('UPDATE provider_accounts SET revision=2 WHERE id=?').run(id);
    service.ledger.disableAccount(id, { code: 'QUOTA_EXHAUSTED', retryable: false }, 1);
    expect(service.ledger.isDisabled(id)).toBe(false);
    await service.stop();
    await providers.stop();
  });
  it('atomic root+daily reservation races cannot exceed limit; failures roll back both budgets', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      id = account(store);
    store.db.transaction(() =>
      ledger.setPreferences(
        { type: 'profile', id: store.profileId },
        { ...DEFAULT_MODEL_PREFERENCES, dailyTokenLimit: 500 },
        1,
      ),
    )();
    const root = newId(),
      requests = Array.from({ length: 10 }, () => request(id));
    const results = await Promise.allSettled(requests.map(async (r) => reserve(ledger, r, root)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(ledger.list(query).dailyReserved).toBe(400);
    expect(store.db.prepare('SELECT count(*) AS n FROM provider_attempts').get()).toEqual({ n: 2 });
    expect(store.db.prepare('SELECT reserved_tokens FROM budgets').all()).toEqual([
      { reserved_tokens: 400 },
      { reserved_tokens: 400 },
    ]);
    ledger.settle(requests[0]!.attemptId, settled);
    ledger.settle(requests[0]!.attemptId, settled);
    expect(ledger.list(query).dailyUsed).toBe(150);
    expect(ledger.list(query).dailyReserved).toBe(200);
    expect(store.db.prepare('SELECT count(*) AS n FROM usage_ledger').get()).toEqual({ n: 1 });
  });
  it('missing and partial failure usage conservatively charge reservations, cached/reasoning are subsets', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      id = account(store);
    const a = request(id),
      b = request(id),
      c = request(id);
    reserve(ledger, a);
    reserve(ledger, b);
    reserve(ledger, c);
    ledger.settle(a.attemptId, {
      ...settled,
      status: 'failed',
      error: { code: 'NETWORK_ERROR', retryable: false },
    });
    ledger.settle(b.attemptId, { status: 'failed', text: '', activeMs: 0 });
    ledger.settle(c.attemptId, { ...settled, usage: { ...actual, inputTotal: null } });
    const report = ledger.list(query);
    expect(report.dailyUsed).toBe(550);
    expect(report.dailyReserved).toBe(0);
    expect(report.items.filter((i) => i.source === 'estimated')).toHaveLength(2);
    expect(report.items.find((i) => i.attemptId === a.attemptId)?.chargedTokens).toBe(150);
    const d = request(id);
    reserve(ledger, d);
    expect(() =>
      ledger.settle(d.attemptId, { ...settled, usage: { ...actual, reasoningSubset: 100 } }),
    ).toThrow('VALIDATION_ERROR');
    expect(ledger.list(query).dailyReserved).toBe(200);
  });
  it('crash recovery charges once, preserves legacy data and resets daily period in profile timezone', async () => {
    let now = Date.UTC(2026, 9, 3, 15, 59, 59);
    const store = await fresh(() => now),
      ledger = new UsageLedger(store),
      id = account(store);
    store.db
      .prepare("UPDATE profiles SET timezone='Asia/Shanghai' WHERE id=?")
      .run(store.profileId);
    const r = request(id);
    reserve(ledger, r);
    expect(ledger.calendar().day).toBe('2026-10-03');
    expect(ledger.resetAt()).toBe(Date.UTC(2026, 9, 3, 16));
    ledger.checkpoint(r.attemptId, 'preserved partial');
    now += 2000;
    ledger.recover();
    ledger.recover();
    expect(ledger.list(query).dailyUsed).toBe(0);
    expect(ledger.list(query).items[0]).toMatchObject({
      status: 'unknown',
      chargedTokens: 200,
      source: 'estimated',
      text: 'preserved partial',
    });
    expect(
      store.db.prepare('SELECT sum(used_tokens) AS n FROM budgets WHERE owner_kind=?').get('daily'),
    ).toEqual({ n: 200 });
  });
  it('money reservation requires fresh full verified prices, uses integer micros and never doubles subsets', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      id = account(store);
    const price: ModelPrice = {
      version: 'fixture-only',
      currency: 'USD',
      inputMicrosPerMillion: 1_000_000,
      outputMicrosPerMillion: 2_000_000,
      uniformInputTiers: true,
      sourceURL: 'https://example.com/fixture',
      checkedAt: store.now(),
    };
    const p = {
      ...DEFAULT_MODEL_PREFERENCES,
      moneyLimits: [{ currency: 'USD', dailyMicros: 500 }],
    };
    store.db.transaction(() =>
      ledger.setPreferences({ type: 'profile', id: store.profileId }, p, 1),
    )();
    expect(() => reserve(ledger, request(id), newId(), p)).toThrow('BUDGET_EXCEEDED');
    const r = request(id);
    reserve(ledger, r, newId(), p, price);
    expect(() => reserve(ledger, request(id), newId(), p, price)).toThrow('BUDGET_EXCEEDED');
    ledger.settle(r.attemptId, settled);
    expect(ledger.list(query).items[0]?.amountMicros).toBe(200);
    expect(pricedMicros(price, 100, 50)).toBe(200);
    const r2 = request(id);
    reserve(ledger, r2, newId(), p, price);
    ledger.settle(r2.attemptId, { status: 'failed', text: '', activeMs: 0 });
    expect(ledger.list(query).items.find((i) => i.attemptId === r2.attemptId)?.amountMicros).toBe(
      300,
    );
    expect(() =>
      reserve(ledger, request(id), newId(), p, {
        ...price,
        checkedAt: store.now() - 31 * 86400000,
      }),
    ).toThrow('BUDGET_EXCEEDED');
  });
  it('root call cap, budget lowering and near/reached alerts apply before the next dispatch', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      id = account(store),
      root = newId();
    for (let i = 0; i < 8; i++) {
      const r = request(id);
      reserve(ledger, r, root);
      ledger.settle(r.attemptId, {
        ...settled,
        usage: {
          ...actual,
          inputTotal: 1,
          inputCachedSubset: 0,
          outputTotal: 1,
          reasoningSubset: 0,
        },
      });
    }
    expect(() => reserve(ledger, request(id), root)).toThrow('BUDGET_EXCEEDED');
    store.db.transaction(() =>
      ledger.setPreferences(
        { type: 'profile', id: store.profileId },
        { ...DEFAULT_MODEL_PREFERENCES, dailyTokenLimit: 20 },
        1,
      ),
    )();
    expect(ledger.list(query).alert).toBe('near');
    expect(() => reserve(ledger, request(id))).toThrow('BUDGET_EXCEEDED');
    store.db.transaction(() =>
      ledger.setPreferences(
        { type: 'profile', id: store.profileId },
        { ...DEFAULT_MODEL_PREFERENCES, dailyTokenLimit: 16 },
        2,
      ),
    )();
    expect(ledger.list(query).alert).toBe('reached');
  });
  it('SQLite migration 3→4 is idempotent, retains accounts/settings and rolls back failed migration', async () => {
    await mkdir('.test-data', { recursive: true });
    const dir = await mkdtemp(resolve('.test-data', 'P01-03-migrate-'));
    const db = new Database(resolve(dir, 'legacy.sqlite'));
    try {
      db.pragma('foreign_keys=ON');
      await migrate(db, resolve(dir, 'backups'), migrations.slice(0, 3));
      const store = new Store(db, dir);
      const id = account(store);
      const old = store.settings;
      await expect(
        migrate(db, resolve(dir, 'backups'), [
          ...migrations.slice(0, 3),
          { version: 4, sql: 'CREATE TABLE transient(x); INSERT INTO nonexistent VALUES(1);' },
        ]),
      ).rejects.toThrow();
      expect(db.pragma('user_version', { simple: true })).toBe(3);
      await migrate(db, resolve(dir, 'backups'));
      await migrate(db, resolve(dir, 'backups'));
      expect(db.pragma('user_version', { simple: true })).toBe(9);
      expect(store.settings).toEqual(old);
      expect(db.prepare('SELECT id FROM provider_accounts WHERE id=?').get(id)).toEqual({ id });
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(
        (await readdir(resolve(dir, 'backups'))).some((n) => n.startsWith('pre-migration-4')),
      ).toBe(true);
    } finally {
      db.close();
    }
  });
  it('Core preferences use CAS/receipts, persist scopes, reject money unknown and preview unsupported JSON/attachments', async () => {
    const store = await fresh(),
      providers = new ProviderService(store, async () => ({ key: 'fixture-only' })),
      service = new ModelService(store, providers);
    const scope = { type: 'profile', id: store.profileId };
    const save = req(
      'models.preferences.set',
      {
        scope,
        values: {
          ...DEFAULT_MODEL_PREFERENCES,
          answer: { ...DEFAULT_MODEL_PREFERENCES.answer, language: 'en' },
          dailyTokenLimit: 2000,
        },
      },
      1,
    );
    const first = await service.dispatch(save);
    expect(await service.dispatch(save)).toEqual(first);
    expect(PreferencesViewSchema.parse(data(first)).revision).toBe(2);
    expect(await service.dispatch(req('models.preferences.set', save.payload, 1))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(
      await service.dispatch(
        req(
          'models.preferences.set',
          {
            scope,
            values: {
              ...DEFAULT_MODEL_PREFERENCES,
              moneyLimits: [{ currency: 'USD', dailyMicros: 1000 }],
            },
          },
          2,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await service.dispatch(req('models.preferences.get', { scope: { ...scope, id: newId() } })),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    const preview = PreviewViewSchema.parse(
      data(
        await service.dispatch(
          req('models.preview', {
            attachments: 1,
            current: { answer: { ...DEFAULT_MODEL_PREFERENCES.answer, format: 'json' } },
          }),
        ),
      ),
    );
    expect(preview.candidates).toHaveLength(0);
    expect(preview.scope).toBe('current');
    expect(service.effective(undefined, { dailyTokenLimit: 2000000 }).values.dailyTokenLimit).toBe(
      2000,
    );
    const sid = newId();
    store.db
      .prepare(
        "INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,settings_json,last_activity_at) VALUES(?,?,?,?,?,'chat',?,?)",
      )
      .run(
        sid,
        store.profileId,
        store.now(),
        store.now(),
        'fixture-session',
        '{"schemaVersion":1,"values":{}}',
        store.now(),
      );
    const session = { type: 'session' as const, id: sid };
    store.db.transaction(() =>
      service.ledger.setPreferences(
        session,
        {
          ...DEFAULT_MODEL_PREFERENCES,
          answer: { ...DEFAULT_MODEL_PREFERENCES.answer, language: 'zh-CN' },
        },
        1,
      ),
    )();
    expect(service.effective(sid).scope).toBe('session');
    expect(service.effective(sid).values.answer.language).toBe('zh-CN');
    expect(
      service.effective(sid, { answer: { ...DEFAULT_MODEL_PREFERENCES.answer, language: 'en' } })
        .values.answer.language,
    ).toBe('en');
    expect(store.replay(0, 100).items.map((e) => e.type)).toContain('model.preferences.updated');
    await service.stop();
    await providers.stop();
  });
  it('public Core path routes a real API adapter fixture and never replays the diagnostic after restart', async () => {
    const store = await fresh(),
      providers = new ProviderService(store, async () => ({ key: 'fixture-only' })),
      service = new ModelService(store, providers),
      core = new CoreService(store);
    const save = req('providers.saveApiKey', {
      providerId: 'deepseek',
      label: 'fixture',
      credentialId: newId(),
      modelId: 'fixture-model',
    });
    const saved = data(core.dispatch(save)) as { accountId: string };
    store.db.prepare("UPDATE provider_accounts SET status='ready' WHERE id=?").run(saved.accountId);
    const config = resolveApiConfig('deepseek', { modelId: 'fixture-model' });
    let calls = 0;
    const channel = new ApiKeyAdapter(
      saved.accountId,
      config,
      async () => 'fixture-only',
      memoryNative().store,
      async () => {
        calls++;
        return sseFrames(events('openai-chat', false, false, undefined, 'ledger OK'));
      },
    );
    providers.adapter = () => channel;
    const diagnostic = req('models.diagnostic', {
      logicalCallId: newId(),
      current: { selection: { accountId: saved.accountId, modelId: config.modelId } },
    });
    const first = DiagnosticViewSchema.parse(data(await service.dispatch(diagnostic)));
    expect(first.attempts).toHaveLength(1);
    expect(first.actualModel?.modelId).toBe(config.modelId);
    expect(first.attempts[0]?.text).toBe('ledger OK');
    expect(calls).toBe(1);
    expect(
      DiagnosticViewSchema.parse(
        data(await service.dispatch({ ...diagnostic, requestId: newId() })),
      ),
    ).toEqual(first);
    expect(calls).toBe(1);
    await service.stop();
    const restarted = new ModelService(store, providers);
    expect(DiagnosticViewSchema.parse(data(await restarted.dispatch(diagnostic)))).toEqual(first);
    expect(calls).toBe(1);
    const queryResult = UsageViewSchema.parse(
      data(
        await restarted.dispatch(req('usage.list', { modelId: config.modelId, groupBy: 'model' })),
      ),
    );
    expect(queryResult.groups[0]?.attempts).toBe(1);
    store.db
      .prepare('DELETE FROM request_receipts WHERE profile_id=? AND request_id=?')
      .run(store.profileId, (diagnostic.payload as { logicalCallId: string }).logicalCallId);
    expect(await restarted.dispatch(diagnostic)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(calls).toBe(1);
    await restarted.stop();
    await providers.stop();
  });
  it('routing ledger integration preserves actual-model attempt and switched outbox after quota fixture', async () => {
    const store = await fresh(),
      ledger = new UsageLedger(store),
      ids = [account(store, 'codex-subscription'), account(store)],
      root = newId();
    const models = describeModels(
      ids.map((id, i) => ({
        accountId: id,
        providerId: i ? ('deepseek' as const) : ('codex-subscription' as const),
        label: 'fixture',
        status: 'ready' as const,
        revision: 1,
        lastErrorCode: null,
        hasCredential: true,
      })),
      ids.map((id, i) => ({
        accountId: id,
        providerId: i ? ('deepseek' as const) : ('codex-subscription' as const),
        modelId: 'fixture-model',
        displayName: 'fixture',
        contextWindow: null,
        maxOutput: null,
        toolCalls: 'documented' as const,
        verification: 'probed' as const,
      })),
    );
    const requests: ModelRequest[] = [];
    const router = new ModelRouter({
      catalog: async () => models,
      id: () => newId(),
      now: store.now,
      disabled: (id) => ledger.isDisabled(id),
      disable: (id, error) => ledger.disableAccount(id, error),
      acquire: async () => () => {},
      reserve: (r, m, input) =>
        ledger.reserve({
          request: r,
          runId: root,
          rootRunId: root,
          inputTokens: 100,
          preferences: input.preferences,
          price: m.price,
          mode: 'chat',
        }),
      settle: (id, result) => ledger.settle(id, result),
      switched: (...args) => ledger.switch(...args),
      adapter: (id) => ({
        id: id === ids[0] ? 'codex-subscription' : 'deepseek',
        listModels: async () => [],
        checkConnection: async () => {
          throw new Error('unused');
        },
        classifyError: () => ({ code: 'INTERNAL_ERROR', retryable: false }),
        async *stream(r) {
          requests.push(r);
          if (id === ids[0])
            yield {
              type: 'error',
              error: { code: 'QUOTA_EXHAUSTED', retryable: false },
              partial: false,
            };
          else {
            yield { type: 'text_delta', blockId: '0', text: 'API OK' };
            yield { type: 'usage', usage: actual };
            yield { type: 'finish', reason: 'stop', nativeStateRef: newId() };
          }
        },
      }),
    });
    const logicalCallId = newId();
    for await (const _ of router.stream(
      {
        logicalCallId,
        runId: root,
        rootRunId: root,
        mode: 'chat',
        preferences: { ...DEFAULT_MODEL_PREFERENCES, allowPaidFallback: true },
        allowedAccounts: new Set(ids),
        need: { inputTokens: 100, outputTokens: 100, attachments: 0, needsTools: false },
        request: {
          branchId: newId(),
          taskVersion: 1,
          messages: [{ role: 'user', text: 'fixture' }],
          tools: [],
          systemModules: [],
          outputLimit: 100,
        },
      },
      new AbortController().signal,
    )) {
      /* consume */
    }
    expect(requests).toHaveLength(2);
    expect(
      ledger.attempts(logicalCallId).map((a) => [a.activeAnswer, a.source, a.chargedTokens]),
    ).toEqual([
      [false, 'estimated', 200],
      [true, 'actual', 150],
    ]);
    expect(store.replay(0, 100).items.at(-1)?.type).toBe('provider.switched');
    expect(ledger.isDisabled(ids[0]!)).toBe(true);
    store.db.prepare('UPDATE provider_accounts SET revision=revision+1 WHERE id=?').run(ids[0]);
    expect(ledger.isDisabled(ids[0]!)).toBe(false);
  });
});
