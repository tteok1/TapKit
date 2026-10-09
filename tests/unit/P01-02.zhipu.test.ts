import { describe, expect, it, vi } from 'vitest';
import { resolveApiConfig, ProbeViewSchema, type ApiConfig } from '../../packages/contracts/src';
import { ApiKeyAdapter } from '../../packages/providers/src';
import {
  accountId,
  memoryNative,
  modelRequest,
  sseFrames,
  events,
  collect,
} from '../fixtures/P01-02.api';

const baseURL = 'https://open.bigmodel.cn/api/paas/v4';
function fixture(fetcher: typeof fetch, overrides: Partial<ApiConfig> = {}) {
  const config = resolveApiConfig('openai-compatible', {
    baseURL,
    modelId: 'glm-4.7-flash',
    ...overrides,
  });
  const channel = new ApiKeyAdapter(
    accountId,
    config,
    async () => 'fixture-key',
    memoryNative().store,
    fetcher,
  );
  return { config, channel };
}
function truncated(text = '') {
  return sseFrames([
    {
      choices: [
        { index: 0, delta: { reasoning_content: 'private-thinking-marker', content: text } },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] },
    '[DONE]',
  ]);
}
async function probe(channel: ApiKeyAdapter, config: ApiConfig) {
  return ProbeViewSchema.parse(
    await channel.checkConnection(
      { accountId, modelId: config.modelId },
      new AbortController().signal,
    ),
  );
}

function responsesTruncated() {
  return sseFrames([
    { type: 'response.reasoning_text.delta', delta: 'private-thinking-marker' },
    {
      type: 'response.incomplete',
      response: {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        usage: { output_tokens: 32, output_tokens_details: { reasoning_tokens: 32 } },
      },
    },
  ]);
}

