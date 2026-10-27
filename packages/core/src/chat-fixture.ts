// Included only by an explicit test build; production builds remove this module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DescriptorSchema, type ProviderAdapter } from '@tapkit/contracts';
import { newId } from '@tapkit/storage';
import type { ModelService } from './model-service';
import { conservativeCandidate } from '../../context/src';
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
  const networkFailures = new Set<string>();
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
      const backgroundCall = request.systemModules.some((module) =>
        ['tapkit.title', 'tapkit.memory.extract'].includes(module.id),
      );
      if (text.includes('P05项目') && !backgroundCall) {
        const result = request.messages
          .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
          .findLast((m) => m.role === 'tool' && m.name === 'knowledge.query');
        if (!result && request.tools.some((tool) => tool.name === 'knowledge.query')) {
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'knowledge.query',
            arguments: { query: '退款期限', limit: 3 },
          };
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        const hit =
          result?.role === 'tool'
            ? (JSON.parse(result.text) as { hits?: { evidence?: { id: string; text: string } }[] })
                .hits?.[0]?.evidence
            : undefined;
        yield {
          type: 'text_delta',
          blockId: 'text',
          text: hit
            ? hit.text.split(/[。；\n]/)[0] + '[[evidence:' + hit.id + ']]'
            : '资料不足，无法查证。',
        };
        yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
        return;
      }
      if (text.includes('P05来源') && !backgroundCall) {
        const current = request.messages.slice(
          request.messages.findLastIndex((m) => m.role === 'user') + 1,
        );
        const result = current.findLast((m) => m.role === 'tool' && m.name === 'web.read');
        const available = request.tools.some((tool) => tool.name === 'web.read');
        if (!result && available) {
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'web.read',
            arguments: { url: text.match(/https?:\/\/[^\s]+/)?.[0] ?? 'https://example.com/' },
          };
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        const page =
          result?.role === 'tool'
            ? (JSON.parse(result.text) as { sourceId?: string; error?: string })
            : undefined;
        yield {
          type: 'text_delta',
          blockId: 'text',
          text: page?.sourceId
            ? '公开价格 42 元[[web:' + page.sourceId + ']]'
            : page?.error
              ? '无法读取来源：' + page.error + '，请补充材料或更换来源。'
              : '当前未启用联网，无法查证。',
        };
        yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
        return;
      }
      yield { type: 'start', attemptId: request.attemptId };
      if (
        request.systemModules.some((m) => m.id === 'tapkit.title') &&
        text.includes('标题故障验收') &&
        !networkFailures.has(request.branchId)
      ) {
        networkFailures.add(request.branchId);
        yield {
          type: 'error',
          partial: false,
          error: {
            code: 'NETWORK_ERROR',
            retryable: true,
            diagnosticCode: 'response_headers_timeout',
          },
        };
        return;
      }
      if (text.includes('网络重试诊断')) {
        if (!networkFailures.has(request.logicalCallId)) {
          networkFailures.add(request.logicalCallId);
          yield {
            type: 'error',
            partial: false,
            error: {
              code: 'NETWORK_ERROR',
              retryable: true,
              diagnosticCode: 'response_headers_timeout',
            },
          };
          return;
        }
        await new Promise<void>((_resolve, reject) => {
          const cancel = () => reject(new Error('CANCELLED'));
          if (signal.aborted) cancel();
          else signal.addEventListener('abort', cancel, { once: true });
        });
      }
      const echoTranslation =
        process.env.TAPKIT_TRANSLATION_ECHO_FIXTURE === '1' &&
        request.systemModules.some(
          (m) => m.id === 'message.selection' && m.text.includes('动作代码：translate'),
        );
      const answer = echoTranslation
        ? (JSON.parse(text.slice(text.lastIndexOf('\n') + 1)).text as string)
        : request.systemModules.some((m) => m.id === 'tapkit.memory.extract')
          ? JSON.stringify(conservativeCandidate(text))
          : text.includes('恶意渲染')
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
