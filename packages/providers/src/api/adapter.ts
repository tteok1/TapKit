import { createHash } from 'node:crypto';
import {
  ApiConfigSchema,
  type ApiConfig,
  type ProviderAdapter,
  type ModelRequest,
  type ModelEvent,
  type ModelView,
  type CanonicalMessage,
  type ProviderError,
  type NormalizedUsage,
  type ProbeView,
  type NativeBinding,
} from '@tapkit/contracts';
import type { NativeStateStore } from '../codex/adapter';
import { apiHttpFailure } from './errors';
import {
  ApiFailure,
  apiEvents,
  secureApiFetch,
  errorBody,
  classifyResponseType,
  inspectJsonResponse,
} from './http';
import { validArguments } from './arguments';
import { isZhipuChat, isZhipuResponses } from './zhipu';

export const API_ADAPTER_VERSION = 'tapkit-api/2';
type Wire = Record<string, any>; // Provider JSON remains private and never enters Renderer.
type Call = { id: string; name: string; arguments: string; complete: boolean };
export function validateToolPairing(messages: CanonicalMessage[]) {
  const pending = new Map<string, string>(),
    seen = new Set<string>();
  for (const message of messages) {
    if (message.role === 'tool') {
      if (pending.get(message.callId) !== message.name)
        throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
      pending.delete(message.callId);
    } else {
      if (pending.size) throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
      if (message.role === 'assistant')
        for (const call of message.calls ?? []) {
          if (!call.id || seen.has(call.id))
            throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
          seen.add(call.id);
          pending.set(call.id, call.name);
        }
    }
  }
  if (pending.size) throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
}
function convert(messages: CanonicalMessage[], format: ApiConfig['apiFormat']): Wire[] {
  if (format === 'anthropic-messages') {
    const result: Wire[] = [];
    for (const message of messages) {
      const role = message.role === 'assistant' ? 'assistant' : 'user';
      const content =
        message.role === 'tool'
          ? [
              {
                type: 'tool_result',
                tool_use_id: message.callId,
                content: message.text,
                is_error: message.isError,
              },
            ]
          : [
              ...(message.text ? [{ type: 'text', text: message.text }] : []),
              ...(message.role === 'assistant'
                ? (message.calls ?? []).map((call) => ({
                    type: 'tool_use',
                    id: call.id,
                    name: call.name,
                    input: call.arguments,
                  }))
                : []),
            ];
      if (result.at(-1)?.role === role) result.at(-1)!.content.push(...content);
      else result.push({ role, content });
    }
    return result;
  }
  return messages.flatMap<Wire>((message) => {
    if (format === 'openai-responses') {
      if (message.role === 'tool')
        return [{ type: 'function_call_output', call_id: message.callId, output: message.text }];
      return [
        ...(message.text ? [{ role: message.role, content: message.text }] : []),
        ...(message.role === 'assistant'
          ? (message.calls ?? []).map((call) => ({
              type: 'function_call',
              call_id: call.id,
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            }))
          : []),
      ];
    }
    if (message.role === 'tool')
      return [{ role: 'tool', tool_call_id: message.callId, content: message.text }];
    return [
      {
        role: message.role,
        content: message.text,
        ...(message.role === 'assistant' && message.calls?.length
          ? {
              tool_calls: message.calls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            }
          : {}),
      },
    ];
  });
}
function number(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function usage(raw: Wire, format: ApiConfig['apiFormat']): NormalizedUsage {
  let input = number(format === 'openai-chat' ? raw.prompt_tokens : raw.input_tokens);
  const output = number(format === 'openai-chat' ? raw.completion_tokens : raw.output_tokens);
  const cached = number(
    format === 'anthropic-messages'
      ? raw.cache_read_input_tokens
      : format === 'openai-chat'
        ? (raw.prompt_tokens_details?.cached_tokens ?? raw.prompt_cache_hit_tokens)
        : raw.input_tokens_details?.cached_tokens,
  );
  if (format === 'anthropic-messages' && input !== null)
    input += (cached ?? 0) + (number(raw.cache_creation_input_tokens) ?? 0);
  const reasoning = number(
    format === 'openai-chat'
      ? raw.completion_tokens_details?.reasoning_tokens
      : raw.output_tokens_details?.reasoning_tokens,
  );
  return {
    inputTotal: input,
    outputTotal: output,
    inputCachedSubset: cached !== null && input !== null && cached <= input ? cached : null,
    reasoningSubset:
      reasoning !== null && output !== null && reasoning <= output ? reasoning : null,
    source: input !== null || output !== null ? 'actual' : 'estimated',
  };
}
export class ApiKeyAdapter implements ProviderAdapter {
  readonly id;
  readonly config: ApiConfig;
  constructor(
    readonly accountId: string,
    config: ApiConfig,
    private readonly readKey: () => Promise<string | undefined>,
    private readonly native: NativeStateStore,
    private readonly fetcher: typeof fetch = secureApiFetch,
  ) {
    this.config = ApiConfigSchema.parse(config);
    this.id = this.config.providerId;
  }
  async hasCredential() {
    return Boolean(await this.readKey());
  }
  async listModels(accountId: string, signal: AbortSignal): Promise<ModelView[]> {
    signal.throwIfAborted();
    if (accountId !== this.accountId)
      throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
    return this.config.modelId
      ? [
          {
            accountId,
            providerId: this.id,
            modelId: this.config.modelId,
            displayName: this.config.modelId,
            contextWindow: null,
            maxOutput: null,
            toolCalls: 'unknown',
            verification: 'documented',
          },
        ]
      : [];
  }
  classifyError(error: unknown): ProviderError {
    if (error instanceof ApiFailure) return error.detail;
    if (
      error instanceof Error &&
      [
        'AUTH_REQUIRED',
        'AUTH_EXPIRED',
        'PERMISSION_DENIED',
        'CONFLICT',
        'VALIDATION_ERROR',
        'MODEL_UNSUPPORTED',
        'CANCELLED',
      ].includes(error.message)
    )
      return { code: error.message as ProviderError['code'], retryable: false };
    return { code: 'STREAM_INTERRUPTED', retryable: false, diagnosticCode: 'read_failed' };
  }
  async *stream(
    input: ModelRequest,
    signal: AbortSignal,
    observe?: (
      view: Pick<NonNullable<ProbeView['diagnostic']>, 'httpStatus' | 'responseType' | 'request'>,
    ) => void,
  ): AsyncIterable<ModelEvent> {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(120_000)]);
    let key: string | undefined,
      partial = false;
    let responseDiagnostic: Pick<ProviderError, 'httpStatus' | 'responseType'> = {};
    try {
      combined.throwIfAborted();
      if (input.accountId !== this.accountId || input.model.providerId !== this.id)
        throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
      if (!this.config.modelId || input.model.modelId !== this.config.modelId)
        throw new ApiFailure({ code: 'MODEL_UNSUPPORTED', retryable: false });
      if (
        !Number.isInteger(input.outputLimit) ||
        input.outputLimit < 1 ||
        input.outputLimit > 1_000_000
      )
        throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
      validateToolPairing(input.messages);
      key = await this.readKey();
      if (!key) throw new ApiFailure({ code: 'AUTH_REQUIRED', retryable: false });
      const format = this.config.apiFormat;
      const version =
        API_ADAPTER_VERSION +
        ':' +
        format +
        ':' +
        createHash('sha256').update(this.config.baseURL).digest('hex');
      const binding: NativeBinding = {
        accountId: this.accountId,
        modelId: this.config.modelId,
        adapterVersion: version,
        branchId: input.branchId,
      };
      let messages = convert(input.messages, format);
      if (input.nativeStateRef) {
        const state = (await this.native.load(input.nativeStateRef, binding)) as {
          canonical: CanonicalMessage[];
          wire: Wire[];
        };
        if (
          !Array.isArray(state.canonical) ||
          !Array.isArray(state.wire) ||
          JSON.stringify(input.messages.slice(0, state.canonical.length)) !==
            JSON.stringify(state.canonical)
        )
          throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
        messages = [
          ...structuredClone(state.wire),
          ...convert(input.messages.slice(state.canonical.length), format),
        ];
      }
      if (isZhipuResponses(this.config))
        messages = messages.map((message) =>
          !message.type && ['user', 'assistant', 'system', 'developer'].includes(message.role)
            ? { ...message, type: 'message' }
            : message,
        );
      const system = input.systemModules.map((module) => module.text).join('\n\n');
      const body: Wire = { model: this.config.modelId, stream: true };
      if (format === 'anthropic-messages')
        Object.assign(body, {
          system,
          messages,
          max_tokens: input.outputLimit,
          ...(input.tools.length
            ? {
                tools: input.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.parameters,
                })),
              }
            : {}),
        });
      else if (format === 'openai-responses')
        Object.assign(body, {
          instructions: system,
          input: messages,
          store: false,
          max_output_tokens: input.outputLimit,
          ...(this.id === 'xai' || new URL(this.config.baseURL).hostname === 'api.openai.com'
            ? { include: ['reasoning.encrypted_content'] }
            : {}),
          ...(input.tools.length
            ? { tools: input.tools.map((tool) => ({ type: 'function', ...tool })) }
            : {}),
        });
      else
        Object.assign(body, {
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
          ...(this.id === 'openai-compatible' &&
          new URL(this.config.baseURL).hostname === 'api.openai.com'
            ? { stream_options: { include_usage: true } }
            : {}),
          ...(this.id === 'openai-compatible' &&
          new URL(this.config.baseURL).hostname === 'api.openai.com'
            ? { max_completion_tokens: input.outputLimit }
            : { max_tokens: input.outputLimit }),
          ...(input.tools.length
            ? { tools: input.tools.map((tool) => ({ type: 'function', function: tool })) }
            : {}),
        });
      if (format === 'openai-chat' && this.id === 'deepseek')
        Object.assign(body, {
          thinking: { type: input.reasoning === 'off' ? 'disabled' : 'enabled' },
          ...(input.reasoning !== 'off'
            ? { reasoning_effort: input.reasoning === 'low' ? 'low' : 'high' }
            : {}),
        });
      else if (
        isZhipuChat(this.config) &&
        ['glm-4.7-flash', 'glm-4.7-flashx'].includes(this.config.modelId.toLowerCase()) &&
        input.reasoning === 'off'
      )
        body.thinking = { type: 'disabled' };
      else if (
        isZhipuResponses(this.config) &&
        ['glm-4.7-flash', 'glm-4.7-flashx'].includes(this.config.modelId.toLowerCase()) &&
        input.reasoning === 'off'
      )
        body.reasoning = { effort: 'none' };
      else if (input.reasoning !== 'off')
        throw new ApiFailure({ code: 'MODEL_UNSUPPORTED', retryable: false });
      const path =
        format === 'anthropic-messages'
          ? 'messages'
          : format === 'openai-responses'
            ? 'responses'
            : 'chat/completions';
      const url = this.config.baseURL.replace(/\/+$/, '') + '/' + path;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      };
      if (format === 'anthropic-messages')
        Object.assign(headers, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
      else headers.authorization = 'Bearer ' + key;
      let response: Response;
      const serializedBody = JSON.stringify(body);
      const prepared = JSON.parse(serializedBody) as Wire;
      observe?.({
        request: {
          outputLimit:
            prepared.max_output_tokens ?? prepared.max_completion_tokens ?? prepared.max_tokens,
          reasoning:
            prepared.reasoning?.effort === 'none'
              ? 'none'
              : prepared.thinking?.type === 'disabled'
                ? 'disabled'
                : 'unspecified',
          stream: prepared.stream === true,
        },
      });
      try {
        response = await this.fetcher(url, {
          method: 'POST',
          headers,
          body: serializedBody,
          signal: combined,
          redirect: 'error',
        });
      } catch (error) {
        if (error instanceof ApiFailure) throw error;
        throw new ApiFailure({
          code: combined.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
          retryable: !combined.aborted,
        });
      }
      responseDiagnostic = {
        httpStatus: response.status,
        responseType: classifyResponseType(response.headers.get('content-type')),
      };
      observe?.(responseDiagnostic);
      if (!response.ok) {
        let code: string | undefined;
        const raw = (await errorBody(response, combined)) as Wire;
        code = raw.error?.code ?? raw.error?.type;
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? /^\d+(?:\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now())
          : NaN;
        throw new ApiFailure({
          ...apiHttpFailure(
            response.status,
            code,
            isZhipuChat(this.config) || isZhipuResponses(this.config),
            isZhipuResponses(this.config),
          ),
          diagnosticCode: 'upstream_error',
          ...(Number.isFinite(delay) ? { retryAfterMs: delay } : {}),
        });
      }
      if (responseDiagnostic.responseType === 'json') {
        const inspection = await inspectJsonResponse(response, combined);
        if (inspection.kind === 'error')
          throw new ApiFailure({
            ...apiHttpFailure(
              response.status,
              inspection.code,
              isZhipuChat(this.config) || isZhipuResponses(this.config),
              isZhipuResponses(this.config),
            ),
            diagnosticCode: 'upstream_error',
          });
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode:
            inspection.kind === 'response'
              ? 'non_streaming_response'
              : inspection.kind === 'other'
                ? 'unrecognized_json'
                : inspection.kind,
        });
      }
      yield { type: 'start', attemptId: input.attemptId };
      let text = '',
        reasoning = '',
        completed = false,
        finishSeen = false,
        reason: 'stop' | 'tool_calls' | 'length' = 'stop';
      const openBlocks = new Set<number>();
      const calls = new Map<string, Call>(),
        blocks = new Map<number, Wire>();
      let rawUsage: Wire = {},
        responseOutput: Wire[] = [];
      const getCall = (slot: string, id?: string, name?: string) => {
        let call = calls.get(slot);
        if (!call) {
          call = { id: id ?? '', name: name ?? '', arguments: '', complete: false };
          calls.set(slot, call);
        }
        if (id) call.id = id;
        if (name) call.name = name;
        return call;
      };
      for await (const raw of apiEvents(response, combined)) {
        combined.throwIfAborted();
        if (raw === '[DONE]') {
          if (format === 'openai-chat') {
            completed = finishSeen;
            break;
          }
          continue;
        }
        if (!raw || typeof raw !== 'object') continue;
        const event = raw as Wire;
        if (event.type === 'error' || event.error || event.type === 'response.failed')
          throw new ApiFailure({
            ...apiHttpFailure(
              response.status,
              event.error?.code ??
                event.error?.type ??
                event.response?.error?.code ??
                (event.type === 'error' ? event.code : undefined),
              isZhipuChat(this.config) || isZhipuResponses(this.config),
              isZhipuResponses(this.config),
            ),
            diagnosticCode: 'upstream_error',
          });
        let delta: string | undefined;
        if (format === 'openai-chat') {
          if (event.usage) rawUsage = event.usage;
          const choice =
            event.choices?.find((choice: Wire) => choice.index === 0) ?? event.choices?.[0];
          const change = choice?.delta;
          if (typeof change?.content === 'string') delta = change.content;
          if (typeof change?.reasoning_content === 'string') reasoning += change.reasoning_content;
          for (const item of change?.tool_calls ?? []) {
            const call = getCall(String(item.index), item.id, item.function?.name);
            const part = item.function?.arguments ?? '';
            call.arguments += part;
            yield { type: 'tool_delta', callId: call.id, name: call.name, argumentsDelta: part };
          }
          if (choice?.finish_reason) {
            finishSeen = true;
            reason =
              choice.finish_reason === 'length'
                ? 'length'
                : choice.finish_reason === 'tool_calls'
                  ? 'tool_calls'
                  : 'stop';
            if (!['stop', 'length', 'tool_calls'].includes(choice.finish_reason))
              throw new ApiFailure({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
            for (const call of calls.values()) call.complete = true;
          }
        } else if (format === 'anthropic-messages') {
          if (event.type === 'message_start') rawUsage = { ...(event.message?.usage ?? {}) };
          if (event.type === 'content_block_start') {
            if (blocks.has(event.index) || !event.content_block)
              throw new ApiFailure({ code: 'STREAM_INTERRUPTED', retryable: false });
            openBlocks.add(event.index);
            blocks.set(event.index, structuredClone(event.content_block));
            if (event.content_block?.type === 'tool_use') {
              const call = getCall(
                String(event.index),
                event.content_block.id,
                event.content_block.name,
              );
              if (Object.keys(event.content_block.input ?? {}).length)
                call.arguments = JSON.stringify(event.content_block.input);
            }
            if (event.content_block?.type === 'text' && event.content_block.text)
              delta = event.content_block.text;
          }
          if (event.type === 'content_block_delta') {
            const block = blocks.get(event.index),
              change = event.delta;
            if (!block || !openBlocks.has(event.index))
              throw new ApiFailure({ code: 'STREAM_INTERRUPTED', retryable: false });
            if (change?.type === 'text_delta') {
              delta = change.text;
              block.text = (block.text ?? '') + change.text;
            }
            if (change?.type === 'thinking_delta')
              block.thinking = (block.thinking ?? '') + change.thinking;
            if (change?.type === 'signature_delta')
              block.signature = (block.signature ?? '') + change.signature;
            if (change?.type === 'input_json_delta') {
              const call = getCall(String(event.index));
              call.arguments += change.partial_json;
              yield {
                type: 'tool_delta',
                callId: call.id,
                name: call.name,
                argumentsDelta: change.partial_json,
              };
            }
          }
          if (event.type === 'content_block_stop') {
            if (!openBlocks.delete(event.index))
              throw new ApiFailure({ code: 'STREAM_INTERRUPTED', retryable: false });
            const call = calls.get(String(event.index));
            if (call) call.complete = true;
          }
          if (event.type === 'message_delta') {
            Object.assign(rawUsage, event.usage ?? {});
            const stop = event.delta?.stop_reason;
            if (stop) {
              finishSeen = true;
              if (!['end_turn', 'stop_sequence', 'max_tokens', 'tool_use'].includes(stop))
                throw new ApiFailure({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
              reason =
                stop === 'max_tokens' ? 'length' : stop === 'tool_use' ? 'tool_calls' : 'stop';
            }
          }
          if (event.type === 'message_stop') {
            completed = finishSeen && openBlocks.size === 0;
            break;
          }
        } else {
          if (event.type === 'response.output_text.delta') delta = event.delta;
          if (event.type === 'response.output_item.added' && event.item?.type === 'function_call')
            getCall(String(event.output_index), event.item.call_id, event.item.name);
          if (event.type === 'response.function_call_arguments.delta') {
            const call = getCall(String(event.output_index));
            call.arguments += event.delta;
            yield {
              type: 'tool_delta',
              callId: call.id,
              name: call.name,
              argumentsDelta: event.delta,
            };
          }
          if (event.type === 'response.output_item.done') {
            responseOutput[event.output_index] = structuredClone(event.item);
            if (event.item?.type === 'function_call') {
              const call = getCall(String(event.output_index), event.item.call_id, event.item.name);
              call.arguments = event.item.arguments;
              call.complete = true;
            }
          }
          if (event.type === 'response.completed' || event.type === 'response.incomplete') {
            if (
              event.type === 'response.incomplete' &&
              event.response?.incomplete_details?.reason !== 'max_output_tokens'
            )
              throw new ApiFailure({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
            rawUsage = event.response?.usage ?? {};
            reason =
              event.type === 'response.incomplete' ? 'length' : calls.size ? 'tool_calls' : 'stop';
            completed = true;
            break;
          }
        }
        if (typeof delta === 'string' && delta) {
          text += delta;
          partial = true;
          yield { type: 'text_delta', blockId: 'text-0', text: delta };
        }
      }
      if (!completed)
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode: 'unterminated_sse',
        });
      const validCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
      if (reason !== 'length')
        for (const call of calls.values()) {
          let argumentsValue: unknown;
          try {
            argumentsValue = JSON.parse(call.arguments || '{}');
          } catch {
            throw new ApiFailure({
              code: 'STREAM_INTERRUPTED',
              retryable: false,
              diagnosticCode: 'invalid_tool_arguments',
            });
          }
          if (
            !call.id ||
            !call.name ||
            !call.complete ||
            !argumentsValue ||
            typeof argumentsValue !== 'object' ||
            Array.isArray(argumentsValue) ||
            validCalls.some((item) => item.id === call.id) ||
            !input.tools.some((tool) => tool.name === call.name)
          )
            throw new ApiFailure({
              code: 'STREAM_INTERRUPTED',
              retryable: false,
              diagnosticCode: 'invalid_tool_arguments',
            });
          if (
            !validArguments(
              argumentsValue,
              input.tools.find((tool) => tool.name === call.name)!.parameters,
            )
          )
            throw new ApiFailure({
              code: 'STREAM_INTERRUPTED',
              retryable: false,
              diagnosticCode: 'invalid_tool_arguments',
            });
          validCalls.push({
            id: call.id,
            name: call.name,
            arguments: argumentsValue as Record<string, unknown>,
          });
        }
      if (reason === 'tool_calls' && !validCalls.length)
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode: 'invalid_tool_arguments',
        });
      if (validCalls.length) reason = 'tool_calls';
      const assistant: CanonicalMessage = {
        role: 'assistant',
        text,
        ...(validCalls.length ? { calls: validCalls } : {}),
      };
      let wireAssistant = convert([assistant], format);
      if (format === 'openai-chat' && this.id === 'deepseek' && reasoning)
        wireAssistant[0]!.reasoning_content = reasoning;
      if (format === 'anthropic-messages' && reason !== 'length') {
        for (const [index, block] of blocks) {
          const call = calls.get(String(index));
          if (call) block.input = validCalls.find((item) => item.id === call.id)?.arguments;
        }
        wireAssistant = [{ role: 'assistant', content: [...blocks.values()] }];
      }
      if (format === 'openai-responses' && responseOutput.length && reason !== 'length')
        wireAssistant = responseOutput.filter(Boolean);
      combined.throwIfAborted();
      const ref = await this.native.save(binding, {
        canonical: [...input.messages, assistant],
        wire: [...messages, ...wireAssistant],
      });
      combined.throwIfAborted();
      for (const call of validCalls)
        yield { type: 'tool_end', callId: call.id, name: call.name, arguments: call.arguments };
      yield { type: 'usage', usage: usage(rawUsage, format) };
      yield { type: 'finish', reason, nativeStateRef: ref };
    } catch (error) {
      yield {
        type: 'error',
        error: {
          ...(combined.aborted
            ? { code: 'CANCELLED' as const, retryable: false }
            : this.classifyError(error)),
          ...responseDiagnostic,
        },
        partial,
      };
    } finally {
      controller.abort();
      key = undefined;
    }
  }
  async checkConnection(
    input: { accountId: string; modelId: string },
    signal: AbortSignal,
  ): Promise<ProbeView> {
    signal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    const request: ModelRequest = {
      accountId: input.accountId,
      model: { providerId: this.id, modelId: input.modelId },
      logicalCallId: 'probe',
      attemptId: 'probe',
      branchId: 'probe',
      taskVersion: 1,
      systemModules: [{ id: 'probe', text: 'Follow the instructions.' }],
      messages: [{ role: 'user', text: 'Reply OK.' }],
      tools: [],
      outputLimit: 32,
      reasoning: 'off',
    };
    let text = false,
      tools = false,
      finished = false,
      finishReason: 'stop' | 'tool_calls' | 'length' | undefined,
      phase: 'text' | 'tools' = 'text',
      error: ProviderError | undefined;
    let details: Pick<
      NonNullable<ProbeView['diagnostic']>,
      'httpStatus' | 'responseType' | 'request'
    > = {};
    let observedUsage: NormalizedUsage | undefined;
    const observe = (view: typeof details) => {
      details = { ...details, ...view };
    };
    const truncationReason = () =>
      details.request?.reasoning !== 'unspecified' &&
      details.request !== undefined &&
      observedUsage?.outputTotal !== null &&
      observedUsage?.outputTotal !== undefined &&
      observedUsage.outputTotal > 0 &&
      observedUsage.reasoningSubset === observedUsage.outputTotal
        ? ('reasoning_output_truncated' as const)
        : ('output_truncated' as const);
    for await (const event of this.stream(request, signal, observe)) {
      if (event.type === 'usage') observedUsage = event.usage;
      if (event.type === 'text_delta' && event.text.trim()) text = true;
      if (event.type === 'finish') {
        finished = true;
        finishReason = event.reason;
      }
      if (event.type === 'error') error = event.error;
    }
    if (!error && finishReason === 'length')
      error = {
        code: 'OUTPUT_LIMIT_REACHED',
        retryable: false,
        diagnosticCode: truncationReason(),
      };
    else if (!error && finished && !text)
      error = {
        code: 'PROVIDER_UNAVAILABLE',
        retryable: false,
        diagnosticCode: 'empty_text',
      };
    const textPassed = text && finished && finishReason === 'stop' && !error;
    if (textPassed) {
      phase = 'tools';
      details = {};
      observedUsage = undefined;
      request.messages = [
        { role: 'user', text: 'Call echo with text OK. Do not answer in plain text.' },
      ];
      request.outputLimit = 128;
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
      let valid = false;
      finished = false;
      finishReason = undefined;
      for await (const event of this.stream(request, signal, observe)) {
        if (event.type === 'usage') observedUsage = event.usage;
        if (event.type === 'tool_end')
          valid = event.name === 'echo' && JSON.stringify(event.arguments) === '{"text":"OK"}';
        if (event.type === 'finish') {
          finished = event.reason === 'tool_calls';
          finishReason = event.reason;
        }
        if (event.type === 'error') error = event.error;
      }
      if (!error && finishReason === 'length')
        error = {
          code: 'OUTPUT_LIMIT_REACHED',
          retryable: false,
          diagnosticCode: truncationReason(),
        };
      tools = valid && finished && !error;
    }
    return {
      ...input,
      status:
        textPassed && tools ? 'ready' : error?.code === 'AUTH_EXPIRED' ? 'expired' : 'unavailable',
      text: textPassed,
      tools,
      errorCode: error?.code ?? (tools ? null : 'MODEL_UNSUPPORTED'),
      ...(error && (error.diagnosticCode || error.code === 'NETWORK_ERROR')
        ? {
            diagnostic: {
              phase,
              reason: error.diagnosticCode ?? 'request_failed',
              ...details,
              ...(observedUsage ? { usage: observedUsage } : {}),
              ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
              ...(error.responseType ? { responseType: error.responseType } : {}),
              ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
            },
          }
        : {}),
    };
  }
}
