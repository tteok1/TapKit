import { randomBytes } from 'node:crypto';
import { ArtifactAssetSchema, type z } from '@tapkit/contracts';

type Asset = z.infer<typeof ArtifactAssetSchema>;
/** Each instance is registered only in its owning window's isolated Chromium session. */
export class ArtifactProtocol {
  private readonly grants = new Map<string, Asset>();
  private closed = false;
  constructor(
    private readonly load: (asset: Asset) => Promise<{ mime: string; base64: string }>,
    private readonly alive: () => boolean,
    private readonly allowedOrigin = 'file://',
  ) {}
  grant(raw: unknown) {
    if (this.closed || !this.alive()) throw new Error('PERMISSION_DENIED');
    const asset = ArtifactAssetSchema.parse(raw);
    const token = randomBytes(32).toString('hex');
    while (this.grants.size >= 256) this.grants.delete(this.grants.keys().next().value!);
    this.grants.set(token, asset);
    return 'tapkit-artifact://asset/' + token;
  }
  close() {
    this.closed = true;
    this.grants.clear();
  }
  async handle(request: Request): Promise<Response> {
    try {
      if (this.closed || !this.alive() || request.method !== 'GET')
        return new Response(null, { status: 403 });
      const origin = request.headers.get('Origin');
      if (
        origin &&
        origin !== this.allowedOrigin &&
        !(this.allowedOrigin === 'file://' && origin === 'null')
      )
        return new Response(null, { status: 403 });
      const url = new URL(request.url);
      if (
        url.protocol !== 'tapkit-artifact:' ||
        url.hostname !== 'asset' ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        !/^\/[a-f0-9]{64}$/.test(url.pathname)
      )
        return new Response(null, { status: 403 });
      const asset = this.grants.get(url.pathname.slice(1));
      if (!asset) return new Response(null, { status: 403 });
      const value = await this.load(asset);
      if (this.closed || !this.alive() || this.grants.get(url.pathname.slice(1)) !== asset)
        return new Response(null, { status: 403 });
      if (
        ![
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif',
          'image/bmp',
          'image/avif',
          'image/svg+xml',
        ].includes(value.mime)
      )
        return new Response(null, { status: 403 });
      const bytes = Buffer.from(value.base64, 'base64');
      if (bytes.length > 100 * 1024 * 1024) return new Response(null, { status: 413 });
      return new Response(bytes, {
        headers: {
          'Content-Type': value.mime,
          'Content-Length': String(bytes.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': origin ?? this.allowedOrigin,
          Vary: 'Origin',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    } catch {
      return new Response(null, { status: 403 });
    }
  }
}
