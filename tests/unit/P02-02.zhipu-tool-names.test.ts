import { expect, it, vi } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { resolveApiConfig, type ApiConfig } from '../../packages/contracts/src';
import {
  accountId,
  collect,
  events,
  memoryNative,
  modelRequest,
  sseFrames,
  tool,
} from '../fixtures/P01-02.api';

const config = resolveApiConfig('openai-compatible', {
  apiFormat: 'openai-chat',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  modelId: 'glm-4.7-flashx',
});
const frames = (name: string, args = '{"text":"OK"}') =>
  events('openai-chat', true, false, args).map((raw) => {
    const frame = structuredClone(raw) as any;
    if (frame?.choices?.[0]?.delta?.tool_calls)
      frame.choices[0].delta.tool_calls[0].function.name = name;
    return frame;
  });

it.each(['canonical', 'alias'])(
  'P02-02 Zhipu names survive a fresh adapter resuming a %s native prefix with paired canonical results',
  async (prefix) => {
    const native = memoryNative();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sseFrames(frames('history_search')));
    const make = () =>
      new ApiKeyAdapter(accountId, config, async () => 'fixture-key', native.store, fetcher);
    const input = modelRequest(config);
    input.tools = ['files.read', 'history.search', 'knowledge.query'].map((name) => ({
      ...tool,
      name,
    }));
    const first = await collect(make(), input);
    expect(first.find((event) => event.type === 'tool_end')).toMatchObject({
      name: 'history.search',
      callId: 'call-0',
    });
    const finish = first.find((event) => event.type === 'finish');
    expect(finish?.type).toBe('finish');
    const saved = native.values.get(finish!.nativeStateRef)!;
    const value = structuredClone(saved.value) as any;
    expect(value.canonical.at(-1).calls[0].name).toBe('history.search');
    expect(value.wire.at(-1).tool_calls[0].function.name).toBe('history_search');
    value.wire.at(-1).tool_calls[0].function.name =
      prefix === 'canonical' ? 'history.search' : 'history_search';
    value.wire.at(-1).reasoning_content = 'private-prefix-marker';
    const ref = await native.store.save(saved.binding, value);
    fetcher.mockResolvedValueOnce(sseFrames(events('openai-chat')));
    const resumed = await collect(make(), {
      ...input,
      nativeStateRef: ref,
      messages: [
        ...value.canonical,
        { role: 'tool', name: 'history.search', callId: 'call-0', text: '{"messageRefs":[]}' },
        { role: 'user', text: 'Continue.' },
      ],
    });
    expect(resumed.some((event) => event.type === 'finish')).toBe(true);
    for (const [, init] of fetcher.mock.calls) {
      const body = JSON.parse(String(init?.body));
      expect(body.tools.map((item: any) => item.function.name)).toEqual([
        'files_read',
        'history_search',
        'knowledge_query',
      ]);
    }
    const body = JSON.parse(String(fetcher.mock.calls[1]![1]?.body));
    const assistant = body.messages.find((item: any) => item.tool_calls);
    expect(assistant.tool_calls[0].function.name).toBe('history_search');
    expect(assistant.reasoning_content).toBe('private-prefix-marker');
    expect(body.messages.find((item: any) => item.role === 'tool').tool_call_id).toBe('call-0');
    expect(JSON.stringify(resumed)).not.toContain('private-prefix-marker');
  },
);

it.each([
  ['knowledge_query', '{"text":"OK"}'],
  ['history.search', '{"text":"OK"}'],
  ['history_search', '{"text":'],
])(
  'P02-02 Zhipu refuses unauthorized names or incomplete alias arguments %s %s',
  async (name, args) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseFrames(frames(name, args)));
    const native = memoryNative();
    const channel = new ApiKeyAdapter(
      accountId,
      config,
      async () => 'fixture-key',
      native.store,
      fetcher,
    );
    const input = modelRequest(config);
    input.tools = [{ ...tool, name: 'history.search' }];
    const result = await collect(channel, input);
    expect(result.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED' } });
    expect(result.some((event) => event.type === 'tool_end' || event.type === 'finish')).toBe(
      false,
    );
    expect(native.values.size).toBe(0);
  },
);

it('P02-02 Zhipu rejects colliding wire names before reading credentials or sending', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const readKey = vi.fn(async () => 'fixture-key');
  const channel = new ApiKeyAdapter(accountId, config, readKey, memoryNative().store, fetcher);
  const input = modelRequest(config);
  input.tools = ['history.search', 'history_search'].map((name) => ({ ...tool, name }));
  expect((await collect(channel, input)).at(-1)).toMatchObject({
    type: 'error',
    error: { code: 'VALIDATION_ERROR' },
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(readKey).not.toHaveBeenCalled();
});

it.each([
  { baseURL: 'https://example.test/v1' },
  { baseURL: 'https://open.bigmodel.cn.example.test/api/paas/v4' },
  { apiFormat: 'openai-responses', baseURL: 'https://open.bigmodel.cn/api/v1' },
] as Partial<ApiConfig>[])(
  'P02-02 Zhipu Chat name conversion stays scoped to its exact endpoint %j',
  async (override) => {
    const other = { ...config, ...override };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseFrames(events(other.apiFormat)));
    const channel = new ApiKeyAdapter(
      accountId,
      other,
      async () => 'fixture-key',
      memoryNative().store,
      fetcher,
    );
    const input = modelRequest(other);
    input.tools = [{ ...tool, name: 'history.search' }];
    await collect(channel, input);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.tools[0].function?.name ?? body.tools[0].name).toBe('history.search');
  },
);
