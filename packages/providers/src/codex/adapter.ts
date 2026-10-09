import {
  createModels,
  hasApi,
  type AssistantMessage,
  type Context,
  type Message,
  type Provider,
  type TSchema,
  type CredentialStore,
} from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth';
import type {
  ModelRequest,
  ModelEvent,
  ProviderAdapter,
  ProviderError,
  ModelView,
  NativeBinding,
  CanonicalMessage,
  ProbeView,
  NormalizedUsage,
} from '@tapkit/contracts';
import { codexFetch } from './transport';
import { classifyCodexError, CodexFailure } from './errors';
import { refreshCodexCredential } from './refresh';

// Public static-loader hook also works in our Node/Electron bundles. Without it,
// pi's opaque relative OAuth import points beside the emitted CJS entry file.
registerBunOAuthFlows();

export const CODEX_ADAPTER_VERSION = 'pi-ai/0.85.1:tapkit/1';
export interface NativeStateStore {
  save(binding: NativeBinding, value: unknown): Promise<string>;
  load(ref: string, binding: NativeBinding): Promise<unknown>;
}
type NativeContext = { canonical: CanonicalMessage[]; messages: Message[] };
export function codexCatalog(): ModelView[] {
  return openaiCodexProvider()
    .getModels()
    .filter((model) => model.input.includes('text'))
    .map((model) => ({
      accountId: null,
      providerId: 'codex-subscription',
      modelId: model.id,
      displayName: model.name,
      contextWindow: model.contextWindow,
      maxOutput: model.maxTokens,
      toolCalls: 'documented',
      verification: 'documented',
      reasoningLevels: model.reasoning ? ['off', 'low', 'medium', 'high'] : ['off'],
    }));
}
const emptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
function toPi(message: CanonicalMessage, modelId: string): Message {
  if (message.role === 'user')
    return { role: 'user', content: message.text, timestamp: Date.now() };
  if (message.role === 'tool')
    return {
      role: 'toolResult',
      toolCallId: message.callId,
      toolName: message.name,
      content: [{ type: 'text', text: message.text }],
      isError: message.isError,
      timestamp: Date.now(),
    };
  return {
    role: 'assistant',
    content: [
      ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
      ...(message.calls ?? []).map((call) => ({ type: 'toolCall' as const, ...call })),
    ],
    api: 'openai-codex-responses',
    provider: 'openai-codex',
    model: modelId,
    usage: emptyUsage(),
    stopReason: message.calls?.length ? 'toolUse' : 'stop',
    timestamp: Date.now(),
  };
}
function canonicalAssistant(message: AssistantMessage): CanonicalMessage {
  return {
    role: 'assistant',
    text: message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    calls: message.content
      .filter((block) => block.type === 'toolCall')
      .map((call) => ({
        id: call.id,
        name: call.name,
        arguments: structuredClone(call.arguments) as Record<string, unknown>,
      })),
  };
}
export class CodexAdapter implements ProviderAdapter {
  readonly id = 'codex-subscription' as const;
  async refreshAuth(signal: AbortSignal) {
    const old = await this.credentials.read('openai-codex', { signal });
    if (!old || old.type !== 'oauth') throw new Error('AUTH_REQUIRED');
    await this.credentials.modify(
      'openai-codex',
      async (current) => {
        if (!current || current.type !== 'oauth') throw new Error('AUTH_REQUIRED');
        if (current.access !== old.access) return current;
        return refreshCodexCredential(current, signal, this.fetcher);
      },
      { signal },
    );
  }
  async hasCredential() {
    return Boolean(await this.credentials.read('openai-codex'));
  }
  readonly models;
  private readonly provider: Provider<'openai-codex-responses'>;
  constructor(
    readonly accountId: string,
    readonly credentials: CredentialStore,
    private readonly native: NativeStateStore,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    provider: Provider<'openai-codex-responses'> = openaiCodexProvider(),
  ) {
    this.models = createModels({
      credentials,
      authContext: { env: async () => undefined, fileExists: async () => false },
    });
    this.provider = {
      ...provider,
      auth: {
        ...provider.auth,
        ...(provider.auth.oauth
          ? { oauth: { ...provider.auth.oauth, refresh: refreshCodexCredential } }
          : {}),
      },
    };
    this.models.setProvider(this.provider);
  }
  private model(modelId: string) {
    const model = this.models.getModel('openai-codex', modelId);
    if (!model || !hasApi(model, 'openai-codex-responses')) throw new Error('MODEL_UNSUPPORTED');
    return model;
  }
  async listModels(accountId: string, signal: AbortSignal): Promise<ModelView[]> {
    signal.throwIfAborted();
    if (accountId !== this.accountId) throw new Error('AUTH_REQUIRED');
    return this.models
      .getModels('openai-codex')
      .filter((model) => model.input.includes('text'))
      .map((model) => ({
        accountId,
        providerId: this.id,
        modelId: model.id,
        displayName: model.name,
        contextWindow: model.contextWindow,
        maxOutput: model.maxTokens,
        reasoningLevels: model.reasoning ? ['off', 'low', 'medium', 'high'] : ['off'],
        toolCalls: 'documented',
        verification: 'documented',
      }));
  }
  classifyError(error: unknown) {
    return classifyCodexError(error);
  }
  async *stream(input: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    let partial = false,
      terminal = false,
      captured: ProviderError | undefined;
    let requested = false;
    let usage: NormalizedUsage = {
      inputTotal: null,
      inputCachedSubset: null,
      outputTotal: null,
      reasoningSubset: null,
      source: 'estimated',
    };
    try {
      combined.throwIfAborted();
      if (input.accountId !== this.accountId || input.model.providerId !== this.id)
        throw new Error('AUTH_REQUIRED');
      const model = this.model(input.model.modelId);
      if (
        !Number.isInteger(input.outputLimit) ||
        input.outputLimit < 1 ||
        input.outputLimit > model.maxTokens
      )
        throw new Error('VALIDATION_ERROR');
      // Resolve auth before pi's lazy stream would flatten a typed failure to text.
      const auth = await this.models.getAuth(model, { signal: combined });
      if (!auth?.auth.apiKey) throw new Error('AUTH_REQUIRED');
      combined.throwIfAborted();
      const binding: NativeBinding = {
        accountId: this.accountId,
        modelId: model.id,
        adapterVersion: CODEX_ADAPTER_VERSION,
        branchId: input.branchId,
      };
      let messages = input.messages.map((message) => toPi(message, model.id));
      if (input.nativeStateRef) {
        const old = (await this.native.load(input.nativeStateRef, binding)) as NativeContext;
        if (
          !Array.isArray(old.canonical) ||
          !Array.isArray(old.messages) ||
          old.canonical.length > input.messages.length ||
          JSON.stringify(old.canonical) !==
            JSON.stringify(input.messages.slice(0, old.canonical.length))
        )
          throw new Error('CONFLICT');
        messages = [
          ...old.messages,
          ...input.messages.slice(old.canonical.length).map((message) => toPi(message, model.id)),
        ];
      }
      const context: Context = {
        systemPrompt: input.systemModules.map((module) => module.text).join('\n\n'),
        messages,
        tools: input.tools.map((tool) => ({ ...tool, parameters: tool.parameters as TSchema })),
      };
      const stream = this.provider.stream(model, context, {
        apiKey: auth.auth.apiKey,
        ...(auth.auth.headers ? { headers: auth.auth.headers } : {}),
        signal: combined,
        transport: 'sse',
        maxRetries: 0,
        maxTokens: input.outputLimit,
        reasoningEffort: input.reasoning === 'off' ? 'none' : input.reasoning,
        fetch: codexFetch(
          (url, init) => {
            requested = true;
            return this.fetcher(url, init);
          },
          (error) => {
            captured = error;
          },
          (value) => {
            usage = value;
          },
        ),
        timeoutMs: 60_000,
      });
      const ended = new Map<string, { name: string; arguments: unknown }>();
      for await (const event of stream) {
        combined.throwIfAborted();
        if (event.type === 'start') yield { type: 'start', attemptId: input.attemptId };
        else if (event.type === 'text_delta') {
          partial = true;
          yield { type: 'text_delta', blockId: String(event.contentIndex), text: event.delta };
        } else if (event.type === 'toolcall_delta') {
          const call = event.partial.content[event.contentIndex];
          if (call?.type !== 'toolCall') throw new Error('STREAM_INTERRUPTED');
          partial = true;
          yield {
            type: 'tool_delta',
            callId: call.id,
            name: call.name,
            argumentsDelta: event.delta,
          };
        } else if (event.type === 'toolcall_end') {
          if (ended.has(event.toolCall.id)) throw new Error('STREAM_INTERRUPTED');
          ended.set(event.toolCall.id, {
            name: event.toolCall.name,
            arguments: structuredClone(event.toolCall.arguments),
          });
        } else if (event.type === 'error') {
          const detail: ProviderError = {
            code: event.reason === 'aborted' ? 'CANCELLED' : 'STREAM_INTERRUPTED',
            retryable: false,
            diagnosticCode: requested ? 'provider_decoder' : 'provider_setup',
          };
          throw new CodexFailure(detail);
        } else if (event.type === 'done') {
          if (captured || event.reason === 'deferred') throw new Error('STREAM_INTERRUPTED');
          const message = structuredClone(event.message);
          const calls = message.content.filter((block) => block.type === 'toolCall');
          if (
            calls.length !== ended.size ||
            calls.some(
              (call) =>
                !ended.has(call.id) ||
                ended.get(call.id)!.name !== call.name ||
                JSON.stringify(ended.get(call.id)!.arguments) !== JSON.stringify(call.arguments),
            )
          )
            throw new Error('STREAM_INTERRUPTED');
          if (event.reason === 'length' && calls.length) throw new Error('STREAM_INTERRUPTED');
          for (const call of calls)
            if (!input.tools.some((tool) => tool.name === call.name))
              throw new Error('MODEL_UNSUPPORTED');
          const nativeStateRef = await this.native.save(binding, {
            canonical: [...input.messages, canonicalAssistant(message)],
            messages: [...messages, message],
          });
          combined.throwIfAborted();
          for (const call of calls)
            yield {
              type: 'tool_end',
              callId: call.id,
              name: call.name,
              arguments: structuredClone(call.arguments),
            };
          yield {
            type: 'usage',
            usage,
          };
          terminal = true;
          yield {
            type: 'finish',
            reason: event.reason === 'toolUse' ? 'tool_calls' : event.reason,
            nativeStateRef,
          };
          return;
        }
      }
      if (!terminal) throw new Error('STREAM_INTERRUPTED');
    } catch (error) {
      yield {
        type: 'error',
        error: combined.aborted
          ? classifyCodexError(error, combined)
          : (captured ?? classifyCodexError(error)),
        partial,
      };
    } finally {
      controller.abort();
    }
  }
  async checkConnection(
    input: { accountId: string; modelId: string },
    signal: AbortSignal,
  ): Promise<ProbeView> {
    const request: ModelRequest = {
      ...input,
      model: { providerId: this.id, modelId: input.modelId },
      logicalCallId: 'connection-probe',
      attemptId: 'connection-probe',
      branchId: 'connection-probe',
      taskVersion: 1,
      systemModules: [{ id: 'probe', text: 'Reply OK.' }],
      messages: [{ role: 'user', text: 'Reply OK.' }],
      tools: [],
      outputLimit: 32,
      reasoning: 'off',
    };
    let text = false,
      finished = false,
      tools = false;
    let error: ProviderError | undefined;
    let phase: 'text' | 'tools' = 'text';
    for await (const event of this.stream(request, signal)) {
      if (event.type === 'text_delta' && event.text.trim()) text = true;
      if (event.type === 'finish') finished = true;
      if (event.type === 'error') error = event.error;
    }
    if (text && finished && !error) {
      phase = 'tools';
      request.tools = [
        {
          name: 'echo',
          description: 'Return the given text.',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      ];
      request.messages = [
        { role: 'user', text: 'Call echo with text OK. Do not answer in plain text.' },
      ];
      request.outputLimit = 128;
      let validCall = false;
      finished = false;
      for await (const event of this.stream(request, signal)) {
        if (event.type === 'tool_end')
          validCall =
            event.name === 'echo' &&
            JSON.stringify(event.arguments) === JSON.stringify({ text: 'OK' });
        if (event.type === 'finish') finished = event.reason === 'tool_calls';
        if (event.type === 'error') error = event.error;
      }
      tools = validCall && finished && !error;
    }
    return {
      accountId: input.accountId,
      modelId: input.modelId,
      status:
        text && tools && !error
          ? 'ready'
          : error?.code === 'AUTH_EXPIRED'
            ? 'expired'
            : 'unavailable',
      text: text && !error,
      tools,
      errorCode: error?.code ?? (tools ? null : 'MODEL_UNSUPPORTED'),
      ...(error?.diagnosticCode
        ? {
            diagnostic: {
              phase,
              reason: error.diagnosticCode,
              ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
              ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
            },
          }
        : {}),
    };
  }
}
