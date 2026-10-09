import { CodexFailure, httpFailure } from './errors';
import type { ProviderError, NormalizedUsage } from '@tapkit/contracts';

function usageFrom(value: unknown): NormalizedUsage {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  const inputTotal = number(raw.input_tokens),
    outputTotal = number(raw.output_tokens);
  const inputDetails = raw.input_tokens_details as { cached_tokens?: unknown } | undefined;
  const outputDetails = raw.output_tokens_details as { reasoning_tokens?: unknown } | undefined;
  const cached = number(inputDetails?.cached_tokens),
    reasoning = number(outputDetails?.reasoning_tokens);
  return {
    inputTotal,
    outputTotal,
    inputCachedSubset:
      cached !== null && inputTotal !== null && cached <= inputTotal ? cached : null,
    reasoningSubset:
      reasoning !== null && outputTotal !== null && reasoning <= outputTotal ? reasoning : null,
    source: inputTotal !== null || outputTotal !== null ? 'actual' : 'estimated',
  };
}

// Normalize strict SSE framing before the pinned pi decoder consumes it.
export function codexFetch(
  fetcher: typeof fetch,
  capture: (error: ProviderError) => void,
  captureUsage: (usage: NormalizedUsage) => void = () => {},
): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (
      url.origin !== 'https://chatgpt.com' ||
      url.pathname !== '/backend-api/codex/responses' ||
      url.search ||
      url.hash
    )
      throw new CodexFailure({ code: 'PERMISSION_DENIED', retryable: false });
    let response: Response;
    try {
      response = await fetcher(input, { ...init, redirect: 'error' });
    } catch {
      const detail: ProviderError = {
        code: init?.signal?.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
        retryable: !init?.signal?.aborted,
        diagnosticCode: 'request_failed',
      };
      capture(detail);
      throw new CodexFailure(detail);
    }
    if (!response.ok) {
      let rawCode: string | undefined;
      try {
        const raw: unknown = await response.clone().json();
        if (raw && typeof raw === 'object' && 'error' in raw) {
          const error = raw.error;
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof error.code === 'string'
          )
            rawCode = error.code;
        }
      } catch {
        /* Preserve HTTP status when the body is not JSON. */
      }
      const retryAfter = response.headers.get('retry-after');
      const retryMs =
        retryAfter === null
          ? NaN
          : /^\d+(\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - Date.now();
      capture({
        ...httpFailure(response.status, rawCode),
        diagnosticCode: 'upstream_error',
        ...(Number.isFinite(retryMs) ? { retryAfterMs: Math.max(0, Math.ceil(retryMs)) } : {}),
      });
      return response;
    }
    if (!response.body) {
      const detail: ProviderError = {
        code: 'STREAM_INTERRUPTED',
        retryable: false,
        httpStatus: response.status,
        diagnosticCode: 'empty_response',
      };
      capture(detail);
      throw new CodexFailure(detail);
    }
    const contentType = (response.headers.get('content-type') ?? '')
      .toLowerCase()
      .split(';')[0]!
      .trim();
    // The live Codex route can omit Content-Type while sending valid SSE.
    // Only a missing header permits bounded, strict first-event validation.
    if (contentType && contentType !== 'text/event-stream') {
      const detail: ProviderError = {
        code: 'STREAM_INTERRUPTED',
        retryable: false,
        httpStatus: response.status,
        diagnosticCode: 'unexpected_content_type',
      };
      capture(detail);
      await response.body.cancel().catch(() => {});
      throw new CodexFailure(detail);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const encoder = new TextEncoder();
    let buffer = '',
      terminal = false;
    let cancelled = false;
    let awaitingSseValidation = !contentType;
    let unvalidatedSize = 0;
    let upstreamFailure: ProviderError | undefined;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        let diagnosticCode: ProviderError['diagnosticCode'] = 'read_failed';
        try {
          for (;;) {
            const chunk = await reader.read();
            // pi cancels its reader after a terminal event. That cancellation
            // can settle an already pending read; the controller is then closed.
            if (cancelled) return;
            diagnosticCode = 'invalid_utf8';
            let emitted = false;
            buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
            diagnosticCode = 'frame_too_large';
            if (buffer.length > 4_194_304) throw new Error('SSE frame too large');
            for (;;) {
              const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
              if (!boundary || boundary.index === undefined) break;
              const frame = buffer.slice(0, boundary.index);
              buffer = buffer.slice(boundary.index + boundary[0].length);
              const lines = frame.split(/\r\n|\n|\r/);
              if (awaitingSseValidation) {
                diagnosticCode = 'unexpected_content_type';
                unvalidatedSize += frame.length + boundary[0].length;
                if (
                  unvalidatedSize > 65_536 ||
                  !lines.every((line) => !line || /^(?:data:|event:|id:|retry:|:)/.test(line))
                )
                  throw new Error('Invalid untyped SSE');
              }
              const data = lines
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).replace(/^ /, ''))
                .join('\n');
              if (!data || data === '[DONE]') continue;
              diagnosticCode = awaitingSseValidation ? 'unexpected_content_type' : 'invalid_json';
              const event: unknown = JSON.parse(data);
              if (awaitingSseValidation) {
                if (
                  !event ||
                  typeof event !== 'object' ||
                  !('type' in event) ||
                  typeof event.type !== 'string' ||
                  !(event.type === 'error' || /^response\.[a-z_]+(?:\.[a-z_]+)*$/.test(event.type))
                )
                  throw new Error('Invalid untyped SSE event');
                awaitingSseValidation = false;
              }
              if (!event || typeof event !== 'object' || !('type' in event)) continue;
              const type = event.type;
              if (
                ['response.completed', 'response.done', 'response.incomplete'].includes(
                  String(type),
                )
              ) {
                const raw = event as { response?: { usage?: unknown } };
                captureUsage(usageFrom(raw.response?.usage));
              }
              if (
                type === 'response.output_item.done' &&
                'item' in event &&
                event.item &&
                typeof event.item === 'object' &&
                'type' in event.item &&
                event.item.type === 'function_call'
              ) {
                diagnosticCode = 'invalid_tool_arguments';
                if (!('arguments' in event.item) || typeof event.item.arguments !== 'string')
                  throw new Error('Invalid tool arguments');
                const argumentsValue: unknown = JSON.parse(event.item.arguments);
                if (
                  !argumentsValue ||
                  typeof argumentsValue !== 'object' ||
                  Array.isArray(argumentsValue)
                )
                  throw new Error('Invalid tool arguments');
              }
              if (type === 'error' || type === 'response.failed') {
                const raw = event as {
                  code?: string;
                  error?: { code?: string };
                  response?: { error?: { code?: string } };
                };
                upstreamFailure = {
                  ...httpFailure(200, raw.response?.error?.code ?? raw.error?.code ?? raw.code),
                  diagnosticCode: 'upstream_error',
                };
                capture(upstreamFailure);
              }
              if (
                [
                  'response.completed',
                  'response.done',
                  'response.incomplete',
                  'response.failed',
                  'error',
                ].includes(String(type))
              )
                terminal = true;
              controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
              emitted = true;
            }
            if (awaitingSseValidation && unvalidatedSize + buffer.length > 65_536) {
              diagnosticCode = 'unexpected_content_type';
              throw new Error('Untyped SSE prefix too large');
            }
            if (chunk.done) {
              diagnosticCode = awaitingSseValidation
                ? 'unexpected_content_type'
                : 'unterminated_sse';
              if (!terminal || buffer.trim()) throw new Error('Unterminated SSE');
              controller.close();
              return;
            }
            if (emitted) return;
            diagnosticCode = 'read_failed';
          }
        } catch {
          if (cancelled) return;
          capture(
            upstreamFailure ?? {
              code: init?.signal?.aborted ? 'CANCELLED' : 'STREAM_INTERRUPTED',
              retryable: false,
              httpStatus: response.status,
              diagnosticCode,
            },
          );
          controller.error(new Error('STREAM_INTERRUPTED'));
          await reader.cancel().catch(() => {});
        }
      },
      async cancel() {
        cancelled = true;
        await reader.cancel().catch(() => {});
      },
    });
    const headers = new Headers(response.headers);
    if (!contentType) headers.set('content-type', 'text/event-stream');
    return new Response(body, { status: response.status, headers });
  };
}
