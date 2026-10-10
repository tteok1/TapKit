import { test, expect, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ExternalArtifact,
  externalCopyExtension,
} from '../../apps/desktop/src/main/external-artifact';
import type { FileView } from '../../packages/contracts/src';
const access = {
  fileId: '0195abc0-0000-7000-8000-000000000001',
  versionId: '0195abc0-0000-7000-8000-000000000002',
};
test('P03-02 external opening uses a Host-owned text copy and rechecks the fixed version after I/O', async () => {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-02 external '));
  const metadata = vi.fn(async () => ({ version: { extension: 'js' } }) as FileView),
    open = vi.fn(async (path: string) => {
      expect(await readFile(path, 'utf8')).toBe('user source');
      expect(path).toMatch(/document\.txt$/);
      return '';
    });
  const service = new ExternalArtifact(
    root,
    metadata,
    async (a, path) => {
      expect(a).toEqual(access);
      await writeFile(path, 'user source', { flag: 'wx' });
    },
    open,
    () => true,
  );
  await service.open(access);
  expect(metadata).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenCalledTimes(1);
  expect(externalCopyExtension('ps1')).toBe('txt');
  expect(() => externalCopyExtension('exe')).toThrow('FORMAT_UNSUPPORTED');
  const children = await readdir(service.base);
  expect(children).toHaveLength(1);
  await service.recover(Date.now() + 86400001);
  expect(await readdir(service.base)).toEqual([]);
});
test('P03-02 external copy permission revocation cannot launch an app and only its known direct files are removed', async () => {
  const root = await mkdtemp(resolve('.test-data', 'P03-02 revoked external '));
  let reads = 0;
  const open = vi.fn(async () => ''),
    service = new ExternalArtifact(
      root,
      async () => {
        if (++reads > 1) throw new Error('PERMISSION_DENIED');
        return { version: { extension: 'pdf' } } as FileView;
      },
      async (_, path) => writeFile(path, '%PDF-1.7'),
      open,
      () => true,
    );
  await expect(service.open(access)).rejects.toThrow('PERMISSION_DENIED');
  expect(open).not.toHaveBeenCalled();
  expect(await readdir(service.base)).toEqual([]);
  await expect(service.open({ ...access, path: 'C:/outside' })).rejects.toThrow();
});
