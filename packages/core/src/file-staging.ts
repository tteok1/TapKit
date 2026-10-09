import { lstat, open, opendir, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z, IdSchema, JobPayloadSchema } from '@tapkit/contracts';
import { type Store, type Job } from '@tapkit/storage';

const MarkerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  directoryId: IdSchema,
  profileId: IdSchema,
  jobId: IdSchema,
  fileVersionId: IdSchema,
  leaseEpoch: z.number().int().positive(),
  leaseOwner: z.string().min(1).max(200),
});
type Marker = z.infer<typeof MarkerSchema>;
type Sweep = { removed: number; retained: number; unrecognized: number };
const markerName = '.tapkit-ingest.json';
const canonical = async (path: string) =>
  (await realpath(path)).toLowerCase() === resolve(path).toLowerCase();

/** Only private, marked parser staging is eligible; originals/blob storage are outside this root. */
export class FileStaging {
  private pending: Promise<Sweep> | undefined;
  private stopping = false;
  constructor(readonly store: Store) {}
  async mark(directory: string, job: Job, fileVersionId: string) {
    if (this.stopping) throw new Error('Staging stopped');
    const base = resolve(this.store.dataDir, 'tmp/ingest');
    const directoryId = relative(base, resolve(directory));
    if (!IdSchema.safeParse(directoryId).success || isAbsolute(directoryId))
      throw new Error('Invalid staging child');
    const meta = await lstat(directory);
    if (
      !meta.isDirectory() ||
      meta.isSymbolicLink() ||
      !(await canonical(base)) ||
      !(await canonical(directory))
    )
      throw new Error('Invalid staging directory');
    const marker = MarkerSchema.parse({
      schemaVersion: 1,
      directoryId,
      profileId: this.store.profileId,
      jobId: job.id,
      fileVersionId,
      leaseEpoch: job.lease_epoch,
      leaseOwner: job.lease_owner,
    });
    await writeFile(join(directory, markerName), JSON.stringify(marker), { flag: 'wx' });
  }
  sweep(): Promise<Sweep> {
    if (this.stopping) return Promise.resolve({ removed: 0, retained: 0, unrecognized: 0 });
    if (this.pending) return this.pending;
    this.pending = this.sweepOnce()
      .catch(() => ({ removed: 0, retained: 1, unrecognized: 0 }))
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  async stop() {
    this.stopping = true;
    await this.pending;
  }
  private async readMarker(path: string): Promise<Buffer> {
    const meta = await lstat(path);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 4096 || !(await canonical(path)))
      throw new Error('Invalid staging marker');
    const handle = await open(path, 'r');
    try {
      const before = await handle.stat();
      if (
        !before.isFile() ||
        before.dev !== meta.dev ||
        before.ino !== meta.ino ||
        before.size > 4096
      )
        throw new Error('Changed staging marker');
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) throw new Error('Incomplete staging marker');
        offset += read.bytesRead;
      }
      const after = await handle.stat();
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        throw new Error('Changed staging marker');
      return bytes;
    } finally {
      await handle.close();
    }
  }
  private jobState(marker: Marker): 'unknown' | 'active' | 'obsolete' {
    const job = this.store.db
      .prepare(
        'SELECT kind,payload_json,status,lease_epoch,lease_owner FROM jobs WHERE profile_id=? AND id=?',
      )
      .get(this.store.profileId, marker.jobId) as
      Pick<Job, 'kind' | 'payload_json' | 'status' | 'lease_epoch' | 'lease_owner'> | undefined;
    if (!job || job.kind !== 'file.parse' || job.lease_epoch < marker.leaseEpoch) return 'unknown';
    const payload = JobPayloadSchema.safeParse(JSON.parse(job.payload_json));
    if (
      !payload.success ||
      payload.data.kind !== 'file.parse' ||
      payload.data.fileVersionId !== marker.fileVersionId
    )
      return 'unknown';
    // Even an expired current lease is retained until the normal worker reclaims/releases it.
    return job.status === 'running' &&
      job.lease_epoch === marker.leaseEpoch &&
      job.lease_owner === marker.leaseOwner
      ? 'active'
      : 'obsolete';
  }
  private async regularTree(
    path: string,
    depth: number,
    budget: { remaining: number },
  ): Promise<boolean> {
    if (this.stopping || --budget.remaining < 0 || depth > 16) return false;
    const meta = await lstat(path);
    if (meta.isSymbolicLink() || !(await canonical(path))) return false;
    if (meta.isFile()) return true;
    if (!meta.isDirectory()) return false;
    const dir = await opendir(path);
    for await (const entry of dir) {
      if (!(await this.regularTree(join(path, entry.name), depth + 1, budget))) return false;
    }
    return true;
  }
  private async sweepOnce(): Promise<Sweep> {
    const counts = { removed: 0, retained: 0, unrecognized: 0 };
    const base = resolve(this.store.dataDir, 'tmp/ingest');
    try {
      const root = await lstat(base);
      if (!root.isDirectory() || root.isSymbolicLink() || !(await canonical(base)))
        return { ...counts, unrecognized: 1 };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return counts;
      return { ...counts, retained: 1 };
    }
    const dir = await opendir(base);
    let visited = 0;
    for await (const entry of dir) {
      if (this.stopping) {
        counts.retained++;
        break;
      }
      if (++visited > 200) {
        counts.retained++;
        break;
      }
      if (!IdSchema.safeParse(entry.name).success) {
        counts.unrecognized++;
        continue;
      }
      const path = resolve(base, entry.name);
      // Resolve and verify the absolute recursive-delete target stays in the named staging root.
      if (relative(base, path) !== entry.name || isAbsolute(relative(base, path))) {
        counts.unrecognized++;
        continue;
      }
      try {
        const meta = await lstat(path);
        if (!meta.isDirectory() || meta.isSymbolicLink() || !(await canonical(path))) {
          counts.unrecognized++;
          continue;
        }
        const markerPath = join(path, markerName),
          markerMeta = await lstat(markerPath);
        if (
          !markerMeta.isFile() ||
          markerMeta.isSymbolicLink() ||
          markerMeta.size > 4096 ||
          !(await canonical(markerPath))
        ) {
          counts.unrecognized++;
          continue;
        }
        const bytes = await this.readMarker(markerPath);
        const marker = MarkerSchema.parse(JSON.parse(bytes.toString('utf8')));
        if (
          marker.directoryId !== entry.name ||
          marker.profileId !== this.store.profileId ||
          this.jobState(marker) !== 'obsolete'
        ) {
          counts.retained++;
          continue;
        }
        if (!(await this.regularTree(path, 0, { remaining: 4000 }))) {
          counts.retained++;
          continue;
        }
        const after = await lstat(path),
          afterMarker = await lstat(markerPath);
        if (
          this.stopping ||
          after.dev !== meta.dev ||
          after.ino !== meta.ino ||
          afterMarker.dev !== markerMeta.dev ||
          afterMarker.ino !== markerMeta.ino ||
          !(await canonical(base)) ||
          !(await canonical(path)) ||
          !(await this.readMarker(markerPath)).equals(bytes) ||
          this.jobState(marker) !== 'obsolete'
        ) {
          counts.retained++;
          continue;
        }
        await rm(path, { recursive: true, force: false });
        counts.removed++;
      } catch {
        counts.retained++;
      }
    }
    return counts;
  }
}
