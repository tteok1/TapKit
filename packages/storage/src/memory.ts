import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { Store, migrations, newId, StorageError } from './foundation';
import { BlobStore } from './blobs';
// No migration backup, filesystem directory, WAL, journal or FTS content for temporary chats.
export function memoryStore(source: Store): Store {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  for (const trigger of db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'history_%'")
    .all() as { name: string }[])
    db.exec('DROP TRIGGER "' + trigger.name + '"');
  db.exec('DELETE FROM history_search_documents');
  for (const table of ['profiles', 'settings', 'provider_accounts', 'model_catalog']) {
    for (const row of source.db.prepare('SELECT * FROM ' + table).all() as Record<
      string,
      unknown
    >[]) {
      const columns = Object.keys(row);
      db.prepare(
        'INSERT INTO ' +
          table +
          '(' +
          columns.join(',') +
          ') VALUES(' +
          columns.map(() => '?').join(',') +
          ')',
      ).run(...Object.values(row));
    }
  }
  return new Store(db, '', source.now, true);
}
export class MemoryBlobStore extends BlobStore {
  private bytes = new Map<string, Buffer>();
  constructor(readonly memory: Store) {
    super(memory);
  }
  override async put(value: Uint8Array, mediaType = 'application/octet-stream') {
    if (value.byteLength > 100 * 1024 * 1024) throw new StorageError('FILE_TOO_LARGE');
    const sha256 = createHash('sha256').update(value).digest('hex'),
      id = newId(),
      now = this.memory.now();
    this.memory.db
      .prepare(
        "INSERT INTO blobs(id,profile_id,created_at,updated_at,sha256,relative_key,size_bytes,state,media_type) VALUES(?,?,?,?,?,?,?,'ready',?) ON CONFLICT(sha256) DO NOTHING",
      )
      .run(
        id,
        this.memory.profileId,
        now,
        now,
        sha256,
        'memory/' + sha256,
        value.byteLength,
        mediaType,
      );
    const row = this.memory.db
      .prepare('SELECT id,sha256,size_bytes FROM blobs WHERE sha256=?')
      .get(sha256) as { id: string; sha256: string; size_bytes: number };
    this.bytes.set(row.id, Buffer.from(value));
    return row;
  }
  override async readVersion(versionId: string) {
    const row = this.memory.db
      .prepare(
        'SELECT blob_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(versionId, this.memory.profileId) as { blob_id: string } | undefined;
    const bytes = row && this.bytes.get(row.blob_id);
    if (!bytes) throw new StorageError('NOT_FOUND');
    return Buffer.from(bytes);
  }
  clear() {
    this.bytes.clear();
  }
}
