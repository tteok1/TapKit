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
import { secureApiFetch } from '../../packages/providers/src/api/http';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  mocks.agents.length = 0;
});
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
    HTTPS_PROXY: 'http://127.0.0.1:7688',
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
  const assertion = expect(operation).rejects.toThrow('NETWORK_ERROR');
  await vi.advanceTimersByTimeAsync(20_000);
  await assertion;
  expect(mocks.request).not.toHaveBeenCalled();
  const controller = new AbortController(),
    cancelled = secureApiFetch('https://api.trusted.example/v1/messages', {
      signal: controller.signal,
    });
  const cancelledAssertion = expect(cancelled).rejects.toThrow('CANCELLED');
  controller.abort();
  await cancelledAssertion;
});
