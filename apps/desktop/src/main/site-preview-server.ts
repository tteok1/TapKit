import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { CodePathSchema, type SiteTransferSchema, type z } from '@tapkit/contracts';

const mime = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  }),
);
type Asset = Extract<z.infer<typeof SiteTransferSchema>, { kind: 'assets' }>['entries'][number];
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export async function serveSite(entries: Asset[]) {
  const files = new Map<string, { body: Buffer; type: string }>();
  let total = 0;
  for (const { path, base64 } of entries) {
    const type = mime.get(extname(path).toLowerCase());
    if (!type || !CodePathSchema.safeParse(path).success || files.has(path))
      throw Error('PERMISSION_DENIED');
    const body = Buffer.from(base64, 'base64');
    total += body.length;
    if (total > 8 * 1024 ** 2) throw Error('OUTPUT_LIMIT_REACHED');
    files.set(path, { body, type });
  }
  if (!files.has('index.html')) throw Error('NOT_FOUND');
  const prefix = '/' + randomBytes(32).toString('hex') + '/';
  let host = '';
  function entry(target: string) {
    const raw = target.split('?', 1)[0]!;
    if (!raw.startsWith(prefix) || /%(?:2f|5c|00)/i.test(raw)) return;
    try {
      const path = decodeURIComponent(raw.slice(prefix.length)) || 'index.html';
      if (CodePathSchema.safeParse(path).success) return files.get(path);
    } catch {
      return;
    }
  }
  const server = createServer(
    { requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 1000 },
    (req, res) => {
      const file =
        req.headers.host === host &&
        ['GET', 'HEAD'].includes(req.method ?? '') &&
        entry(req.url ?? '');
      if (!file) {
        res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      res
        .writeHead(200, {
          'Content-Type': file.type,
          'Content-Length': file.body.length,
          'Content-Security-Policy': csp,
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Referrer-Policy': 'no-referrer',
          'X-DNS-Prefetch-Control': 'off',
          'Cache-Control': 'no-store',
        })
        .end(req.method === 'HEAD' ? undefined : file.body);
    },
  );
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('connect', (_req, socket) => socket.destroy());
  server.maxConnections = 24;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw Error('INTERNAL_ERROR');
  }
  host = '127.0.0.1:' + address.port;
  const origin = 'http://' + host;
  return {
    origin,
    host,
    url: origin + prefix,
    allows(target: string, document = false) {
      if (!target.startsWith(origin + prefix)) return false;
      const file = entry(target.slice(origin.length).split('#', 1)[0]!);
      return !!file && (!document || file.type.startsWith('text/html'));
    },
    close() {
      server.close();
      server.closeAllConnections();
      files.clear();
    },
  };
}
