import { expect, test } from 'vitest';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './P06.fixture';
import { DocumentRepository, migrate } from '../../packages/storage/src';

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

// Simulate a schema-17 installation with real task data before applying the additive migration.
test('P07-01 migration 17 to 18 preserves task data and is idempotent', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    const before = f.store.db.prepare('SELECT * FROM tasks WHERE id=?').get(view.taskId);
    f.store.db.exec(
      'DROP TABLE browser_snapshots; DROP TABLE browser_tabs; DROP TABLE browser_sessions; DROP TABLE document_specs',
    );
    f.store.db.pragma('user_version=17');
    await migrate(f.store.db, join(f.dir, 'p07-migration-backups'));
    await migrate(f.store.db, join(f.dir, 'p07-migration-backups'));
    expect(f.store.db.pragma('user_version', { simple: true })).toBe(19);
    expect(f.store.db.prepare('SELECT * FROM tasks WHERE id=?').get(view.taskId)).toEqual(before);
    expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
    expect(f.store.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(
      (await readdir(join(f.dir, 'p07-migration-backups'))).some((name) =>
        name.startsWith('pre-migration-18'),
      ),
    ).toBe(true);
  } finally {
    await f.close();
  }
});
