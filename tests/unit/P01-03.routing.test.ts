import { describe, it, expect } from 'vitest';
import {
  ModelRouter,
  describeModels,
  effectivePreferences,
  candidates,
  compatibility,
  rebuildCanonical,
} from '../../packages/providers/src';
import {
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  type ModelDescriptor,
  type ModelRequest,
  type ProviderAdapter,
  type ModelEvent,
  type ProviderError,
  type ModelPreferences,
} from '../../packages/contracts/src';
import type { RoutingInput, RoutingDependencies } from '../../packages/providers/src';
import { CodexAdapter } from '../../packages/providers/src';
import { codexFetch } from '../../packages/providers/src/codex/transport';
import { credentials, nativeStore, token } from '../fixtures/P01-01.codex';
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const model = (n: number, providerId: ModelDescriptor['providerId'] = 'codex-subscription') =>
  DescriptorSchema.parse({
    accountId: id(n),
    providerId,
    modelId: 'model-' + n,
    displayName: 'Model ' + n,
    contextWindow: 128000,
    maxOutput: 8192,
    toolCalls: 'documented',
    verification: 'probed',
    accountLabel: 'fixture',
    status: 'ready',
    reasoningLevels: ['off', 'low', 'medium', 'high'],
    modalities: ['text'],
    parallelTools: 'unknown',
    jsonOutput: 'unknown',
    scenario: 'fixture',
    price: null,
    quotaRemaining: null,
    quotaResetAt: null,
  });
