import { mkdir, lstat, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { IdSchema, z } from '@tapkit/contracts';
import { newId, StorageError, type Store } from '@tapkit/storage';
const Marker = z.strictObject({
  schemaVersion: z.literal(1),
  directoryId: IdSchema,
  profileId: IdSchema,
  fileVersionId: IdSchema,
});
const markerName = '.tapkit-preview.json';
/** Own marked conversion trees only. Active work and unrecognized paths are retained. */
export class PreviewStaging {
  readonly base: string;
  private readonly active = new Set<string>();
  private pending: Promise<{ removed: number; retained: number }> | undefined;
  constructor(readonly store: Store) {
    this.base = resolve(store.dataDir, 'tmp/preview');
  }
  private async canonical(path: string) {
    const info = await lstat(path);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
    )
      throw new StorageError('PERMISSION_DENIED');
  }
  private async prepare() {
    await this.canonical(this.store.dataDir);
    for (const path of [resolve(this.store.dataDir, 'tmp'), this.base]) {
      try {
        await mkdir(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      await this.canonical(path);
    }
  }
  async create(fileVersionId: string) {
    IdSchema.parse(fileVersionId);
    await this.prepare();
    const directoryId = newId(),
      directory = join(this.base, directoryId);
    await mkdir(directory);
    this.active.add(directoryId);
    try {
      await writeFile(
        join(directory, markerName),
        JSON.stringify(
          Marker.parse({
            schemaVersion: 1,
            directoryId,
            profileId: this.store.profileId,
            fileVersionId,
          }),
        ),
        { flag: 'wx' },
      );
    } catch (error) {
      this.active.delete(directoryId);
      throw error;
    }
    return directory;
  }
  async release(directory: string) {
    const id = relative(this.base, resolve(directory));
    if (isAbsolute(id) || !IdSchema.safeParse(id).success)
      throw new StorageError('PERMISSION_DENIED');
    this.active.delete(id);
    return this.erase(directory, id);
  }
  private async erase(directory: string, id: string) {
    try {
      await this.canonical(this.base);
      await this.canonical(directory);
      const markerPath = join(directory, markerName),
        meta = await lstat(markerPath);
      if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 4096) return false;
      const marker = Marker.parse(JSON.parse(await readFile(markerPath, 'utf8')));
      if (
        marker.directoryId !== id ||
        marker.profileId !== this.store.profileId ||
        this.active.has(id)
      )
        return false;
      let entries = 0;
      const inspect = async (path: string): Promise<void> => {
        await this.canonical(path);
        for (const name of await readdir(path)) {
          if (++entries > 10000) throw new StorageError('OUTPUT_LIMIT_REACHED');
          const child = join(path, name),
            stat = await lstat(child);
          if (
            stat.isSymbolicLink() ||
            (await realpath(child)).toLowerCase() !== resolve(child).toLowerCase()
          )
            throw new StorageError('PERMISSION_DENIED');
          if (stat.isDirectory()) await inspect(child);
          else if (!stat.isFile()) throw new StorageError('PERMISSION_DENIED');
        }
      };
      await inspect(directory);
      // The checked UUID child is confined to the private base; processes have
      // finished before release. A failed cleanup cannot invalidate a committed PDF.
      await rm(directory, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
  sweep() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await this.prepare();
      let removed = 0,
        retained = 0;
      for (const id of await readdir(this.base)) {
        if (this.active.has(id)) continue;
        if (!IdSchema.safeParse(id).success) {
          retained++;
          continue;
        }
        if (await this.erase(join(this.base, id), id)) removed++;
        else retained++;
      }
      return { removed, retained };
    })()
      .catch(() => ({ removed: 0, retained: 1 }))
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  async stop() {
    await this.pending;
    await this.sweep();
  }
}
