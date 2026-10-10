import { it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { openStore, newId, Store, migrate, migrations } from '../../packages/storage/src';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
import { CoreService } from '../../packages/core/src/service';
import { CreatedEntitySchema, WorkspaceViewSchema, type Reply } from '../../packages/contracts/src';
const stores: Store[] = [];
async function fresh() {
  await mkdir('.test-data', { recursive: true });
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P02-01 ')));
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
function request(command: string, payload: unknown, expectedRevision?: number) {
  return {
    protocolVersion: 1,
    requestId: newId(),
    command,
    payload,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  };
}
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
it('P02-01 T01 persists CAS settings, profile nickname and personal preferences without erasing existing fields', async () => {
  const store = await fresh(),
    service = new CoreService(store),
    scope = { type: 'profile', id: store.profileId };
  const personal = {
    ...store.settings.values.personal,
    nickname: '测试用户',
    occupation: 'fixture',
  };
  const update = request(
    'settings.set',
    {
      scope,
      patch: {
        personal,
        desktop: { ...store.settings.values.desktop, theme: 'dark' },
        network: { mode: 'direct', proxyURL: '' },
      },
    },
    1,
  );
  expect(service.dispatch(update).ok).toBe(true);
  expect(service.dispatch(update).ok).toBe(true);
  expect(store.settings.revision).toBe(2);
  expect(store.bootstrap().profile.displayName).toBe('测试用户');
  expect(
    service.dispatch(request('settings.set', { scope, patch: { historyEnabled: false } }, 1)),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT', currentRevision: 2 } });
  expect(
    service.dispatch(request('settings.set', { scope, patch: { historyEnabled: false } }, 2)).ok,
  ).toBe(true);
  expect(store.settings.values.desktop.theme).toBe('dark');
  expect(store.settings.values.personal.occupation).toBe('fixture');
  expect(
    service.dispatch(
      request(
        'settings.set',
        { scope: { type: 'profile', id: newId() }, patch: { historyEnabled: true } },
        3,
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  const dir = store.dataDir;
  store.close();
  const reopened = await openStore(dir);
  stores.push(reopened);
  expect(reopened.settings.values.network.mode).toBe('direct');
  expect(reopened.settings.values.historyEnabled).toBe(false);
  expect(reopened.replay(0, 100).items).toHaveLength(2);
  expect(JSON.stringify(reopened.replay(0, 100))).not.toContain('测试用户');
  expect(JSON.stringify(reopened.replay(0, 100))).not.toContain('occupation');
});
it('P02-01 T01 creates real session anchors and project records idempotently; pin conflicts and tombstones are enforced', async () => {
  const store = await fresh(),
    service = new CoreService(store),
    create = request('sessions.create', { mode: 'work', title: '真实工作记录' });
  const reply = service.dispatch(create),
    id = CreatedEntitySchema.parse(data(reply)).entityId;
  expect(service.dispatch(create)).toEqual(reply);
  expect(store.db.prepare('SELECT count(*) AS n FROM branches WHERE session_id=?').get(id)).toEqual(
    { n: 1 },
  );
  expect(store.db.pragma('foreign_key_check')).toEqual([]);
  expect(service.dispatch(request('projects.create', { name: '本地项目' })).ok).toBe(true);
  expect(service.dispatch(request('sessions.pin', { sessionId: id, pinned: true }, 1)).ok).toBe(
    true,
  );
  expect(
    service.dispatch(request('sessions.pin', { sessionId: id, pinned: false }, 1)),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  expect(
    service.dispatch(request('sessions.pin', { sessionId: newId(), pinned: true }, 1)),
  ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  const view = WorkspaceViewSchema.parse(data(service.dispatch(request('desktop.workspace', {}))));
  expect(view.sessions).toMatchObject([
    { id, mode: 'work', pinned: true, unread: false, revision: 2 },
  ]);
  expect(view.projects[0]?.name).toBe('本地项目');
  expect(view.files).toEqual([]);
  expect(view.pendingApprovals).toBe(0);
  store.db.prepare('UPDATE sessions SET deleted_at=1 WHERE id=?').run(id);
  expect(
    WorkspaceViewSchema.parse(data(service.dispatch(request('desktop.workspace', {})))).sessions,
  ).toEqual([]);
  expect(
    service.dispatch(request('sessions.create', { mode: 'work', title: 'illegal', run: true })),
  ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
});
it('P02-01 T20 migrates a v4 database and legacy preferences without resetting model accounts or unrelated settings', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-01 legacy '));
  await mkdir(join(dir, 'db'));
  const db = new Database(join(dir, 'db/app.sqlite'));
  db.pragma('foreign_keys=ON');
  await migrate(db, join(dir, 'backups'), migrations.slice(0, 4));
  const store = new Store(db, dir),
    id = store.profileId;
  stores.push(store);
  const account = newId();
  db.prepare(
    "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES(?,?,?,?,'codex-subscription','旧账号','oauth',?,'ready')",
  ).run(account, id, 1, 1, newId());
  const {
    desktop: _,
    personal: __,
    personalization: ___,
    network: ____,
    ...legacy
  } = store.settings.values;
  store.db
    .prepare("UPDATE settings SET value_json=? WHERE key='preferences'")
    .run(JSON.stringify({ schemaVersion: 1, values: { ...legacy, historyEnabled: false } }));
  store.close();
  const reopened = await openStore(dir);
  stores.push(reopened);
  expect(reopened.profileId).toBe(id);
  expect(reopened.db.pragma('user_version', { simple: true })).toBe(10);
  expect(reopened.settings.values.historyEnabled).toBe(false);
  expect(reopened.settings.values.desktop.theme).toBe('system');
  expect(reopened.db.prepare('SELECT id,label FROM provider_accounts').get()).toEqual({
    id: account,
    label: '旧账号',
  });
  reopened.close();
  const again = await openStore(dir);
  stores.push(again);
  expect(again.db.prepare('SELECT count(*) AS n FROM profiles').get()).toEqual({ n: 1 });
});

it('P02-01 proxy switching restores routing without changing environment or sending credentials', async () => {
  const { createServer } = await import('node:http');
  const { configureProviderNetwork } = await import('../../packages/providers/src');
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
    expect(request.headers.authorization === undefined).toBe(true);
    response.end('local fixture');
  });
  server.on('connect', (request, socket) => {
    paths.push('CONNECT ' + request.url);
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes('\r\n\r\n')) return;
      paths.push(buffer.split('\r\n')[0]!);
      socket.end('HTTP/1.1 200 OK\r\nContent-Length: 13\r\nConnection: close\r\n\r\nlocal fixture');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port,
    previous = process.env.TAPKIT_HTTP_PROXY;
  let undoProxy: (() => void) | undefined, undoDirect: (() => void) | undefined;
  try {
    undoProxy = configureProviderNetwork({
      TAPKIT_HTTP_PROXY: 'http://127.0.0.1:' + port,
      NO_PROXY: '',
    });
    expect(
      await (
        await fetch('http://p02-01.invalid/before', { signal: AbortSignal.timeout(3000) })
      ).text(),
    ).toBe('local fixture');
    undoDirect = configureProviderNetwork({ TAPKIT_HTTP_PROXY: '' });
    expect(
      await (
        await fetch('http://127.0.0.1:' + port + '/direct', { signal: AbortSignal.timeout(3000) })
      ).text(),
    ).toBe('local fixture');
    expect(paths).toEqual(['CONNECT p02-01.invalid:80', 'GET /before HTTP/1.1', '/direct']);
    expect(process.env.TAPKIT_HTTP_PROXY === previous).toBe(true);
  } finally {
    undoDirect?.();
    undoProxy?.();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
