import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { BlobStore, FileRepository, openStore, type Store } from '../../packages/storage/src';
import { FileExporter } from '../../packages/core/src/file-exporter';
const fixtures: { exporter: FileExporter; store: Store }[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    await f.exporter.stop();
    f.store.close();
  }
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-01 original download '));
  const store = await openStore(join(root, 'managed')),
    blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  const bytes = Buffer.alloc(700000, 13),
    blob = await blobs.put(bytes);
  const file = files.importBlob({
    blobId: blob.id,
    name: '失败原件.txt',
    relativePath: '失败原件.txt',
    owner: { type: 'library' },
  }).file;
  const exporter = new FileExporter(files);
  fixtures.push({ exporter, store });
  return { root, blobs, files, file, bytes, exporter, store };
}
test('P03-01 private original download succeeds even after parse failure and writes identical bytes without exposing paths', async () => {
  const f = await fixture(),
    path = join(f.root, '下载原件.txt');
  f.store.db
    .prepare(
      "UPDATE file_versions SET parse_status='failed',error_code='PARSE_FAILED',error_reason='CORRUPT_FILE' WHERE id=?",
    )
    .run(f.file.currentVersionId);
  expect(await f.exporter.export('1', { fileId: f.file.id }, path)).toBe(f.file.id);
  expect(await readFile(path)).toEqual(f.bytes);
  expect(
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
  ).toBe(f.file.version.sha256);
  expect(await f.blobs.readVersion(f.file.currentVersionId)).toEqual(f.bytes);
});
test('P03-01 saving an original never truncates an existing user file or a managed blob', async () => {
  const f = await fixture(),
    path = join(f.root, '已有.txt');
  await writeFile(path, '用户已有内容');
  await expect(f.exporter.export('1', { fileId: f.file.id }, path)).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await readFile(path, 'utf8')).toBe('用户已有内容');
  const key = f.store.db
    .prepare('SELECT relative_key FROM blobs WHERE sha256=?')
    .get(f.file.version.sha256) as { relative_key: string };
  await expect(
    f.exporter.export('1', { fileId: f.file.id }, join(f.store.dataDir, key.relative_key)),
  ).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await f.blobs.readVersion(f.file.currentVersionId)).toEqual(f.bytes);
});
test('P03-01 invalid scope and junction save parents never create an output', async () => {
  const f = await fixture(),
    path = join(f.root, '不应生成.txt');
  await expect(
    f.exporter.export('1', { fileId: f.file.id, owner: { type: 'project', id: f.file.id } }, path),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  const link = `${f.root}-junction`;
  await symlink(f.root, link, 'junction');
  await expect(
    f.exporter.export('1', { fileId: f.file.id }, join(link, '越界.txt')),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(readFile(join(f.root, '越界.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test('P03-01 original read rechecks a concurrent trash and old-version downloads remain pinned', async () => {
  const f = await fixture(),
    replacement = await f.blobs.put(Buffer.from('新版'));
  f.files.importBlob({
    blobId: replacement.id,
    name: '新版.txt',
    relativePath: '新版.txt',
    owner: { type: 'library' },
    replaceId: f.file.id,
  });
  const old = join(f.root, '旧版.txt');
  await f.exporter.export('1', { fileId: f.file.id, versionId: f.file.currentVersionId }, old);
  expect(await readFile(old)).toEqual(f.bytes);
  const read = f.blobs.readVersion.bind(f.blobs);
  vi.spyOn(f.blobs, 'readVersion').mockImplementation(async (id) => {
    const bytes = await read(id);
    f.files.trash([f.file.id]);
    return bytes;
  });
  const denied = join(f.root, '权限已撤回.txt');
  await expect(f.exporter.export('1', { fileId: f.file.id }, denied)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(readFile(denied)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('P03-01 cancellation during an original read and revoked access after output sync do not leave partial exports', async () => {
  const f = await fixture(),
    original = f.files.original.bind(f.files);
  vi.spyOn(f.files, 'original').mockImplementation(async (...args) => {
    const source = await original(...args);
    f.exporter.closeWindow('1');
    return source;
  });
  const cancelled = join(f.root, '已取消.txt');
  await expect(f.exporter.export('1', { fileId: f.file.id }, cancelled)).rejects.toMatchObject({
    code: 'CANCELLED',
  });
  await expect(readFile(cancelled)).rejects.toMatchObject({ code: 'ENOENT' });
  vi.restoreAllMocks();
  const get = f.files.get.bind(f.files);
  let reads = 0;
  vi.spyOn(f.files, 'get').mockImplementation((...args) => {
    if (++reads === 3) f.files.trash([f.file.id]);
    return get(...args);
  });
  const revoked = join(f.root, '输出期间撤权.txt');
  await expect(f.exporter.export('1', { fileId: f.file.id }, revoked)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(readFile(revoked)).rejects.toMatchObject({ code: 'ENOENT' });
  f.files.restore([f.file.id]);
  expect(await f.blobs.readVersion(f.file.currentVersionId)).toEqual(f.bytes);
});
