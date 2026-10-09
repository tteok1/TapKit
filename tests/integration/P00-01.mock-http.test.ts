import { expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { startMockHttpServer } from '../fixtures/mock-http';
import fixture from '../fixtures/stream.json';
it('P00-01 mock streams controlled chunks with real delay', async () => {
  const server = await startMockHttpServer(fixture);
  try {
    const start = performance.now();
    const response = await fetch(server.url);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('你好');
    expect(body.indexOf('你好')).toBeLessThan(body.indexOf('TapKit'));
    expect(body).toContain('[DONE]');
    expect(performance.now() - start).toBeGreaterThanOrEqual(45);
  } finally {
    await server.close();
  }
});
it('P00-01 mock emits 429 with retry guidance', async () => {
  const server = await startMockHttpServer({ chunks: [], delayMs: 0, status: 429 });
  try {
    const response = await fetch(server.url);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1');
    await response.text();
  } finally {
    await server.close();
  }
});
it('P00-01 mock disconnects a partial stream', async () => {
  const server = await startMockHttpServer({
    chunks: ['first', 'second'],
    delayMs: 20,
    disconnectAfter: 1,
  });
  try {
    const response = await fetch(server.url);
    await expect(response.text()).rejects.toThrow();
  } finally {
    await server.close();
  }
});
it('P00-01 mock refuses production mode', async () => {
  const mode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await expect(startMockHttpServer({ chunks: [], delayMs: 0 })).rejects.toThrow('test-only');
  } finally {
    if (mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = mode;
  }
});
