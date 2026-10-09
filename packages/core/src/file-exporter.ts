import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, basename } from 'node:path';
import { FileGetSchema, FileNameSchema, type z } from '@tapkit/contracts';
import { FileRepository, StorageError } from '@tapkit/storage';
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
/** Only a private Host save-dialog selection can call this writer. */
export class FileExporter {
  private readonly active = new Map<AbortController, string>();
  private readonly work = new Set<Promise<string>>();
  private stopped = false;
  constructor(private readonly files: FileRepository) {}
  export(windowId: string, file: z.infer<typeof FileGetSchema>, targetPath: string) {
    if (this.stopped) return Promise.reject(new StorageError('CANCELLED'));
    if (this.active.size >= 2) return Promise.reject(new StorageError('QUOTA_EXHAUSTED'));
    const controller = new AbortController();
    this.active.set(controller, windowId);
    const timer = setTimeout(() => controller.abort(), 120000);
    timer.unref();
    const promise = this.write(file, targetPath, controller.signal).catch((error) => {
      if (
        controller.signal.aborted &&
        !(error instanceof StorageError && error.code === 'SIDE_EFFECT_UNKNOWN')
      )
        throw new StorageError('CANCELLED');
      throw error;
    });
    this.work.add(promise);
    void promise
      .finally(() => {
        this.active.delete(controller);
        this.work.delete(promise);
        clearTimeout(timer);
      })
      .catch(() => {});
    return promise;
  }
  private async write(raw: z.infer<typeof FileGetSchema>, targetPath: string, signal: AbortSignal) {
    const p = FileGetSchema.parse(raw);
    if (!isAbsolute(targetPath)) throw new StorageError('VALIDATION_ERROR');
    const path = resolve(targetPath);
    FileNameSchema.parse(basename(path));
    await parent(path);
    const source = await this.files.original(p.fileId, {
      ...(p.versionId ? { versionId: p.versionId } : {}),
      ...(p.owner ? { owner: p.owner } : {}),
    });
    signal.throwIfAborted();
    // Never truncate an existing user file, link or managed original.
    const handle = await open(path, 'wx');
    let owned: { dev: number; ino: number } | undefined;
    let committed = false;
    try {
      owned = await handle.stat();
      await parent(path);
      if ((await realpath(path)).toLowerCase() !== path.toLowerCase())
        throw new StorageError('PERMISSION_DENIED');
      for (let offset = 0; offset < source.bytes.length; offset += 256 * 1024) {
        signal.throwIfAborted();
        await handle.writeFile(source.bytes.subarray(offset, offset + 256 * 1024));
      }
      await handle.sync();
      signal.throwIfAborted();
      // Source authorization is checked again after all asynchronous output I/O.
      this.files.get(source.file.id, {
        versionId: source.file.version.id,
        ...(p.owner ? { owner: p.owner } : {}),
      });
      signal.throwIfAborted();
      committed = true;
      return source.file.id;
    } finally {
      await handle.close();
      if (!committed) {
        try {
          await parent(path);
          const current = await lstat(path);
          if (
            !owned ||
            !current.isFile() ||
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
  closeWindow(windowId: string) {
    for (const [controller, window] of this.active) if (window === windowId) controller.abort();
  }
  async stop() {
    this.stopped = true;
    for (const controller of this.active.keys()) controller.abort();
    await Promise.allSettled([...this.work]);
  }
}
