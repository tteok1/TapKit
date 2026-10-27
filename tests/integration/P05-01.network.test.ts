import { test, expect } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { NetworkPolicyService } from '../../packages/network/src';
import type { Socket } from 'node:net';

async function proxyFixture(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  const authorities: string[] = [],
    sockets = new Set<Socket>();
  server.on('connect', (req, stream, head) => {
    const socket = stream as Socket;
    authorities.push(req.url ?? '');
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) socket.unshift(head);
    server.emit('connection', socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  let resolutions = 0;
  const policy = new NetworkPolicyService({
    resolve: async () => {
      resolutions++;
      return [{ address: '8.8.8.8', family: 4 }];
    },
    proxy: async () => `http://127.0.0.1:${address.port}`,
  });
  return {
    policy,
    authorities,
    resolutions: () => resolutions,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
test('P05-01 T19 actual HTTP proxy uses pinned addresses, keeps path/query and rejects redirected private targets', async () => {
  const received: { url: string | undefined; host: string | undefined }[] = [];
  const f = await proxyFixture((req, res) => {
    received.push({ url: req.url, host: req.headers.host });
    if (received.length === 1)
      res.writeHead(302, { location: 'http://example.net/final?q=2' }).end();
    else if (received.length === 2)
      res.writeHead(200, { 'content-type': 'text/html' }).end('<p>ok</p>');
    else res.writeHead(302, { location: 'http://169.254.169.254/latest' }).end();
  });
  try {
    const reply = await f.policy.request('http://example.com/start?q=1');
    expect(reply.bytes.toString()).toBe('<p>ok</p>');
    expect(f.resolutions()).toBe(2);
    expect(f.authorities).toEqual(['8.8.8.8:80', '8.8.8.8:80']);
    expect(received[0]).toEqual({ url: '/start?q=1', host: 'example.com' });
    await expect(f.policy.request('http://example.com/private')).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    expect(received).toHaveLength(3);
  } finally {
    await f.close();
  }
});
test('P05-01 T19 actual transfer byte limits, redirect bounds, domain filters, compression and cancellation fail closed', async () => {
  let mode = 'large',
    hits = 0;
  const f = await proxyFixture((_req, res) => {
    hits++;
    if (mode === 'large') res.writeHead(200).end('x'.repeat(4096));
    if (mode === 'gzip') res.writeHead(200, { 'content-encoding': 'gzip' }).end('compressed');
    if (mode === 'redirect') res.writeHead(302, { location: 'http://other.example.org/' }).end();
    if (mode === 'slow') {
      res.writeHead(200);
      res.write('pending');
    }
  });
  try {
    await expect(f.policy.request('http://example.com', { limit: 1024 })).rejects.toThrow(
      'FILE_TOO_LARGE',
    );
    mode = 'gzip';
    await expect(f.policy.request('http://example.com')).rejects.toThrow('FORMAT_UNSUPPORTED');
    mode = 'redirect';
    const before = hits;
    await expect(f.policy.request('http://example.com')).rejects.toThrow('PERMISSION_DENIED');
    expect(hits - before).toBe(6);
    const earlier = hits;
    await expect(
      f.policy.request('http://example.com', {
        allowUrl: (url) => {
          if (new URL(url).hostname !== 'example.com') throw new Error('FILTERED');
        },
      }),
    ).rejects.toThrow('FILTERED');
    expect(hits - earlier).toBe(1);
    mode = 'slow';
    const controller = new AbortController();
    const work = f.policy.request('http://example.com', { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    await expect(work).rejects.toThrow('CANCELLED');
  } finally {
    await f.close();
  }
});
