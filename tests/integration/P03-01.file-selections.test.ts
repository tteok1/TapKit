import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, symlink, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { FileSelections } from '../../packages/core/src/file-selections';
import { FILE_LIMITS, FileSelectionSchema } from '../../packages/contracts/src';
const managers: FileSelections[] = [];
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.close();
});
async function fixture(now?: () => number) {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-01 selected source '));
  const manager = new FileSelections(now);
  managers.push(manager);
  const put = async (name: string, bytes: string | Buffer = '中文原件') => {
    const path = join(root, name);
    await writeFile(path, bytes);
    return path;
  };
  return { root, manager, put };
}
test('P03-01 trusted selection exposes opaque window-bound tokens and reads the pinned original once', async () => {
  const { manager, put } = await fixture(),
    path = await put('原件.TXT');
  const before = await readFile(path),
    [selected] = await manager.select('1', [path]);
  expect(FileSelectionSchema.parse(selected)).toMatchObject({ name: '原件.TXT', extension: 'txt' });
  expect(JSON.stringify(selected)).not.toContain(path);
  await expect(
    manager.take('2', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  const result = await manager.take('1', selected!.token, new AbortController().signal);
  expect(result.bytes).toEqual(before);
  expect(result.sha256).toBe(createHash('sha256').update(before).digest('hex'));
  expect(await readFile(path)).toEqual(before);
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});
test('P03-01 selection rejects source changes, expired grants, closed windows and concurrent token reuse', async () => {
  let now = 1000;
  const { manager, put } = await fixture(() => now),
    path = await put('changes.txt');
  let [selected] = await manager.select('1', [path]);
  await writeFile(path, 'source changed');
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  [selected] = await manager.select('1', [path]);
  now += 300001;
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  [selected] = await manager.select('1', [path]);
  const first = manager.take('1', selected!.token, new AbortController().signal);
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await first;
  [selected] = await manager.select('1', [path]);
  await manager.closeWindow('1');
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(manager.select('1', [path])).rejects.toMatchObject({ code: 'CANCELLED' });
});
test('P03-01 folder selection preserves Chinese relative directories and rejects oversized folders atomically', async () => {
  const { root, manager, put } = await fixture();
  await put('根.TXT');
  await mkdir(join(root, '中文子目录'));
  await writeFile(join(root, '中文子目录', '资料.MD'), '# 原件');
  const selected = await manager.select('1', [root], true);
  expect(selected.map((s) => s.relativePath)).toEqual(
    expect.arrayContaining([
      `${root.split(/[\\/]/).at(-1)}/中文子目录/资料.MD`,
      `${root.split(/[\\/]/).at(-1)}/根.TXT`,
    ]),
  );
  for (let i = 0; i < 19; i++) await put(`${i}.txt`);
  await expect(manager.select('2', [root], true)).rejects.toMatchObject({
    code: 'OUTPUT_LIMIT_REACHED',
  });
  // A failed folder selection must not spend the receiving window's quota.
  expect(await manager.select('2', [join(root, '根.TXT')])).toHaveLength(1);
});
test('P03-01 junctions through selected parents cannot broaden a Host selection', async () => {
  const { root, manager, put } = await fixture(),
    path = await put('inside.txt');
  const junction = `${root}-junction`;
  await symlink(root, junction, 'junction');
  await expect(manager.select('1', [join(junction, 'inside.txt')])).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
  });
  await expect(manager.select('1', [junction], true)).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
  });
  expect(await readFile(path, 'utf8')).toBe('中文原件');
});
test('P03-01 cancelled partial reads leave sources unchanged and consume the original grant', async () => {
  const { manager, put } = await fixture(),
    bytes = Buffer.alloc(600000, 9);
  const path = await put('large.txt', bytes),
    [selected] = await manager.select('1', [path]);
  const controller = new AbortController(),
    progress: number[] = [];
  await expect(
    manager.take('1', selected!.token, controller.signal, (count) => {
      progress.push(count);
      controller.abort();
    }),
  ).rejects.toThrow();
  expect(progress).toEqual([256 * 1024]);
  expect(await readFile(path)).toEqual(bytes);
  await expect(
    manager.take('1', selected!.token, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});
test('P03-01 invalid selections and over-100-MiB files never publish partial grants', async () => {
  const { manager, put } = await fixture(),
    path = await put('valid.txt');
  await expect(manager.select('1', [path, path])).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  });
  const large = await put('over-limit.txt'),
    handle = await open(large, 'r+');
  try {
    await handle.truncate(FILE_LIMITS.maxFileBytes + 1);
  } finally {
    await handle.close();
  }
  await expect(manager.select('1', [path, large])).rejects.toMatchObject({
    code: 'FILE_TOO_LARGE',
  });
  const paths = [path];
  for (let i = 0; i < 19; i++) paths.push(await put(`${i}.txt`));
  expect(await manager.select('1', paths)).toHaveLength(20);
  await expect(manager.select('1', [path])).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
});
