import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, basename } from 'node:path';
import { FileNameSchema } from '@tapkit/contracts';
import { StorageError } from '@tapkit/storage';
async function parent(path: string) {
  const directory = dirname(path),
    meta = await lstat(directory);
  if (
    !meta.isDirectory() ||
    meta.isSymbolicLink() ||
    (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
  )
    throw new StorageError('PERMISSION_DENIED');
}
export async function writeExportTarget(
  target: string,
  bytes: Buffer,
  signal: AbortSignal,
  validate: () => void,
  alive: () => void = () => signal.throwIfAborted(),
) {
  if (!isAbsolute(target)) throw new StorageError('VALIDATION_ERROR');
  const path = resolve(target);
  FileNameSchema.parse(basename(path));
  await parent(path);
  validate();
  signal.throwIfAborted();
  const handle = await open(path, 'wx').catch((error: NodeJS.ErrnoException) => {
    throw new StorageError(
      error.code === 'EEXIST'
        ? 'CONFLICT'
        : error.code === 'ENOSPC'
          ? 'DISK_FULL'
          : 'PERMISSION_DENIED',
    );
  });
  let owned: { dev: number; ino: number } | undefined,
    committed = false;
  try {
    owned = await handle.stat();
    await parent(path);
    if ((await realpath(path)).toLowerCase() !== path.toLowerCase())
      throw new StorageError('PERMISSION_DENIED');
    for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
      alive();
      await handle.writeFile(bytes.subarray(offset, offset + 256 * 1024));
    }
    await handle.sync();
    validate();
    signal.throwIfAborted();
    committed = true;
  } catch (error) {
    if (['ENOSPC', 'EDQUOT'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw new StorageError('DISK_FULL');
    throw error;
  } finally {
    await handle.close().catch(() => {
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    });
    if (!committed) {
      if (!owned) throw new StorageError('SIDE_EFFECT_UNKNOWN');
      try {
        await parent(path);
        const current = await lstat(path).catch(() => undefined);
        if (
          !current ||
          current.isSymbolicLink() ||
          current.dev !== owned.dev ||
          current.ino !== owned.ino
        )
          throw new StorageError('SIDE_EFFECT_UNKNOWN');
        await unlink(path);
      } catch {
        throw new StorageError('SIDE_EFFECT_UNKNOWN');
      }
    }
  }
}
