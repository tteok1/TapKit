import { test, expect } from 'vitest';
import { mkdir, mkdtemp, readdir, writeFile, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PreviewStaging } from '../../packages/core/src/preview-staging';
import type { Store } from '../../packages/storage/src';
const profileId = '0195abc0-0000-7000-8000-000000000001',
  versionId = '0195abc0-0000-7000-8000-000000000002';
test('P03-02 conversion cleanup retains active and unknown trees, recovers only owned marked stale directories', async () => {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-02 staging ')),
    store = { dataDir: root, profileId } as Store;
  const service = new PreviewStaging(store),
    active = await service.create(versionId);
  await mkdir(join(active, 'workspace'));
  await writeFile(join(active, 'workspace', 'page.pdf'), '%PDF-1.7');
  await mkdir(join(service.base, 'unknown'));
  expect(await service.sweep()).toEqual({ removed: 0, retained: 1 });
  const restarted = new PreviewStaging(store);
  expect(await restarted.sweep()).toEqual({ removed: 1, retained: 1 });
  expect(await readdir(service.base)).toEqual(['unknown']);
});
test('P03-02 private staging rejects a junction before writing into its external target', async () => {
  const root = await mkdtemp(resolve('.test-data', 'P03-02 staging junction ')),
    outside = await mkdtemp(resolve('.test-data', 'P03-02 staging outside '));
  await symlink(outside, join(root, 'tmp'), 'junction');
  const service = new PreviewStaging({ dataDir: root, profileId } as Store);
  await expect(service.create(versionId)).rejects.toThrow('PERMISSION_DENIED');
  expect(await readdir(outside)).toEqual([]);
});
