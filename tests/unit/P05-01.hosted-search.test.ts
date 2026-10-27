import { test, expect, vi } from 'vitest';
import { zstdDecompressSync } from 'node:zlib';
import { WebOptionsSchema, type ModelRequest, type ModelEvent } from '../../packages/contracts/src';
import { HostedSources } from '../../packages/providers/src/hosted-search';
import { CodexAdapter, codexCatalog } from '../../packages/providers/src';
import { adapter, modelRequest, collect, sseFrames } from '../fixtures/P01-02.api';
import {
  credentials,
  nativeStore,
  request as codexRequest,
  textEvents,
} from '../fixtures/P01-01.codex';
const options = WebOptionsSchema.parse({
  days: 7,
  language: 'zh',
  country: 'china',
  domains: ['example.com'],
  excludeDomains: ['bad.example.com'],
});
function isolated(input: ModelRequest): ModelRequest {
  return {
    ...input,
    hostedSearch: options,
    systemModules: [],
    tools: [],
    messages: [{ role: 'user', text: '查证公开测试资料' }],
  };
}
const searchItem = (id = 'ws-1') => ({
  type: 'web_search_call',
  id,
  status: 'completed',
  action: { type: 'search', sources: [{ url: 'https://example.com/one', title: '公开来源' }] },
});
function responses() {
  return [
    { type: 'response.output_item.added', item: { type: 'web_search_call', id: 'ws-1' } },
    { type: 'response.output_item.done', item: searchItem() },
    { type: 'response.output_text.delta', delta: 'UNTRUSTED_SEARCH_ANSWER' },
    {
      type: 'response.output_item.done',
      item: {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'UNTRUSTED_SEARCH_ANSWER',
            annotations: [
              { type: 'url_citation', title: '另一来源', url: 'https://example.com/two' },
            ],
          },
        ],
      },
    },
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [searchItem()],
        usage: { input_tokens: 12, output_tokens: 7, input_tokens_details: { cached_tokens: 3 } },
      },
    },
  ];
}
function anthropic(stop = 'end_turn', call = true) {
  const blocks = call
    ? [
        { type: 'server_tool_use', id: 'srv-1', name: 'web_search', input: { query: '公开问题' } },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srv-1',
          content: [
            {
              type: 'web_search_result',
              title: '公开来源',
              url: 'https://example.com/one',
              encrypted_content: 'PRIVATE_PROVIDER_BLOB',
            },
          ],
        },
      ]
    : [
        {
          type: 'text',
          text: 'UNTRUSTED_SEARCH_ANSWER',
          citations: [
            {
              type: 'web_search_result_location',
              title: '另一来源',
              url: 'https://example.com/two',
            },
          ],
        },
      ];
  return [
    { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 2 } } },
    ...blocks.flatMap((block, index) => [
      { type: 'content_block_start', index, content_block: block },
      { type: 'content_block_stop', index },
    ]),
    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
}

test.each(['openai-responses', 'anthropic-messages'] as const)(
  'P05-01 %s hosted search sends only isolated question; server tools never become client calls or native state',
  async (format) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      sseFrames(format === 'openai-responses' ? responses() : anthropic(), true),
    );
    const f = adapter(
      format === 'openai-responses' ? 'openai-compatible' : 'anthropic-compatible',
      fetcher,
      format,
    );
    const events = await collect(f.channel, isolated(modelRequest(f.config)));
    expect(events.at(-1)).toMatchObject({ type: 'finish', nativeStateRef: '' });
    expect(events.find((e) => e.type === 'hosted_search')).toMatchObject({
      result: {
        searches: 1,
        candidates: expect.arrayContaining([
          expect.objectContaining({ url: 'https://example.com/one' }),
        ]),
      },
    });
    expect(events.some((e) => ['text_delta', 'tool_delta', 'tool_end'].includes(e.type))).toBe(
      false,
    );
    expect(JSON.stringify(events)).not.toMatch(/UNTRUSTED_SEARCH_ANSWER|PRIVATE_PROVIDER_BLOB/);
    expect(f.native.values.size).toBe(0);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.previous_response_id).toBeUndefined();
    expect(body.tools).toHaveLength(1);
    if (format === 'openai-responses') {
      expect(body).toMatchObject({
        store: false,
        max_tool_calls: 1,
        include: ['web_search_call.action.sources'],
        input: [{ role: 'user', content: '查证公开测试资料' }],
      });
      expect(body.tools[0].filters).toEqual({
        allowed_domains: options.domains,
        blocked_domains: options.excludeDomains,
      });
    } else {
      expect(body.tools[0]).toMatchObject({
        type: 'web_search_20250305',
        max_uses: 1,
        allowed_domains: options.domains,
      });
      expect(body.tools[0].blocked_domains).toBeUndefined();
      expect(body.messages).toEqual([{ role: 'user', content: '查证公开测试资料' }]);
    }
  },
);

