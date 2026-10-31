import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { Store, migrate, migrations, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
test('P08-01 schema18 upgrade preserves user sessions/settings, applies once and keeps foreign keys intact', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P08-01 migration ')),
    db = new Database(join(dir, 'app.sqlite')),
    backup = join(dir, 'backups');
  db.pragma('foreign_keys=ON');
  await migrate(
    db,
    backup,
    migrations.filter((m) => m.version <= 18),
  );
  const store = new Store(db, dir);
  try {
    const result = new CoreService(store).dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'sessions.create',
      payload: { mode: 'chat', title: '迁移前保留的会话' },
    });
    expect(result.ok).toBe(true);
    const sessions = db.prepare('SELECT * FROM sessions').all(),
      settings = db.prepare('SELECT * FROM settings').all();
    await migrate(db, backup);
    await migrate(db, backup);
    expect(db.pragma('user_version', { simple: true })).toBe(19);
    expect(db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
    expect(db.prepare('SELECT * FROM settings').all()).toEqual(settings);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('browser_sessions','browser_tabs','browser_snapshots')",
        )
        .all(),
    ).toHaveLength(3);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally {
    store.close();
  }
});
