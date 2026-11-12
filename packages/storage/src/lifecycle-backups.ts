import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  statfs,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import {
  BackupManifestSchema,
  ClearTargetSchema,
  DataDigestSchema,
  IdSchema,
  z,
} from '@tapkit/contracts';
import { fileExists, newId, StorageError, type Store } from './foundation';

type Manifest = z.infer<typeof BackupManifestSchema>;
const PendingRestoreSchema = z.strictObject({
  id: IdSchema,
  profileId: IdSchema,
  digest: DataDigestSchema,
  safety: IdSchema,
});
type Target = z.infer<typeof ClearTargetSchema>;
export async function hashLocalFile(path: string, signal?: AbortSignal) {
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink()) throw Error('INVALID_FILE');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, signal ? { signal } : {})) hash.update(chunk);
  return hash.digest('hex');
}

export async function localBackups(dataDir: string) {
  const base = join(dataDir, 'backups');
  if (!(await fileExists(base))) return [];
  const result: { directory: string; manifest: Manifest }[] = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !IdSchema.safeParse(entry.name).success)
      continue;
    const directory = join(base, entry.name);
    try {
      const path = join(directory, 'manifest.json');
      const meta = await lstat(path);
      if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 32 * 1024 * 1024) continue;
      const manifest = BackupManifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (manifest.id === entry.name) result.push({ directory, manifest });
    } catch {
      // An incomplete snapshot is never eligible for recovery.
    }
  }
  return result.sort(
    (a, b) =>
      b.manifest.createdAt - a.manifest.createdAt || b.manifest.id.localeCompare(a.manifest.id),
  );
}

const tables = {
  session: 'sessions',
  project: 'projects',
  file: 'files',
  memory: 'memories',
} as const;
async function containsTarget(path: string, profileId: string, targets: readonly Target[]) {
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink()) throw Error('INVALID_SNAPSHOT');
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    for (const [type, table] of Object.entries(tables)) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
        continue;
      const active = db.prepare(
        `SELECT 1 FROM ${table} WHERE id=? AND profile_id=? AND NOT EXISTS (SELECT 1 FROM deletion_tombstones WHERE entity_type=? AND entity_id=? AND profile_id=?)`,
      );
      for (const target of targets) {
        if (target.type === type && active.get(target.id, profileId, type, target.id, profileId))
          return true;
      }
    }
    return false;
  } finally {
    db.close();
  }
}

export async function backupPruneCount(dataDir: string) {
  const base = join(dataDir, 'backups');
  const migrations = join(base, 'migrations');
  const count = (await fileExists(base))
    ? (await readdir(base, { withFileTypes: true })).filter(
        (entry) =>
          entry.isDirectory() && !entry.isSymbolicLink() && IdSchema.safeParse(entry.name).success,
      ).length
    : 0;
  return (
    count +
    ((await fileExists(migrations))
      ? (await readdir(migrations)).filter((name) =>
          /^pre-migration-\d+-[a-f0-9-]{36}\.sqlite$/.test(name),
        ).length
      : 0)
  );
}

async function stageBackupRemoval(directory: string, trash: string, signal?: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      await rename(directory, trash);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt === 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await delay(100 * (attempt + 1), undefined, { signal });
    }
  }
}

export async function pruneBackups(store: Store, targets: readonly Target[], signal?: AbortSignal) {
  const base = join(store.dataDir, 'backups');
  const entries = (await fileExists(base)) ? await readdir(base, { withFileTypes: true }) : [];
  const removal = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;
  for (const entry of entries) {
    const id = entry.name.startsWith('.purge-') ? entry.name.slice(7) : '';
    if (!entry.isDirectory() || entry.isSymbolicLink() || !IdSchema.safeParse(id).success) continue;
    await rm(join(base, entry.name), removal);
    store.db.prepare('DELETE FROM backups WHERE id=? AND profile_id=?').run(id, store.profileId);
  }
  for (const entry of entries) {
    signal?.throwIfAborted();
    if (!entry.isDirectory() || entry.isSymbolicLink() || !IdSchema.safeParse(entry.name).success)
      continue;
    const directory = join(base, entry.name),
      database = join(directory, 'app.sqlite');
    if (
      !(await fileExists(database)) ||
      !(await containsTarget(database, store.profileId, targets))
    )
      continue;
    const trash = join(base, '.purge-' + entry.name);
    await stageBackupRemoval(directory, trash, signal);
    await rm(trash, removal);
    store.db
      .prepare('DELETE FROM backups WHERE id=? AND profile_id=?')
      .run(entry.name, store.profileId);
  }
  const dir = join(store.dataDir, 'backups', 'migrations');
  if (!(await fileExists(dir))) return;
  for (const name of await readdir(dir)) {
    signal?.throwIfAborted();
    if (!/^pre-migration-\d+-[a-f0-9-]{36}\.sqlite$/.test(name)) continue;
    const path = join(dir, name);
    if (await containsTarget(path, store.profileId, targets)) await rm(path);
  }
}

const pendingRestore = (root: string) => join(root, 'db', 'pending-restore.json');
const restoreResult = (root: string) => join(root, 'db', 'last-restore.json');
type LocalBackup = Awaited<ReturnType<typeof localBackups>>[number];

