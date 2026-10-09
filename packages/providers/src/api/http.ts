import { request, Agent, type AgentOptions } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { ProviderError } from '@tapkit/contracts';

export class ApiFailure extends Error {
  constructor(readonly detail: ProviderError) {
    super(detail.code);
  }
}
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6)
    return /^[23]/.test(address) && !address.toLowerCase().startsWith('2001:db8:');
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && [0, 168].includes(b!)) ||
    (a === 192 && b === 2) ||
    (a === 198 && ([18, 19].includes(b!) || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function bypassProxy(host: string, port: string, rules: string) {
  return rules.split(',').some((rule) => {
    let name = rule.trim().toLowerCase();
    if (!name) return false;
    if (name === '*') return true;
    const colon = name.lastIndexOf(':');
    if (colon >= 0) {
      if (name.slice(colon + 1) !== port) return false;
      name = name.slice(0, colon);
    }
    name = name.replace(/^\*?\./, '');
    return host === name || host.endsWith('.' + name);
  });
}
// Resolve once, reject non-public results, then connect to that exact address.
// Host/SNI preserve the original HTTPS origin, including through CONNECT proxies.
export function apiFetchForNetwork(network: {
  mode: 'environment' | 'direct' | 'manual';
  proxyURL: string;
}): typeof fetch {
  return (input, init) => secureRequest(input, init, network);
}
export const secureApiFetch: typeof fetch = (input, init) => secureRequest(input, init);
const secureRequest = async (
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  network?: { mode: 'environment' | 'direct' | 'manual'; proxyURL: string },
): Promise<Response> => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
    throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const connection = new AbortController();
  const signal = AbortSignal.any([...(init?.signal ? [init.signal] : []), connection.signal]);
  const timer = setTimeout(() => connection.abort(), 20_000);
  let addresses: { address: string; family: number }[];
  try {
    signal.throwIfAborted();
    addresses = await new Promise((resolve, reject) => {
      const abort = () =>
        reject(
          new ApiFailure({
            code: init?.signal?.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
            retryable: !init?.signal?.aborted,
          }),
        );
      signal.addEventListener('abort', abort, { once: true });
      lookup(host, { all: true, verbatim: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
  if (!addresses.length || addresses.some((row) => !isPublicAddress(row.address))) {
    clearTimeout(timer);
    throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
  }
  if (signal.aborted) {
    clearTimeout(timer);
    throw new ApiFailure({
      code: init?.signal?.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
      retryable: !init?.signal?.aborted,
    });
  }
  const proxy =
    network?.mode === 'direct'
      ? ''
      : network?.mode === 'manual'
        ? network.proxyURL
        : process.env.TAPKIT_HTTP_PROXY ||
          process.env.HTTPS_PROXY ||
          process.env.https_proxy ||
          process.env.HTTP_PROXY ||
          process.env.http_proxy ||
          '';
  const noProxy =
    network?.mode === 'manual' ? '' : process.env.NO_PROXY || process.env.no_proxy || '';
  const agent = new Agent({
    proxyEnv: {
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      NO_PROXY: bypassProxy(host, url.port || '443', noProxy) ? '*' : '',
    },
  } as AgentOptions);
  const headers = Object.fromEntries(new Headers(init?.headers));
  headers.host = url.host;
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      {
        hostname: addresses[0]!.address,
        servername: host,
        port: url.port || 443,
        path: url.pathname,
        method: init?.method || 'POST',
        headers,
        agent,
        rejectUnauthorized: true,
        signal,
      },
      (res) => {
        clearTimeout(timer);
        req.setTimeout(60_000, () => req.destroy(new Error('STREAM_INTERRUPTED')));
        res.once('close', () => agent.destroy());
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined)
            responseHeaders.set(name, Array.isArray(value) ? value.join(',') : value);
        }
        const empty = [204, 205, 304].includes(res.statusCode!);
        if (empty) res.resume();
        resolve(
          new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), {
            status: res.statusCode!,
            headers: responseHeaders,
          }),
        );
      },
    );
    req.on('error', () => {
      clearTimeout(timer);
      agent.destroy();
      reject(
        new ApiFailure({
          code: init?.signal?.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
          retryable: !init?.signal?.aborted,
        }),
      );
    });
    req.end(typeof init?.body === 'string' ? init.body : undefined);
  });
};

