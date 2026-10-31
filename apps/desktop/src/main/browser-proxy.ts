import { createServer, request, Agent } from 'node:http';
import type { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { NetworkPolicyService, pinnedSocket, WEB_BYTE_LIMIT } from '@tapkit/network';

/** Both HTTP and CONNECT connect to an independently validated, pinned public address. */
export async function browserProxy(proxyURL: string) {
  const controller = new AbortController();
  const policy = new NetworkPolicyService();
  const sockets = new Set<Socket>();
  const authorization =
    'Basic ' + Buffer.from('tapkit:' + randomBytes(32).toString('hex')).toString('base64');
  let bytes = 0;
  const meter = (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > WEB_BYTE_LIMIT * 4) controller.abort();
  };
  const server = createServer((incoming, response) => {
    if (incoming.headers['proxy-authorization'] !== authorization) {
      response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="TapKit"' }).end();
      incoming.resume();
      return;
    }
    void (async () => {
      const destination = await policy.destination(incoming.url ?? '', controller.signal);
      if (destination.url.protocol !== 'http:') throw Error('PERMISSION_DENIED');
      const socket = await pinnedSocket(destination, proxyURL, controller.signal);
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('data', meter);
      const agent = new Agent({ keepAlive: false });
      agent.createConnection = () => socket;
      const headers: Record<string, string | string[] | undefined> = {
        ...incoming.headers,
        host: destination.url.host,
      };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const forward = request(
        {
          hostname: destination.host,
          port: Number(destination.url.port || 80),
          path: destination.url.pathname + destination.url.search,
          method: incoming.method,
          headers,
          agent,
          signal: controller.signal,
        },
        (reply) => {
          response.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(response);
        },
      );
      forward.on('error', () => response.destroy());
      incoming.pipe(forward);
    })().catch(() => response.destroy());
  });
  server.on('connect', (incoming, client, head) => {
    const socket = client as Socket;
    if (incoming.headers['proxy-authorization'] !== authorization) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="TapKit"\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    void (async () => {
      const destination = await policy.destination('https://' + incoming.url, controller.signal);
      if (destination.url.port && destination.url.port !== '443') throw Error('PERMISSION_DENIED');
      const remote = await pinnedSocket(destination, proxyURL, controller.signal);
      sockets.add(socket);
      sockets.add(remote);
      remote.on('data', meter);
      remote.on('error', () => socket.destroy());
      socket.on('error', () => remote.destroy());
      socket.on('close', () => {
        remote.destroy();
        sockets.delete(remote);
        sockets.delete(socket);
      });
      const begin = () => {
        if (socket.destroyed || controller.signal.aborted) {
          remote.destroy();
          return;
        }
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        socket.pipe(remote).pipe(socket);
      };
      if (remote.connecting) remote.once('connect', begin);
      else begin();
    })().catch(() => socket.destroy());
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  const close = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  controller.signal.addEventListener('abort', close, { once: true });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('NETWORK_ERROR');
  return {
    port: address.port,
    authorization,
    close: () => {
      controller.abort();
      close();
    },
  };
}
