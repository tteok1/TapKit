import { mkdtemp } from '../../scripts/test-temp.mjs';
import { expect, test } from 'vitest';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './P06.fixture';
import {
  SCHEMA_VERSION,
  DocumentRepository,
  Store,
  migrate,
  migrations,
  newId,
} from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';

const spec = {
  schemaVersion: 1,
  title: '报告',
  audience: '团队',
  language: '中文',
  sections: [{ blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '原文' }] }],
};

test('P07-01 stores a spec with a version, rejects stale bases, rolls back and erases on deletion', async () => {
  const f = await fixture();
  try {
    const run = f.work.repo.row((await f.create()).runId);
    const owner = { type: 'session' as const, id: f.sessionId };
    const repo = new DocumentRepository(f.files);
    const firstBlob = await f.blobs.put(
      Buffer.from('fixture one'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const first = f.store.db.transaction(() => {
      const file = f.files.importBlob({
        blobId: firstBlob.id,
        name: '报告.docx',
        relativePath: '报告.docx',
        generatedByRunId: run.id,
        owner,
      }).file;
      repo.record(file.id, file.version.id, owner, spec);
      return file;
    })();
    expect(repo.read(first.id, first.version.id, owner).sections[0]?.blocks[0]).toEqual({
      type: 'paragraph',
      text: '原文',
    });
    expect(() => repo.assertBase(first.id, first.version.id, first.revision, owner)).toThrow(
      'INTERNAL_ERROR',
    );
    const secondBlob = await f.blobs.put(
      Buffer.from('fixture two'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(() =>
      f.store.db.transaction(() => {
        repo.assertBase(first.id, first.version.id, first.revision, owner);
        const next = f.files.importBlob({
          blobId: secondBlob.id,
          name: '报告.docx',
          relativePath: '报告.docx',
          replaceId: first.id,
          generatedByRunId: run.id,
          owner,
        }).file;
        repo.record(next.id, next.version.id, owner, { ...spec, title: '修改后' });
        throw new Error('fixture rollback');
      })(),
    ).toThrow('fixture rollback');
    expect(f.files.get(first.id).currentVersionId).toBe(first.version.id);
    expect(repo.read(first.id, first.version.id, { type: 'task', id: run.task_id }).title).toBe(
      '报告',
    );
    const next = f.store.db.transaction(() => {
      repo.assertBase(first.id, first.version.id, first.revision, owner);
      const file = f.files.importBlob({
        blobId: secondBlob.id,
        name: '报告.docx',
        relativePath: '报告.docx',
        replaceId: first.id,
        generatedByRunId: run.id,
        owner,
      }).file;
      repo.record(file.id, file.version.id, owner, { ...spec, title: '修改后' });
      return file;
    })();
    expect(repo.read(first.id, first.version.id, { type: 'task', id: run.task_id }).title).toBe(
      '报告',
    );
    expect(repo.read(first.id, next.version.id, owner).title).toBe('修改后');
    expect(() =>
      f.store.db.transaction(() =>
        repo.assertBase(first.id, first.version.id, first.revision, owner),
      )(),
    ).toThrow('CONFLICT');
    f.blobs.trash(first.id);
    expect(
      f.store.db
        .prepare('SELECT count(*) AS n FROM document_specs WHERE profile_id=?')
        .get(f.store.profileId),
    ).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});

// Build the historical schema itself: relabelling a current database leaves later columns behind.
test('P07-01 / P08-03 schema17 upgrade preserves task data and is idempotent', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P08-03 schema17 upgrade '));
  const Database = createRequire(import.meta.url)(
    '../../packages/storage/node_modules/better-sqlite3',
  ) as typeof import('better-sqlite3');
  const db = new Database(join(dir, 'app.sqlite')),
    backups = join(dir, 'migration-backups');
  try {
    db.pragma('foreign_keys=ON');
    await migrate(
      db,
      join(dir, 'initial-backups'),
      migrations.filter((m) => m.version <= 17),
    );
    const store = new Store(db, dir),
      reply = new CoreService(store).dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'sessions.create',
        payload: { mode: 'work', title: '迁移前保留的工作' },
      });
    if (!reply.ok || !('entityId' in reply.data)) throw Error('session');
    const taskId = newId(),
      now = store.now();
    db.prepare(
      'INSERT INTO tasks(id,profile_id,created_at,updated_at,session_id,root_task_id,goal,acceptance_json,mode,priority) VALUES(?,?,?,?,?,?,?,\'{"schemaVersion":1,"rules":[]}\',\'work\',7)',
    ).run(taskId, store.profileId, now, now, reply.data.entityId, taskId, '迁移前的文档任务');
    const before = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId),
      columns = () => (db.pragma('table_info(runs)') as { name: string }[]).map((c) => c.name);
    expect(db.pragma('user_version', { simple: true })).toBe(17);
    expect(columns()).not.toContain('parent_run_id');
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='document_specs'").get(),
    ).toBeUndefined();
    await migrate(db, backups);
    expect(columns()).toContain('parent_run_id');
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='document_specs'").get(),
    ).toBeDefined();
    const schema = db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),
      firstBackups = await readdir(backups);
    await migrate(db, backups);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId)).toEqual(before);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(
      schema,
    );
    expect(await readdir(backups)).toEqual(firstBackups);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(firstBackups.some((name) => name.startsWith('pre-migration-18'))).toBe(true);
  } finally {
    db.close();
  }
});
