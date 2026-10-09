import { createHash } from 'node:crypto';
import {
  resolveApiConfig,
  type ApiConfig,
  type ModelRequest,
  type ModelEvent,
  type NativeBinding,
} from '../../packages/contracts/src';
import { ApiKeyAdapter, type NativeStateStore } from '../../packages/providers/src';
export const accountId = '01990000-0000-7000-8000-000000000001';
export const tool = {
  name: 'echo',
  description: 'Return text.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
};
export function modelRequest(config: ApiConfig): ModelRequest {
  return {
    accountId,
    model: { providerId: config.providerId, modelId: config.modelId },
    attemptId: 'attempt',
    logicalCallId: 'call',
    taskVersion: 1,
    branchId: 'branch',
    systemModules: [{ id: 'system', text: 'Follow instructions.' }],
    messages: [{ role: 'user', text: '测试中文' }],
    tools: [],
    outputLimit: 128,
    reasoning: 'off',
  };
}
export function events(
  format: ApiConfig['apiFormat'],
  tools = false,
  parallel = false,
  argumentsText = '{"text":"OK"}',
  text = '中文OK',
): unknown[] {
  const count = parallel ? 2 : 1;
  if (format === 'openai-chat')
    return [
      { unknown: true },
      {
        choices: [
          {
            index: 0,
            delta: {
              content: tools ? '' : text,
              reasoning_content: 'private-thinking-marker',
              ...(tools
                ? {
                    tool_calls: Array.from({ length: count }, (_, index) => ({
                      index,
                      id: 'call-' + index,
                      type: 'function',
                      function: { name: 'echo', arguments: argumentsText },
                    })),
                  }
                : {}),
            },
          },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: tools ? 'tool_calls' : 'stop' }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 3 },
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      },
      '[DONE]',
    ];
  if (format === 'anthropic-messages')
    return [
      {
        type: 'message_start',
        message: {
          usage: { input_tokens: 10, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
        },
      },
      { type: 'future_event' },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'private-thinking-marker' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'private-signature-marker' },
      },
      { type: 'content_block_stop', index: 0 },
      ...(tools
        ? Array.from({ length: count }, (_, i) => i + 1).flatMap((index) => [
            {
              type: 'content_block_start',
              index,
              content_block: {
                type: 'tool_use',
                id: 'call-' + (index - 1),
                name: 'echo',
                input: {},
              },
            },
            {
              type: 'content_block_delta',
              index,
              delta: { type: 'input_json_delta', partial_json: argumentsText },
            },
            { type: 'content_block_stop', index },
          ])
        : [
            { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
            { type: 'content_block_stop', index: 1 },
          ]),
      {
        type: 'message_delta',
        delta: { stop_reason: tools ? 'tool_use' : 'end_turn' },
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ];
  return [
    { type: 'future_event' },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'reasoning', id: 'reasoning-id', encrypted_content: 'private-thinking-marker' },
    },
    ...(tools
      ? Array.from({ length: count }, (_, i) => i + 1).flatMap((index) => [
          {
            type: 'response.output_item.added',
            output_index: index,
            item: {
              type: 'function_call',
              id: 'fc-' + index,
              call_id: 'call-' + (index - 1),
              name: 'echo',
              arguments: '',
            },
          },
          {
            type: 'response.function_call_arguments.delta',
            output_index: index,
            delta: argumentsText,
          },
          {
            type: 'response.output_item.done',
            output_index: index,
            item: {
              type: 'function_call',
              id: 'fc-' + index,
              call_id: 'call-' + (index - 1),
              name: 'echo',
              arguments: argumentsText,
            },
          },
        ])
      : [
          { type: 'response.output_text.delta', output_index: 1, delta: text },
          {
            type: 'response.output_item.done',
            output_index: 1,
            item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
          },
        ]),
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          input_tokens_details: { cached_tokens: 3 },
          output_tokens_details: { reasoning_tokens: 2 },
        },
      },
    },
  ];
}
export function sseFrames(items: unknown[], split = false, mime = 'text/event-stream') {
  const bytes = new TextEncoder().encode(
    ': heartbeat\r\n\r\n' +
      items
        .map(
          (item) =>
            'data: ' + (typeof item === 'string' ? item : JSON.stringify(item)) + '\r\n\r\n',
        )
        .join(''),
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (split) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: mime ? { 'content-type': mime } : {} },
  );
}
export function memoryNative() {
  const values = new Map<string, { binding: NativeBinding; value: unknown }>();
  const store: NativeStateStore = {
    save: async (binding, value) => {
      const ref = createHash('sha256').update(JSON.stringify(value)).digest('hex');
      values.set(ref, { binding: structuredClone(binding), value: structuredClone(value) });
      return ref;
    },
    load: async (ref, binding) => {
      const value = values.get(ref);
      if (!value || JSON.stringify(value.binding) !== JSON.stringify(binding))
        throw new Error('PERMISSION_DENIED');
      return structuredClone(value.value);
    },
  };
  return { store, values };
}
export function adapter(
  provider: ApiConfig['providerId'],
  fetcher: typeof fetch,
  format?: ApiConfig['apiFormat'],
) {
  const config = resolveApiConfig(provider, {
      modelId: 'mock-model',
      ...(format ? { apiFormat: format } : {}),
    }),
    native = memoryNative();
  return {
    config,
    native,
    channel: new ApiKeyAdapter(accountId, config, async () => 'fixture-key', native.store, fetcher),
  };
}
export async function collect(
  channel: ApiKeyAdapter,
  input: ModelRequest,
  signal = new AbortController().signal,
) {
  const result: ModelEvent[] = [];
  for await (const event of channel.stream(input, signal)) result.push(event);
  return result;
}
