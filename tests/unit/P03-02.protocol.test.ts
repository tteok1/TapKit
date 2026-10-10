import { expect, test, vi } from 'vitest';
import { ArtifactProtocol } from '../../apps/desktop/src/main/artifact-protocol';
import { ArtifactCommandSchemas, CoreCommandSchema } from '../../packages/contracts/src';
const fileId = '0195abc0-0000-7000-8000-000000000001',
  versionId = '0195abc0-0000-7000-8000-000000000002';
test('P03-02 asset capabilities are bound to their window handler, reject paths/POST and disappear on close', async () => {
  const load = vi.fn(async () => ({
    mime: 'application/pdf',
    base64: Buffer.from('%PDF-1.7 immutable').toString('base64'),
  }));
  const a = new ArtifactProtocol(load, () => true),
    b = new ArtifactProtocol(load, () => true);
  const url = a.grant({ fileId, versionId, kind: 'original' });
  expect((await b.handle(new Request(url))).status).toBe(403);
  expect((await a.handle(new Request(url + '?path=C:/private'))).status).toBe(403);
  expect((await a.handle(new Request(url, { method: 'POST' }))).status).toBe(403);
  expect(
    (await a.handle(new Request(url, { headers: { Origin: 'https://untrusted.example' } }))).status,
  ).toBe(403);
  const cors = await a.handle(new Request(url, { headers: { Origin: 'file://' } }));
  expect(cors.headers.get('Access-Control-Allow-Origin')).toBe('file://');
  const ok = await a.handle(new Request(url));
  expect(await ok.text()).toBe('%PDF-1.7 immutable');
  expect(ok.headers.get('Cache-Control')).toBe('no-store');
  expect(ok.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  expect(load).toHaveBeenCalledTimes(2);
  a.close();
  expect((await a.handle(new Request(url))).status).toBe(403);
});
test('P03-02 protocol rejects deletion during I/O and any executable response MIME', async () => {
  let close = () => {};
  const handler = new ArtifactProtocol(
    async () => {
      close();
      return { mime: 'image/png', base64: '' };
    },
    () => true,
  );
  close = () => handler.close();
  const url = handler.grant({ fileId, versionId, kind: 'original' });
  expect((await handler.handle(new Request(url))).status).toBe(403);
  const html = new ArtifactProtocol(
    async () => ({
      mime: 'text/html',
      base64: Buffer.from('<script>bad()</script>').toString('base64'),
    }),
    () => true,
  );
  expect(
    (await html.handle(new Request(html.grant({ fileId, versionId, kind: 'original' })))).status,
  ).toBe(403);
});
test('P03-02 DTOs reject absolute paths, missing fixed versions, traversal and annotation rectangles beyond page bounds', () => {
  expect(
    ArtifactCommandSchemas['artifacts.open'].safeParse({ fileId, path: 'C:/secret' }).success,
  ).toBe(false);
  expect(
    ArtifactCommandSchemas['artifacts.selection'].safeParse({
      fileId,
      locator: { kind: 'pdf', pageIndex: 0 },
    }).success,
  ).toBe(false);
  expect(
    ArtifactCommandSchemas['annotations.upsert'].safeParse({
      fileVersionId: versionId,
      selectedTextHash: '0'.repeat(64),
      locator: { kind: 'pdf', pageIndex: 0, rects: [{ x: 0.9, y: 0, width: 0.2, height: 0.2 }] },
    }).success,
  ).toBe(false);
  expect(
    CoreCommandSchema.safeParse({
      type: 'artifacts.read',
      id: crypto.randomUUID(),
      requestId: fileId,
      windowId: '0',
      asset: { fileId, versionId, kind: 'original', path: '../secret' },
    }).success,
  ).toBe(false);
});
