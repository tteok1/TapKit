import type { ModelRequest, NativeBinding } from '../../packages/contracts/src';
import {
  AccountCredentialStore,
  type CredentialSnapshot,
  type NativeStateStore,
} from '../../packages/providers/src';
export const accountId = '01990000-0000-7000-8000-000000000001';
export function token() {
  return (
    'e30.' +
    Buffer.from(
      JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'mock-account' } }),
    ).toString('base64') +
    '.mock'
  );
}
export function credentials(expires = Date.now() + 3600_000) {
  let document: CredentialSnapshot = {
    version: 1,
    credential: {
      type: 'oauth',
      access: token(),
      refresh: 'mock-refresh',
      expires,
      accountId: 'mock-account',
    },
  };
  return new AccountCredentialStore({
    read: async () => structuredClone(document),
    write: async (expected, credential) => {
      if (expected !== document.version) throw new Error('CONFLICT');
      document = { version: document.version + 1, ...(credential ? { credential } : {}) };
    },
  });
}
export function nativeStore(): NativeStateStore {
  const values = new Map<string, { binding: NativeBinding; value: unknown }>();
  return {
    save: async (binding, value) => {
      const ref = String(values.size + 1);
      values.set(ref, structuredClone({ binding, value }));
      return ref;
    },
    load: async (ref, binding) => {
      const row = values.get(ref);
      if (!row || JSON.stringify(row.binding) !== JSON.stringify(binding))
        throw new Error('CONFLICT');
      return structuredClone(row.value);
    },
  };
}
export function request(): ModelRequest {
  return {
    accountId,
    logicalCallId: 'logical',
    attemptId: 'attempt',
    model: { providerId: 'codex-subscription', modelId: 'gpt-5.5' },
    systemModules: [{ id: 'application', text: 'TapKit system prompt.' }],
    messages: [{ role: 'user', text: '你好' }],
    tools: [
      {
        name: 'echo',
        description: 'Echo text.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    ],
    outputLimit: 128,
    reasoning: 'off',
    taskVersion: 1,
    branchId: 'branch-1',
  };
}
const usage = {
  input_tokens: 12,
  input_tokens_details: { cached_tokens: 3 },
  output_tokens: 7,
  output_tokens_details: { reasoning_tokens: 2 },
  total_tokens: 19,
};
export function textEvents(text = '你好') {
  const item = {
    type: 'message',
    id: 'msg_1',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
  return [
    { type: 'response.created', response: { id: 'response_1' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'response_1', status: 'completed', usage } },
  ];
}
export function toolEvents(argumentsText = '{"text":"中文"}') {
  const item = {
    type: 'function_call',
    id: 'fc_1',
    call_id: 'call_1',
    name: 'echo',
    arguments: argumentsText,
  };
  return [
    { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: argumentsText.slice(0, 10),
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: argumentsText.slice(10),
    },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'response_2', status: 'completed', usage } },
  ];
}
export function sse(events: unknown[], separator = '\r\n', bytesPerChunk = 1): Response {
  const bytes = new TextEncoder().encode(
    events.map((event) => 'data: ' + JSON.stringify(event) + separator + separator).join(''),
  );
  let cursor = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (cursor >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(cursor, (cursor += bytesPerChunk)));
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