const input = (models: ModelDescriptor[], prefs: Partial<ModelPreferences> = {}): RoutingInput => ({
  logicalCallId: id(100),
  runId: id(101),
  rootRunId: id(101),
  mode: 'chat',
  preferences: { ...DEFAULT_MODEL_PREFERENCES, allowPaidFallback: true, ...prefs },
  request: {
    messages: [{ role: 'user', text: 'fixture' }],
    tools: [],
    systemModules: [],
    outputLimit: 128,
    branchId: id(102),
    taskVersion: 1,
  },
  need: { inputTokens: 100, outputTokens: 128, attachments: 0, needsTools: false },
  allowedAccounts: new Set(models.map((m) => m.accountId!)),
});
const success: ModelEvent[] = [
  { type: 'text_delta', blockId: '0', text: 'new answer' },
  {
    type: 'usage',
    usage: {
      inputTotal: 10,
      inputCachedSubset: 5,
      outputTotal: 4,
      reasoningSubset: 2,
      source: 'actual',
    },
  },
  { type: 'finish', reason: 'stop', nativeStateRef: id(90) },
];
const fail = (code: ProviderError['code'], extra: Partial<ProviderError> = {}): ModelEvent => ({
  type: 'error',
  error: { code, retryable: false, ...extra },
  partial: false,
});
function harness(models: ModelDescriptor[], sequences: ModelEvent[][][]) {
  let counter = 200;
  const requests: ModelRequest[] = [],
    settled: Parameters<RoutingDependencies['settle']>[] = [],
    switches: unknown[] = [],
    waits: number[] = [],
    disabled = new Set<string>();
  const turns = models.map(() => 0),
    refreshes = models.map(() => 0),
    releases: string[] = [];
  const adapters: ProviderAdapter[] = models.map((m, i) => ({
    id: m.providerId,
    listModels: async () => [],
    checkConnection: async () => {
      throw new Error('unused');
    },
    classifyError: (error) => ({
      code:
        error instanceof Error && error.message === 'AUTH_EXPIRED'
          ? 'AUTH_EXPIRED'
          : 'PROVIDER_UNAVAILABLE',
      retryable: false,
    }),
    refreshAuth: async () => {
      refreshes[i] = refreshes[i]! + 1;
    },
    async *stream(request) {
      requests.push(request);
      const events = sequences[i]![turns[i]!] ?? [];
      turns[i] = turns[i]! + 1;
      for (const event of events) yield event;
    },
  }));
  const deps: RoutingDependencies = {
    catalog: async () => models,
    adapter: (accountId) => adapters[models.findIndex((m) => m.accountId === accountId)]!,
    id: () => id(counter++),
    now: () => 0,
    disabled: (accountId) => disabled.has(accountId),
    disable: (accountId) => {
      disabled.add(accountId);
    },
    reserve: () => requests.length + 1,
    settle: (...args) => {
      settled.push(args);
    },
    switched: (...args) => {
      switches.push(args);
    },
    acquire: async (accountId) => () => {
      releases.push(accountId);
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    random: () => 0,
  };
  const router = new ModelRouter(deps);
  return { deps, router, requests, settled, switches, waits, disabled, refreshes, releases };
}
const collect = async (
  router: ModelRouter,
  request: RoutingInput,
  signal = new AbortController().signal,
) => {
  const events = [];
  for await (const event of router.stream(request, signal)) events.push(event);
  return events;
};
describe('P01-03 routing, capabilities and scopes', () => {
  it('real Codex force-refresh is serialized and cancelled refresh cannot write credentials', async () => {
    const store = credentials();
    let calls = 0;
    const next = token() + '-updated';
    const adapter = new CodexAdapter(id(1), store, nativeStore(), async () => {
      calls++;
      return new Response(
        JSON.stringify({ access_token: next, refresh_token: 'fixture-updated', expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    await Promise.all([
      adapter.refreshAuth(new AbortController().signal),
      adapter.refreshAuth(new AbortController().signal),
    ]);
    expect(calls).toBe(1);
    expect((await store.read('openai-codex'))?.type).toBe('oauth');
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.refreshAuth(controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it('Codex HTTP retry-after survives typed classification without changing 429 into quota', async () => {
    let captured: ProviderError | undefined;
    const fetcher = codexFetch(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '32' } }),
      (error) => {
        captured = error;
      },
    );
    await fetcher('https://chatgpt.com/backend-api/codex/responses');
    expect(captured).toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 32000 });
  });
  it('subscription exhaustion preserves interrupted text and switches to DeepSeek with a separate attempt', async () => {
    const models = [model(1), model(2, 'deepseek')],
      h = harness(models, [
        [[{ type: 'text_delta', blockId: '0', text: 'old partial' }, fail('QUOTA_EXHAUSTED')]],
        [success],
      ]);
    const events = await collect(h.router, input(models));
    expect(h.requests).toHaveLength(2);
    expect(h.switches).toHaveLength(1);
    expect(h.disabled.has(id(1))).toBe(true);
    expect(h.settled.map((s) => [s[1].status, s[1].text])).toEqual([
      ['interrupted', 'old partial'],
      ['completed', 'new answer'],
    ]);
    expect(events.filter((e) => e.type === 'attempt')).toHaveLength(2);
    expect(h.releases).toHaveLength(2);
  });
  it('explicit API balance exhaustion also advances once and never revisits an exhausted account', async () => {
    const models = [model(1), model(2, 'deepseek'), model(3, 'doubao')],
      h = harness(models, [[[fail('QUOTA_EXHAUSTED')]], [[fail('QUOTA_EXHAUSTED')]], [success]]);
    await collect(h.router, input(models));
    expect(h.requests).toHaveLength(3);
    expect(h.disabled.size).toBe(2);
  });
  it('all unavailable and only-this-model terminate without paid fallback', async () => {
    const models = [model(1), model(2, 'deepseek')];
    models.forEach((m) => (m.status = 'unavailable'));
    const h = harness(models, []);
    expect((await collect(h.router, input(models))).at(-1)?.type).toBe('route.error');
    expect(h.requests).toHaveLength(0);
    models.forEach((m) => (m.status = 'ready'));
    const h2 = harness(models, [[[fail('QUOTA_EXHAUSTED')]], [success]]);
    await collect(
      h2.router,
      input(models, { onlyThisModel: true, selection: { accountId: id(1), modelId: 'model-1' } }),
    );
    expect(h2.requests).toHaveLength(1);
  });
  it('ordinary 429 retries twice with retry-after and does not switch or mark quota', async () => {
    const models = [model(1), model(2, 'deepseek')],
      error = fail('RATE_LIMITED', { retryable: true, retryAfterMs: 2000 });
    const h = harness(models, [[[error], [error], [error]], [success]]);
    await collect(h.router, input(models));
    expect(h.waits).toEqual([2000, 2000]);
    expect(h.requests).toHaveLength(3);
    expect(h.switches).toHaveLength(0);
    expect(h.disabled.size).toBe(0);
    const h2 = harness(models, [
      [[fail('RATE_LIMITED', { retryable: true, retryAfterMs: 31000 })]],
      [success],
    ]);
    await collect(h2.router, input(models));
    expect(h2.requests).toHaveLength(1);
    expect(h2.waits).toEqual([]);
  });
  it('401 refreshes once, retries the same account, then asks reconnection instead of looping', async () => {
    const models = [model(1)],
      h = harness(models, [[[fail('AUTH_EXPIRED')], [fail('AUTH_EXPIRED')]]]);
    await collect(h.router, input(models));
    expect(h.requests).toHaveLength(2);
    expect(h.refreshes).toEqual([1]);
    expect(h.disabled.has(id(1))).toBe(true);
    const h2 = harness(models, [[[fail('AUTH_EXPIRED')], success]]);
    await collect(h2.router, input(models));
    expect(h2.refreshes).toEqual([1]);
    expect(h2.settled.at(-1)?.[1].status).toBe('completed');
  });
  it('no retries after body starts, no retry/switch on permission failure', async () => {
    const models = [model(1)],
      h = harness(models, [
        [
          [
            { type: 'text_delta', blockId: '0', text: 'partial' },
            fail('NETWORK_ERROR', { retryable: true }),
          ],
          success,
        ],
      ]);
    await collect(h.router, input(models));
    expect(h.requests).toHaveLength(1);
    expect(h.waits).toEqual([]);
    const h2 = harness(
      [model(1), model(2, 'deepseek')],
      [[[fail('PERMISSION_DENIED')]], [success]],
    );
    await collect(h2.router, input([model(1), model(2, 'deepseek')]));
    expect(h2.requests).toHaveLength(1);
  });
  it('at most five distinct accounts, scoped account grants and paid consent are respected', async () => {
    const models = Array.from({ length: 7 }, (_, i) =>
      model(i + 1, i ? 'deepseek' : 'codex-subscription'),
    );
    const h = harness(
      models,
      models.map(() => [[fail('QUOTA_EXHAUSTED')]]),
    );
    await collect(h.router, input(models));
    expect(h.requests).toHaveLength(5);
    const h2 = harness(
      models,
      models.map(() => [[fail('QUOTA_EXHAUSTED')]]),
    );
    const request = input(models, { allowPaidFallback: false });
    await collect(h2.router, request);
    expect(h2.requests).toHaveLength(1);
    const h3 = harness(
      models,
      models.map(() => [success]),
    );
    request.allowedAccounts = new Set([id(2)]);
    await collect(h3.router, request);
    expect(h3.requests[0]?.accountId).toBe(id(2));
  });
  it('cross-model uses settled tool evidence exactly once, strips opaque state and waits for pending tool ledger', async () => {
    const models = [model(1), model(2, 'deepseek')],
      h = harness(models, [[[fail('QUOTA_EXHAUSTED')]], [success]]),
      request = input(models);
    let writes = 1,
      settlements = 0;
    request.request.messages = [
      { role: 'user', text: 'write once' },
      {
        role: 'assistant',
        text: '',
        calls: [{ id: 'call-original', name: 'write', arguments: { path: 'fixture' } }],
      },
      {
        role: 'tool',
        callId: 'call-original',
        name: 'write',
        text: 'written once; approval ledger retained',
        isError: false,
      },
    ];
    request.request.nativeStateRef = id(99);
    request.nativeOrigin = { accountId: id(1), modelId: 'model-1' };
    request.settlePendingTools = async () => {
      settlements++;
      return request.request.messages;
    };
    await collect(h.router, request);
    expect(h.requests[0]?.nativeStateRef).toBe(id(99));
    expect(h.requests[1]?.nativeStateRef).toBeUndefined();
    expect(settlements).toBe(2);
    expect(writes).toBe(1);
    expect(
      h.requests[1]?.messages.some(
        (m) => m.role === 'tool' || (m.role === 'assistant' && m.calls?.length),
      ),
    ).toBe(false);
    expect(JSON.stringify(h.requests[1]?.messages)).toContain('call-original');
    expect(JSON.stringify(h.requests[1]?.messages)).toContain('approval ledger retained');
    request.request.messages.pop();
    const h2 = harness(models, [[success], [success]]);
    await collect(h2.router, request);
    expect(h2.requests).toHaveLength(0);
    writes = 1;
  });
  it('consumer return and abort release budget/slots; unfinished tools are not released', async () => {
    const models = [model(1)],
      h = harness(models, [
        [
          [
            { type: 'tool_end', callId: 'call', name: 'write', arguments: {} },
            fail('STREAM_INTERRUPTED'),
          ],
        ],
      ]);
    const events = await collect(h.router, input(models));
    expect(events.some((e) => e.type === 'model.event' && e.event.type === 'tool_end')).toBe(false);
    const h2 = harness(models, [[success]]);
    const iterator = h2.router
      .stream(input(models), new AbortController().signal)
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    expect(h2.settled[0]?.[1].status).toBe('cancelled');
    expect(h2.releases).toHaveLength(1);
    const c = new AbortController();
    c.abort();
    expect((await collect(h.router, input(models), c.signal)).at(-1)).toMatchObject({
      type: 'route.error',
      error: { code: 'CANCELLED' },
    });
  });
  it('default/session/current priority and compatibility never discard attachments or context', () => {
    const p = { ...DEFAULT_MODEL_PREFERENCES, selection: { accountId: id(1), modelId: 'model-1' } },
      session = { ...p, selection: { accountId: id(2), modelId: 'model-2' } };
    expect(effectivePreferences(p, session).values.selection).toEqual(session.selection);
    expect(effectivePreferences(p, session, { selection: null }).scope).toBe('current');
    const need = { inputTokens: 100, outputTokens: 128, attachments: 1, needsTools: false };
    expect(candidates([model(1)], p, need)).toEqual([]);
    expect(
      compatibility(model(1), p, { ...need, attachments: 0, inputTokens: 200000 }),
    ).not.toEqual([]);
    expect(
      compatibility(
        model(1),
        { ...p, answer: { ...p.answer, format: 'json' } },
        { ...need, attachments: 0 },
      ),
    ).not.toEqual([]);
    const messages = [{ role: 'user' as const, text: 'keep me' }];
    expect(rebuildCanonical(messages)).toEqual(messages);
    expect(messages).toHaveLength(1);
    const catalog = describeModels(
      [
        {
          accountId: id(1),
          providerId: 'deepseek',
          status: 'ready',
          label: 'fixture',
          revision: 1,
          lastErrorCode: null,
          hasCredential: false,
        },
      ],
      [
        {
          accountId: id(1),
          providerId: 'deepseek',
          modelId: 'm',
          displayName: 'm',
          contextWindow: null,
          maxOutput: null,
          toolCalls: 'unknown',
          verification: 'documented',
        },
      ],
    );
    expect(catalog[0]?.status).toBe('unconfigured');
    expect(catalog[0]?.price).toBeNull();
  });
});
