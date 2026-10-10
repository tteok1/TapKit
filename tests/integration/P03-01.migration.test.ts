import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  BlobStore,
  FileRepository,
  JobQueue,
  Store,
  migrate,
  migrations,
  newId,
} from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { CreatedEntitySchema } from '../../packages/contracts/src';
const require = createRequire(import.meta.url);
const Database =
  require('../../packages/storage/node_modules/better-sqlite3') as typeof import('better-sqlite3');
const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});

test('P03-01 schema9 repairs only live legacy generated-note links to their original version and preserves bytes, invalid pins and leased jobs', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P03-01 note migration '));
  const db = new Database(join(directory, 'app.sqlite'));
  db.pragma('foreign_keys=ON');
  const backups = join(directory, 'backups/migrations');
  await migrate(
    db,
    backups,
    migrations.filter((m) => m.version <= 8),
  );
  const store = new Store(db, directory);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store);
  const reply = core.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'sessions.create',
    payload: { mode: 'chat', title: '旧笔记会话' },
  });
  if (!reply.ok) throw new Error(reply.error.code);
  const session = CreatedEntitySchema.parse(reply.data).entityId,
    project = newId(),
    now = store.now();
  db.prepare(
    'INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)',
  ).run(project, store.profileId, now, now, '旧笔记项目');
  const original = Buffer.from('旧生成笔记原件'),
    blob = await blobs.put(original, 'text/markdown'),
    note = blobs.attach(blob.id, '收藏笔记.md');
  db.prepare("UPDATE files SET kind='note',source_type='generated' WHERE id=?").run(note.id);
  const link = (resource: string, owner: string, type = 'session', pin: string | null = null) => {
    const id = newId();
    db.prepare(
      "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role,pinned_version_id) VALUES(?,?,?,?,'file',?,?,?,'input',?)",
    ).run(id, store.profileId, now, now, resource, type, owner, pin);
    return id;
  };
  const sessionLink = link(note.id, session),
    projectLink = link(note.id, project, 'project');
  const unknownOwner = link(note.id, newId()),
    badPin = link(note.id, newId(), 'project', newId());
  const imported = blobs.attach(blob.id, '普通导入.md'),
    untouched = link(imported.id, session);
  const newer = await blobs.put(Buffer.from('newer binary original'), 'application/pdf');
  files.importBlob({
    blobId: newer.id,
    name: '新版本.pdf',
    relativePath: '新版本.pdf',
    owner: { type: 'library' },
    replaceId: note.id,
  });
  const job = files.jobs.claim('migration9')!,
    oldJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  const beforeInvalid = [unknownOwner, badPin, untouched].map((id) =>
    db.prepare('SELECT * FROM resource_links WHERE id=?').get(id),
  );
  await migrate(db, backups);
  const after = db
    .prepare('SELECT * FROM resource_links WHERE id IN (?,?) ORDER BY id')
    .all(sessionLink, projectLink);
  await migrate(db, backups);
  expect(db.pragma('user_version', { simple: true })).toBe(11);
  expect(
    db
      .prepare('SELECT * FROM resource_links WHERE id IN (?,?) ORDER BY id')
      .all(sessionLink, projectLink),
  ).toEqual(after);
  expect(
    [unknownOwner, badPin, untouched].map((id) =>
      db.prepare('SELECT * FROM resource_links WHERE id=?').get(id),
    ),
  ).toMatchObject(beforeInvalid);
  expect(db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id)).toEqual(oldJob);
  expect(files.jobs.heartbeat(job)).toBe(true);
  for (const owner of [
    { type: 'session' as const, id: session },
    { type: 'project' as const, id: project },
  ]) {
    const file = files.get(note.id, { owner });
    expect(file.version).toMatchObject({
      id: note.versionId,
      name: '收藏笔记.md',
      extension: 'md',
      mime: 'text/markdown',
    });
    expect(files.list({ owner }).files.map((v) => v.id)).toContain(note.id);
    expect((await files.original(note.id, { owner })).bytes).toEqual(original);
  }
  expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
});
test('P03-01 schema8 preserves schema7 files, blobs and leased jobs and reruns without duplication', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P03-01 migration '));
  const db = new Database(join(directory, 'app.sqlite'));
  db.pragma('foreign_keys = ON');
  await migrate(
    db,
    join(directory, 'backups/migrations'),
    migrations.filter((m) => m.version <= 7),
  );
  const store = new Store(db, directory);
  stores.push(store);
  const blobs = new BlobStore(store),
    queue = new JobQueue(store);
  const bytes = Buffer.from('不可变原件\n版本保持');
  const blob = await blobs.put(bytes, 'text/plain'),
    file = blobs.attach(blob.id, '资料.TXT');
  const jobId = queue.enqueue({ schemaVersion: 1, kind: 'data.backup' }, 'existing-backup');
  const lease = queue.claim('migration-test')!;
  const oldJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  await migrate(
    db,
    join(directory, 'backups/migrations'),
    migrations.filter((m) => m.version <= 8),
  );
  await migrate(
    db,
    join(directory, 'backups/migrations'),
    migrations.filter((m) => m.version <= 8),
  );
  expect(db.pragma('user_version', { simple: true })).toBe(8);
  expect(db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId)).toEqual(oldJob);
  expect(queue.heartbeat(lease)).toBe(true);
  expect(await blobs.readVersion(file.versionId)).toEqual(bytes);
  expect(db.prepare('SELECT current_version_id FROM files WHERE id=?').get(file.id)).toEqual({
    current_version_id: file.versionId,
  });
  expect(
    db.prepare('SELECT favorite,relative_path,purge_after FROM files WHERE id=?').get(file.id),
  ).toEqual({ favorite: 0, relative_path: null, purge_after: null });
  expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  const id = queue.enqueue(
    {
      schemaVersion: 1,
      kind: 'file.parse',
      fileVersionId: file.versionId,
      parserVersion: 'p03-v1',
    },
    'parse:' + file.versionId + ':p03-v1',
  );
  expect(
    queue.enqueue(
      {
        schemaVersion: 1,
        kind: 'file.parse',
        fileVersionId: file.versionId,
        parserVersion: 'p03-v1',
      },
      'parse:' + file.versionId + ':p03-v1',
    ),
  ).toBe(id);
  db.prepare('INSERT INTO file_search_documents VALUES(?,?,?,?)').run(
    file.versionId,
    file.id,
    store.profileId,
    '中文定位内容',
  );
  expect(
    db
      .prepare(
        'SELECT count(*) n FROM file_content_fts WHERE file_content_fts MATCH \'"中文定位"\'',
      )
      .get(),
  ).toEqual({ n: 1 });
  db.prepare('DELETE FROM file_search_documents WHERE file_version_id=?').run(file.versionId);
  expect(
    db
      .prepare(
        'SELECT count(*) n FROM file_content_fts WHERE file_content_fts MATCH \'"中文定位"\'',
      )
      .get(),
  ).toEqual({ n: 0 });
});
