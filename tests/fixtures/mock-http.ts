import { createServer, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
export interface MockScenario {
  chunks: string[];
  delayMs: number;
  status?: number;
  disconnectAfter?: number;
}
export async function startMockHttpServer(scenario: MockScenario) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Mock HTTP is test-only');
  if (!Number.isInteger(scenario.delayMs) || scenario.delayMs < 0 || scenario.delayMs > 10_000)
    throw new Error('Invalid delay');
  const server = createServer((_request, response) => {
    void serve(response).catch(() => response.destroy());
  });
  async function serve(response: ServerResponse) {
    if (scenario.status === 429) {
      response.writeHead(429, { 'Retry-After': '1' });
      response.end('rate limited');
      return;
    }
    response.writeHead(scenario.status ?? 200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.flushHeaders();
    for (const [index, chunk] of scenario.chunks.entries()) {
      await delay(scenario.delayMs);
      if (response.destroyed) return;
      if (scenario.disconnectAfter !== undefined && index >= scenario.disconnectAfter) {
        response.destroy();
        return;
      }
      response.write('data: ' + JSON.stringify({ text: chunk }) + '\n\n');
    }
    response.end('data: [DONE]\n\n');
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: 'http://127.0.0.1:' + address.port,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
