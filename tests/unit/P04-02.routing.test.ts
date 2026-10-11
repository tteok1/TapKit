import { test, expect } from 'vitest';
import { ModelRouter } from '../../packages/providers/src';
import {
  DescriptorSchema,
  DEFAULT_MODEL_PREFERENCES,
  type ModelRequest,
  type ProviderAdapter,
} from '../../packages/contracts/src';
import { checkpoint, assemble } from '../../packages/context/src';
import type { RoutingInput } from '../../packages/providers/src';
const id = (n: number) => `019953fa-0000-7000-8000-${String(n).padStart(12, '0')}`;
test('P04-02 T03 quota fallback reassembles for small window and never migrates opaque state or replays tools', async () => {
  const descriptor = (n: number, window: number) =>
    DescriptorSchema.parse({
      accountId: id(n),
      providerId: n === 1 ? 'codex-subscription' : 'deepseek',
      modelId: 'm' + n,
      displayName: 'fixture',
      contextWindow: window,
      maxOutput: 1024,
      toolCalls: 'documented',
      verification: 'probed',
      accountLabel: 'fixture',
      status: 'ready',
      reasoningLevels: ['off'],
      modalities: ['text'],
      parallelTools: 'unknown',
      jsonOutput: 'unknown',
      scenario: 'fixture',
      price: null,
      quotaRemaining: null,
      quotaResetAt: null,
    });
  const models = [descriptor(1, 128000), descriptor(2, 16000)],
    requests: ModelRequest[] = [],
    windows: number[] = [];
  const messages: ModelRequest['messages'] = [
    { role: 'user', text: '金额￥500，ID A-123，不得创建PR。' },
    { role: 'assistant', text: '中文背景'.repeat(3000) },
    { role: 'user', text: '最新目标：只读核查。' },
  ];
  const state = checkpoint(
    messages.map((m, i) => ({ id: id(10 + i), revision: 1, seq: i, role: m.role, text: m.text })),
  );
  const adapter = (n: number): ProviderAdapter => ({
    id: models[n - 1]!.providerId,
    listModels: async () => [],
    checkConnection: async () => {
      throw new Error();
    },
    classifyError: () => ({ code: 'PROVIDER_UNAVAILABLE', retryable: false }),
    async *stream(request) {
      requests.push(request);
      if (n === 1)
        yield {
          type: 'error',
          error: { code: 'QUOTA_EXHAUSTED', retryable: false },
          partial: false,
        };
      else {
        yield { type: 'text_delta', blockId: 'text', text: 'done' };
        yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
      }
    },
  });
  let n = 100;
  const router = new ModelRouter({
    catalog: async () => models,
    adapter: (accountId) => adapter(accountId === id(1) ? 1 : 2),
    id: () => id(n++),
    now: () => 0,
    disabled: () => false,
    reserve: () => 1,
    settle: () => {},
    disable: () => {},
    switched: () => {},
    acquire: async () => () => {},
  });
  const input: RoutingInput = {
    logicalCallId: id(50),
    runId: id(51),
    rootRunId: id(51),
    mode: 'chat',
    preferences: { ...DEFAULT_MODEL_PREFERENCES, allowPaidFallback: true },
    need: { inputTokens: 40000, outputTokens: 1024, attachments: 0, needsTools: false },
    allowedAccounts: new Set([id(1), id(2)]),
    nativeOrigin: { accountId: id(1), modelId: 'm1' },
    request: {
      messages,
      systemModules: [],
      tools: [],
      outputLimit: 1024,
      branchId: id(52),
      taskVersion: 1,
      nativeStateRef: 'opaque-private',
    },
    prepareContext: async (model) => {
      windows.push(model.contextWindow!);
      const result = assemble({
        systemModules: [],
        messages,
        tools: [],
        state,
        limits: { contextWindow: model.contextWindow, inputLimit: 64000, outputLimit: 1024 },
      });
      return {
        messages: result.messages,
        systemModules: [],
        inputTokens: result.stats.inputTokens,
        outputLimit: 1024,
      };
    },
  };
  for await (const _ of router.stream(input, new AbortController().signal)) {
    /* drain actual router */
  }
  expect(windows).toEqual([128000, 16000]);
  expect(requests).toHaveLength(2);
  expect(requests[0]!.nativeStateRef).toBe('opaque-private');
  expect(requests[1]!.nativeStateRef).toBeUndefined();
  expect(JSON.stringify(requests[1]!.messages)).toContain('A-123');
  expect(JSON.stringify(requests[1]!.messages)).toContain('不得创建PR');
  expect(JSON.stringify(requests[1]!.messages).length).toBeLessThan(
    JSON.stringify(requests[0]!.messages).length,
  );
});
