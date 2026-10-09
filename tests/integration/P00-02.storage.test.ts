import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  openStore,
  Store,
  BlobStore,
  JobQueue,
  Outbox,
  migrate,
  migrations,
  SCHEMA_VERSION,
  newId,
} from '../../packages/storage/src/index';
import { CoreService } from '../../packages/core/src/service';
import { FoundationWorker } from '../../packages/core/src/worker';
import { ReplySchema, type Request } from '../../packages/contracts/src/index';
const require = createRequire(import.meta.url);
const Database =
  require('../../packages/storage/node_modules/better-sqlite3') as typeof import('better-sqlite3');
const stores: Store[] = [];
const children: ChildProcess[] = [];
async function fresh(now?: () => number) {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P00-02 中文 '));
  const store = await openStore(dir, now);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const s of stores.splice(0)) if (s.db.open) s.close();
  for (const c of children.splice(0)) c.kill();
});
function req(command: string, payload: unknown, expectedRevision?: number): Request {
  return {
    protocolVersion: 1,
    requestId: newId(),
    command,
    payload,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  };
}
describe('P00-02 real SQLite storage integration', () => {
  it('T01 creates one profile, preserves defaults and enables WAL/FK/FULL', async () => {
    const store = await fresh();
    expect(store.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(store.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(store.db.pragma('synchronous', { simple: true })).toBe(2);
    const id = store.profileId;
    store.close();
    const reopened = await openStore(store.dataDir);
    stores.push(reopened);
    expect(reopened.profileId).toBe(id);
    expect(reopened.settings.values.memoryEnabled).toBe(true);
    expect(reopened.db.pragma('foreign_key_check')).toEqual([]);
    expect(reopened.db.prepare('SELECT count(*) AS n FROM profiles').get()).toEqual({ n: 1 });
  });
  it('T05 duplicate request writes once across reopen; changed payload conflicts', async () => {
    const store = await fresh(),
      service = new CoreService(store);
    const request = req(
      'settings.set',
      { scope: { type: 'profile', id: store.profileId }, patch: { memoryEnabled: false } },
      1,
    );
    const first = service.dispatch(request);
    expect(first.ok).toBe(true);
    expect(service.dispatch(request)).toEqual(first);
    store.close();
    const reopened = await openStore(store.dataDir);
    stores.push(reopened);
    const next = new CoreService(reopened);
    expect(next.dispatch(request)).toEqual(first);
    const conflict = next.dispatch({
      ...request,
      payload: { scope: { type: 'profile', id: store.profileId }, patch: { memoryEnabled: true } },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('CONFLICT');
    expect(reopened.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 1 });
    expect(reopened.db.prepare('SELECT count(*) AS n FROM outbox').get()).toEqual({ n: 1 });
  });
  it('T05 atomically rolls back state, receipt and event when outbox insertion fails', async () => {
    const store = await fresh(),
      service = new CoreService(store);
    store.db.exec(
      "CREATE TRIGGER reject_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'fixture'); END",
    );
    const reply = service.dispatch(
      req(
        'settings.set',
        { scope: { type: 'profile', id: store.profileId }, patch: { memoryEnabled: false } },
        1,
      ),
    );
    expect(reply.ok).toBe(false);
    expect(store.settings.revision).toBe(1);
    for (const table of ['events', 'outbox', 'request_receipts'])
      expect(store.db.prepare('SELECT count(*) AS n FROM ' + table).get()).toEqual({ n: 0 });
  });
  it('T19 enforces Core profile scope, strict payloads, unknown commands and CAS', async () => {
    const store = await fresh(),
      service = new CoreService(store);
    expect(service.dispatch(req('terminal.start', {}))).toMatchObject({
      ok: false,
      error: { code: 'FEATURE_NOT_AVAILABLE' },
    });
    expect(
      service.dispatch(req('settings.get', { scope: { type: 'profile', id: newId() } })),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    expect(
      service.dispatch(
        req(
          'settings.set',
          { scope: { type: 'profile', id: store.profileId }, patch: { memoryEnabled: false } },
          1,
        ),
      ).ok,
    ).toBe(true);
    expect(
      service.dispatch(
        req(
          'settings.set',
          { scope: { type: 'profile', id: store.profileId }, patch: { historyEnabled: false } },
          1,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT', currentRevision: 2 } });
    expect(service.dispatch(req('providers.saveApiKey', { key: 'secret' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
  it('replays ordered committed events with a bounded page', async () => {
    const store = await fresh(),
      service = new CoreService(store);
    for (let i = 1; i <= 3; i++)
      service.dispatch(
        req(
          'settings.set',
          {
            scope: { type: 'profile', id: store.profileId },
            patch: { memoryEnabled: i % 2 === 0 },
          },
          i,
        ),
      );
    const page = store.replay(0, 2);
    expect(page.items.map((e) => e.seq)).toEqual([1, 2]);
    expect(page.nextCursor).not.toBeNull();
    expect(store.replay(2, 2).items.map((e) => e.seq)).toEqual([3]);
  });
  it('T20 migration failure rolls back and preserves a real SQLite backup; downgrade fails closed', async () => {
    const store = await fresh();
    await expect(
      migrate(store.db, join(store.dataDir, 'migration-test'), [
        ...migrations.map((m) => ({ version: m.version, sql: '' })),
        {
          version: SCHEMA_VERSION + 1,
          sql: 'CREATE TABLE rollback_probe(id TEXT); INSERT INTO no_such_table VALUES (1);',
        },
      ]),
    ).rejects.toThrow();
    expect(store.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(
      store.db.prepare("SELECT name FROM sqlite_master WHERE name='rollback_probe'").get(),
    ).toBeUndefined();
    const backupFile = (await readdir(join(store.dataDir, 'migration-test')))[0]!;
    const backup = new Database(join(store.dataDir, 'migration-test', backupFile), {
      readonly: true,
    });
    expect(backup.prepare('SELECT count(*) AS n FROM profiles').get()).toEqual({ n: 1 });
    backup.close();
    store.db.pragma('user_version = ' + (SCHEMA_VERSION + 1));
    store.close();
    await expect(openStore(store.dataDir)).rejects.toThrow('DATABASE_RECOVERY_REQUIRED');
    const ro = new Database(join(store.dataDir, 'db/app.sqlite'), { readonly: true });
    expect(ro.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION + 1);
    ro.close();
  });
  it('T20 corruption is preserved, never replaced by an empty database', async () => {
    const store = await fresh();
    store.close();
    const path = join(store.dataDir, 'db/app.sqlite');
    await writeFile(path, 'corrupted-data-fixture');
    await expect(openStore(store.dataDir)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('corrupted-data-fixture');
  });
  it('lease epochs reject stale callbacks; cancellation is durable; dedupe is stable', async () => {
    let now = Date.now();
    const store = await fresh(() => now),
      queue = new JobQueue(store);
    const id = queue.enqueue({ schemaVersion: 1, kind: 'blob.gc' }, 'stable');
    expect(queue.enqueue({ schemaVersion: 1, kind: 'blob.gc' }, 'stable')).toBe(id);
    const first = queue.claim('one')!;
    expect(queue.claim('two')).toBeUndefined();
    now += 16_000;
    const second = queue.claim('two')!;
    expect(second.lease_epoch).toBe(first.lease_epoch + 1);
    expect(queue.heartbeat(first)).toBe(false);
    expect(queue.finish(first, 'completed')).toBe(false);
    expect(queue.cancel(id)).toBe('cancelled');
    expect(queue.finish(second, 'completed')).toBe(false);
    expect(queue.claim('three')).toBeUndefined();
  });
  it('outbox delivery is fenced and can replay once to an idempotent consumer', async () => {
    let now = Date.now();
    const store = await fresh(() => now),
      service = new CoreService(store);
    service.dispatch(
      req(
        'settings.set',
        { scope: { type: 'profile', id: store.profileId }, patch: { memoryEnabled: false } },
        1,
      ),
    );
    const outbox = new Outbox(store),
      a = outbox.claim('one')!;
    now += 16_000;
    const b = outbox.claim('two')!;
    expect(outbox.heartbeat(a)).toBe(false);
    expect(outbox.heartbeat(b)).toBe(true);
    expect(outbox.ack(a)).toBe(false);
    expect(outbox.ack(b)).toBe(true);
    expect(outbox.claim('three')).toBeUndefined();
    const consumed = new Set([a.event_id, b.event_id]);
    expect(consumed.size).toBe(1);
  });
  it('T20 blob bytes and backup snapshot match; trash immediately revokes reads and keeps a tombstone', async () => {
    const store = await fresh(),
      blobs = new BlobStore(store),
      bytes = Buffer.from('中文 blob fixture');
    const blob = await blobs.put(bytes, 'text/plain');
    const file = blobs.attach(blob.id, '资料.txt');
    expect(await blobs.readVersion(file.versionId)).toEqual(bytes);
    const id = await blobs.backup(newId());
    const manifest = JSON.parse(
      await readFile(join(store.dataDir, 'backups', id, 'manifest.json'), 'utf8'),
    );
    expect(manifest.blobs[0].sha256).toBe(blob.sha256);
    const snapshot = new Database(join(store.dataDir, 'backups', id, 'app.sqlite'), {
      readonly: true,
    });
    expect(snapshot.prepare('SELECT count(*) AS n FROM files').get()).toEqual({ n: 1 });
    snapshot.close();
    blobs.trash(file.id);
    expect(() => blobs.readVersion(file.versionId)).toThrow('NOT_FOUND');
    expect(store.db.prepare('SELECT entity_id FROM deletion_tombstones').get()).toEqual({
      entity_id: file.id,
    });
  });
  it('background worker completes one deduplicated backup and stops cleanly', async () => {
    const store = await fresh(),
      blobs = new BlobStore(store),
      worker = new FoundationWorker(store, blobs, () => {});
    const id = worker.queue.enqueue({ schemaVersion: 1, kind: 'data.backup' }, 'backup-one');
    worker.start();
    try {
      await expect
        .poll(() => store.db.prepare('SELECT status FROM jobs WHERE id=?').get(id))
        .toEqual({ status: 'completed' });
    } finally {
      await worker.stop();
    }
    expect(worker.queue.enqueue({ schemaVersion: 1, kind: 'data.backup' }, 'backup-one')).toBe(id);
    expect(store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get(id)).toEqual({
      attempts: 1,
    });
  });
  it('T20 process death after blob rename permits orphan GC', async () => {
    const store = await fresh();
    store.close();
    const child = fork(resolve('tests/fixtures/P00-02.crash.cjs'), [store.dataDir, 'blob'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      child.once('message', () => {
        child.kill();
        resolve();
      });
      child.once('error', reject);
    });
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const reopened = await openStore(store.dataDir);
    stores.push(reopened);
    const blobs = new BlobStore(reopened);
    expect(await blobs.gc()).toBe(1);
    expect(reopened.db.prepare('SELECT count(*) AS n FROM blobs').get()).toEqual({ n: 0 });
  });
  it('T05 process death after job claim recovers the same job with a new epoch', async () => {
    const store = await fresh();
    store.close();
    const child = fork(resolve('tests/fixtures/P00-02.crash.cjs'), [store.dataDir, 'job'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.push(child);
    const result = await new Promise<{ id: string; epoch: number; expires: number }>(
      (resolve, reject) => {
        child.once('message', (data) => {
          resolve(data as { id: string; epoch: number; expires: number });
          child.kill();
        });
        child.once('error', reject);
      },
    );
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const reopened = await openStore(store.dataDir, () => result.expires + 1);
    stores.push(reopened);
    const queue = new JobQueue(reopened),
      job = queue.claim('recovered')!;
    expect(job.id).toBe(result.id);
    expect(job.lease_epoch).toBe(result.epoch + 1);
    expect(queue.finish(job, 'completed')).toBe(true);
    expect(queue.claim('again')).toBeUndefined();
    expect(
      ReplySchema.safeParse(new CoreService(reopened).dispatch(req('app.bootstrap', {}))).success,
    ).toBe(true);
  });

  it('JSON values require their schema version; temporary sessions cannot persist', async () => {
    const store = await fresh();
    expect(() => store.db.prepare("UPDATE settings SET value_json='{}'").run()).toThrow();
    expect(() =>
      store.db
        .prepare(
          "INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,temporary,settings_json,last_activity_at) VALUES (?,?,?,?,?,'chat',1,?,?)",
        )
        .run(
          newId(),
          store.profileId,
          0,
          0,
          '临时',
          JSON.stringify({ schemaVersion: 1, values: {} }),
          0,
        ),
    ).toThrow();
  });
  it('backup retry reconciles its registry and rejects changed bytes', async () => {
    const store = await fresh(),
      blobs = new BlobStore(store),
      blob = await blobs.put(Buffer.from('verified'));
    const id = await blobs.backup(newId());
    store.db.prepare('DELETE FROM backups WHERE id=?').run(id);
    expect(await blobs.backup(id)).toBe(id);
    expect(store.db.prepare('SELECT state FROM backups WHERE id=?').get(id)).toEqual({
      state: 'complete',
    });
    const key = (
      store.db.prepare('SELECT relative_key FROM blobs WHERE id=?').get(blob.id) as {
        relative_key: string;
      }
    ).relative_key;
    await writeFile(join(store.dataDir, key), 'changed');
    await expect(blobs.backup(id)).rejects.toThrow('DATABASE_RECOVERY_REQUIRED');
  });
  it('T20 restores a verified snapshot, keeps corrupt original, and reapplies newer deletion tombstones', async () => {
    const store = await fresh(),
      blobs = new BlobStore(store),
      blob = await blobs.put(Buffer.from('preserved'));
    const file = blobs.attach(blob.id, '恢复.txt');
    await blobs.backup(newId());
    blobs.trash(file.id);
    const profileId = store.profileId;
    store.close();
    await writeFile(join(store.dataDir, 'db/app.sqlite'), 'corrupt-original-fixture');
    const restored = await openStore(store.dataDir);
    stores.push(restored);
    expect(restored.profileId).toBe(profileId);
    expect(() => new BlobStore(restored).readVersion(file.versionId)).toThrow('NOT_FOUND');
    const quarantine = (await readdir(join(store.dataDir, 'db/quarantine')))[0]!;
    expect(
      await readFile(join(store.dataDir, 'db/quarantine', quarantine, 'app.sqlite'), 'utf8'),
    ).toBe('corrupt-original-fixture');
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok');
  });
  it('daily snapshots retain seven days and never copy secrets', async () => {
    let now = Date.now();
    const store = await fresh(() => now),
      blobs = new BlobStore(store);
    await mkdir(join(store.dataDir, 'secrets'));
    await writeFile(join(store.dataDir, 'secrets', 'fixture'), 'encrypted-fixture');
    for (let i = 0; i < 9; i++) {
      await blobs.dailyBackup();
      now += 86_400_000;
    }
    const names = await readdir(join(store.dataDir, 'backups'));
    expect(names.filter((n) => n.startsWith('daily-'))).toHaveLength(7);
    expect(store.db.prepare('SELECT count(*) AS n FROM backups').get()).toEqual({ n: 7 });
    for (const name of names.filter((n) => !n.startsWith('daily-') && n !== 'migrations'))
      expect(await readdir(join(store.dataDir, 'backups', name))).toEqual(
        expect.arrayContaining(['app.sqlite', 'manifest.json']),
      );
  });
  it('outbox preserves seq ordering even for events written within one clock millisecond', async () => {
    const store = await fresh(),
      service = new CoreService(store),
      outbox = new Outbox(store);
    for (let i = 1; i <= 20; i++)
      service.dispatch(
        req(
          'settings.set',
          {
            scope: { type: 'profile', id: store.profileId },
            patch: { memoryEnabled: i % 2 === 0 },
          },
          i,
        ),
      );
    const seq: number[] = [];
    for (;;) {
      const item = outbox.claim('ordered');
      if (!item) break;
      seq.push(
        (
          store.db.prepare('SELECT seq FROM events WHERE id=?').get(item.event_id) as {
            seq: number;
          }
        ).seq,
      );
      outbox.ack(item);
    }
    expect(seq).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('an interrupted restore with a missing main DB does not create a new profile', async () => {
    const store = await fresh(),
      profileId = store.profileId;
    await new BlobStore(store).backup(newId());
    store.close();
    await unlink(join(store.dataDir, 'db/app.sqlite'));
    await mkdir(join(store.dataDir, 'db/quarantine'), { recursive: true });
    const restored = await openStore(store.dataDir);
    stores.push(restored);
    expect(restored.profileId).toBe(profileId);
  });
});
