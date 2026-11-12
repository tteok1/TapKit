import { afterEach, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  BlobStore,
  FileRepository,
  FILE_PARSER_VERSION,
  JobQueue,
  newId,
  openStore,
  localBackups,
  verifyLocalBackup,
  withRecoverySnapshot,
  writeClearRecord,
  SCHEMA_VERSION,
  type Store,
} from '../../packages/storage/src';
import { DataLifecycle } from '../../packages/core/src/data-lifecycle/service';
import { PortableData } from '../../packages/core/src/data-lifecycle/portable';
import { CoreService } from '../../packages/core/src/service';
import { MemoryService } from '../../packages/core/src/memory-service';
import { FoundationWorker } from '../../packages/core/src/worker';
import {
  DataImpactSchema,
  ParsedDocumentSchema,
  type Reply,
  type Request,
} from '../../packages/contracts/src';
import { managedZip } from '../../packages/tools/src';
import { moveDataRoot, readDataRoot } from '../../apps/desktop/src/main/data-root';

const stores: Store[] = [];
const workers: FoundationWorker[] = [];
afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.stop();
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
async function directory() {
  await mkdir('.test-data', { recursive: true });
  return mkdtemp(resolve('.test-data', 'P10-03 数据 '));
}
async function fixture(root?: string, clock?: () => number) {
  const store = await openStore(root ?? (await directory()), clock);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  return {
    store,
    blobs,
    files,
    lifecycle: new DataLifecycle(store, blobs),
    portable: new PortableData(store, blobs),
  };
}
function request(command: string, payload: unknown): Request {
  return { protocolVersion: 1, requestId: newId(), command, payload };
}
function replyData(reply: Reply) {
  if (!reply.ok) throw Error(reply.error.code);
  return reply.data;
}
const body = 'P1003 confidential synthetic body';
const checksum = (data: Buffer) => createHash('sha256').update(data).digest('hex');
async function addFile(f: Awaited<ReturnType<typeof fixture>>, project?: string) {
  const blob = await f.blobs.put(Buffer.from(body), 'text/plain');
  const file = f.files.importBlob({
    blobId: blob.id,
    name: 'portable.txt',
    relativePath: 'portable.txt',
    owner: project ? { type: 'project', id: project } : { type: 'library' },
  }).file;
  const job = f.files.jobs.claim('T20 parse')!;
  f.files.beginParse(job, file.version.id);
  await f.files.completeParse(
    job,
    file.version.id,
    ParsedDocumentSchema.parse({
      schemaVersion: 1,
      parserVersion: FILE_PARSER_VERSION,
      format: 'text',
      blocks: [
        {
          id: 'line',
          kind: 'text',
          text: body,
          locator: { kind: 'text', start: 0, end: body.length },
        },
      ],
      pages: [],
      sheets: [],
      slides: [],
      entries: [],
      quality: { needsOcr: false, warnings: [] },
    }),
    new AbortController().signal,
  );
  f.files.jobs.finish(job, 'completed');
  return file;
}
function addSession(store: Store, title: string, projectId?: string) {
  const service = new CoreService(store);
  const id = (
    replyData(
      service.dispatch(
        request('sessions.create', {
          title,
          mode: 'chat',
          ...(projectId ? { projectId } : {}),
        }),
      ),
    ) as { entityId: string }
  ).entityId;
  const { active_branch_id: branch } = store.db
    .prepare('SELECT active_branch_id FROM sessions WHERE id=?')
    .get(id) as { active_branch_id: string };
  const message = newId(),
    now = store.now();
  store.db
    .prepare(
      "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status) VALUES(?,?,?,?,?,?,'user',?,'final')",
    )
    .run(
      message,
      store.profileId,
      now,
      now,
      id,
      branch,
      JSON.stringify({ schemaVersion: 1, blocks: [{ kind: 'text', text: title + ' 正文' }] }),
    );
  store.db.prepare('UPDATE branches SET head_message_id=? WHERE id=?').run(message, branch);
  return { id, message };
}
function addMemory(store: Store, messages: string[]) {
  const memory = newId(),
    now = store.now();
  store.db
    .prepare(
      "INSERT INTO memories(id,profile_id,created_at,updated_at,subject,predicate,value_json,scope_type,scope_id,status,valid_from,source_ids_json,content_hash) VALUES(?,?,?,?,'fixture','preference','{\"value\":\"fixture memory\"}','profile',?,'active',?,?,?)",
    )
    .run(
      memory,
      store.profileId,
      now,
      now,
      store.profileId,
      now,
      JSON.stringify(messages),
      checksum(Buffer.from('memory')),
    );
  return memory;
}
async function preview(
  f: Awaited<ReturnType<typeof fixture>>,
  selection: { categories: string[]; includeBackups: boolean },
) {
  const data = replyData(await f.lifecycle.dispatch(request('data.clearPreview', selection)));
  return DataImpactSchema.parse((data as { dataImpact: unknown }).dataImpact);
}

