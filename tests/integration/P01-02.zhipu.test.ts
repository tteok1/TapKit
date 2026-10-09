import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import {
  ProviderListSchema,
  ProbeViewSchema,
  type Request,
  type Reply,
} from '../../packages/contracts/src';
import { events } from '../fixtures/P01-02.api';

it.each([
  ['openai-chat', 'glm-4.7-flash'],
  ['openai-chat', 'glm-4.7-flashx'],
  ['openai-responses', 'glm-4.7-flash'],
  ['openai-responses', 'glm-4.7-flashx'],
] as const)(
  'P01-02 Zhipu %s %s real mock HTTP and Core persist readiness, quota, truncation and upstream failure',
  async (apiFormat, modelId) => {
    const baseURL =
      apiFormat === 'openai-chat'
        ? 'https://open.bigmodel.cn/api/paas/v4'
        : 'https://open.bigmodel.cn/api/v1';
    const isOff = (body: Record<string, any>) =>
      apiFormat === 'openai-chat'
        ? body.thinking?.type === 'disabled'
        : body.reasoning?.effort === 'none';
    const directory = await mkdtemp(resolve('.test-data', 'P01-02-zhipu-core-'));
    const store = await openStore(directory);
    const core = new CoreService(store);
    const credentialId = newId();
    const states = new Map<string, unknown>();
    const vault: PrivateVault = async (operation, _account, raw) => {
      const value = raw as Record<string, any>;
      if (operation === 'api-key.read')
        return value.credentialId === credentialId ? { key: 'fixture-zhipu-key' } : {};
      if (operation === 'native.save') {
        states.set(value.ref, value.value);
        return {
          contentHash: createHash('sha256').update(JSON.stringify(value.value)).digest('hex'),
        };
      }
      if (operation === 'native.load') return states.get(value.ref);
      throw new Error('Unexpected private operation');
    };
    const service = new ProviderService(store, vault);
    let mode: 'ready' | 'quota' | 'truncated' | 'overloaded' | 'json' | 'html' | 'json-error' =
      'ready';
    const bodies: Record<string, any>[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const value = JSON.parse(body);
        bodies.push(value);
        if (mode === 'quota') {
          res.writeHead(429, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: '1113', message: 'private-error-message' } }));
          return;
        }
        if (mode === 'json-error') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                code: apiFormat === 'openai-responses' ? 'invalid_request' : '1210',
                message: 'private-error-message',
              },
            }),
          );
          return;
        }
        if (mode === 'json' || mode === 'html') {
          res.writeHead(200, {
            'content-type':
              (mode === 'json' ? 'application/problem+json' : 'text/html') +
              '; private-header-marker=private-key-marker',
          });
          res.end(
            mode === 'json'
              ? JSON.stringify({ message: 'private-body-marker' })
              : '<html>private-body-marker</html>',
          );
          return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        if (mode === 'overloaded') {
          res.end(
            `data: ${JSON.stringify({
              type: 'response.failed',
              response: {
                status: 'failed',
                error: { code: 'overloaded', message: 'private-error-message' },
                usage: null,
              },
            })}\n\n`,
          );
          return;
        }
        const output =
          mode === 'ready' && isOff(value)
            ? events(apiFormat, Boolean(value.tools?.length))
            : apiFormat === 'openai-chat'
              ? [{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, '[DONE]']
              : [
                  {
                    type: 'response.incomplete',
                    response: {
                      status: 'incomplete',
                      incomplete_details: { reason: 'max_output_tokens' },
                      usage: {
                        input_tokens: 20,
                        output_tokens: 32,
                        output_tokens_details: { reasoning_tokens: 32 },
                      },
                    },
                  },
                ];
        for (const event of output)
          res.write(
            'data: ' + (typeof event === 'string' ? event : JSON.stringify(event)) + '\n\n',
          );
        res.end();
      });
    });
    const request = (command: string, payload: unknown, revision?: number): Request => ({
      protocolVersion: 1,
      requestId: newId(),
      command,
      payload,
      ...(revision ? { expectedRevision: revision } : {}),
    });
    const data = (reply: Reply) => {
      if (!reply.ok) throw new Error(reply.error.code);
      return reply.data;
    };
    try {
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      expect(
        core.dispatch(
          request('providers.saveApiKey', {
            providerId: 'openai-compatible',
            label: 'Zhipu fixture',
            credentialId,
            apiFormat,
            baseURL,
            modelId,
          }),
        ),
      ).toMatchObject({ ok: true });
      const list = async () =>
        ProviderListSchema.parse(data(await service.dispatch(request('providers.list', {}))));
      let listing = await list();
      const channels = (service as unknown as { channels: Map<string, { fetcher: typeof fetch }> })
        .channels;
      channels.get(listing.accounts[0]!.accountId)!.fetcher = async (url, init) => {
        expect(String(url)).toBe(
          baseURL + (apiFormat === 'openai-chat' ? '/chat/completions' : '/responses'),
        );
        // Only this test's injected channel reaches loopback; production transport remains strict.
        return fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port, init);
      };
      const outcomes =
        apiFormat === 'openai-responses'
          ? (['ready', 'quota', 'truncated', 'overloaded', 'json', 'html', 'json-error'] as const)
          : (['ready', 'quota', 'truncated', 'json', 'html', 'json-error'] as const);
      for (const outcome of outcomes) {
        mode = outcome;
        const account = listing.accounts[0]!;
        const result = ProbeViewSchema.parse(
          data(
            await service.dispatch(
              request(
                'providers.check',
                { accountId: account.accountId, modelId: account.modelId },
                account.revision,
              ),
            ),
          ),
        );
        if (outcome === 'ready')
          expect(result).toMatchObject({ status: 'ready', text: true, tools: true });
        else
          expect(result).toMatchObject({
            status: 'unavailable',
            text: false,
            tools: false,
            errorCode:
              outcome === 'quota'
                ? 'QUOTA_EXHAUSTED'
                : outcome === 'overloaded'
                  ? 'PROVIDER_UNAVAILABLE'
                  : outcome === 'json' || outcome === 'html'
                    ? 'STREAM_INTERRUPTED'
                    : outcome === 'json-error'
                      ? 'VALIDATION_ERROR'
                      : 'OUTPUT_LIMIT_REACHED',
            diagnostic: {
              phase: 'text',
              reason:
                outcome === 'truncated'
                  ? apiFormat === 'openai-responses'
                    ? 'reasoning_output_truncated'
                    : 'output_truncated'
                  : outcome === 'json'
                    ? 'unrecognized_json'
                    : outcome === 'html'
                      ? 'unexpected_content_type'
                      : 'upstream_error',
              ...(outcome === 'quota'
                ? { upstreamCode: '1113', httpStatus: 429, responseType: 'json' }
                : {}),
              ...(outcome === 'overloaded'
                ? { upstreamCode: 'overloaded', httpStatus: 200, responseType: 'event-stream' }
                : {}),
              ...(outcome === 'json' || outcome === 'html'
                ? { httpStatus: 200, responseType: outcome }
                : {}),
              ...(outcome === 'json-error'
                ? {
                    httpStatus: 200,
                    responseType: 'json',
                    upstreamCode: apiFormat === 'openai-responses' ? 'invalid_request' : '1210',
                  }
                : {}),
              request: {
                outputLimit: 32,
                reasoning: apiFormat === 'openai-responses' ? 'none' : 'disabled',
                stream: true,
              },
              ...(outcome === 'truncated' && apiFormat === 'openai-responses'
                ? {
                    httpStatus: 200,
                    responseType: 'event-stream',
                    usage: {
                      inputTotal: 20,
                      outputTotal: 32,
                      inputCachedSubset: null,
                      reasoningSubset: 32,
                      source: 'actual',
                    },
                  }
                : {}),
            },
          });
        listing = await list();
        expect(listing.accounts[0]!.status).toBe(result.status);
        expect(listing.accounts[0]!.lastErrorCode).toBe(result.errorCode);
        expect(
          listing.models.find((model) => model.accountId === account.accountId)!.verification,
        ).toBe(outcome === 'ready' ? 'probed' : 'documented');
        expect(
          store.db
            .prepare('SELECT verification FROM model_catalog WHERE provider_id=? AND model_id=?')
            .get('openai-compatible', account.modelId),
        ).toEqual({ verification: outcome === 'ready' ? 'probed' : 'failed' });
        expect(JSON.stringify(result) + JSON.stringify(listing)).not.toMatch(
          /fixture-zhipu-key|private-error-message|private-thinking-marker|private-body-marker|private-header-marker|private-key-marker/,
        );
      }
      // Two requests for ready; every failed probe stops after one request, including overload.
      expect(bodies).toHaveLength(apiFormat === 'openai-responses' ? 8 : 7);
      expect(bodies.every(isOff)).toBe(true);
      expect(bodies.every((body) => body.model === modelId)).toBe(true);
      expect(bodies.every((body) => body.stream === true)).toBe(true);
      if (apiFormat === 'openai-responses')
        expect(
          bodies.every((body) =>
            body.input.every((item: Record<string, unknown>) => item.type === 'message'),
          ),
        ).toBe(true);
      expect(
        bodies.map((body) =>
          apiFormat === 'openai-chat' ? body.max_tokens : body.max_output_tokens,
        ),
      ).toEqual(
        apiFormat === 'openai-responses'
          ? [32, 128, 32, 32, 32, 32, 32, 32]
          : [32, 128, 32, 32, 32, 32, 32],
      );
    } finally {
      await service.stop();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      store.close();
    }
  },
);