describe('P01-02 Zhipu Responses request and error compatibility', () => {
  it('types official message inputs including native replay without changing function items', async () => {
    const fetcher = vi.fn().mockImplementation(async () => sseFrames(events('openai-responses')));
    const { config, channel } = fixture(fetcher, {
      apiFormat: 'openai-responses',
      baseURL: 'https://open.bigmodel.cn/api/v1',
      modelId: 'glm-4.7-flashx',
    });
    const input = modelRequest(config);
    input.messages = [
      { role: 'user', text: 'question' },
      {
        role: 'assistant',
        text: 'calling',
        calls: [{ id: 'echo-1', name: 'echo', arguments: { text: 'OK' } }],
      },
      { role: 'tool', callId: 'echo-1', name: 'echo', text: 'OK', isError: false },
    ];
    const first = await collect(channel, input);
    const terminal = first.find((event) => event.type === 'finish');
    expect(terminal?.type).toBe('finish');
    if (terminal?.type !== 'finish') throw new Error('Fixture did not finish');
    const second = await collect(channel, {
      ...input,
      messages: [
        ...input.messages,
        {
          role: 'assistant',
          text: first
            .flatMap((event) => (event.type === 'text_delta' ? [event.text] : []))
            .join(''),
        },
        { role: 'user', text: 'continue' },
      ],
      nativeStateRef: terminal.nativeStateRef,
    });
    expect(second.some((event) => event.type === 'finish')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    for (const body of bodies) {
      expect(body).toMatchObject({ stream: true, reasoning: { effort: 'none' }, store: false });
      expect(
        body.input
          .filter((item: Record<string, unknown>) => item.role)
          .every((item: Record<string, unknown>) => item.type === 'message'),
      ).toBe(true);
      expect(body.input).toContainEqual({
        type: 'function_call',
        call_id: 'echo-1',
        name: 'echo',
        arguments: '{"text":"OK"}',
      });
      expect(body.input).toContainEqual({
        type: 'function_call_output',
        call_id: 'echo-1',
        output: 'OK',
      });
    }
    const other = fixture(fetcher, {
      apiFormat: 'openai-responses',
      baseURL: 'https://example.com/v1',
    });
    await collect(other.channel, modelRequest(other.config));
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]?.body)).input[0]).not.toHaveProperty(
      'type',
    );
  });
  it.each([
    ['invalid_request', 'VALIDATION_ERROR', false],
    ['expired', 'AUTH_EXPIRED', false],
    ['permission_denied', 'PERMISSION_DENIED', false],
    ['usage_not_included', 'QUOTA_EXHAUSTED', false],
    ['server_is_overloaded', 'PROVIDER_UNAVAILABLE', true],
    ['slow_down', 'RATE_LIMITED', true],
    ['not_implemented', 'MODEL_UNSUPPORTED', false],
  ] as const)(
    'classifies Responses JSON and top-level SSE error %s',
    async (code, expected, retryable) => {
      for (const json of [true, false]) {
        const fetcher = vi
          .fn()
          .mockImplementation(async () =>
            json
              ? Response.json({ error: { code, message: 'private-response-marker' } })
              : sseFrames([{ type: 'error', code, message: 'private-response-marker' }]),
          );
        const { config, channel } = fixture(fetcher, {
          apiFormat: 'openai-responses',
          baseURL: 'https://open.bigmodel.cn/api/v1',
        });
        const items = await collect(channel, modelRequest(config));
        expect(items.at(-1)).toMatchObject({
          type: 'error',
          error: {
            code: expected,
            retryable,
            diagnosticCode: 'upstream_error',
            httpStatus: 200,
            responseType: json ? 'json' : 'event-stream',
            upstreamCode: code,
          },
        });
        expect(items.some((event) => event.type === 'finish' || event.type === 'tool_end')).toBe(
          false,
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(items)).not.toContain('private-response-marker');
      }
    },
  );
  it('keeps HTTP authentication precedence and scopes Responses aliases to the official endpoint', async () => {
    for (const status of [401, 403]) {
      const { config, channel } = fixture(
        async () => Response.json({ error: { code: 'usage_not_included' } }, { status }),
        { apiFormat: 'openai-responses', baseURL: 'https://open.bigmodel.cn/api/v1' },
      );
      expect((await collect(channel, modelRequest(config))).at(-1)).toMatchObject({
        type: 'error',
        error: {
          code: status === 401 ? 'AUTH_EXPIRED' : 'PERMISSION_DENIED',
          retryable: false,
          httpStatus: status,
        },
      });
    }
    for (const baseURL of [
      'https://example.com/v1',
      'https://open.bigmodel.cn.evil.example/api/v1',
      'https://open.bigmodel.cn/api/coding/v1',
    ]) {
      const { config, channel } = fixture(
        async () => Response.json({ error: { code: 'invalid_request' } }),
        { apiFormat: 'openai-responses', baseURL },
      );
      expect((await collect(channel, modelRequest(config))).at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'PROVIDER_UNAVAILABLE', retryable: false },
      });
    }
  });
});

