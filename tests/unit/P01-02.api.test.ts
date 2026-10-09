import { describe, it, expect, vi } from 'vitest';
import {
  API_PRESETS,
  SaveApiKeySchema,
  ApiBaseURLSchema,
  ProbeViewSchema,
  type ApiConfig,
  type ModelEvent,
} from '../../packages/contracts/src';
import { validateToolPairing, isPublicAddress, bypassProxy } from '../../packages/providers/src';
import {
  accountId,
  adapter,
  modelRequest,
  events,
  sseFrames,
  tool,
  collect,
} from '../fixtures/P01-02.api';
const providers = Object.keys(API_PRESETS) as ApiConfig['providerId'][];
function finish(items: ModelEvent[]) {
  return items.find((item) => item.type === 'finish');
}
describe('P01-02 API protocol fixtures', () => {
  for (const provider of providers) {
    it(
      provider + ' sends the correct auth/body and parses UTF-8, usage and parallel tools',
      async () => {
        const fetcher = vi.fn<typeof fetch>();
        const { config, channel } = adapter(provider, fetcher);
        fetcher.mockImplementation(async () => sseFrames(events(config.apiFormat), true));
        const first = await collect(channel, modelRequest(config));
        expect(
          first
            .filter((item) => item.type === 'text_delta')
            .map((item) => item.text)
            .join(''),
        ).toBe('中文OK');
        expect(finish(first)).toMatchObject({ reason: 'stop' });
        expect(first.at(-2)).toMatchObject({
          type: 'usage',
          usage: {
            inputTotal: config.apiFormat === 'anthropic-messages' ? 15 : 10,
            inputCachedSubset: 3,
            outputTotal: 5,
          },
        });
        const [url, init] = fetcher.mock.calls[0]!;
        const headers = new Headers(init?.headers),
          body = JSON.parse(String(init?.body));
        expect(String(url)).toBe(
          config.baseURL +
            '/' +
            (config.apiFormat === 'anthropic-messages'
              ? 'messages'
              : config.apiFormat === 'openai-responses'
                ? 'responses'
                : 'chat/completions'),
        );
        expect(init?.redirect).toBe('error');
        expect(body.model).toBe('mock-model');
        if (config.apiFormat === 'anthropic-messages') {
          expect(headers.get('x-api-key')).toBe('fixture-key');
          expect(headers.get('anthropic-version')).toBe('2023-06-01');
          expect(headers.has('authorization')).toBe(false);
          expect(body.max_tokens).toBe(128);
        } else {
          expect(headers.get('authorization')).toBe('Bearer fixture-key');
          expect(headers.has('x-api-key')).toBe(false);
          if (config.apiFormat === 'openai-responses') {
            expect(body.store).toBe(false);
            expect(body.max_output_tokens).toBe(128);
            expect(body.messages).toBeUndefined();
          }
        }
        if (provider === 'deepseek') expect(body.thinking).toEqual({ type: 'disabled' });
        if (provider === 'hunyuan' || provider === 'doubao') {
          expect(body.thinking).toBeUndefined();
          expect(body.stream_options).toBeUndefined();
          expect(body.max_tokens).toBe(128);
        }
        fetcher.mockImplementation(async () =>
          sseFrames(events(config.apiFormat, true, true), true),
        );
        const input = modelRequest(config);
        input.tools = [tool];
        const second = await collect(channel, input);
        expect(second.filter((item) => item.type === 'tool_end')).toHaveLength(2);
        expect(finish(second)).toMatchObject({ reason: 'tool_calls' });
        expect(JSON.stringify(first) + JSON.stringify(second)).not.toMatch(
          /private-thinking|private-signature/,
        );
      },
    );
    it(
      provider + ' requires a full terminal and never emits completed tools after interruption',
      async () => {
        const fetcher = vi.fn<typeof fetch>();
        const { config, channel } = adapter(provider, fetcher);
        const input = modelRequest(config);
        input.tools = [tool];
        fetcher.mockResolvedValue(sseFrames(events(config.apiFormat, true).slice(0, -1)));
        const failed = await collect(channel, input);
        expect(failed.at(-1)).toMatchObject({
          type: 'error',
          error: { code: 'STREAM_INTERRUPTED' },
        });
        expect(failed.some((item) => item.type === 'tool_end' || item.type === 'finish')).toBe(
          false,
        );
        fetcher.mockResolvedValue(sseFrames(events(config.apiFormat, true, false, '{"text":7}')));
        const bad = await collect(channel, input);
        expect(bad.at(-1)).toMatchObject({
          type: 'error',
          error: { diagnosticCode: 'invalid_tool_arguments' },
        });
        expect(bad.some((item) => item.type === 'tool_end')).toBe(false);
      },
    );
    it(provider + ' can run minimal text and tool probes and reject empty text', async () => {
      const fetcher = vi.fn<typeof fetch>();
      const { config, channel } = adapter(provider, fetcher);
      fetcher
        .mockResolvedValueOnce(sseFrames(events(config.apiFormat)))
        .mockResolvedValueOnce(sseFrames(events(config.apiFormat, true)));
      expect(
        await channel.checkConnection(
          { accountId, modelId: config.modelId },
          new AbortController().signal,
        ),
      ).toMatchObject({ status: 'ready', text: true, tools: true });
      fetcher.mockResolvedValue(sseFrames(events(config.apiFormat, false, false, '{}', '')));
      expect(
        await channel.checkConnection(
          { accountId, modelId: config.modelId },
          new AbortController().signal,
        ),
      ).toMatchObject({ status: 'unavailable', text: false, tools: false });
    });
  }
  for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) {
    it(format + ' aborts an idle body with no completion or tool dispatch', async () => {
      const controller = new AbortController(),
        cancel = vi.fn();
      const { config, channel } = adapter(
        'openai-compatible',
        async () =>
          new Response(
            new ReadableStream({
              start() {
                queueMicrotask(() => controller.abort());
              },
              cancel,
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        format,
      );
      const result = await collect(channel, modelRequest(config), controller.signal);
      expect(result.at(-1)).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
      expect(cancel).toHaveBeenCalled();
      expect(finish(result)).toBeUndefined();
    });
    for (const status of [401, 403, 429, 500])
      it(format + ' maps HTTP ' + status + ' without raw error text', async () => {
        const { config, channel } = adapter(
          'openai-compatible',
          async () =>
            Response.json(
              { error: { type: 'mock_error', message: 'private-error-key' } },
              { status, headers: { 'retry-after': '2' } },
            ),
          format,
        );
        const result = await collect(channel, modelRequest(config));
        expect(result.at(-1)).toMatchObject({
          type: 'error',
          error: {
            code:
              status === 401
                ? 'AUTH_EXPIRED'
                : status === 403
                  ? 'PERMISSION_DENIED'
                  : status === 429
                    ? 'RATE_LIMITED'
                    : 'PROVIDER_UNAVAILABLE',
            httpStatus: status,
            retryAfterMs: 2000,
          },
        });
        expect(JSON.stringify(result)).not.toContain('private-error-key');
      });
    it(
      format + ' reports missing usage as null and rejects account/model mismatch before fetch',
      async () => {
        const fetcher = vi.fn<typeof fetch>();
        const { config, channel } = adapter('openai-compatible', fetcher, format);
        const fixture = events(format).map((event) => {
          if (typeof event === 'string') return event;
          const copy = structuredClone(event) as Record<string, any>;
          delete copy.usage;
          if (copy.message) delete copy.message.usage;
          if (copy.response) delete copy.response.usage;
          return copy;
        });
        fetcher.mockResolvedValue(sseFrames(fixture));
        const result = await collect(channel, modelRequest(config));
        expect(result.at(-2)).toMatchObject({
          type: 'usage',
          usage: {
            inputTotal: null,
            outputTotal: null,
            inputCachedSubset: null,
            reasoningSubset: null,
          },
        });
        fetcher.mockClear();
        const input = modelRequest(config);
        input.accountId = 'other';
        expect((await collect(channel, input)).at(-1)).toMatchObject({
          type: 'error',
          error: { code: 'PERMISSION_DENIED' },
        });
        input.accountId = accountId;
        input.model.modelId = 'other';
        expect((await collect(channel, input)).at(-1)).toMatchObject({
          type: 'error',
          error: { code: 'MODEL_UNSUPPORTED' },
        });
        expect(fetcher).not.toHaveBeenCalled();
      },
    );
  }
  it('distinguishes explicit quota from rate limit and does not retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 }));
    const { config, channel } = adapter('openai-compatible', fetcher);
    expect((await collect(channel, modelRequest(config))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'QUOTA_EXHAUSTED', retryable: false },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed SSE, bad UTF-8, oversized frames and HTTP 200 gateway pages', async () => {
    for (const response of [
      new Response('data: {bad}\n\n', { headers: { 'content-type': 'text/event-stream' } }),
      new Response(Uint8Array.of(0xff), { headers: { 'content-type': 'text/event-stream' } }),
      new Response('data: ' + 'x'.repeat(4_194_305)),
      new Response('<html>private-page</html>', { headers: { 'content-type': 'text/html' } }),
    ]) {
      const { config, channel } = adapter('openai-compatible', async () => response);
      const result = await collect(channel, modelRequest(config));
      expect(result.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED' } });
      expect(finish(result)).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('private-page');
    }
  });
  it.each([
    ['Text/HTML; private-header-marker=private-key-marker', 'html', 200],
    ['application/xhtml+xml', 'html', 202],
    ['application/private-header-marker', 'other', 200],
  ] as const)(
    'bounds non-SSE diagnostics for %s and never reads the body',
    async (mime, responseType, status) => {
      for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) {
        const response = new Response('private-body-marker', {
          status,
          headers: { 'content-type': mime, 'x-private-header': 'private-key-marker' },
        });
        const read = vi.spyOn(response.body!, 'getReader');
        // A cancellation error must not hide the observed content-type failure.
        const cancel = vi
          .spyOn(response.body!, 'cancel')
          .mockRejectedValue(new Error('private-cancel-marker'));
        const fetcher = vi.fn().mockResolvedValue(response);
        const { config, channel } = adapter('openai-compatible', fetcher, format);
        const result = ProbeViewSchema.parse(
          await channel.checkConnection(
            { accountId, modelId: config.modelId },
            new AbortController().signal,
          ),
        );
        expect(result).toMatchObject({
          status: 'unavailable',
          text: false,
          tools: false,
          errorCode: 'STREAM_INTERRUPTED',
          diagnostic: {
            phase: 'text',
            reason: 'unexpected_content_type',
            httpStatus: status,
            responseType,
          },
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(read).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toMatch(/private-|application\/|text\/html/i);
        expect(
          ProbeViewSchema.safeParse({
            ...result,
            diagnostic: { ...result.diagnostic, responseType: mime },
          }).success,
        ).toBe(false);
      }
    },
  );
  it('reports tool-phase JSON without retrying or exporting headers or body', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(sseFrames(events('openai-responses')))
      .mockResolvedValueOnce(Response.json({ error: { message: 'private-body-marker' } }));
    const { config, channel } = adapter('openai-compatible', fetcher, 'openai-responses');
    const result = ProbeViewSchema.parse(
      await channel.checkConnection(
        { accountId, modelId: config.modelId },
        new AbortController().signal,
      ),
    );
    expect(result).toMatchObject({
      text: true,
      tools: false,
      status: 'unavailable',
      errorCode: 'PROVIDER_UNAVAILABLE',
      diagnostic: {
        phase: 'tools',
        reason: 'upstream_error',
        httpStatus: 200,
        responseType: 'json',
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('private-body-marker');
  });
  it.each([
    [
      { error: { code: 'model_not_found', message: 'private-body-marker' } },
      'upstream_error',
      'MODEL_UNSUPPORTED',
    ],
    [
      { type: 'error', code: 'invalid_api_key', message: 'private-body-marker' },
      'upstream_error',
      'AUTH_EXPIRED',
    ],
    [{ error: { code: '<private-key-marker>' } }, 'upstream_error', 'PROVIDER_UNAVAILABLE'],
    [
      {
        object: 'response',
        status: 'completed',
        output: [{ text: 'private-body-marker' }],
        error: null,
      },
      'non_streaming_response',
      'STREAM_INTERRUPTED',
    ],
    [{ message: 'private-body-marker' }, 'unrecognized_json', 'STREAM_INTERRUPTED'],
    [[{ error: { code: 'invalid_api_key' } }], 'unrecognized_json', 'STREAM_INTERRUPTED'],
  ] as const)(
    'inspects JSON safely without completing or retrying: %j',
    async (body, reason, errorCode) => {
      for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) {
        const response = Response.json(body, {
          status: 201,
          headers: {
            'content-type': 'Application/Problem+JSON; private-header-marker=private-key-marker',
          },
        });
        const fetcher = vi.fn().mockResolvedValue(response);
        const { config, channel, native } = adapter('openai-compatible', fetcher, format);
        const result = ProbeViewSchema.parse(
          await channel.checkConnection(
            { accountId, modelId: config.modelId },
            new AbortController().signal,
          ),
        );
        expect(result).toMatchObject({
          status: errorCode === 'AUTH_EXPIRED' ? 'expired' : 'unavailable',
          text: false,
          tools: false,
          errorCode,
          diagnostic: { phase: 'text', reason, httpStatus: 201, responseType: 'json' },
        });
        expect(JSON.stringify(result)).not.toMatch(/private-|application\//);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(native.values.size).toBe(0);
        expect(response.body!.locked).toBe(false);
      }
    },
  );
  it.each([
    ['data: {"type":"response.completed"}\n\n', 'invalid_json'],
    ['{"private-body-marker":', 'invalid_json'],
    [new Uint8Array([0xff]), 'invalid_utf8'],
    ['', 'empty_response'],
    [new Uint8Array(65_537), 'frame_too_large'],
  ] as const)('rejects bounded malformed JSON responses: %s', async (body, reason) => {
    const response = new Response(body, { headers: { 'content-type': 'application/json' } });
    const { config, channel } = adapter('openai-compatible', async () => response);
    const result = await channel.checkConnection(
      { accountId, modelId: config.modelId },
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      text: false,
      tools: false,
      errorCode: 'STREAM_INTERRUPTED',
      diagnostic: { phase: 'text', reason, httpStatus: 200, responseType: 'json' },
    });
    expect(JSON.stringify(result)).not.toContain('private-body-marker');
  });
  it('cancels oversized, broken and aborted JSON bodies without publishing data', async () => {
    const cancel = vi.fn();
    const oversized = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(32_769));
        },
        cancel,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
    const fixture = adapter('openai-compatible', async () => oversized);
    const oversizedEvents = await collect(fixture.channel, modelRequest(fixture.config));
    expect(oversizedEvents.at(-1)).toMatchObject({
      type: 'error',
      error: { diagnosticCode: 'frame_too_large' },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('private-read-marker'));
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
    const failing = adapter('openai-compatible', async () => broken);
    expect((await collect(failing.channel, modelRequest(failing.config))).at(-1)).toMatchObject({
      type: 'error',
      error: { diagnosticCode: 'read_failed' },
    });
    const abort = new AbortController();
    const abortedCancel = vi.fn();
    const pending = new Response(new ReadableStream({ cancel: abortedCancel }), {
      headers: { 'content-type': 'application/json' },
    });
    const getReader = pending.body!.getReader.bind(pending.body!);
    vi.spyOn(pending.body!, 'getReader').mockImplementation(() => {
      const reader = getReader();
      queueMicrotask(() => abort.abort());
      return reader;
    });
    const aborting = adapter('openai-compatible', async () => pending);
    const aborted = await collect(aborting.channel, modelRequest(aborting.config), abort.signal);
    expect(aborted.at(-1)).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
    expect(finish(aborted)).toBeUndefined();
    expect(abortedCancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(oversizedEvents) + JSON.stringify(aborted)).not.toContain('private-');
  });
  it('validates SSE even when content-type is absent and omits HTTP facts before a response', async () => {
    const malformed = new Response(new TextEncoder().encode('data: {bad}\n\n'));
    const { config, channel } = adapter('openai-compatible', async () => malformed);
    const result = await channel.checkConnection(
      { accountId, modelId: config.modelId },
      new AbortController().signal,
    );
    expect(result.diagnostic).toMatchObject({
      phase: 'text',
      reason: 'invalid_json',
      httpStatus: 200,
      responseType: 'missing',
    });
    const valid = sseFrames(events('openai-chat'));
    valid.headers.delete('content-type');
    const working = adapter('openai-compatible', async () => valid);
    expect(finish(await collect(working.channel, modelRequest(working.config)))).toBeDefined();
    const failing = adapter('openai-compatible', async () => {
      throw new Error('private-network-marker');
    });
    const failure = (await collect(failing.channel, modelRequest(failing.config))).at(-1);
    expect(failure).toEqual({
      type: 'error',
      error: { code: 'NETWORK_ERROR', retryable: true },
      partial: false,
    });
    const http = adapter('openai-compatible', async () =>
      Response.json({ error: { message: 'private-body-marker' } }, { status: 401 }),
    );
    const denied = await http.channel.checkConnection(
      { accountId, modelId: http.config.modelId },
      new AbortController().signal,
    );
    expect(denied.diagnostic).toMatchObject({
      reason: 'upstream_error',
      httpStatus: 401,
      responseType: 'json',
    });
    expect(JSON.stringify(denied)).not.toContain('private-body-marker');
  });
  it('requires stop metadata in Chat and Anthropic terminals', async () => {
    for (const format of ['openai-chat', 'anthropic-messages'] as const) {
      const { config, channel } = adapter(
        'openai-compatible',
        async () => sseFrames([format === 'openai-chat' ? '[DONE]' : { type: 'message_stop' }]),
        format,
      );
      expect((await collect(channel, modelRequest(config))).at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'STREAM_INTERRUPTED' },
      });
    }
  });
  it('keeps length-limited text and never commits unfinished tool arguments', async () => {
    for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) {
      const partial = events(format, true, false, '{"text":');
      if (format === 'openai-chat')
        partial.splice(-3, 1, {
          choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: 'length' }],
        });
      else if (format === 'anthropic-messages')
        partial.splice(-2, 1, { type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
      else
        partial.splice(-1, 1, {
          type: 'response.incomplete',
          response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
        });
      const { config, channel } = adapter(
          'openai-compatible',
          async () => sseFrames(partial),
          format,
        ),
        input = modelRequest(config);
      input.tools = [tool];
      const result = await collect(channel, input);
      expect(result.at(-1)).toMatchObject({ type: 'finish', reason: 'length' });
      expect(result.some((event) => event.type === 'tool_end')).toBe(false);
      if (format === 'openai-chat')
        expect(result).toContainEqual({ type: 'text_delta', blockId: 'text-0', text: 'partial' });
    }
  });
  it('classifies structured stream errors without finishing or copying the error message', async () => {
    for (const [type, code] of [
      ['rate_limit_error', 'RATE_LIMITED'],
      ['authentication_error', 'AUTH_EXPIRED'],
      ['overloaded_error', 'PROVIDER_UNAVAILABLE'],
    ]) {
      const { config, channel } = adapter('anthropic-compatible', async () =>
        sseFrames([{ type: 'error', error: { type, message: 'private-error-key' } }]),
      );
      const result = await collect(channel, modelRequest(config));
      expect(result.at(-1)).toMatchObject({ type: 'error', error: { code, httpStatus: 200 } });
      expect(finish(result)).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('private-error-key');
    }
  });
  it('validates canonical tool pairing including empty assistant content and parallel results', () => {
    const assistant = {
      role: 'assistant' as const,
      text: '',
      calls: [
        { id: 'a', name: 'echo', arguments: {} },
        { id: 'b', name: 'echo', arguments: {} },
      ],
    };
    const result = { role: 'tool' as const, name: 'echo', text: 'OK', isError: false };
    expect(() =>
      validateToolPairing([assistant, { ...result, callId: 'b' }, { ...result, callId: 'a' }]),
    ).not.toThrow();
    for (const messages of [
      [assistant],
      [{ ...result, callId: 'a' }],
      [assistant, { role: 'user' as const, text: 'next' }],
      [assistant, { ...result, callId: 'a' }, { ...result, callId: 'a' }],
    ])
      expect(() => validateToolPairing(messages)).toThrow('VALIDATION_ERROR');
  });
  it('validates HTTPS/key control characters without inferring protocol from key prefixes', () => {
    for (const base of [
      'http://api.example/v1',
      'https://user:pass@api.example/v1',
      'https://api.example/v1?key=x',
      'https://api.example/v1#x',
    ])
      expect(ApiBaseURLSchema.safeParse(base).success).toBe(false);
    expect(
      SaveApiKeySchema.parse({
        providerId: 'anthropic-compatible',
        label: 'a',
        key: 'arbitrary-key',
      }).key,
    ).toBe('arbitrary-key');
    expect(
      SaveApiKeySchema.safeParse({
        providerId: 'openai-compatible',
        label: 'a',
        key: 'bad\r\nheader',
      }).success,
    ).toBe(false);
  });
  it('blocks private, loopback, link-local and reserved addresses and respects NO_PROXY domains', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.1.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.1.1',
      '::1',
      '::ffff:127.0.0.1',
      'fe80::1',
      '2001:db8::1',
      '198.51.100.1',
    ])
      expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(bypassProxy('api.example', '443', '.example')).toBe(true);
    expect(bypassProxy('evil-example', '443', 'example')).toBe(false);
    expect(bypassProxy('api.example', '443', 'api.example:8080')).toBe(false);
  });
});