test('P10-03 T20 portable ZIP copies records and remaps file, project and version IDs into an independent profile', async () => {
  const source = await fixture();
  const project = (
    replyData(
      new CoreService(source.store).dispatch(
        request('projects.create', { name: 'Portable project' }),
      ),
    ) as { entityId: string }
  ).entityId;
  const session = addSession(source.store, 'Portable conversation', project);
  const db = source.store.db,
    now = source.store.now(),
    profile = source.store.profileId;
  const branch = newId(),
    forked = newId(),
    account = newId();
  db.prepare(
    'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label) VALUES(?,?,?,?,?,?)',
  ).run(branch, profile, now, now, session.id, 'Retained alternate');
  db.prepare(
    "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,parent_message_id,role,content_json,status) VALUES(?,?,?,?,?,?,?,'assistant',?,'final')",
  ).run(
    forked,
    profile,
    now,
    now,
    session.id,
    branch,
    session.message,
    JSON.stringify({ schemaVersion: 1, blocks: [{ kind: 'text', text: 'Alternate body' }] }),
  );
  db.prepare('UPDATE branches SET head_message_id=? WHERE id=?').run(forked, branch);
  db.prepare(
    "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES(?,?,?,?,'deepseek','Fixture account','api_key',?,'ready')",
  ).run(account, profile, now, now, newId());
  db.prepare(
    'INSERT INTO opaque_states(id,profile_id,created_at,updated_at,account_id,model_ref,adapter_version,branch_id,cipher_blob_ref,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newId(),
    profile,
    now,
    now,
    account,
    'fixture-model',
    'fixture-adapter',
    branch,
    'fixture-opaque',
    checksum(Buffer.from('synthetic opaque fixture')),
  );
  await mkdir(join(source.store.dataDir, 'secrets'));
  await writeFile(join(source.store.dataDir, 'secrets', 'fixture'), 'synthetic vault fixture');
  const file = await addFile(source, project);
  addMemory(source.store, [session.message]);
  const path = join(source.store.dataDir, 'copy.zip');
  const expected = { projects: 1, sessions: 1, files: 1, memories: 1 };
  expect(await source.portable.export(['projects', 'sessions', 'files', 'memories'], path)).toEqual(
    expected,
  );
  await expect(source.portable.export(['files'], path)).rejects.toMatchObject({ code: 'EEXIST' });
  const receiver = await fixture();
  expect(receiver.store.profileId).not.toBe(source.store.profileId);
  expect(await receiver.portable.importFile(path)).toEqual(expected);
  const row = receiver.store.db.prepare('SELECT id,current_version_id FROM files').get() as {
    id: string;
    current_version_id: string;
  };
  expect(row.id).not.toBe(file.id);
  expect(row.current_version_id).not.toBe(file.version.id);
  expect((await receiver.blobs.readVersion(row.current_version_id)).toString()).toBe(body);
  expect(receiver.store.db.prepare('SELECT count(*) n FROM provider_accounts').get()).toEqual({
    n: 0,
  });
  expect(receiver.store.db.prepare('SELECT count(*) n FROM opaque_states').get()).toEqual({ n: 0 });
  expect(receiver.store.db.prepare('SELECT id,project_id FROM sessions').get()).toEqual({
    id: expect.not.stringMatching(session.id),
    project_id: expect.not.stringMatching(project),
  });
  expect(
    receiver.store.db.prepare('SELECT resource_id,owner_id FROM resource_links').get(),
  ).toMatchObject({ resource_id: row.id });
  expect(receiver.store.db.prepare('SELECT content_json,role FROM messages').get()).toMatchObject({
    content_json: expect.stringContaining('Portable conversation 正文'),
    role: 'system_note',
  });
  expect(
    receiver.store.db
      .prepare(
        "SELECT child.id,child.content_json,parent.content_json AS parent FROM branches b JOIN messages child ON child.id=b.head_message_id JOIN messages parent ON parent.id=child.parent_message_id WHERE b.label='Retained alternate'",
      )
      .get(),
  ).toMatchObject({
    id: expect.not.stringMatching(forked),
    content_json: expect.stringContaining('Alternate body'),
    parent: expect.stringContaining('Portable conversation 正文'),
  });
  expect(receiver.store.db.prepare('SELECT status FROM memories').get()).toEqual({
    status: 'superseded',
  });
  expect(
    new MemoryService(receiver.store).list({ type: 'profile', id: receiver.store.profileId })
      .memories,
  ).toMatchObject([{ value: 'fixture memory', imported: true }]);
  expect(receiver.store.db.pragma('foreign_key_check')).toEqual([]);
});
test('P10-03 T20 rejects truncated ZIP, wrong data hash, future schema and unexpected entries before import', async () => {
  const f = await fixture();
  const payload = Buffer.from(
    JSON.stringify({ projects: [], sessions: [], files: [], memories: [], links: [] }),
  );
  const manifest = {
    schema_version: 1,
    format: 'tapkit-portable-data',
    categories: ['files'],
    data_hash: checksum(payload),
    files: [],
  };
  for (const [patch, extra] of [
    [{ schema_version: 2 }, false],
    [{ data_hash: 'a'.repeat(64) }, false],
    [{}, true],
  ] as const) {
    const bytes = await managedZip([
      { name: 'manifest.json', bytes: Buffer.from(JSON.stringify({ ...manifest, ...patch })) },
      { name: 'data.json', bytes: payload },
      ...(extra ? [{ name: 'extra.txt', bytes: Buffer.from('bad') }] : []),
    ]);
    await expect(f.portable.importBytes(bytes)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  const hostile = await managedZip([{ name: 'safe/test', bytes: Buffer.from('outside') }]);
  for (
    let offset = hostile.indexOf('safe/test');
    offset !== -1;
    offset = hostile.indexOf('safe/test', offset + 9)
  )
    hostile.write('../escape', offset, 'utf8');
  await expect(f.portable.importBytes(hostile)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(f.portable.importBytes(Buffer.from('PK'))).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  });
  expect(f.store.db.prepare('SELECT count(*) n FROM blobs').get()).toEqual({ n: 0 });
});
test('P10-03 T20 file clear revokes bytes, references, indexes and cache and an old restore replays deletion', async () => {
  const f = await fixture();
  const file = await addFile(f);
  const original = await f.blobs.backup(newId());
  const select = { categories: ['files'], includeBackups: false };
  const impact = await preview(f, select);
  expect(impact).toMatchObject({ files: 1, indexes: 1, caches: 1 });
  const stale = await f.lifecycle.dispatch(
    request('data.clear', { ...select, impactHash: 'f'.repeat(64) }),
  );
  expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  const clear = request('data.clear', { ...select, impactHash: impact.impactHash });
  const cleared = await f.lifecycle.dispatch(clear);
  expect(cleared).toMatchObject({ ok: true, data: { jobId: clear.requestId } });
  expect(await f.lifecycle.dispatch(clear)).toEqual(cleared);
  expect(() => f.blobs.readVersion(file.version.id)).toThrow('NOT_FOUND');
  for (const table of ['file_search_documents', 'chunks'])
    expect(f.store.db.prepare('SELECT count(*) n FROM ' + table).get()).toEqual({ n: 0 });
  expect(f.store.db.prepare('SELECT deleted_at FROM parsed_documents').get()).toMatchObject({
    deleted_at: expect.any(Number),
  });
  const queue = new JobQueue(f.store),
    job = queue.claim('complete clear')!;
  expect(job.id).toBe(clear.requestId);
  await f.lifecycle.executeClear(job, new AbortController().signal);
  queue.finish(job, 'completed');
  expect((await f.lifecycle.restore(newId(), original)).ok).toBe(true);
  const root = f.store.dataDir;
  f.store.close();
  const recovered = await fixture(root);
  expect(
    recovered.store.db
      .prepare("SELECT entity_id FROM deletion_tombstones WHERE entity_type='file'")
      .get(),
  ).toEqual({ entity_id: file.id });
  expect(() => recovered.blobs.readVersion(file.version.id)).toThrow('NOT_FOUND');
  expect(recovered.store.db.prepare('SELECT count(*) n FROM file_search_documents').get()).toEqual({
    n: 0,
  });
  expect(
    recovered.store.db
      .prepare('SELECT count(*) n FROM resource_links WHERE deleted_at IS NULL AND resource_id=?')
      .get(file.id),
  ).toEqual({ n: 0 });
});
test('P10-03 T20 resumes a fsynced clear and expired cleanup lease, and removes the old snapshot only', async () => {
  let time = Date.now();
  const f = await fixture(undefined, () => time);
  const file = await addFile(f);
  const old = await f.blobs.backup(newId());
  const incomplete = join(f.store.dataDir, 'backups', newId());
  await mkdir(incomplete);
  await copyFile(
    join(f.store.dataDir, 'backups', old, 'app.sqlite'),
    join(incomplete, 'app.sqlite'),
  );
  const operationId = newId();
  writeClearRecord(f.store, {
    schemaVersion: 1,
    profileId: f.store.profileId,
    operationId,
    deletedAt: time,
    clear: {
      schemaVersion: 1,
      kind: 'data.clear',
      includeBackups: true,
      impactHash: '1'.repeat(64),
      targets: [{ type: 'file', id: file.id }],
    },
  });
  const root = f.store.dataDir;
  f.store.close();
  const resumed = await fixture(root, () => time);
  const safe = await resumed.blobs.backup(newId());
  resumed.store.close();
  const child = fork(resolve('tests/fixtures/P00-02.crash.cjs'), [root, 'clear', old], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const lost = await new Promise<{ id: string; expires: number }>((resolve, reject) => {
    child.once('message', (message) => {
      child.kill();
      resolve(message as { id: string; expires: number });
    });
    child.once('exit', () => reject(Error('Clear worker exited before staging the snapshot')));
    child.once('error', reject);
  });
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  expect(lost.id).toBe(operationId);
  time = lost.expires + 1;
  const restarted = await fixture(root, () => time);
  const worker = new FoundationWorker(
    restarted.store,
    restarted.blobs,
    () => {},
    (job, signal) => restarted.lifecycle.executeClear(job, signal),
  );
  workers.push(worker);
  worker.start();
  await expect
    .poll(
      () =>
        restarted.store.db.prepare('SELECT status,attempts FROM jobs WHERE id=?').get(operationId),
      { timeout: 15000 },
    )
    .toMatchObject({ status: 'completed', attempts: 2 });
  expect((await localBackups(root)).map((x) => x.manifest.id)).toEqual([safe]);
  await expect(readFile(join(incomplete, 'app.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' });
  const digest = checksum(Buffer.from(body));
  await expect(
    readFile(join(root, 'blobs', 'sha256', digest.slice(0, 2), digest)),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
test('P10-03 T20 clearing a project preserves an independently supported memory', async () => {
  const f = await fixture();
  const project = (
    replyData(
      new CoreService(f.store).dispatch(request('projects.create', { name: 'To clear' })),
    ) as { entityId: string }
  ).entityId;
  const one = addSession(f.store, 'one', project),
    two = addSession(f.store, 'two'),
    three = addSession(f.store, 'three');
  const memory = addMemory(f.store, [one.message, two.message, three.message]);
  const selection = { categories: ['projects'], includeBackups: false };
  const impact = await preview(f, selection);
  expect(impact).toMatchObject({ projects: 1, sessions: 1, messages: 1, relatedMemories: 1 });
  expect(
    await f.lifecycle.dispatch(
      request('data.clear', { ...selection, impactHash: impact.impactHash }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    f.store.db.prepare('SELECT status,source_ids_json FROM memories WHERE id=?').get(memory),
  ).toEqual({ status: 'active', source_ids_json: JSON.stringify([two.message, three.message]) });
});
test('P10-03 T20 interrupted backup leaves last valid snapshot and recovery export applies the journal', async () => {
  const f = await fixture();
  await addFile(f);
  const old = await f.blobs.backup(newId());
  const controller = new AbortController();
  controller.abort();
  await expect(f.blobs.backup(newId(), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  const interrupted = newId();
  const incomplete = join(f.store.dataDir, 'backups', interrupted);
  await mkdir(join(incomplete, 'manifest.tmp'), { recursive: true });
  await expect(f.blobs.backup(interrupted)).rejects.toThrow();
  expect((await readFile(join(incomplete, 'app.sqlite'))).length).toBeGreaterThan(0);
  const root = f.store.dataDir;
  const copies = await localBackups(root);
  expect(copies.map((x) => x.manifest.id)).toEqual([old]);
  await expect(verifyLocalBackup(root, copies[0]!, SCHEMA_VERSION)).resolves.toMatch(
    /^[a-f0-9]{64}$/,
  );
  const selection = { categories: ['files'], includeBackups: false };
  const impact = await preview(f, selection);
  expect(
    await f.lifecycle.dispatch(
      request('data.clear', { ...selection, impactHash: impact.impactHash }),
    ),
  ).toMatchObject({ ok: true });
  f.store.close();
  const broken = Buffer.from('corrupt original');
  await writeFile(join(root, 'db', 'app.sqlite'), broken);
  expect(
    await withRecoverySnapshot(
      root,
      async (copy) => (await new PortableData(copy, new BlobStore(copy)).build(['files'])).counts,
    ),
  ).toMatchObject({ files: 0 });
  expect(await readFile(join(root, 'db', 'app.sqlite'))).toEqual(broken);
});
test('P10-03 T20 directory migration keeps the profile identity and does not publish an invalid destination', async () => {
  const f = await fixture();
  const root = f.store.dataDir,
    profile = f.store.profileId,
    file = await addFile(f);
  f.store.close();
  await expect(moveDataRoot(root, root, join(root, 'db'))).rejects.toThrow('PERMISSION_DENIED');
  expect(readDataRoot(root)).toBe(root);
  const destination = await moveDataRoot(root, root, await directory());
  expect(readDataRoot(root)).toBe(destination);
  const migrated = await fixture(destination);
  expect(migrated.store.profileId).toBe(profile);
  expect((await migrated.blobs.readVersion(file.version.id)).toString()).toBe(body);
});
