import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src/api/adapter';
import { ModelRouter, type RoutingDependencies } from '../../packages/providers/src/routing/router';
import {
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  resolveApiConfig,
  type ModelRequest,
} from '../../packages/contracts/src';
import { runApiAcceptance } from '../live/P01-02.acceptance';
import { auditedApiFetch, type ApiRequestAudit } from '../live/P01-02.audit';
import { accountId, events, memoryNative, sseFrames, modelRequest } from '../fixtures/P01-02.api';

describe('P01-02 API acceptance with actual adapter and local HTTP', () => {
  it('preserves all-reasoning truncation while auditing none and stopping after one request', async () => {
    const config = resolveApiConfig('openai-compatible', {
      apiFormat: 'openai-responses',
      baseURL: 'https://open.bigmodel.cn/api/v1',
      modelId: 'glm-4.7-flashx',
    });
    const requestAudit: ApiRequestAudit[] = [];
    const adapter = new ApiKeyAdapter(
      accountId,
      config,
      async () => 'fixture-key',
      memoryNative().store,
      auditedApiFetch(config, requestAudit, async () =>
        sseFrames([
          { type: 'response.reasoning_text.delta', delta: 'private-reasoning-marker' },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              usage: {
                input_tokens: 20,
                output_tokens: 128,
                input_tokens_details: { cached_tokens: 2 },
                output_tokens_details: { reasoning_tokens: 128 },
              },
            },
          },
        ]),
      ),
    );
    const report = await runApiAcceptance(
      adapter,
      { accountId, label: 'fixture', config },
      new AbortController().signal,
      { textOnly: true },
    );
    expect(report.status).toBe('failed');
    expect(report.requests).toBe(1);
    expect(report.checks[0]).toMatchObject({
      error: { code: 'OUTPUT_LIMIT_REACHED', retryable: false },
      usage: {
        inputTotal: 20,
        outputTotal: 128,
        inputCachedSubset: 2,
        reasoningSubset: 128,
        source: 'actual',
      },
    });
    expect(requestAudit[0]).toMatchObject({
      reasoningEffort: 'none',
      maxOutputTokens: 128,
      inputShape: 'message.content.string',
      httpStatus: 200,
    });
    expect(report.checks.slice(1).every((check) => check.status === 'not_run')).toBe(true);
    expect(JSON.stringify({ report, requestAudit })).not.toMatch(/fixture-key|private-reasoning/);
  });
  it.each(['openai-chat', 'openai-responses', 'anthropic-messages'] as const)(
    'fully closes %s history, tool result and cancellation without live requests',
    async (apiFormat) => {
      const providerId =
        apiFormat === 'anthropic-messages' ? 'anthropic-compatible' : 'openai-compatible';
      const config = resolveApiConfig(providerId, {
        apiFormat,
        baseURL:
          apiFormat === 'openai-chat'
            ? 'https://open.bigmodel.cn/api/paas/v4'
            : apiFormat === 'openai-responses'
              ? 'https://open.bigmodel.cn/api/v1'
              : 'https://open.bigmodel.cn/api/anthropic/v1',
        modelId: apiFormat === 'openai-chat' ? 'glm-4.7-flash' : 'glm-4.7-flashx',
      });
      const bodies: Record<string, any>[] = [];
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          bodies.push(JSON.parse(body));
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const output = events(
            apiFormat,
            bodies.length === 4,
            false,
            '{"text":"TAPKIT_ECHO"}',
            bodies.length === 5 ? 'TAPKIT_ECHO' : 'TAPKIT_OK',
          );
          for (const event of output)
            res.write(
              'data: ' + (typeof event === 'string' ? event : JSON.stringify(event)) + '\n\n',
            );
          res.end();
        });
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const native = memoryNative();
      const requestAudit: ApiRequestAudit[] = [];
      const fetcher: typeof fetch = (_url, init) =>
        fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, init);
      try {
        // The injected loopback transport is test-only; production DNS/TLS rules remain unchanged.
        const adapter = new ApiKeyAdapter(
          accountId,
          config,
          async () => 'fixture-key',
          native.store,
          auditedApiFetch(config, requestAudit, fetcher),
        );
        const result = await runApiAcceptance(adapter, { accountId, label: 'fixture', config });
        expect(result.status).toBe('passed');
        expect(bodies).toHaveLength(6);
        expect(requestAudit).toHaveLength(6);
        expect(
          requestAudit.every(
            (entry) =>
              entry.httpStatus === 200 &&
              entry.maxOutputTokens === 128 &&
              entry.endpointMatchesConfig &&
              entry.modelMatchesConfig,
          ),
        ).toBe(true);
        if (apiFormat === 'openai-responses')
          expect(requestAudit.every((entry) => entry.reasoningEffort === 'none')).toBe(true);
        const input = (body: Record<string, any>) => body.input ?? body.messages;
        expect(JSON.stringify(input(bodies[1]!))).toContain('TAPKIT_OK');
        expect(JSON.stringify(input(bodies[4]!))).toContain('TAPKIT_ECHO');
        if (apiFormat !== 'openai-chat') {
          expect(JSON.stringify(input(bodies[1]!))).toContain('private-thinking-marker');
          expect(JSON.stringify(input(bodies[2]!))).not.toContain('private-thinking-marker');
          expect(JSON.stringify(input(bodies[4]!))).toContain(
            apiFormat === 'openai-responses' ? 'function_call_output' : 'tool_result',
          );
        } else expect(JSON.stringify(input(bodies[4]!))).toContain('tool_call_id');
        expect(result.checks[0]?.usage?.source).toBe('actual');
        expect(result.checks[5]?.usage).toBeNull();
        expect(native.values.size).toBe(5); // Cancelled output is never saved as finished native state.
        expect(JSON.stringify(result)).not.toMatch(
          /fixture-key|private-thinking|private-signature|TAPKIT_OK/,
        );
        expect(bodies.every((b) => (b.max_output_tokens ?? b.max_tokens) === 128)).toBe(true);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((done, reject) =>
          server.close((err) => (err ? reject(err) : done())),
        );
      }
    },
  );
});
describe('P01-02 official overloaded participates in bounded routing', () => {
  it.each(['recovers', 'always-busy', 'partial'] as const)(
    '%s retries only before output starts, at most twice',
    async (mode) => {
      const config = resolveApiConfig('openai-compatible', {
        apiFormat: 'openai-responses',
        baseURL: 'https://open.bigmodel.cn/api/v1',
        modelId: 'glm-4.7-flashx',
      });
      let calls = 0;
      const fetcher: typeof fetch = async () => {
        calls++;
        if (mode === 'recovers' && calls === 2) return sseFrames(events('openai-responses'));
        return sseFrames([
          ...(mode === 'partial'
            ? [{ type: 'response.output_text.delta', delta: 'private-partial' }]
            : []),
          {
            type: 'response.failed',
            response: { status: 'failed', error: { code: 'overloaded', message: 'private-error' } },
          },
        ]);
      };
      const adapter = new ApiKeyAdapter(
        accountId,
        config,
        async () => 'fixture-key',
        memoryNative().store,
        fetcher,
      );
      const model = DescriptorSchema.parse({
        accountId,
        providerId: config.providerId,
        modelId: config.modelId,
        displayName: 'fixture',
        contextWindow: 128000,
        maxOutput: 8192,
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
      const waits: number[] = [];
      const requests: ModelRequest[] = [];
      const deps: RoutingDependencies = {
        catalog: async () => [model],
        adapter: () => adapter,
        id: () => 'attempt-' + requests.length,
        now: () => 0,
        disabled: () => false,
        disable: () => {},
        switched: () => {},
        reserve: (request) => {
          requests.push(request);
          return 1;
        },
        settle: () => {},
        acquire: async () => () => {},
        wait: async (ms) => {
          waits.push(ms);
        },
        random: () => 0,
      };
      const router = new ModelRouter(deps);
      const result = [];
      for await (const event of router.stream(
        {
          logicalCallId: 'call',
          runId: 'run',
          rootRunId: 'run',
          mode: 'chat',
          preferences: {
            ...DEFAULT_MODEL_PREFERENCES,
            onlyThisModel: true,
            selection: { accountId, modelId: config.modelId },
          },
          request: modelRequest(config),
          need: { inputTokens: 50, outputTokens: 128, attachments: 0, needsTools: false },
          allowedAccounts: new Set([accountId]),
        },
        new AbortController().signal,
      ))
        result.push(event);
      expect(calls).toBe(mode === 'recovers' ? 2 : mode === 'always-busy' ? 3 : 1);
      expect(waits).toEqual(
        mode === 'recovers' ? [1000] : mode === 'always-busy' ? [1000, 3000] : [],
      );
      expect(requests).toHaveLength(calls);
      expect(result.some((e) => e.type === 'model.event' && e.event.type === 'finish')).toBe(
        mode === 'recovers',
      );
    },
  );
});
