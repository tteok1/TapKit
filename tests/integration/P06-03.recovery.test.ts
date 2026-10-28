import { test, expect, vi } from 'vitest';
import { fixture, until } from './P06.fixture';
import { WorkNotifications } from '../../packages/core/src/work-notifications';
import { openStore, newId, eraseSessionContent } from '../../packages/storage/src';
import { NotificationPrefsSchema } from '../../packages/contracts/src';

test('P06-03 T13 two-window pause/cancel CAS preserves paused time and resume uses the same nonterminal run', async () => {
  let calls = 0;
  const f = await fixture(async (_run, _step, signal) => {
    if (++calls === 1)
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    return {
      text: '完成',
      calls: [{ tool: 'artifact.write', name: '结果.md', content: '真实结果' }],
      finished: true,
    };
  });
  try {
    const run = await f.create();
    await f.work.start();
    await until(() => calls === 1);
    const revision = f.work.repo.row(run.runId).revision;
    const [pause, cancel] = await Promise.all([
      f.send('runs.pause', { runId: run.runId }, revision),
      f.send('runs.cancel', { runId: run.runId }, revision),
    ]);
    expect(pause.ok).toBe(true);
    expect(cancel.ok).toBe(false);
    await until(() => f.work.repo.row(run.runId).status === 'paused');
    vi.setSystemTime(f.store.now() + 3600000);
    expect(
      (await f.send('runs.resume', { runId: run.runId }, f.work.repo.row(run.runId).revision)).ok,
    ).toBe(true);
    await until(() => f.work.repo.row(run.runId).status === 'completed');
    expect(f.work.repo.view(run.runId).activeMs).toBeLessThan(1000);
  } finally {
    await f.close();
  }
});
test('P06-03 T13 expired lease invalidates late worker, and simulated suspend prevents dispatch until wake', async () => {
  let release!: () => void,
    calls = 0;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  const f = await fixture(async () => {
    if (++calls === 1) await barrier;
    return {
      text: '结果',
      calls: [{ tool: 'artifact.write', name: '结果.md', content: '新租约结果' }],
      finished: true,
    };
  });
  try {
    const run = await f.create();
    await f.work.start();
    await until(() => calls === 1);
    const old = f.work.repo.row(run.runId).lease_epoch;
    f.store.db
      .prepare('UPDATE runs SET lease_expires_at=? WHERE id=?')
      .run(f.store.now() - 1, run.runId);
    await f.work.tick();
    expect(f.work.repo.row(run.runId).lease_epoch).toBeGreaterThan(old);
    release();
    await until(() => f.work.repo.row(run.runId).status === 'completed');
    expect(f.store.db.prepare("SELECT count(*) n FROM files WHERE kind='artifact'").get()).toEqual({
      n: 1,
    });
    await f.work.suspend();
    const queued = await f.create();
    await new Promise((r) => setTimeout(r, 100));
    expect(f.work.repo.row(queued.runId).status).toBe('queued');
    await f.work.wake();
    await until(() => f.work.repo.row(queued.runId).status === 'completed');
  } finally {
    release();
    await f.close();
  }
});
test('P06-03 T13 unknown effects require manual reconciliation and never automatically replay', async () => {
  const f = await fixture();
  try {
    const view = await f.create(),
      run = f.work.repo.row(view.runId),
      callId = newId();
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',lease_epoch=1,lease_owner='old',lease_expires_at=? WHERE id=?",
      )
      .run(f.store.now() - 1, run.id);
    f.store.db
      .prepare(
        `INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect,step_key,lease_epoch) VALUES(?,?,?,?,?,1,?,'python.analyze','1',?,'hash','resource',?,'dispatched','none','deliver-1',1)`,
      )
      .run(
        callId,
        f.store.profileId,
        f.store.now(),
        f.store.now(),
        run.id,
        callId,
        JSON.stringify({ tool: 'python.analyze', fileId: newId(), versionId: newId() }),
        callId,
      );
    await f.work.recover();
    expect(f.work.repo.row(run.id).status).toBe('waiting_user');
    expect(f.work.repo.view(run.id).unresolvedCalls[0]!.id).toBe(callId);
    expect(
      (await f.send('runs.resume', { runId: run.id }, f.work.repo.row(run.id).revision)).ok,
    ).toBe(false);
    expect(f.store.db.prepare('SELECT count(*) n FROM files').get()).toEqual({ n: 0 });
    expect(
      (
        await f.send(
          'runs.reconcile',
          { runId: run.id, callId, decision: 'not_committed' },
          f.work.repo.row(run.id).revision,
        )
      ).ok,
    ).toBe(true);
    expect(f.work.repo.row(run.id).status).toBe('paused');
  } finally {
    await f.close();
  }
});
test('P06-03 T20 retains a completed run notification when the task version advances before sync', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    f.store.db.transaction(() => {
      const run = f.work.repo.row(view.runId);
      f.work.repo.status(run, 'running');
      f.work.repo.status(run, 'waiting_user', 'APPROVAL_REQUIRED');
      f.work.repo.status(run, 'paused');
      f.work.repo.status(run, 'queued');
      f.work.repo.status(run, 'running');
      f.work.repo.status(run, 'completed');
      f.store.db.prepare('UPDATE tasks SET current_version=2 WHERE id=?').run(view.taskId);
    })();
    f.work.notifications.sync();
    const reply = await f.send('notifications.list', {});
    if (!reply.ok || !('notifications' in reply.data)) throw Error('notifications');
    expect(reply.data.notifications.filter((n) => n.kind === 'completed')).toHaveLength(1);
    expect(reply.data.notifications.filter((n) => n.kind === 'waiting_user')).toHaveLength(0);
    f.work.notifications.sync();
    expect(
      f.store.db.prepare("SELECT count(*) n FROM notifications WHERE kind='completed'").get(),
    ).toEqual({ n: 1 });
  } finally {
    await f.close();
  }
});
test('P06-03 T20 notifications dedupe, persist cursor/read/delete, honor DND and mute without replaying toast', async () => {
  const f = await fixture();
  let closed = false;
  try {
    f.store.db
      .prepare("UPDATE profiles SET timezone='Asia/Shanghai' WHERE id=?")
      .run(f.store.profileId);
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'));
    const view = await f.create();
    f.store.db.transaction(() => {
      const r = f.work.repo.row(view.runId);
      f.work.repo.status(r, 'running');
      f.work.repo.status(r, 'waiting_user', 'APPROVAL_REQUIRED');
      f.work.repo.event(r, 'approval.required', '具体操作待审阅');
    })();
    f.work.notifications.sync();
    expect(f.work.notifications.unread()).toBe(1);
    expect(f.work.notifications.claimDesktop()).toEqual([]);
    const prefs = await f.send('notifications.preferences', {});
    expect(prefs.ok && 'notificationPreferences' in prefs.data).toBe(true);
    const values = NotificationPrefsSchema.parse({ quietStart: 0, quietEnd: 0 });
    expect((await f.send('notifications.preferences', { values }, 1)).ok).toBe(true);
    expect((await f.send('notifications.preferences', { values }, 1)).ok).toBe(false);
    const listed = await f.send('notifications.list', {});
    if (!listed.ok || !('notifications' in listed.data)) throw Error('notifications');
    const id = listed.data.notifications[0]!.id;
    await f.send('notifications.read', { ids: [id] });
    expect(f.work.notifications.unread()).toBe(0);
    f.work.notifications.sync();
    expect(f.work.notifications.unread()).toBe(0);
    vi.setSystemTime(f.store.now() + 5001);
    f.store.db.transaction(() =>
      f.work.repo.event(f.work.repo.row(view.runId), 'approval.required', '新的待确认事件'),
    )();
    const delivered = f.work.notifications.claimDesktop();
    expect(delivered).toHaveLength(1);
    expect(f.work.notifications.claimDesktop()).toHaveLength(0);
    await f.close();
    closed = true;
    const store = await openStore(f.dir);
    try {
      const restarted = new WorkNotifications(store);
      expect(restarted.claimDesktop()).toHaveLength(0);
      expect(restarted.unread()).toBe(1);
      const reply = restarted.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'notifications.delete',
        payload: { all: true },
      });
      expect(reply.ok).toBe(true);
      expect(restarted.unread()).toBe(0);
      expect(restarted.claimDesktop()).toHaveLength(0);
    } finally {
      store.close();
    }
  } finally {
    if (!closed) await f.close();
  }
});
test('P06-03 T19 task-scoped historical versions reject other tasks, originals, and deleted owners', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',lease_epoch=1,lease_owner='scope',lease_expires_at=? WHERE id=?",
      )
      .run(f.store.now() + 15000, view.runId);
    const run = f.work.repo.row(view.runId),
      ref = await f.gateway.execute(
        run,
        'source',
        { tool: 'artifact.write', name: '历史.md', content: '原版' },
        () => f.work.repo.guard(run, 'scope'),
      );
    if (!ref || ref.kind !== 'file') throw Error('source');
    const other = await f.create();
    expect(() =>
      f.files.get(ref.fileId, {
        versionId: ref.versionId,
        owner: { type: 'task', id: other.taskId },
      }),
    ).toThrow('PERMISSION_DENIED');
    const blob = await f.blobs.put(Buffer.from('private original'));
    const original = f.files.importBlob({
      blobId: blob.id,
      name: '原件.txt',
      relativePath: '原件.txt',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    expect(() =>
      f.files.get(original.id, {
        versionId: original.version.id,
        owner: { type: 'task', id: view.taskId },
      }),
    ).toThrow('PERMISSION_DENIED');
    expect(
      (
        await f.files.original(ref.fileId, {
          versionId: ref.versionId,
          owner: { type: 'task', id: view.taskId },
        })
      ).bytes.toString(),
    ).toBe('原版');
    f.store.db.transaction(() => eraseSessionContent(f.store, f.sessionId, f.store.now()))();
    expect(
      f.store.db
        .prepare("SELECT count(*) n FROM resource_links WHERE owner_type='task' AND owner_id=?")
        .get(view.taskId),
    ).toEqual({ n: 0 });
    expect(() =>
      f.files.get(ref.fileId, {
        versionId: ref.versionId,
        owner: { type: 'task', id: view.taskId },
      }),
    ).toThrow('PERMISSION_DENIED');
    expect(f.store.db.prepare('SELECT work_json FROM runs WHERE id=?').get(run.id)).toEqual({
      work_json: '{"schemaVersion":1}',
    });
    expect((await f.send('approvals.list', {})).ok).toBe(true);
  } finally {
    await f.close();
  }
});
test('P06-03 T13 batch actions return individual errors and terminal edits create a new immutable version', async () => {
  const f = await fixture();
  try {
    const first = await f.create();
    await f.work.start();
    await until(() => f.work.repo.row(first.runId).status === 'completed');
    const invalid = newId(),
      batch = await f.send('runs.batch', { runIds: [first.runId, invalid], action: 'pause' });
    expect(
      batch.ok && 'workResults' in batch.data && batch.data.workResults.every((r) => !r.ok),
    ).toBe(true);
    const previous = f.work.repo.view(first.runId);
    const changed = await f.send(
      'runs.steer',
      { runId: first.runId, text: '用户对完成成果提出新要求', refs: [], clientRequestId: newId() },
      previous.revision,
    );
    expect(changed.ok && 'work' in changed.data && changed.data.work.version).toBe(2);
    expect(f.work.repo.row(first.runId).status).toBe('completed');
  } finally {
    await f.close();
  }
});
