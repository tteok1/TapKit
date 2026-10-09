import Database from 'better-sqlite3';
// A compatibility probe only. Persistent schema/migrations belong to P00-02.
export function openCompatibilityDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE VIRTUAL TABLE probe USING fts5(content)');
  db.prepare('INSERT INTO probe(content) VALUES (?)').run('TapKit');
  const match = db
    .prepare("SELECT count(*) AS count FROM probe WHERE probe MATCH 'TapKit'")
    .get() as { count: number };
  if (match.count !== 1) {
    db.close();
    throw new Error('SQLite FTS5 probe failed');
  }
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  return { version: row.version, close: () => db.close() };
}
export * from './foundation';
export * from './blobs';
export * from './jobs';
export * from './usage-ledger';
export * from './memory';
export * from './session-cleanup';
export * from './files';