export async function verifyLocalBackup(
  dataDir: string,
  candidate: LocalBackup,
  maximumSchema: number,
  profileId?: string,
) {
  const path = join(candidate.directory, 'app.sqlite');
  const digest = await hashLocalFile(path);
  if (candidate.manifest.databaseHash && digest !== candidate.manifest.databaseHash)
    throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const schema = db.pragma('user_version', { simple: true }) as number;
    if (
      !Number.isInteger(schema) ||
      schema < 1 ||
      schema > maximumSchema ||
      db.pragma('integrity_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    const profiles = db.prepare('SELECT id FROM profiles').all() as { id: string }[];
    if (profiles.length !== 1 || (profileId && profiles[0]?.id !== profileId))
      throw new StorageError('PERMISSION_DENIED');
    const inventory = db
      .prepare(
        "SELECT sha256,relative_key,size_bytes FROM blobs WHERE state='ready' ORDER BY sha256",
      )
      .all();
    if (JSON.stringify(inventory) !== JSON.stringify(candidate.manifest.blobs))
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  } finally {
    db.close();
  }
  for (const blob of candidate.manifest.blobs) {
    if (
      blob.relative_key !== 'blobs/sha256/' + blob.sha256.slice(0, 2) + '/' + blob.sha256 ||
      (await lstat(join(dataDir, blob.relative_key))).size !== blob.size_bytes ||
      (await hashLocalFile(join(dataDir, blob.relative_key))) !== blob.sha256
    )
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  }
  return digest;
}

async function writeMarker(path: string, value: object) {
  const temporary = path + '.' + newId() + '.tmp';
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

export async function stageLocalRestore(
  store: Store,
  id: string,
  maximumSchema: number,
  backup: (id: string) => Promise<string>,
) {
  if (await fileExists(pendingRestore(store.dataDir))) throw new StorageError('CONFLICT');
  const candidate = (await localBackups(store.dataDir)).find((item) => item.manifest.id === id);
  if (!candidate) throw new StorageError('NOT_FOUND');
  const digest = await verifyLocalBackup(store.dataDir, candidate, maximumSchema, store.profileId);
  const safety = await backup(newId());
  await writeMarker(pendingRestore(store.dataDir), {
    id: IdSchema.parse(id),
    profileId: store.profileId,
    digest,
    safety,
  });
}

export async function lastLocalRestore(root: string) {
  try {
    const data = JSON.parse(await readFile(restoreResult(root), 'utf8')) as { status?: string };
    return data.status === 'restored' || data.status === 'failed' ? data.status : null;
  } catch {
    return null;
  }
}

export async function installLocalBackup(
  dataDir: string,
  candidate: LocalBackup,
  maximumSchema: number,
  profileId?: string,
  expectedDigest?: string,
) {
  const digest = await verifyLocalBackup(dataDir, candidate, maximumSchema, profileId);
  if (expectedDigest && digest !== expectedDigest) throw new StorageError('CONFLICT');
  const database = join(dataDir, 'db', 'app.sqlite'),
    source = join(candidate.directory, 'app.sqlite');
  const staged = join(dataDir, 'db', 'restore-' + newId() + '.sqlite');
  const originalPaths = [];
  let required = (await lstat(source)).size;
  for (const suffix of ['', '-wal', '-shm']) {
    const path = database + suffix;
    if (await fileExists(path)) {
      const meta = await lstat(path);
      if (!meta.isFile() || meta.isSymbolicLink()) throw new StorageError('PERMISSION_DENIED');
      originalPaths.push(suffix);
      required += meta.size;
    }
  }
  const disk = await statfs(dataDir);
  if (disk.bavail * disk.bsize < required) throw new StorageError('QUOTA_EXHAUSTED');
  const quarantine = join(dataDir, 'db', 'quarantine', newId());
  const moved: string[] = [];
  try {
    await copyFile(source, staged);
    const handle = await open(staged, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    if ((await hashLocalFile(staged)) !== digest)
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    if (originalPaths.length) await mkdir(quarantine, { recursive: true });
    if (originalPaths.includes('')) await copyFile(database, join(quarantine, 'app.sqlite'));
    for (const suffix of originalPaths.filter(Boolean)) {
      await rename(database + suffix, join(quarantine, 'app.sqlite' + suffix));
      moved.push(suffix);
    }
    // The writer has stopped. The final same-volume rename publishes the complete database.
    await rename(staged, database);
  } catch (error) {
    for (const suffix of moved)
      await rename(join(quarantine, 'app.sqlite' + suffix), database + suffix);
    throw error;
  } finally {
    await rm(staged, { force: true });
  }
}

export async function runPendingRestore(dataDir: string, maximumSchema: number) {
  const path = pendingRestore(dataDir);
  let status: 'restored' | 'failed' = 'failed';
  try {
    const value = PendingRestoreSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const available = await localBackups(dataDir);
    const candidate = available.find((item) => item.manifest.id === value.id);
    const safety = available.find((item) => item.manifest.id === value.safety);
    if (!candidate || !safety || candidate === safety)
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    await verifyLocalBackup(dataDir, safety, maximumSchema, value.profileId);
    await installLocalBackup(dataDir, candidate, maximumSchema, value.profileId, value.digest);
    status = 'restored';
  } catch {
    // A rejected request keeps the current database and records the recovery state.
  }
  await writeMarker(restoreResult(dataDir), { status });
  await rm(path);
}
