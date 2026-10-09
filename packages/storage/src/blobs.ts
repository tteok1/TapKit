import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, open, rename, readdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { IdSchema, BackupManifestSchema, DeletionJournalEntrySchema } from '@tapkit/contracts';
import { Store, newId, fileExists, StorageError, SCHEMA_VERSION } from './foundation';
import { eraseFileDerivedContent } from './file-cleanup';

export class BlobStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly store: Store) {}
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
  get settled() {
    return this.tail;
  }
  put(bytes: Uint8Array, mediaType = 'application/octet-stream') {
    return this.exclusive(async () => {
      if (bytes.byteLength > 100 * 1024 * 1024) throw new StorageError('FILE_TOO_LARGE');
      if (mediaType.length > 128) throw new StorageError('VALIDATION_ERROR');
      const hash = createHash('sha256').update(bytes).digest('hex');
      const key = 'blobs/sha256/' + hash.slice(0, 2) + '/' + hash;
      const target = join(this.store.dataDir, key),
        tmp = join(this.store.dataDir, 'tmp', newId() + '.blob');
      await mkdir(join(this.store.dataDir, 'tmp'), { recursive: true });
      await mkdir(join(this.store.dataDir, 'blobs/sha256', hash.slice(0, 2)), { recursive: true });
      const handle = await open(tmp, 'wx');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (await fileExists(target)) {
        if (
          createHash('sha256')
            .update(await readFile(target))
            .digest('hex') !== hash
        )
          throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        await rm(tmp);
      } else await rename(tmp, target);
      // No await between rename completion and registration. GC shares this I/O queue.
      const now = this.store.now(),
        id = newId();
      this.store.db
        .prepare(
          "INSERT INTO blobs(id,profile_id,created_at,updated_at,sha256,relative_key,size_bytes,state,media_type) VALUES (?,?,?,?,?,?,?,'ready',?) ON CONFLICT(sha256) DO UPDATE SET state='ready',deleted_at=NULL,updated_at=excluded.updated_at",
        )
        .run(id, this.store.profileId, now, now, hash, key, bytes.byteLength, mediaType);
      return this.store.db
        .prepare('SELECT id,sha256,size_bytes FROM blobs WHERE sha256=?')
        .get(hash) as { id: string; sha256: string; size_bytes: number };
    });
  }
  // Internal repository operation; UI import/export is introduced in P03.
  attach(blobId: string, displayName: string) {
    IdSchema.parse(blobId);
    if (!displayName || displayName.length > 240) throw new StorageError('VALIDATION_ERROR');
    return this.store.db.transaction(() => {
      const blob = this.store.db
        .prepare(
          "SELECT sha256,size_bytes,media_type FROM blobs WHERE id=? AND profile_id=? AND state='ready' AND deleted_at IS NULL",
        )
        .get(blobId, this.store.profileId) as
        { sha256: string; size_bytes: number; media_type: string } | undefined;
      if (!blob) throw new StorageError('NOT_FOUND');
      const id = newId(),
        versionId = newId(),
        now = this.store.now();
      this.store.db
        .prepare(
          "INSERT INTO files(id,profile_id,created_at,updated_at,display_name,extension,mime,kind,current_version_id,status,source_type) VALUES (?,?,?,?,?,?,?,'input',?,'ready','import')",
        )
        .run(
          id,
          this.store.profileId,
          now,
          now,
          displayName,
          displayName.includes('.') ? displayName.split('.').at(-1)! : '',
          blob.media_type,
          versionId,
        );
      this.store.db
        .prepare(
          "INSERT INTO file_versions(id,profile_id,created_at,updated_at,file_id,version,blob_id,size_bytes,sha256,parse_status,preview_status) VALUES (?,?,?,?,?,1,?,?,?,'pending','pending')",
        )
        .run(versionId, this.store.profileId, now, now, id, blobId, blob.size_bytes, blob.sha256);
      this.store.db
        .prepare('UPDATE blobs SET reference_count=reference_count+1 WHERE id=?')
        .run(blobId);
      return { id, versionId };
    })();
  }
  trash(fileId: string, includeTrash = false) {
    IdSchema.parse(fileId);
    if (
      !this.store.db
        .prepare('SELECT id FROM files WHERE id=? AND profile_id=? AND (? OR deleted_at IS NULL)')
        .get(fileId, this.store.profileId, +includeTrash)
    )
      throw new StorageError('NOT_FOUND');
    const entry = DeletionJournalEntrySchema.parse({
      schemaVersion: 1,
      profileId: this.store.profileId,
      entityType: 'file',
      entityId: fileId,
      deletedAt: this.store.now(),
    });
    const fd = openSync(join(this.store.dataDir, 'db/deletions.jsonl'), 'a');
    try {
      writeSync(fd, JSON.stringify(entry) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return this.store.db.transaction(() => {
      const now = this.store.now();
      if (
        !this.store.db
          .prepare(
            'UPDATE files SET deleted_at=?,revision=revision+1 WHERE id=? AND profile_id=? AND (? OR deleted_at IS NULL)',
          )
          .run(now, fileId, this.store.profileId, +includeTrash).changes
      )
        throw new StorageError('NOT_FOUND');
      this.store.db
        .prepare(
          'INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES (?,?,?,?,?,?,?) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET updated_at=excluded.updated_at',
        )
        .run(
          newId(),
          this.store.profileId,
          now,
          now,
          'file',
          fileId,
          (
            this.store.db.prepare('SELECT coalesce(max(seq),0) AS seq FROM events').get() as {
              seq: number;
            }
          ).seq,
        );
      if (
        this.store.db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parsed_documents'")
          .get()
      )
        eraseFileDerivedContent(this.store, fileId, now);
      this.store.db
        .prepare('UPDATE file_versions SET deleted_at=? WHERE file_id=?')
        .run(now, fileId);
    })();
  }
  readVersion(versionId: string) {
    IdSchema.parse(versionId);
    const row = this.store.db
      .prepare(
        "SELECT b.relative_key,v.sha256,v.size_bytes FROM file_versions v JOIN files f ON f.id=v.file_id JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND f.profile_id=? AND f.deleted_at IS NULL AND v.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='ready'",
      )
      .get(versionId, this.store.profileId) as
      { relative_key: string; sha256: string; size_bytes: number } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    if (!/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(row.relative_key))
      throw new StorageError('PERMISSION_DENIED');
    return this.readVerifiedBlob(row);
  }
  readDerivedVersion(versionId: string, kind: 'structure' | 'preview') {
    IdSchema.parse(versionId);
    const source =
      kind === 'structure'
        ? "JOIN parsed_documents p ON p.file_version_id=v.id AND p.profile_id=v.profile_id AND p.deleted_at IS NULL AND p.status='ready' JOIN blobs b ON b.id=p.structure_blob_id"
        : 'JOIN blobs b ON b.id=v.preview_blob_id';
    const row = this.store.db
      .prepare(
        `SELECT b.relative_key,b.sha256,b.size_bytes FROM file_versions v
      JOIN files f ON f.id=v.file_id ${source} WHERE v.id=? AND f.profile_id=? AND
      f.deleted_at IS NULL AND v.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='ready'`,
      )
      .get(versionId, this.store.profileId) as
      { relative_key: string; sha256: string; size_bytes: number } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    if (!/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(row.relative_key))
      throw new StorageError('PERMISSION_DENIED');
    return this.readVerifiedBlob(row);
  }
  backupReferencedBlobs() {
    return this.exclusive(async () => {
      const referenced = new Map<string, number>();
      const backups = this.store.db
        .prepare("SELECT id FROM backups WHERE profile_id=? AND state='complete'")
        .all(this.store.profileId) as { id: string }[];
      for (const backup of backups) {
        const id = IdSchema.parse(backup.id),
          path = join(this.store.dataDir, 'backups', id, 'manifest.json');
        const meta = await lstat(path);
        if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 100 * 1024 * 1024)
          throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        const manifest = BackupManifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        if (manifest.id !== id) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        for (const blob of manifest.blobs) {
          const row = this.store.db
            .prepare(
              "SELECT size_bytes FROM blobs WHERE sha256=? AND profile_id=? AND state='ready' AND deleted_at IS NULL",
            )
            .get(blob.sha256, this.store.profileId) as { size_bytes: number } | undefined;
          if (!row || row.size_bytes !== blob.size_bytes)
            throw new StorageError('DATABASE_RECOVERY_REQUIRED');
          referenced.set(blob.sha256, blob.size_bytes);
        }
      }
      return referenced;
    });
  }
  private async readVerifiedBlob(row: {
    relative_key: string;
    sha256: string;
    size_bytes: number;
  }) {
    const path = join(this.store.dataDir, row.relative_key),
      meta = await lstat(path);
    if (
      !meta.isFile() ||
      meta.isSymbolicLink() ||
      meta.size !== row.size_bytes ||
      meta.size > 100 * 1024 * 1024
    )
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    const handle = await open(path, 'r');
    let bytes: Buffer;
    try {
      const pinned = await handle.stat();
      if (!pinned.isFile() || pinned.size !== row.size_bytes)
        throw new StorageError('DATABASE_RECOVERY_REQUIRED');
      bytes = Buffer.alloc(row.size_bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        offset += read.bytesRead;
      }
      if ((await handle.stat()).size !== row.size_bytes)
        throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    } finally {
      await handle.close();
    }
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha256').update(bytes).digest('hex') !== row.sha256
    )
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    return bytes;
  }
  backup(id: string, signal?: AbortSignal) {
    IdSchema.parse(id);
    return this.exclusive(async () => {
      const directory = join(this.store.dataDir, 'backups', id),
        manifestPath = join(directory, 'manifest.json');
      await mkdir(directory, { recursive: true });
      signal?.throwIfAborted();
      const existing = await fileExists(manifestPath);
      if (!existing)
        await this.store.db.backup(join(directory, 'app.sqlite'), {
          progress: () => {
            signal?.throwIfAborted();
            return 100;
          },
        });
      const snapshot = new Database(join(directory, 'app.sqlite'), {
        readonly: true,
        fileMustExist: true,
      });
      let blobs: { sha256: string; relative_key: string; size_bytes: number }[], deleted: string[];
      try {
        if (
          snapshot.pragma('integrity_check', { simple: true }) !== 'ok' ||
          !Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1).includes(
            snapshot.pragma('user_version', { simple: true }) as number,
          )
        )
          throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        blobs = snapshot
          .prepare(
            "SELECT sha256,relative_key,size_bytes FROM blobs WHERE state='ready' ORDER BY sha256",
          )
          .all() as typeof blobs;
        deleted = (
          snapshot
            .prepare('SELECT entity_id FROM deletion_tombstones ORDER BY entity_id')
            .all() as { entity_id: string }[]
        ).map((r) => r.entity_id);
      } finally {
        snapshot.close();
      }
      const manifest = BackupManifestSchema.parse(
        existing
          ? JSON.parse(await readFile(manifestPath, 'utf8'))
          : {
              schemaVersion: 1,
              id,
              createdAt: this.store.now(),
              blobs,
              deletedResourceIds: deleted,
            },
      );
      if (
        manifest.id !== id ||
        JSON.stringify(manifest.blobs) !== JSON.stringify(blobs) ||
        JSON.stringify(manifest.deletedResourceIds) !== JSON.stringify(deleted)
      )
        throw new StorageError('DATABASE_RECOVERY_REQUIRED');
      for (const blob of manifest.blobs) {
        signal?.throwIfAborted();
        const bytes = await readFile(join(this.store.dataDir, blob.relative_key));
        if (
          bytes.length !== blob.size_bytes ||
          createHash('sha256').update(bytes).digest('hex') !== blob.sha256
        )
          throw new StorageError('DATABASE_RECOVERY_REQUIRED');
      }
      signal?.throwIfAborted();
      if (!existing) {
        const handle = await open(join(directory, 'manifest.tmp'), 'w');
        try {
          await handle.writeFile(JSON.stringify(manifest));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(join(directory, 'manifest.tmp'), manifestPath);
      }
      // Reconcile a crash after the manifest rename but before the registry write.
      this.store.db
        .prepare("INSERT INTO backups VALUES (?,?,?,'complete',?,1,?) ON CONFLICT(id) DO NOTHING")
        .run(
          id,
          this.store.profileId,
          'backups/' + id + '/manifest.json',
          manifest.createdAt,
          JSON.stringify({ schemaVersion: 1, ids: deleted }),
        );
      return id;
    });
  }
  gc(signal?: AbortSignal) {
    return this.exclusive(async () => {
      const keep = new Set<string>();
      const backups = join(this.store.dataDir, 'backups');
      for (const entry of await readdir(backups, { withFileTypes: true })) {
        if (!entry.isDirectory() || !IdSchema.safeParse(entry.name).success) continue;
        const manifest = join(backups, entry.name, 'manifest.json');
        if (await fileExists(manifest)) {
          const parsed = BackupManifestSchema.parse(JSON.parse(await readFile(manifest, 'utf8')));
          for (const blob of parsed.blobs) keep.add(blob.sha256);
        }
      }
      // Preserve both explicit references and backup manifests. Deleted version metadata remains
      // for tombstones, so collect its bytes without removing the FK target row.
      const hasFiles = !!this.store.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parsed_documents'")
        .get();
      const candidates = this.store.db
        .prepare(
          `SELECT b.id,b.sha256 FROM blobs b WHERE b.reference_count=0
        AND NOT EXISTS(SELECT 1 FROM file_versions v WHERE v.blob_id=b.id AND v.deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM events e WHERE e.payload_blob_id=b.id)
        ${hasFiles ? 'AND NOT EXISTS(SELECT 1 FROM parsed_documents p WHERE p.structure_blob_id=b.id AND p.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM file_versions v WHERE v.preview_blob_id=b.id AND v.deleted_at IS NULL)' : ''}`,
        )
        .all() as { id: string; sha256: string }[];
      const collect = candidates.filter((b) => !keep.has(b.sha256));
      for (const b of collect)
        this.store.db
          .prepare(
            "UPDATE blobs SET state='deleting',deleted_at=coalesce(deleted_at,?),updated_at=? WHERE id=?",
          )
          .run(this.store.now(), this.store.now(), b.id);
      for (const b of this.store.db
        .prepare("SELECT sha256 FROM blobs WHERE state<>'deleting'")
        .all() as { sha256: string }[])
        keep.add(b.sha256);
      let removed = 0;
      const base = join(this.store.dataDir, 'blobs/sha256');
      await mkdir(base, { recursive: true });
      for (const prefix of await readdir(base, { withFileTypes: true })) {
        if (!prefix.isDirectory() || prefix.isSymbolicLink() || !/^[a-f0-9]{2}$/.test(prefix.name))
          continue;
        for (const file of await readdir(join(base, prefix.name), { withFileTypes: true })) {
          signal?.throwIfAborted();
          if (file.isFile() && /^[a-f0-9]{64}$/.test(file.name) && !keep.has(file.name)) {
            await rm(join(base, prefix.name, file.name));
            removed++;
          }
        }
      }
      // Staging leftovers are from an interrupted writer; no writer can run during GC.
      const tmp = join(this.store.dataDir, 'tmp');
      await mkdir(tmp, { recursive: true });
      for (const file of await readdir(tmp)) {
        if (!/^[a-f0-9-]{36}\.blob$/.test(file)) continue;
        const path = join(tmp, file);
        if ((await lstat(path)).isFile()) {
          await rm(path);
          removed++;
        }
      }
      return removed;
    });
  }
  async dailyBackup() {
    const day = new Date(this.store.now()).toISOString().slice(0, 10);
    const marker = join(this.store.dataDir, 'backups/daily-' + day + '.json');
    if (!(await fileExists(marker))) {
      const id = await this.backup(newId());
      await writeFile(marker, JSON.stringify({ id }), { flag: 'wx' });
    }
    const markers = (await readdir(join(this.store.dataDir, 'backups')))
      .filter((n) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort()
      .reverse();
    for (const name of markers.slice(7)) {
      const { id } = JSON.parse(
        await readFile(join(this.store.dataDir, 'backups', name), 'utf8'),
      ) as { id: string };
      IdSchema.parse(id);
      // IDs are validated; deletion remains inside DATA/backups.
      await rm(join(this.store.dataDir, 'backups', id), { recursive: true, force: true });
      await rm(join(this.store.dataDir, 'backups', name));
      this.store.db.prepare('DELETE FROM backups WHERE id=?').run(id);
    }
  }
}
