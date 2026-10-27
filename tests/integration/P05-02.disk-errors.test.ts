import { test, expect, vi } from 'vitest';
import { mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const fault = vi.hoisted(() => ({ phase: 'write' as 'write' | 'sync' }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (!String(args[0]).endsWith('-fault.txt')) return handle;
      let writes = 0;
      const full = () => Object.assign(new Error('synthetic disk full'), { code: 'ENOSPC' });
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'writeFile')
            return async (...data: Parameters<typeof handle.writeFile>) => {
              if (fault.phase === 'write' && ++writes > 1) throw full();
              return handle.writeFile(...data);
            };
          if (key === 'sync' && fault.phase === 'sync')
            return async () => {
              throw full();
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});
import { writeExportTarget } from '../../packages/core/src/export-target';
test('P05-02 T20 ENOSPC during real partial writes or fsync reports DISK_FULL and removes only the owned incomplete copy', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-02 disk synthetic '));
  for (const phase of ['write', 'sync'] as const) {
    fault.phase = phase;
    const path = join(dir, phase + '-fault.txt');
    await expect(
      writeExportTarget(path, Buffer.alloc(800000), new AbortController().signal, () => {}),
    ).rejects.toThrow('DISK_FULL');
    await expect(lstat(path)).rejects.toThrow();
  }
});