describe('P01-02 Zhipu Responses off mapping', () => {
  it('reports HTTP 200 response.failed overloaded as an upstream failure without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      sseFrames([
        {
          type: 'response.failed',
          response: {
            status: 'failed',
            error: { code: 'overloaded', message: 'private-overload-message' },
            usage: null,
          },
        },
      ]),
    );
    const { config, channel } = fixture(fetcher, {
      apiFormat: 'openai-responses',
      baseURL: 'https://open.bigmodel.cn/api/v1',
    });
    const result = await probe(channel, config);
    expect(result).toMatchObject({
      status: 'unavailable',
      text: false,
      tools: false,
      errorCode: 'PROVIDER_UNAVAILABLE',
      diagnostic: {
        phase: 'text',
        reason: 'upstream_error',
        httpStatus: 200,
        upstreamCode: 'overloaded',
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/fixture-key|private-overload-message/);
  });

  it.each([
    ['glm-4.7-flash', 'https://open.bigmodel.cn/api/v1'],
    ['GLM-4.7-Flash', 'https://open.bigmodel.cn/api/v1/'],
    ['glm-4.7-flashx', 'https://open.bigmodel.cn/api/v1'],
    ['GLM-4.7-FlashX', 'https://open.bigmodel.cn/api/v1/'],
  ])('disables default max reasoning for %s at %s in both phases', async (modelId, baseURL) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.reasoning?.effort !== 'none') return responsesTruncated();
      return sseFrames(events('openai-responses', Boolean(body.tools?.length)));
    });
    const { config, channel } = fixture(fetcher, {
      apiFormat: 'openai-responses',
      baseURL,
      modelId,
    });
    expect(await probe(channel, config)).toMatchObject({
      status: 'ready',
      text: true,
      tools: true,
      errorCode: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map((body) => body.max_output_tokens)).toEqual([32, 128]);
    for (const body of bodies) {
      expect(body.model).toBe(modelId);
      expect(body.reasoning).toEqual({ effort: 'none' });
      expect(body.thinking).toBeUndefined();
      expect(body.store).toBe(false);
      expect(body.include).toBeUndefined();
    }
    expect(
      fetcher.mock.calls.every(
        ([url]) => String(url) === 'https://open.bigmodel.cn/api/v1/responses',
      ),
    ).toBe(true);
  });

  it.each([
    { baseURL: 'https://open.bigmodel.cn.evil.example/api/v1' },
    { baseURL: 'https://open.bigmodel.cn:8443/api/v1' },
    { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4' },
    { baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
    { baseURL: 'https://other.example/api/v1' },
    { modelId: 'glm-5.3' },
    { apiFormat: 'openai-chat' as const },
    { apiFormat: 'anthropic-messages' as const, providerId: 'anthropic-compatible' as const },
    { modelId: 'glm-4.7-flashx', baseURL: 'https://other.example/api/v1' },
    {
      modelId: 'glm-4.7-flashx',
      apiFormat: 'anthropic-messages' as const,
      providerId: 'anthropic-compatible' as const,
    },
  ])('leaves unrelated endpoints, models and formats unchanged: %j', async (overrides) => {
    const fetcher = vi.fn<typeof fetch>();
    const { config, channel } = fixture(fetcher, {
      baseURL: 'https://open.bigmodel.cn/api/v1',
      apiFormat: 'openai-responses',
      ...overrides,
    });
    fetcher.mockResolvedValue(sseFrames(events(config.apiFormat)));
    await collect(channel, modelRequest(config));
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.reasoning).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it.each(['glm-4.7-flash', 'glm-4.7-flashx'])(
    'does not open unimplemented Responses thinking levels for %s',
    async (modelId) => {
      const fetcher = vi.fn<typeof fetch>();
      const { config, channel } = fixture(fetcher, {
        apiFormat: 'openai-responses',
        baseURL: 'https://open.bigmodel.cn/api/v1',
        modelId,
      });
      const request = modelRequest(config);
      request.reasoning = 'high';
      expect((await collect(channel, request)).at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'MODEL_UNSUPPORTED' },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(['glm-4.7-flash', 'glm-4.7-flashx'])(
    'still stops after one truncated text response for %s and never exposes private reasoning',
    async (modelId) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(responsesTruncated());
      const { config, channel } = fixture(fetcher, {
        apiFormat: 'openai-responses',
        baseURL: 'https://open.bigmodel.cn/api/v1',
        modelId,
      });
      const result = await probe(channel, config);
      expect(result).toMatchObject({
        status: 'unavailable',
        text: false,
        tools: false,
        errorCode: 'OUTPUT_LIMIT_REACHED',
        diagnostic: { phase: 'text', reason: 'reasoning_output_truncated' },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('private-thinking-marker');
    },
  );

  it.each([
    ['1305', 'PROVIDER_UNAVAILABLE'],
    ['1113', 'QUOTA_EXHAUSTED'],
  ])('classifies official Responses business code %s', async (code, errorCode) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code } }, { status: 429 }));
    const { config, channel } = fixture(fetcher, {
      apiFormat: 'openai-responses',
      baseURL: 'https://open.bigmodel.cn/api/v1',
    });
    expect(await probe(channel, config)).toMatchObject({
      errorCode,
      diagnostic: { phase: 'text', reason: 'upstream_error', httpStatus: 429, upstreamCode: code },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('P01-02 Zhipu thinking and bounded diagnostics', () => {
  it.each([
    [32, 32, 'reasoning_output_truncated'],
    [32, 0, 'output_truncated'],
    [32, undefined, 'output_truncated'],
    [undefined, undefined, 'output_truncated'],
  ] as const)(
    'keeps the actual text probe audit and reported usage on truncation %s/%s',
    async (output, reasoning, reason) => {
      const fetcher = vi.fn().mockImplementation(async () =>
        sseFrames([
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              usage: {
                input_tokens: 20,
                output_tokens: output,
                output_tokens_details: { reasoning_tokens: reasoning },
                private_key: 'private-usage-marker',
              },
            },
          },
        ]),
      );
      const { config, channel } = fixture(fetcher, {
        baseURL: 'https://open.bigmodel.cn/api/v1',
        apiFormat: 'openai-responses',
        modelId: 'glm-4.7-flashx',
      });
      const result = ProbeViewSchema.parse(await probe(channel, config));
      expect(result).toMatchObject({
        text: false,
        tools: false,
        status: 'unavailable',
        errorCode: 'OUTPUT_LIMIT_REACHED',
        diagnostic: {
          phase: 'text',
          reason,
          httpStatus: 200,
          responseType: 'event-stream',
          request: { outputLimit: 32, reasoning: 'none', stream: true },
          usage: {
            inputTotal: 20,
            outputTotal: output ?? null,
            inputCachedSubset: null,
            reasoningSubset: reasoning ?? null,
            source: 'actual',
          },
        },
      });
      const actualBody = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
      expect(result.diagnostic?.request?.outputLimit).toBe(actualBody.max_output_tokens);
      expect(result.diagnostic?.request?.reasoning).toBe(actualBody.reasoning.effort);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toMatch(
        /fixture-key|private-usage-marker|private_key|authorization/,
      );
      expect(
        ProbeViewSchema.safeParse({
          ...result,
          diagnostic: {
            ...result.diagnostic,
            request: { ...result.diagnostic?.request, key: 'private-key' },
          },
        }).success,
      ).toBe(false);
    },
  );
  it('uses the tool phase audit and usage rather than the successful text phase', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(sseFrames(events('openai-responses')))
      .mockResolvedValueOnce(
        sseFrames([
          {
            type: 'response.incomplete',
            response: {
              incomplete_details: { reason: 'max_output_tokens' },
              usage: {
                input_tokens: 30,
                output_tokens: 128,
                output_tokens_details: { reasoning_tokens: 128 },
              },
            },
          },
        ]),
      );
    const { config, channel } = fixture(fetcher, {
      baseURL: 'https://open.bigmodel.cn/api/v1',
      apiFormat: 'openai-responses',
      modelId: 'glm-4.7-flashx',
    });
    const result = ProbeViewSchema.parse(await probe(channel, config));
    expect(result).toMatchObject({
      text: true,
      tools: false,
      diagnostic: {
        phase: 'tools',
        reason: 'reasoning_output_truncated',
        request: { outputLimit: 128, reasoning: 'none' },
        usage: { inputTotal: 30, outputTotal: 128, reasoningSubset: 128 },
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not fabricate response facts or reasoning usage when none are available', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('private-network-message'));
    const { config, channel } = fixture(fetcher, {
      baseURL: 'https://open.bigmodel.cn/api/v1',
      apiFormat: 'openai-responses',
      modelId: 'glm-4.7-flashx',
    });
    const result = await probe(channel, config);
    expect(result.diagnostic).toMatchObject({
      request: { outputLimit: 32, reasoning: 'none', stream: true },
    });
    expect(result.diagnostic).not.toHaveProperty('httpStatus');
    expect(result.diagnostic).not.toHaveProperty('usage');
    expect(JSON.stringify(result)).not.toContain('private-network-message');
  });
  it.each([
    ['glm-4.7-flash', baseURL],
    ['GLM-4.7-Flash', baseURL + '/'],
    ['glm-4.7-flashx', baseURL],
    ['GLM-4.7-FlashX', baseURL + '/'],
  ])(
    'disables default thinking for %s at %s in both probe phases without rewriting the configured model',
    async (modelId, baseURL) => {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        // Reproduce the observed default-thinking / no-public-text failure.
        if (body.thinking?.type !== 'disabled') return truncated();
        return sseFrames(events('openai-chat', Boolean(body.tools?.length)));
      });
      const { config, channel } = fixture(fetcher, { modelId, baseURL });
      expect(await probe(channel, config)).toMatchObject({
        status: 'ready',
        text: true,
        tools: true,
        errorCode: null,
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
      const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
      expect(bodies.map((body) => body.max_tokens)).toEqual([32, 128]);
      for (const body of bodies) {
        expect(body.model).toBe(modelId);
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.reasoning).toBeUndefined();
      }
    },
  );

  it.each([
    { baseURL: 'https://open.bigmodel.cn.evil.example/api/paas/v4' },
    { baseURL: 'https://open.bigmodel.cn:8443/api/paas/v4' },
    { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4' },
    { baseURL: 'https://open.bigmodel.cn/v1' },
    { modelId: 'glm-5.3' },
    { baseURL: 'https://other.example/v1' },
    { apiFormat: 'openai-responses' as const },
    { apiFormat: 'anthropic-messages' as const },
    { modelId: 'glm-4.7-flashx', baseURL: 'https://open.bigmodel.cn.evil.example/api/paas/v4' },
    { modelId: 'glm-4.7-flashx', baseURL: 'https://open.bigmodel.cn:8443/api/paas/v4' },
    { modelId: 'glm-4.7-flashx', baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4' },
    { modelId: 'glm-4.7-flashx', baseURL: 'https://other.example/v1' },
    { modelId: 'glm-4.7-flashx', apiFormat: 'openai-responses' as const },
    { modelId: 'glm-4.7-flashx', apiFormat: 'anthropic-messages' as const },
  ])(
    'does not add vendor extensions to unrelated endpoints, formats or unverified models: %j',
    async (overrides) => {
      const fetcher = vi.fn<typeof fetch>();
      const { config, channel } = fixture(fetcher, overrides);
      fetcher.mockResolvedValue(sseFrames(events(config.apiFormat)));
      await collect(channel, modelRequest(config));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).thinking).toBeUndefined();
    },
  );

  it.each(['glm-4.7-flash', 'glm-4.7-flashx'])(
    'does not enable unimplemented Zhipu thinking levels for %s or issue a request for them',
    async (modelId) => {
      const fetcher = vi.fn<typeof fetch>();
      const { config, channel } = fixture(fetcher, { modelId });
      const input = modelRequest(config);
      input.reasoning = 'high';
      expect((await collect(channel, input)).at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'MODEL_UNSUPPORTED' },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['glm-4.7-flash', ''],
    ['glm-4.7-flash', 'partial'],
    ['glm-4.7-flashx', ''],
    ['glm-4.7-flashx', 'partial'],
  ])(
    'reports text truncation instead of model incompatibility for %s, including %j text',
    async (modelId, text) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(truncated(text));
      const { config, channel } = fixture(fetcher, { modelId });
      const result = await probe(channel, config);
      expect(result).toMatchObject({
        status: 'unavailable',
        text: false,
        tools: false,
        errorCode: 'OUTPUT_LIMIT_REACHED',
        diagnostic: { phase: 'text', reason: 'output_truncated' },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('private-thinking');
    },
  );

  it.each(['glm-4.7-flash', 'glm-4.7-flashx'])(
    'preserves the passed text phase but fails a truncated tool probe for %s without retrying',
    async (modelId) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(sseFrames(events('openai-chat')))
        .mockResolvedValueOnce(truncated());
      const { config, channel } = fixture(fetcher, { modelId });
      expect(await probe(channel, config)).toMatchObject({
        status: 'unavailable',
        text: true,
        tools: false,
        errorCode: 'OUTPUT_LIMIT_REACHED',
        diagnostic: { phase: 'tools', reason: 'output_truncated' },
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it('distinguishes a completed empty response from a model-not-found error', async () => {
    const { config, channel } = fixture(async () =>
      sseFrames(events('openai-chat', false, false, '{}', '')),
    );
    expect(await probe(channel, config)).toMatchObject({
      errorCode: 'PROVIDER_UNAVAILABLE',
      diagnostic: { reason: 'empty_text' },
    });
  });

  it.each([
    ['1113', 429, 'QUOTA_EXHAUSTED', false],
    ['1302', 429, 'RATE_LIMITED', true],
    ['1305', 429, 'PROVIDER_UNAVAILABLE', true],
    ['1308', 429, 'QUOTA_EXHAUSTED', false],
    ['1311', 429, 'PERMISSION_DENIED', false],
    [1315, 429, 'PERMISSION_DENIED', false],
    ['1313', 429, 'RATE_LIMITED', false],
    ['1211', 400, 'MODEL_UNSUPPORTED', false],
    ['1214', 400, 'VALIDATION_ERROR', false],
    ['9999', 429, 'RATE_LIMITED', true],
  ] as const)(
    'classifies Zhipu business code %s and preserves sanitized diagnostics',
    async (code, status, expected, retryable) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json(
            { error: { code, message: 'private-error-key' } },
            { status, headers: { 'retry-after': '2' } },
          ),
        );
      const { config, channel } = fixture(fetcher);
      const stream = await collect(channel, modelRequest(config));
      expect(stream.at(-1)).toMatchObject({
        type: 'error',
        error: {
          code: expected,
          retryable,
          httpStatus: status,
          upstreamCode: String(code),
          retryAfterMs: 2000,
        },
      });
      const result = await probe(channel, config);
      expect(result).toMatchObject({
        errorCode: expected,
        diagnostic: {
          phase: 'text',
          reason: 'upstream_error',
          httpStatus: status,
          upstreamCode: String(code),
        },
      });
      expect(fetcher).toHaveBeenCalledTimes(2); // One stream call, one probe; neither retries.
      expect(JSON.stringify(stream) + JSON.stringify(result)).not.toMatch(
        /private-error-key|fixture-key/,
      );
    },
  );

  it('does not interpret another vendor numeric code as Zhipu quota', async () => {
    const { config, channel } = fixture(
      async () => Response.json({ error: { code: '1113' } }, { status: 429 }),
      { baseURL: 'https://other.example/v1' },
    );
    expect(await probe(channel, config)).toMatchObject({
      errorCode: 'RATE_LIMITED',
      diagnostic: { upstreamCode: '1113' },
    });
  });

  it('preserves business codes from stream errors and rejects unsafe diagnostic strings', async () => {
    for (const code of ['1113', '<script>private-error-key</script>']) {
      const { config, channel } = fixture(async () =>
        sseFrames([{ error: { code, message: 'private-error-key' } }]),
      );
      const result = await probe(channel, config);
      expect(result.errorCode).toBe(code === '1113' ? 'QUOTA_EXHAUSTED' : 'PROVIDER_UNAVAILABLE');
      expect(result.diagnostic?.upstreamCode).toBe(code === '1113' ? code : undefined);
      expect(result.diagnostic?.httpStatus).toBe(200);
      expect(JSON.stringify(result)).not.toContain('private-error-key');
    }
  });
});
