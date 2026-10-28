import { it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  agents: [] as Record<string, any>[],
}));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({
  Agent: class {
    constructor(options: Record<string, any>) {
      mocks.agents.push(options);
    }
    destroy() {}
  },
  request: mocks.request,
}));
import {
  secureApiFetch,
  isPublicAddress,
  apiFetchForNetwork,
  bypassProxy,
} from '../../packages/providers/src/api/http';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  mocks.agents.length = 0;
});
it('P01-02 handles public IPv6 and IPv6 NO_PROXY rules without accepting documentation or scoped addresses', () => {
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  expect(isPublicAddress('2001:0200::1')).toBe(true);
  expect(isPublicAddress('fe80::1%eth0')).toBe(false);
  expect(bypassProxy('[2606:4700:4700::1111]', '443', '[2606:4700:4700::1111]')).toBe(true);
  expect(bypassProxy('[2606:4700:4700::1111]', '443', '[2606:4700:4700::1111]:443')).toBe(true);
  expect(bypassProxy('[2606:4700:4700::1111]', '8443', '[2606:4700:4700::1111]:443')).toBe(false);
});
it.each(['2001:0db8::1', '2001:0000:4136:e378:8000:63bf:3fff:fdd2', '2002:7f00:1::', '3fff::1'])(
  'P01-02 rejects reserved or tunnelling IPv6 %s before credentials can be dispatched',
  (address) => {
    expect(isPublicAddress(address)).toBe(false);
  },
);
function requestFixture() {
  mocks.request.mockImplementation((options, done) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void };
    req.setTimeout = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = Readable.from([Buffer.from('data: [DONE]\n\n')]) as Readable & {
          statusCode: number;
          headers: Record<string, string>;
        };
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/event-stream' };
        done(res);
      });
    options.signal.addEventListener('abort', () => req.emit('error', new Error('cancelled')), {
      once: true,
    });
    return req;
  });
}
it('reports only fixed transport milestones without exposing request data', async () => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  requestFixture();
  const events: string[] = [];
  const response = await apiFetchForNetwork(
    { mode: 'direct', proxyURL: '' },
    undefined,
    (event) => {
      events.push(event);
      if (event === 'dns_complete') throw new Error('observer failure');
    },
  )('https://api.trusted.example/v1/messages', { headers: { authorization: 'secret' } });
  await response.text();
  expect(events).toEqual(['dns_complete', 'proxy_resolved', 'response_headers']);
  expect(JSON.stringify(events)).not.toContain('secret');
});
it('P01-02 validates all DNS answers and pins the actual connection, Host, SNI and TLS policy', async () => {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  requestFixture();
  vi.stubEnv('TAPKIT_HTTP_PROXY', 'http://127.0.0.1:7688');
  vi.stubEnv('NO_PROXY', '.trusted.example');
  vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
  const response = await secureApiFetch('https://api.trusted.example/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': 'fixture' },
    body: '{}',
  });
  expect(await response.text()).toContain('[DONE]');
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  expect(mocks.request.mock.calls[0]![0]).toMatchObject({
    hostname: '8.8.8.8',
    servername: 'api.trusted.example',
    path: '/v1/messages',
    rejectUnauthorized: true,
    headers: { host: 'api.trusted.example', 'x-api-key': 'fixture' },
  });
  expect(mocks.agents[0]!.proxyEnv).toMatchObject({
    HTTPS_PROXY: '',
    NO_PROXY: '*',
  });
});
it('P01-02 rejects mixed public/private DNS and redirects before exposing credentials to another destination', async () => {
  mocks.lookup.mockResolvedValue([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(secureApiFetch('https://api.trusted.example/v1/messages')).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  requestFixture();
  mocks.request.mockImplementationOnce((_options, done) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void };
    req.setTimeout = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = Readable.from([Buffer.alloc(0)]) as Readable & {
          statusCode: number;
          headers: Record<string, string>;
        };
        res.statusCode = 302;
        res.headers = { location: 'https://127.0.0.1/private' };
        done(res);
      });
    return req;
  });
  const response = await secureApiFetch('https://api.trusted.example/v1/messages');
  expect(response.status).toBe(302);
  await response.text();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('P01-02 includes DNS in the connection deadline and cancels stalled lookup promptly', async () => {
  vi.useFakeTimers();
  mocks.lookup.mockImplementation(() => new Promise(() => {}));
  const operation = secureApiFetch('https://api.trusted.example/v1/messages');
  const assertion = expect(operation).rejects.toMatchObject({
    message: 'NETWORK_ERROR',
    detail: { code: 'NETWORK_ERROR', retryable: true, diagnosticCode: 'dns_timeout' },
  });
  await vi.advanceTimersByTimeAsync(20_000);
  await assertion;
  expect(mocks.request).not.toHaveBeenCalled();
  const controller = new AbortController(),
    cancelled = secureApiFetch('https://api.trusted.example/v1/messages', {
      signal: controller.signal,
    });
  const cancelledAssertion = expect(cancelled).rejects.toMatchObject({
    detail: { code: 'CANCELLED', retryable: false },
  });
  controller.abort();
  await cancelledAssertion;
});
it('P01-03 reports a fixed DNS failure without leaking native error text', async () => {
  mocks.lookup.mockRejectedValue(new Error('secret@proxy.example/private-key'));
  const error = await secureApiFetch('https://api.trusted.example/v1/messages').catch((e) => e);
  expect(error.message).toBe('NETWORK_ERROR');
  expect(error.detail).toEqual({
    code: 'NETWORK_ERROR',
    retryable: true,
    diagnosticCode: 'dns_failed',
  });
  expect(JSON.stringify(error)).not.toMatch(/secret|proxy.example|private-key/);
  expect(mocks.request).not.toHaveBeenCalled();
});
function pendingRequest() {
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mocks.request.mockImplementation((options) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {};
    options.signal.addEventListener('abort', () => req.emit('error', new Error('secret')), {
      once: true,
    });
    return req;
  });
}
it('P01-03 distinguishes the response-header deadline from explicit cancellation', async () => {
  vi.useFakeTimers();
  pendingRequest();
  const operation = secureApiFetch('https://api.trusted.example/v1/messages');
  const assertion = expect(operation).rejects.toMatchObject({
    detail: {
      code: 'NETWORK_ERROR',
      retryable: true,
      diagnosticCode: 'response_headers_timeout',
    },
  });
  await vi.advanceTimersByTimeAsync(20_000);
  await assertion;
  const controller = new AbortController();
  const cancelled = secureApiFetch('https://api.trusted.example/v1/messages', {
    signal: controller.signal,
  });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  const error = await cancelled.catch((e) => e);
  expect(error.detail).toEqual({ code: 'CANCELLED', retryable: false });
});
it('honors an extended deadline while preserving cancellation', async () => {
  vi.useFakeTimers();
  pendingRequest();
  const controller = new AbortController();
  const operation = apiFetchForNetwork(
    { mode: 'direct', proxyURL: '' },
    undefined,
    undefined,
    90_000,
  )('https://api.trusted.example/v1/messages', { signal: controller.signal });
  const assertion = expect(operation).rejects.toMatchObject({ detail: { code: 'CANCELLED' } });
  await vi.advanceTimersByTimeAsync(20_001);
  expect(mocks.request).toHaveBeenCalledOnce();
  controller.abort();
  await assertion;
  const timeout = apiFetchForNetwork(
    { mode: 'direct', proxyURL: '' },
    undefined,
    undefined,
    90_000,
  )('https://api.trusted.example/v1/messages');
  const timedOut = expect(timeout).rejects.toMatchObject({
    detail: { diagnosticCode: 'response_headers_timeout' },
  });
  await vi.advanceTimersByTimeAsync(90_000);
  await timedOut;
});
it('P01-03 classifies pre-response connection errors without exporting raw details', async () => {
  pendingRequest();
  const operation = secureApiFetch('https://api.trusted.example/v1/messages');
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  mocks.request.mock.results[0]!.value.emit('error', new Error('private-key@proxy'));
  const error = await operation.catch((e) => e);
  expect(error.detail).toEqual({
    code: 'NETWORK_ERROR',
    retryable: true,
    diagnosticCode: 'connection_failed',
  });
  expect(JSON.stringify(error)).not.toContain('private-key');
});
function cleanProxyEnvironment() {
  for (const name of [
    'TAPKIT_HTTP_PROXY',
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
    'NO_PROXY',
    'no_proxy',
  ])
    vi.stubEnv(name, undefined);
}
it('P01-02 automatic routing uses the Host system proxy only after public DNS validation and preserves pinned TLS', async () => {
  cleanProxyEnvironment();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  requestFixture();
  const resolver = vi.fn(async () => 'http://127.0.0.1:7890');
  const response = await apiFetchForNetwork(
    { mode: 'environment', proxyURL: '' },
    resolver,
  )('https://api.trusted.example/v1/messages');
  await response.text();
  expect(resolver).toHaveBeenCalledWith(
    'https://api.trusted.example/v1/messages',
    expect.any(AbortSignal),
  );
  expect(mocks.agents[0]!.proxyEnv.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
  expect(mocks.request.mock.calls[0]![0]).toMatchObject({
    hostname: '8.8.8.8',
    servername: 'api.trusted.example',
    rejectUnauthorized: true,
  });
  mocks.lookup.mockResolvedValue([{ address: '198.18.1.1', family: 4 }]);
  await expect(
    apiFetchForNetwork(
      { mode: 'environment', proxyURL: '' },
      resolver,
    )('https://api.trusted.example/v1/messages'),
  ).rejects.toMatchObject({
    detail: { code: 'PERMISSION_DENIED', retryable: false, diagnosticCode: 'non_public_dns' },
  });
  expect(resolver).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledOnce();
});
it('P01-02 manual, direct and explicit environment routes override system routing without touching settings', async () => {
  cleanProxyEnvironment();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  requestFixture();
  const resolver = vi.fn(async () => 'http://127.0.0.1:7890');
  for (const [network, env, expected] of [
    [
      { mode: 'manual' as const, proxyURL: 'https://proxy.example:8443' },
      'http://env.example:8888',
      'https://proxy.example:8443',
    ],
    [{ mode: 'direct' as const, proxyURL: '' }, 'http://env.example:8888', ''],
    [
      { mode: 'environment' as const, proxyURL: '' },
      'http://env.example:8888',
      'http://env.example:8888',
    ],
    [{ mode: 'environment' as const, proxyURL: '' }, '', ''],
  ] as const) {
    vi.stubEnv('TAPKIT_HTTP_PROXY', env);
    const response = await apiFetchForNetwork(
      network,
      resolver,
    )('https://api.trusted.example/v1/messages');
    await response.text();
    expect(mocks.agents.at(-1)!.proxyEnv.HTTPS_PROXY).toBe(expected);
  }
  expect(resolver).not.toHaveBeenCalled();
});
it('P01-02 unsupported proxy and synchronous HTTPS setup errors are sanitized and release deadlines', async () => {
  cleanProxyEnvironment();
  vi.useFakeTimers();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  vi.stubEnv('TAPKIT_HTTP_PROXY', 'socks5://private-secret@proxy.example:7890');
  const invalid = await secureApiFetch('https://api.trusted.example/v1/messages').catch((e) => e);
  expect(invalid.detail).toEqual({
    code: 'NETWORK_ERROR',
    retryable: false,
    diagnosticCode: 'proxy_unsupported',
  });
  expect(JSON.stringify(invalid)).not.toContain('private-secret');
  expect(mocks.request).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  vi.stubEnv('TAPKIT_HTTP_PROXY', '');
  mocks.request.mockImplementation(() => {
    throw new Error('private-secret@request');
  });
  const setup = await secureApiFetch('https://api.trusted.example/v1/messages').catch((e) => e);
  expect(setup.detail).toEqual({
    code: 'NETWORK_ERROR',
    retryable: true,
    diagnosticCode: 'connection_failed',
  });
  expect(JSON.stringify(setup)).not.toContain('private-secret');
  expect(vi.getTimerCount()).toBe(0);
});
it('P01-02 cancels a stalled proxy lookup before a model request is dispatched', async () => {
  cleanProxyEnvironment();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  const controller = new AbortController(),
    resolver = vi.fn(() => new Promise<string>(() => {}));
  const result = apiFetchForNetwork({ mode: 'environment', proxyURL: '' }, resolver)(
    'https://api.trusted.example/v1/messages',
    { signal: controller.signal },
  );
  await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce());
  const assertion = expect(result).rejects.toMatchObject({
    detail: { code: 'CANCELLED', retryable: false },
  });
  controller.abort();
  await assertion;
  expect(mocks.request).not.toHaveBeenCalled();
});
