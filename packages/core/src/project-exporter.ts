import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, basename } from 'node:path';
import { managedZip } from '@tapkit/tools';
import { FileNameSchema } from '@tapkit/contracts';
import { StorageError } from '@tapkit/storage';
import { ProjectService } from './project-service';
async function parent(path: string) {
  const p = dirname(path),
    s = await lstat(p);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    (await realpath(p)).toLowerCase() !== p.toLowerCase()
  )
    throw new StorageError('PERMISSION_DENIED');
}
export class ProjectExporter {
  private active = new Map<AbortController, string>();
  private work = new Set<Promise<string>>();
  private stopped = false;
  constructor(readonly projects: ProjectService) {}
  export(windowId: string, projectId: string, revision: number, targetPath: string) {
    if (this.stopped) return Promise.reject(new StorageError('CANCELLED'));
    if (this.active.size >= 2) return Promise.reject(new StorageError('QUOTA_EXHAUSTED'));
    const c = new AbortController();
    this.active.set(c, windowId);
    const timer = setTimeout(() => c.abort(), 120000);
    timer.unref();
    const promise = this.write(projectId, revision, targetPath, c.signal);
    this.work.add(promise);
    void promise
      .finally(() => {
        clearTimeout(timer);
        this.active.delete(c);
        this.work.delete(promise);
      })
      .catch(() => {});
    return promise;
  }
  private async write(projectId: string, revision: number, target: string, signal: AbortSignal) {
    if (!isAbsolute(target)) throw new StorageError('VALIDATION_ERROR');
    const path = resolve(target);
    FileNameSchema.parse(basename(path));
    await parent(path);
    const preview = this.projects.exportPreview(projectId),
      fingerprint = JSON.stringify(this.projects.links(projectId));
    if (preview.project.revision !== revision) throw new StorageError('CONFLICT');
    if (preview.totalBytes > 200 * 1024 * 1024) throw new StorageError('FILE_TOO_LARGE');
    const entries: { name: string; bytes: Buffer }[] = [
      {
        name: 'project.json',
        bytes: Buffer.from(
          JSON.stringify(
            { schemaVersion: 1, ...preview, materials: this.projects.materials(projectId) },
            null,
            2,
          ),
        ),
      },
    ];
    for (const f of preview.files) {
      signal.throwIfAborted();
      const source = await this.projects.files.original(f.fileId, {
        versionId: f.versionId,
        owner: { type: 'project', id: projectId },
      });
      entries.push({ name: 'files/' + f.fileId + '/' + f.name, bytes: source.bytes });
    }
    const bytes = await managedZip(entries);
    signal.throwIfAborted();
    const validate = () => {
      if (
        this.projects.get(projectId).revision !== revision ||
        JSON.stringify(this.projects.links(projectId)) !== fingerprint
      )
        throw new StorageError('CONFLICT');
      for (const f of preview.files)
        this.projects.files.get(f.fileId, {
          versionId: f.versionId,
          owner: { type: 'project', id: projectId },
        });
    };
    validate();
    const handle = await open(path, 'wx');
    let owned: { dev: number; ino: number } | undefined,
      committed = false;
    try {
      owned = await handle.stat();
      await parent(path);
      if ((await realpath(path)).toLowerCase() !== path.toLowerCase())
        throw new StorageError('PERMISSION_DENIED');
      for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
        signal.throwIfAborted();
        await handle.writeFile(bytes.subarray(offset, offset + 256 * 1024));
      }
      await handle.sync();
      validate();
      signal.throwIfAborted();
      committed = true;
      return projectId;
    } finally {
      await handle.close();
      if (!committed && owned) {
        const current = await lstat(path).catch(() => undefined);
        if (
          current &&
          current.dev === owned.dev &&
          current.ino === owned.ino &&
          !current.isSymbolicLink()
        )
          await unlink(path);
      }
    }
  }
  closeWindow(id: string) {
    for (const [c, w] of this.active) if (w === id) c.abort();
  }
  async stop() {
    this.stopped = true;
    for (const c of this.active.keys()) c.abort();
    await Promise.allSettled([...this.work]);
  }
}
