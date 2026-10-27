import { lookup } from 'node:dns/promises';
import { isIP, connect, type Socket } from 'node:net';
import { connect as tlsConnect, checkServerIdentity } from 'node:tls';
import { request as httpRequest, Agent as HttpAgent } from 'node:http';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';

export const WEB_BYTE_LIMIT = 50 * 1024 * 1024;
export class NetworkFailure extends Error {}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    let canonical: string;
    try {
      canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
    } catch {
      return false;
    }
    const parts = canonical.split(':');
    const first = parseInt(parts[0]!, 16),
      second = parseInt(parts[1] || '0', 16);
    return (
      first >= 0x2000 &&
      first < 0x4000 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
      first !== 0x2002 &&
      !(first === 0x3fff && second < 0x1000)
    );
  }
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
export function publicUrl(value: string, allowOtherPorts = false): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NetworkFailure('VALIDATION_ERROR');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!allowOtherPorts && url.port && !['80', '443'].includes(url.port)) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (isIP(host) && !publicAddress(host))
  )
    throw new NetworkFailure('PERMISSION_DENIED');
  url.hash = '';
  return url;
}
type Address = { address: string; family: number };
export async function pinnedSocket(
  destination: { address: Address; host: string; url: URL },
  proxy: string,
  signal: AbortSignal,
): Promise<Socket> {
  signal.throwIfAborted();
  if (!proxy)
    return new Promise((resolve, reject) => {
      const socket = connect({
        host: destination.address.address,
        port: Number(destination.url.port || (destination.url.protocol === 'https:' ? 443 : 80)),
        signal,
      });
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
    });
  const upstream = new URL(proxy);
  if (
    !['http:', 'https:'].includes(upstream.protocol) ||
    upstream.pathname !== '/' ||
    upstream.search ||
    upstream.hash
  )
    throw new NetworkFailure('PERMISSION_DENIED');
  return new Promise((resolve, reject) => {
    const target =
      (destination.address.family === 6
        ? '[' + destination.address.address + ']'
        : destination.address.address) +
      ':' +
      (destination.url.port || (destination.url.protocol === 'https:' ? 443 : 80));
    const req = (upstream.protocol === 'https:' ? httpsRequest : httpRequest)({
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: target,
      agent: false,
      signal,
      headers: {
        Host: target,
        ...(upstream.username
          ? {
              'Proxy-Authorization':
                'Basic ' +
                Buffer.from(
                  decodeURIComponent(upstream.username) +
                    ':' +
                    decodeURIComponent(upstream.password),
                ).toString('base64'),
            }
          : {}),
      },
    });
    req.once('connect', (res, socket, head) => {
      if (res.statusCode !== 200 || head.length) {
        socket.destroy();
        reject(new NetworkFailure('NETWORK_ERROR'));
      } else {
        const abort = () => socket.destroy(new NetworkFailure('CANCELLED'));
        signal.addEventListener('abort', abort, { once: true });
        socket.once('close', () => signal.removeEventListener('abort', abort));
        resolve(socket);
      }
    });
    req.once('response', (res) => {
      res.destroy();
      reject(new NetworkFailure('NETWORK_ERROR'));
    });
    req.once('error', reject);
    req.end();
  });
}
export type WireReply = {
  url: string;
  status: number;
  headers: Record<string, string>;
  bytes: Buffer;
};
export type PolicyDependencies = {
  resolve?: (host: string) => Promise<Address[]>;
  proxy?: (url: URL, signal: AbortSignal) => Promise<string>;
};
/** Each connection uses an explicitly validated address, including CONNECT targets. */
export class NetworkPolicyService {
  constructor(readonly deps: PolicyDependencies = {}) {}
  async destination(value: string, signal: AbortSignal, kind: 'web' | 'model' = 'web') {
    signal.throwIfAborted();
    const url = publicUrl(value, kind === 'model'),
      host = url.hostname.replace(/^\[|\]$/g, '');
    let abort: (() => void) | undefined;
    let addresses: Address[];
    try {
      addresses = await Promise.race([
        (this.deps.resolve ?? ((h) => lookup(h, { all: true, verbatim: true })))(host),
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(new NetworkFailure('CANCELLED'));
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        }),
      ]);
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
    }
    signal.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new NetworkFailure('PERMISSION_DENIED');
    return { url, host, address: addresses[0]! };
  }
  async request(
    value: string,
    options: {
      signal?: AbortSignal;
      json?: unknown;
      limit?: number;
      allowUrl?: (url: string) => void;
      followRedirects?: boolean;
    } = {},
  ): Promise<WireReply> {
    const signal = AbortSignal.any([
      AbortSignal.timeout(30_000),
      ...(options.signal ? [options.signal] : []),
    ]);
    let current = value;
    for (let redirect = 0; redirect <= 5; redirect++) {
      options.allowUrl?.(current);
      const dest = await this.destination(current, signal);
      if ('bearer' in options) throw new NetworkFailure('PERMISSION_DENIED');
      const proxy = (await this.deps.proxy?.(dest.url, signal)) ?? '';
      signal.throwIfAborted();
      const reply = await this.wire(dest, proxy, options, signal);
      if (options.followRedirects === false) return reply;
      if ([301, 302, 303, 307, 308].includes(reply.status)) {
        if (redirect === 5 || options.json !== undefined || !reply.headers.location)
          throw new NetworkFailure('PERMISSION_DENIED');
        current = new URL(reply.headers.location, dest.url).href;
        continue;
      }
      return reply;
    }
    throw new NetworkFailure('NETWORK_ERROR');
  }
  private wire(
    dest: Awaited<ReturnType<NetworkPolicyService['destination']>>,
    proxy: string,
    options: { json?: unknown; limit?: number },
    signal: AbortSignal,
  ): Promise<WireReply> {
    const secure = dest.url.protocol === 'https:';
    const agent = secure ? new HttpsAgent() : new HttpAgent();
    agent.createConnection = (_options, callback) => {
      void pinnedSocket(dest, proxy, signal).then(
        (socket) => {
          if (!secure) {
            callback?.(null, socket);
            return;
          }
          const tls = tlsConnect({
            socket,
            servername: dest.host,
            rejectUnauthorized: true,
            checkServerIdentity: (_name, cert) => checkServerIdentity(dest.host, cert),
          });
          tls.once('secureConnect', () => callback?.(null, tls));
          tls.once('error', (error) => {
            socket.destroy();
            callback?.(error, undefined!);
          });
        },
        (error: Error) => callback?.(error, undefined!),
      );
      return undefined;
    };
    const limit = Math.min(options.limit ?? WEB_BYTE_LIMIT, WEB_BYTE_LIMIT);
    return new Promise((resolve, reject) => {
      const req = (secure ? httpsRequest : httpRequest)(
        {
          hostname: dest.host,
          port: dest.url.port || (secure ? 443 : 80),
          servername: dest.host,
          path: dest.url.pathname + dest.url.search,
          method: options.json === undefined ? 'GET' : 'POST',
          agent,
          signal,
          headers: {
            Host: dest.url.host,
            Accept: options.json === undefined ? 'text/html,text/plain' : 'application/json',
            'Accept-Encoding': 'identity',
            'User-Agent': 'TapKit/0.1 (anonymous reader)',
            ...(options.json === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
        },
        (res) => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(',') : value;
          let size = 0;
          const parts: Buffer[] = [];
          const failed = (code: string) => {
            agent.destroy();
            res.destroy();
            reject(new NetworkFailure(code));
          };
          if (Number(headers['content-length']) > limit) {
            failed('FILE_TOO_LARGE');
            return;
          }
          if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') {
            failed('FORMAT_UNSUPPORTED');
            return;
          }
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) failed('FILE_TOO_LARGE');
            else parts.push(chunk);
          });
          res.on('end', () => {
            agent.destroy();
            resolve({
              url: dest.url.href,
              status: res.statusCode ?? 0,
              headers,
              bytes: Buffer.concat(parts),
            });
          });
          res.on('error', () => {
            agent.destroy();
            reject(new NetworkFailure(signal.aborted ? 'CANCELLED' : 'NETWORK_ERROR'));
          });
        },
      );
      req.on('error', () => {
        agent.destroy();
        reject(new NetworkFailure(signal.aborted ? 'CANCELLED' : 'NETWORK_ERROR'));
      });
      req.end(options.json === undefined ? undefined : JSON.stringify(options.json));
    });
  }
}