export function classifyResponseType(
  contentType: string | null,
): NonNullable<ProviderError['responseType']> {
  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mime) return 'missing';
  if (mime === 'text/event-stream') return 'event-stream';
  if (mime === 'application/json' || /^application\/[^\s/;]+\+json$/.test(mime)) return 'json';
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  return 'other';
}

type JsonResponseInspection =
  | { kind: 'error'; code?: string }
  | { kind: 'response' | 'other' }
  | {
      kind: 'invalid_json' | 'invalid_utf8' | 'frame_too_large' | 'read_failed' | 'empty_response';
    };

// Only bounded classification and a restricted error code may leave this function.
export async function inspectJsonResponse(
  response: Response,
  signal: AbortSignal,
): Promise<JsonResponseInspection> {
  signal.throwIfAborted();
  if (!response.body) return { kind: 'empty_response' };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 65_536) return { kind: 'frame_too_large' };
      chunks.push(chunk.value);
    }
    if (!length) return { kind: 'empty_response' };
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      return { kind: 'invalid_utf8' };
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { kind: 'invalid_json' };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'other' };
    const object = value as Record<string, unknown>;
    const nested = object.error;
    if (
      (nested && typeof nested === 'object' && !Array.isArray(nested)) ||
      object.type === 'error'
    ) {
      const error =
        nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : object;
      const rawCode = error.code ?? error.type;
      const code =
        typeof rawCode === 'string'
          ? rawCode
          : typeof rawCode === 'number' && Number.isSafeInteger(rawCode) && rawCode >= 0
            ? String(rawCode)
            : undefined;
      return { kind: 'error', ...(code && /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? { code } : {}) };
    }
    if (
      object.object === 'response' &&
      Array.isArray(object.output) &&
      typeof object.status === 'string' &&
      ['completed', 'failed', 'incomplete', 'in_progress', 'queued', 'cancelled'].includes(
        object.status,
      )
    )
      return { kind: 'response' };
    return { kind: 'other' };
  } catch {
    signal.throwIfAborted();
    return { kind: 'read_failed' };
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* apiEvents(response: Response, signal: AbortSignal): AsyncGenerator<unknown> {
  if (!response.body)
    throw new ApiFailure({
      code: 'STREAM_INTERRUPTED',
      retryable: false,
      diagnosticCode: 'empty_response',
    });
  const responseType = classifyResponseType(response.headers.get('content-type'));
  if (responseType !== 'missing' && responseType !== 'event-stream') {
    await response.body.cancel().catch(() => {});
    throw new ApiFailure({
      code: 'STREAM_INTERRUPTED',
      retryable: false,
      diagnosticCode: 'unexpected_content_type',
    });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let received = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      received += chunk.value?.byteLength ?? 0;
      if (received > 50 * 1024 * 1024)
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode: 'frame_too_large',
        });
      try {
        buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode: 'invalid_utf8',
        });
      }
      for (;;) {
        const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
        if (!boundary) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (Buffer.byteLength(frame) > 4_194_304)
          throw new ApiFailure({
            code: 'STREAM_INTERRUPTED',
            retryable: false,
            diagnosticCode: 'frame_too_large',
          });
        const data = frame
          .split(/\r\n|\n|\r/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data) continue;
        if (data === '[DONE]') {
          yield '[DONE]';
          continue;
        }
        try {
          yield JSON.parse(data);
        } catch (error) {
          if (error instanceof ApiFailure) throw error;
          throw new ApiFailure({
            code: 'STREAM_INTERRUPTED',
            retryable: false,
            diagnosticCode: 'invalid_json',
          });
        }
      }
      if (Buffer.byteLength(buffer) > 4_194_304)
        throw new ApiFailure({
          code: 'STREAM_INTERRUPTED',
          retryable: false,
          diagnosticCode: 'frame_too_large',
        });
      if (chunk.done) {
        if (buffer.trim())
          throw new ApiFailure({
            code: 'STREAM_INTERRUPTED',
            retryable: false,
            diagnosticCode: 'unterminated_sse',
          });
        break;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}

export async function errorBody(
  response: Response,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!response.body) return {};
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const value = await reader.read();
      signal.throwIfAborted();
      if (value.done) break;
      length += value.value.length;
      if (length > 65_536) return {};
      chunks.push(value.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}
