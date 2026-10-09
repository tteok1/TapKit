import { lstat, open, realpath, opendir, type FileHandle } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  FILE_LIMITS,
  FileRelativePathSchema,
  FileSelectionSchema,
  type FileSelection,
} from '@tapkit/contracts';
import { newId, StorageError } from '@tapkit/storage';

const TTL_MS = 5 * 60_000;
type Selected = {
  view: FileSelection;
  windowId: string;
  path: string;
  handle: FileHandle;
  stat: Stats;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};
function identical(a: Stats, b: Stats) {
  return (
    a.isFile() &&
    b.isFile() &&
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
function checkWindow(windowId: string) {
  if (!/^[0-9]{1,8}$/.test(windowId)) throw new StorageError('VALIDATION_ERROR');
}
async function canonical(path: string, directory = false) {
  if (!isAbsolute(path)) throw new StorageError('VALIDATION_ERROR');
  const absolute = resolve(path),
    stat = await lstat(absolute);
  // Reject links, junctions and aliases through any parent. Host paths are never DTO fields.
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (await realpath(absolute)).toLowerCase() !== absolute.toLowerCase()
  )
    throw new StorageError('PERMISSION_DENIED');
  return { path: absolute, stat };
}

/** Private Core API: paths may only come from the trusted Host picker/drop handler. */
export class FileSelections {
  private readonly selected = new Map<string, Selected>();
  private readonly closedWindows = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  constructor(private readonly now = Date.now) {}

  select(windowId: string, paths: string[], folder = false): Promise<FileSelection[]> {
    const work = this.queue.then(() => this.selectTrusted(windowId, paths, folder));
    this.queue = work.catch(() => {});
    return work;
  }
  private async selectTrusted(windowId: string, paths: string[], folder: boolean) {
    checkWindow(windowId);
    if (this.disposed || this.closedWindows.has(windowId)) throw new StorageError('CANCELLED');
    if (!paths.length || paths.length > (folder ? 1 : FILE_LIMITS.maxBatchFiles))
      throw new StorageError('VALIDATION_ERROR');
    await this.expire();
    const sources: { path: string; relativePath: string }[] = [];
    if (folder) {
      const root = await canonical(paths[0]!, true);
      let directories = 0;
      const walk = async (path: string, relativePath: string, depth: number) => {
        if (++directories > 2000 || depth > 32) throw new StorageError('OUTPUT_LIMIT_REACHED');
        FileRelativePathSchema.parse(relativePath);
        await canonical(path, true);
        // Stop at the 21st file; do not silently import only part of an oversized folder.
        const directory = await opendir(path);
        for await (const item of directory) {
          const child = join(path, item.name),
            name = `${relativePath}/${item.name}`;
          if (item.isSymbolicLink()) throw new StorageError('PERMISSION_DENIED');
          if (item.isDirectory()) await walk(child, name, depth + 1);
          else {
            if (!item.isFile()) throw new StorageError('PERMISSION_DENIED');
            sources.push({ path: child, relativePath: name });
            if (sources.length > FILE_LIMITS.maxBatchFiles)
              throw new StorageError('OUTPUT_LIMIT_REACHED');
          }
        }
        await canonical(path, true);
      };
      await walk(root.path, basename(root.path), 0);
    } else {
      for (const path of paths) sources.push({ path, relativePath: basename(path) });
    }
    if (!sources.length) throw new StorageError('VALIDATION_ERROR');
    if (
      this.selected.size + sources.length > 100 ||
      [...this.selected.values()].filter((s) => s.windowId === windowId).length + sources.length >
        20
    )
      throw new StorageError('QUOTA_EXHAUSTED');
    const opened: Omit<Selected, 'expiresAt' | 'timer'>[] = [];
    try {
      const unique = new Set<string>();
      for (const source of sources) {
        const checked = await canonical(source.path);
        if (unique.has(checked.path.toLowerCase())) throw new StorageError('VALIDATION_ERROR');
        unique.add(checked.path.toLowerCase());
        if (checked.stat.size > FILE_LIMITS.maxFileBytes) throw new StorageError('FILE_TOO_LARGE');
        const view = FileSelectionSchema.parse({
          token: newId(),
          name: basename(checked.path),
          relativePath: source.relativePath,
          sizeBytes: checked.stat.size,
          extension: extname(checked.path).slice(1).toLowerCase(),
        });
        const handle = await open(checked.path, 'r');
        opened.push({ view, path: checked.path, windowId, handle, stat: checked.stat });
        if (
          !identical(checked.stat, await handle.stat()) ||
          !identical(checked.stat, (await canonical(checked.path)).stat)
        )
          throw new StorageError('CONFLICT');
      }
      if (this.disposed || this.closedWindows.has(windowId)) throw new StorageError('CANCELLED');
      for (const item of opened) {
        const timer = setTimeout(() => {
          void this.release(item.view.token).catch(() => {});
        }, TTL_MS);
        timer.unref();
        this.selected.set(item.view.token, { ...item, expiresAt: this.now() + TTL_MS, timer });
      }
      return opened.map((item) => item.view);
    } catch (error) {
      await Promise.allSettled(opened.map((item) => item.handle.close()));
      throw error;
    }
  }

  async take(
    windowId: string,
    token: string,
    signal: AbortSignal,
    progress?: (bytes: number, total: number) => void,
  ) {
    checkWindow(windowId);
    const item = this.selected.get(token);
    if (!item || item.windowId !== windowId) throw new StorageError('PERMISSION_DENIED');
    if (item.expiresAt <= this.now() || this.disposed || this.closedWindows.has(windowId)) {
      await this.release(token);
      throw new StorageError('PERMISSION_DENIED');
    }
    // Consume before awaiting: concurrent requests cannot reuse one grant.
    this.selected.delete(token);
    clearTimeout(item.timer);
    try {
      signal.throwIfAborted();
      if (
        !identical(item.stat, await item.handle.stat()) ||
        !identical(item.stat, (await canonical(item.path)).stat)
      )
        throw new StorageError('CONFLICT');
      const bytes = Buffer.alloc(item.stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        signal.throwIfAborted();
        if (this.disposed || this.closedWindows.has(windowId)) throw new StorageError('CANCELLED');
        const read = await item.handle.read(
          bytes,
          offset,
          Math.min(256 * 1024, bytes.length - offset),
          offset,
        );
        if (!read.bytesRead) throw new StorageError('CONFLICT');
        offset += read.bytesRead;
        progress?.(offset, bytes.length);
      }
      signal.throwIfAborted();
      if (this.disposed || this.closedWindows.has(windowId)) throw new StorageError('CANCELLED');
      if (
        !identical(item.stat, await item.handle.stat()) ||
        !identical(item.stat, (await canonical(item.path)).stat)
      )
        throw new StorageError('CONFLICT');
      return {
        selection: item.view,
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } finally {
      await item.handle.close();
    }
  }
  inspect(windowId: string, tokens: string[]) {
    checkWindow(windowId);
    return tokens.map((token) => {
      const item = this.selected.get(token);
      if (
        !item ||
        item.windowId !== windowId ||
        item.expiresAt <= this.now() ||
        this.disposed ||
        this.closedWindows.has(windowId)
      )
        throw new StorageError('PERMISSION_DENIED');
      return item.view;
    });
  }
  async discard(windowId: string, tokens: string[]) {
    const owned = tokens.filter((token) => this.selected.get(token)?.windowId === windowId);
    await Promise.all(owned.map((token) => this.release(token)));
    return owned;
  }
  private async release(token: string) {
    const item = this.selected.get(token);
    if (!item) return;
    this.selected.delete(token);
    clearTimeout(item.timer);
    await item.handle.close();
  }
  private async expire() {
    await Promise.all(
      [...this.selected.values()]
        .filter((s) => s.expiresAt <= this.now())
        .map((s) => this.release(s.view.token)),
    );
  }
  async closeWindow(windowId: string) {
    this.closedWindows.add(windowId);
    await Promise.all(
      [...this.selected.values()]
        .filter((s) => s.windowId === windowId)
        .map((s) => this.release(s.view.token)),
    );
  }
  async close() {
    this.disposed = true;
    await Promise.all([...this.selected.keys()].map((token) => this.release(token)));
    await this.queue;
  }
}
