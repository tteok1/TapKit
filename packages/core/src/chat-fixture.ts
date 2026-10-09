// Included only by an explicit test build; production builds remove this module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DescriptorSchema, type ProviderAdapter } from '@tapkit/contracts';
import { newId } from '@tapkit/storage';
import type { ModelService } from './model-service';
export function installChatFixture(models: ModelService) {
  const store = models.store;
  if (readFileSync(join(store.dataDir, 'P02-02.fixture'), 'utf8') !== 'P02-02 isolated fixture')
    throw new Error('FIXTURE_PROFILE_REQUIRED');
  const accounts = store.db.prepare('SELECT id,label FROM provider_accounts').all() as {
    id: string;
    label: string;
  }[];
  if (accounts.some((a) => a.label !== 'P02-02 synthetic fixture'))
    throw new Error('FIXTURE_PROFILE_REQUIRED');
  const accountId = accounts[0]?.id ?? newId();
  if (!accounts.length)
    store.db
      .prepare(
        "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id) VALUES(?,?,?,?,'openai-compatible','P02-02 synthetic fixture','api_key',?,'ready','openai-chat','https://fixture.invalid/v1','fixture-model')",
      )
      .run(accountId, store.profileId, store.now(), store.now(), newId());
  const descriptor = DescriptorSchema.parse({
    accountId,
    providerId: 'openai-compatible',
    modelId: 'fixture-model',
    displayName: '隔离测试模型',
    contextWindow: 128000,
    maxOutput: 8192,
    toolCalls: 'documented',
    verification: 'probed',
    accountLabel: 'P02-02 synthetic fixture',
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
  const adapter: ProviderAdapter = {
    id: 'openai-compatible',
    listModels: async () => [],
    checkConnection: async () => {
      throw new Error('FIXTURE_ONLY');
    },
    classifyError: () => ({ code: 'STREAM_INTERRUPTED', retryable: false }),
    async *stream(request, signal) {
      const last = request.messages.findLast((m) => m.role === 'user');
      const text = last?.role === 'user' ? last.text : '';
      yield { type: 'start', attemptId: request.attemptId };
      const answer = text.includes('恶意渲染')
        ? '# 安全标题\n\n|列|值|\n|---|---|\n|中文|1|\n\n$$x^2+1$$\n\n```javascript\nconst value = 1;\n```\n\n```mermaid\ngraph TD\nA[输入] --> B[输出]\n```\n\n[危险链接](javascript:alert(1))\n<img src="https://fixture.invalid/evil.png" onerror="window.fixturePwned=true">'
        : '隔离测试回复：' + text.slice(0, 80);
      yield { type: 'text_delta', blockId: 'text', text: answer.slice(0, 5) };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', cancel);
            resolve();
          },
          text.includes('慢速') ? 4000 : 100,
        );
        const cancel = () => {
          clearTimeout(timer);
          reject(new Error('CANCELLED'));
        };
        signal.addEventListener('abort', cancel, { once: true });
      });
      signal.throwIfAborted();
      yield { type: 'text_delta', blockId: 'text', text: answer.slice(5) };
      yield {
        type: 'usage',
        usage: {
          inputTotal: 20,
          inputCachedSubset: 0,
          outputTotal: 40,
          reasoningSubset: 0,
          source: 'actual',
        },
      };
      yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
    },
  };
  models.catalog = async () => [descriptor];
  models.router.deps.adapter = () => adapter;
}