test('P05-01 Anthropic pause_turn preserves server blocks and tools, aggregates both turns, caps continuation', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(sseFrames(anthropic('pause_turn')))
    .mockResolvedValueOnce(sseFrames(anthropic('end_turn', false)));
  const f = adapter('anthropic-compatible', fetcher);
  const events = await collect(f.channel, isolated(modelRequest(f.config)));
  expect(events.at(-1)?.type).toBe('finish');
  const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init!.body)));
  expect(bodies[1].tools).toEqual(bodies[0].tools);
  expect(bodies[1].messages[1].content[1].content[0].encrypted_content).toBe(
    'PRIVATE_PROVIDER_BLOB',
  );
  expect(events.filter((e) => e.type === 'usage').at(-1)).toMatchObject({
    usage: { inputTotal: 24, outputTotal: 10 },
  });
  expect(JSON.stringify(events)).not.toContain('PRIVATE_PROVIDER_BLOB');
  fetcher.mockReset().mockImplementation(async () => sseFrames(anthropic('pause_turn', false)));
  const capped = await collect(f.channel, isolated(modelRequest(f.config)));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(capped.at(-1)).toMatchObject({ type: 'error', error: { code: 'BUDGET_EXCEEDED' } });
});

test.each([
  ['chat protocol', (r: ModelRequest) => r, 'openai-chat'],
  [
    'history',
    (r: ModelRequest) => ({
      ...r,
      messages: [...r.messages, { role: 'user' as const, text: 'PRIVATE_CANARY' }],
    }),
    'openai-responses',
  ],
  [
    'native state',
    (r: ModelRequest) => ({ ...r, nativeStateRef: 'PRIVATE_CANARY' }),
    'openai-responses',
  ],
  [
    'system context',
    (r: ModelRequest) => ({ ...r, systemModules: [{ id: 'memory', text: 'PRIVATE_CANARY' }] }),
    'openai-responses',
  ],
] as const)('P05-01 rejects %s before any search dispatch', async (_name, change, format) => {
  const fetcher = vi.fn<typeof fetch>();
  const f = adapter('openai-compatible', fetcher, format);
  const events = await collect(f.channel, change(isolated(modelRequest(f.config))));
  expect(events.at(-1)?.type).toBe('error');
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(['no search', 'missing terminal', 'extra search', 'client tool', 'server error'])(
  'P05-01 %s never produces usable search success',
  async (kind) => {
    let frames = responses();
    if (kind === 'no search')
      frames = frames.filter((e) => !JSON.stringify(e).includes('web_search_call')).map((e) => e);
    if (kind === 'no search')
      frames.push({
        type: 'response.completed',
        response: { status: 'completed', usage: { input_tokens: 12, output_tokens: 7 } },
      } as any);
    if (kind === 'missing terminal') frames = frames.filter((e) => e.type !== 'response.completed');
    if (kind === 'extra search')
      frames.splice(1, 0, { type: 'response.output_item.done', item: searchItem('ws-2') } as any);
    if (kind === 'client tool')
      frames.splice(0, 0, {
        type: 'response.output_item.done',
        item: { type: 'function_call', name: 'private.read' },
      } as any);
    if (kind === 'server error')
      frames = [{ type: 'error', error: { message: 'PRIVATE_CANARY' } } as any];
    const f = adapter(
      'openai-compatible',
      vi.fn(async () => sseFrames(frames)),
      'openai-responses',
    );
    const events = await collect(f.channel, isolated(modelRequest(f.config)));
    expect(events.at(-1)?.type).toBe('error');
    expect(events.some((e) => e.type === 'hosted_search')).toBe(false);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_CANARY');
  },
);

test('P05-01 Codex pinned pi payload hook and SSE capture expose candidates, no native save or auxiliary text', async () => {
  const store = nativeStore();
  const save = vi.spyOn(store, 'save');
  const frames = textEvents('UNTRUSTED_SEARCH_ANSWER');
  frames.splice(1, 0, {
    type: 'response.output_item.done',
    item: searchItem(),
    output_index: 1,
  } as any);
  const fetcher = vi.fn<typeof fetch>(async () => sseFrames(frames));
  const channel = new CodexAdapter(codexRequest().accountId, credentials(), store, fetcher);
  const events: ModelEvent[] = [];
  for await (const e of channel.stream(isolated(codexRequest()), new AbortController().signal))
    events.push(e);
  expect(events.at(-1)).toMatchObject({ type: 'finish', nativeStateRef: '' });
  expect(events.find((e) => e.type === 'hosted_search')).toMatchObject({ result: { searches: 1 } });
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(events)).not.toContain('UNTRUSTED_SEARCH_ANSWER');
  const wire = fetcher.mock.calls[0]![1]!.body;
  const body = JSON.parse(
    typeof wire === 'string' ? wire : zstdDecompressSync(wire as Uint8Array).toString('utf8'),
  );
  expect(body.tools).toEqual([{ type: 'web_search' }]);
  expect(body.include).toContain('web_search_call.action.sources');
  expect(body.input).toHaveLength(1);
});

test('P05-01 candidates are bounded and deduplicated before public URL policy', () => {
  const sources = new HostedSources();
  sources.call('ws');
  for (let i = 0; i < 1000; i++)
    sources.add({
      url: 'https://example.com/' + i,
      title: 'x'.repeat(800),
      snippet: 'y'.repeat(3000),
    });
  sources.add({ url: 'file:///private' });
  expect(sources.result().candidates).toHaveLength(64);
  expect(sources.result().candidates[0]!.title).toHaveLength(500);
  expect(sources.result().candidates[0]!.snippet).toHaveLength(2000);
});

test('P05-01 current Codex model metadata exposes supported reasoning and sends low without a model alias', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => sseFrames(textEvents('OK')));
  const channel = new CodexAdapter(codexRequest().accountId, credentials(), nativeStore(), fetcher);
  const models = await channel.listModels(channel.accountId, new AbortController().signal);
  expect(codexCatalog().find((m) => m.modelId === 'gpt-6.1-sol')).toMatchObject({
    accountId: null,
    reasoningLevels: ['low', 'medium', 'high'],
  });
  expect(models.find((m) => m.modelId === 'gpt-6.1-sol')).toMatchObject({
    contextWindow: 1050000,
    maxOutput: 128000,
    reasoningLevels: ['low', 'medium', 'high'],
  });
  const request = isolated(codexRequest());
  request.model.modelId = 'gpt-6.1-sol';
  request.reasoning = 'low';
  for await (const _event of channel.stream(request, new AbortController().signal)) {
    /* no text-only search success */
  }
  const body = JSON.parse(
    zstdDecompressSync(fetcher.mock.calls[0]![1]!.body as Uint8Array).toString('utf8'),
  );
  expect(body.model).toBe('gpt-6.1-sol');
  expect(body.reasoning.effort).toBe('low');
});
