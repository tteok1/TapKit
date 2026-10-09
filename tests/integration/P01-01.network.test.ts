import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { configureProviderNetwork } from '../../packages/providers/src';

describe('P01-01 Node provider proxy routing', () => {
  it('routes native fetch through the explicit local HTTP proxy without target DNS or external traffic', async () => {
    const paths: string[] = [];
    const proxy = createServer((request, response) => {
      paths.push(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      response.end('{"fixture":"proxy"}');
    });
    proxy.on('connect', (request, socket) => {
      paths.push('CONNECT ' + request.url);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        if (!buffer.includes('\r\n\r\n')) return;
        paths.push(buffer.split('\r\n')[0]!);
        const body = '{"fixture":"proxy"}';
        socket.end(
          'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' +
            Buffer.byteLength(body) +
            '\r\nConnection: close\r\n\r\n' +
            body,
        );
      });
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Proxy address missing');
    const restore = configureProviderNetwork({
      TAPKIT_HTTP_PROXY: 'http://127.0.0.1:' + address.port,
      NO_PROXY: '',
    });
    try {
      const response = await fetch('http://tapkit-proxy-fixture.invalid/probe', {
        signal: AbortSignal.timeout(3000),
      });
      expect(await response.json()).toEqual({ fixture: 'proxy' });
      expect(paths).toEqual(['CONNECT tapkit-proxy-fixture.invalid:80', 'GET /probe HTTP/1.1']);
    } finally {
      restore();
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it.each([
    'socks5://127.0.0.1:7688',
    'invalid-private-proxy-secret',
    'http://127.0.0.1:7688/private-token',
  ])('rejects unsupported proxy configuration without exposing it', (address) => {
    expect(() => configureProviderNetwork({ TAPKIT_HTTP_PROXY: address })).toThrow('NETWORK_ERROR');
  });
});
