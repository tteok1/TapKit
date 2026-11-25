import { afterAll, expect, test, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { openStore, newId, type Store } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { MemoryService } from '../../packages/core/src/memory-service';

const stores: Store[] = [];
afterAll(() => {
  for (const store of stores) store.close();
});
async function fixture() {
  vi.useRealTimers();
  await mkdir('.test-data', { recursive: true });
  const store = await openStore(await mkdtemp(resolve('.test-data/P11-01 history query ')));
  stores.push(store);
  const core = new CoreService(store),
    memory = new MemoryService(store);
  const command = (command: string, payload: unknown) => {
    const reply = core.dispatch({ protocolVersion: 1, requestId: newId(), command, payload });
    if (!reply.ok || !('entityId' in reply.data)) throw Error('Fixture creation failed');
    return reply.data.entityId;
  };
  const session = (projectId?: string) =>
    command('sessions.create', {
      title: '隔离查询',
      mode: 'chat',
      ...(projectId ? { projectId } : {}),
    });
  const add = (sessionId: string, body: string, createdAt = store.now()) => {
    const id = newId(),
      branch = store.db
        .prepare('SELECT active_branch_id id FROM sessions WHERE id=?')
        .get(sessionId) as { id: string };
    store.db
      .prepare(
        "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status) VALUES(?,?,?,?,?,?,'user',?,'final')",
      )
      .run(
        id,
        store.profileId,
        createdAt,
        createdAt,
        sessionId,
        branch.id,
        JSON.stringify({ schemaVersion: 1, blocks: [{ kind: 'text', text: body }] }),
      );
    return id;
  };
  return {
    store,
    core,
    memory,
    session,
    add,
    project: () => command('projects.create', { name: '隔离项目' }),
  };
}

test('P11-01 profile history yields newest valid matches without a global ordering buffer', async () => {
  const f = await fixture(),
    current = f.session(),
    other = f.session();
  const old = f.add(other, '共同标记 旧记录', f.store.now() + 5000);
  const recent = f.add(other, '共同标记 新记录', f.store.now() - 5000);
  f.add(current, '共同标记 当前会话');
  f.add(f.session(f.project()), '共同标记 项目秘密');
  for (let i = 0; i < 25; i++) f.add(other, '共同标记 API Key synthetic');
  let query = '';
  const prepare = f.store.db.prepare.bind(f.store.db);
  const spy = vi.spyOn(f.store.db, 'prepare').mockImplementation((sql) => {
    if (sql.includes('SELECT m.id,m.session_id,m.revision,m.content_json')) query = sql;
    return prepare(sql);
  });
  try {
    expect(
      f.memory.history(current, '共同标记', 2, undefined, true).map((r) => r.messageId),
    ).toEqual([recent, old]);
  } finally {
    spy.mockRestore();
  }
  const plan = f.store.db
    .prepare('EXPLAIN QUERY PLAN ' + query)
    .all(
      f.store.profileId,
      1,
      current,
      null,
      +f.memory.policy(current).globalHistory,
      null,
      null,
      '共同标记',
    ) as { detail: string }[];
  expect(plan.some((row) => row.detail.includes('USE TEMP B-TREE FOR ORDER BY'))).toBe(false);
});

test('P11-01 history selection, project scope, deletion and disabled policy remain enforced', async () => {
  const f = await fixture(),
    current = f.session(),
    one = f.session(),
    two = f.session();
  const first = f.add(one, '共同标记 第一条'),
    second = f.add(two, '共同标记 第二条');
  const removed = f.add(one, '共同标记 已删除');
  f.store.db.prepare('UPDATE messages SET deleted_at=? WHERE id=?').run(f.store.now(), removed);
  const project = f.project(),
    projectSession = f.session(project),
    projectMessage = f.add(projectSession, '共同标记 项目内');
  expect(f.memory.history(current, '共同标记').map((r) => r.messageId)).toEqual([second, first]);
  expect(f.memory.history(current, '共同标记', 20, [one]).map((r) => r.messageId)).toEqual([first]);
  expect(f.memory.history(current, '共同标记', 20, [])).toEqual([]);
  expect(f.memory.history(projectSession, '共同标记').map((r) => r.messageId)).toEqual([
    projectMessage,
  ]);
  const revision = (
    f.store.db.prepare('SELECT revision FROM sessions WHERE id=?').get(current) as {
      revision: number;
    }
  ).revision;
  const reply = f.memory.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    expectedRevision: revision,
    command: 'memory.policy.set',
    payload: { sessionId: current, memoryEnabled: true, historyEnabled: false },
  });
  expect(reply.ok).toBe(true);
  expect(f.memory.history(current, '共同标记')).toEqual([]);
});

test('P11-01 chat recall yields between bounded pages and preserves history ranking', async () => {
  const f = await fixture(),
    current = f.session(),
    other = f.session();
  f.store.db.transaction(() => {
    f.add(other, 'joint-marker older');
    for (let i = 0; i < 1030; i++) f.add(other, 'unrelated history');
    const newest = f.add(other, 'joint-marker newest');
    f.store.db.prepare('UPDATE messages SET rowid=rowid+100000000 WHERE id=?').run(newest);
    f.add(other, 'joint-marker API Key synthetic');
    f.add(current, 'joint-marker current session');
    f.add(f.session(f.project()), 'joint-marker project history');
  })();
  const before = f.memory.background(current, 'joint-marker');
  expect(before.historyUses.map(({ text }) => text)).toEqual([
    'joint-marker newest',
    'joint-marker older',
  ]);
  const prepare = f.store.db.prepare.bind(f.store.db);
  let pages = 0;
  const spy = vi.spyOn(f.store.db, 'prepare').mockImplementation((sql) => {
    if (sql.includes('m.rowid BETWEEN ? AND ?')) pages++;
    return prepare(sql);
  });
  try {
    const beforeNextTurn = new Promise<number>((done) => setImmediate(() => done(pages)));
    const recall = f.memory.backgroundForChat(
      current,
      'joint-marker',
      new AbortController().signal,
    );
    const pagesAtYield = await beforeNextTurn;
    expect(await recall).toEqual(before);
    expect(pagesAtYield).toBe(1);
    expect(pages).toBe(3);
  } finally {
    spy.mockRestore();
  }
});

test('P11-01 yielding chat recall revalidates deleted rows and honours cancellation', async () => {
  const f = await fixture(),
    current = f.session(),
    other = f.session();
  const preserved = f.add(other, 'joint-marker retained');
  const removed = f.add(other, 'joint-marker revoked while reading');
  expect(f.memory.history(current, 'joint-marker').map(({ messageId }) => messageId)).toEqual([
    removed,
    preserved,
  ]);
  setImmediate(() => {
    f.store.db.prepare('UPDATE messages SET deleted_at=? WHERE id=?').run(f.store.now(), removed);
  });
  const result = await f.memory.backgroundForChat(
    current,
    'joint-marker',
    new AbortController().signal,
  );
  expect(result.historyUses.map(({ messageId }) => messageId)).toEqual([preserved]);
  expect(result.historyModule?.text).not.toContain('revoked while reading');

  const cancel = new AbortController();
  setImmediate(() => cancel.abort(new Error('cancelled during recall')));
  await expect(f.memory.backgroundForChat(current, 'joint-marker', cancel.signal)).rejects.toThrow(
    'cancelled during recall',
  );
});
