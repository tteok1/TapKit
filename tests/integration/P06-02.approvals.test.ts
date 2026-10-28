import { test, expect, vi } from 'vitest';
import { fixture } from './P06.fixture';
import { newId } from '../../packages/storage/src';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { unavailableExecution, type WorkToolArgs } from '../../packages/contracts/src';
async function prepared() {
  const f = await fixture(),
    view = await f.create();
  const activate = () => {
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=lease_epoch+1,lease_expires_at=?,pause_requested_at=NULL WHERE id=?",
      )
      .run(f.store.now() + 15000, view.runId);
    return f.work.repo.row(view.runId);
  };
  let run = activate();
  const source = await f.gateway.execute(
    run,
    'source',
    { tool: 'artifact.write', name: 'draft.md', content: '# 原文' },
    () => f.work.repo.guard(run, 'fixture'),
  );
  if (!source || source.kind !== 'file') throw Error('source');
  const args: WorkToolArgs = {
    tool: 'workspace.patch',
    fileId: source.fileId,
    versionId: source.versionId,
    content: '# 待审正文',
  };
  expect(await f.gateway.execute(run, 'patch', args, () => f.work.repo.guard(run, 'fixture'))).toBe(
    null,
  );
  const approval = () =>
    f.store.db
      .prepare('SELECT * FROM approvals ORDER BY created_at DESC,rowid DESC LIMIT 1')
      .get() as {
      id: string;
      args_hash: string;
      content_version_hash: string;
      tool_call_id: string;
    };
  const decide = (extra: Record<string, unknown> = {}) => {
    const a = approval();
    return f.send(
      'approvals.decide',
      {
        approvalId: a.id,
        decision: 'approved',
        argsHash: a.args_hash,
        contentVersionHash: a.content_version_hash,
        ...extra,
      },
      f.work.repo.row(view.runId).revision,
    );
  };
  return { ...f, view, source, args, approval, decide, activate: () => (run = activate()) };
}
test('P06-02 T14 reviewed approval executes once and preserves both immutable versions and receipt', async () => {
  const f = await prepared();
  try {
    expect((await f.decide()).ok).toBe(true);
    const run = f.activate(),
      results = await f.gateway.resume(run, 'patch', () => f.work.repo.guard(run, 'fixture'));
    expect(results).toHaveLength(1);
    const result = results![0]!;
    if (result.kind !== 'file') throw Error('result');
    expect(result.fileId).toBe(f.source.fileId);
    expect(result.versionId).not.toBe(f.source.versionId);
    expect(
      (await f.files.original(f.source.fileId, { versionId: f.source.versionId })).bytes.toString(),
    ).toBe('# 原文');
    expect(
      (await f.files.original(result.fileId, { versionId: result.versionId })).bytes.toString(),
    ).toBe('# 待审正文');
    expect(await f.gateway.resume(run, 'patch', () => f.work.repo.guard(run, 'fixture'))).toEqual(
      results,
    );
    const row = f.store.db
      .prepare('SELECT status,side_effect FROM tool_calls WHERE id=?')
      .get(f.approval().tool_call_id);
    expect(row).toEqual({ status: 'succeeded', side_effect: 'committed' });
  } finally {
    await f.close();
  }
});
test.each(['content', 'target', 'taskVersion', 'hash', 'expiry'])(
  'P06-02 T14 %s mutation invalidates original preview',
  async (kind) => {
    const f = await prepared();
    try {
      const a = f.approval();
      if (kind === 'content')
        f.store.db
          .prepare('UPDATE tool_calls SET args_json=? WHERE id=?')
          .run(JSON.stringify({ ...f.args, content: '篡改' }), a.tool_call_id);
      if (kind === 'target')
        f.store.db
          .prepare('UPDATE tool_calls SET args_json=? WHERE id=?')
          .run(JSON.stringify({ ...f.args, fileId: newId() }), a.tool_call_id);
      if (kind === 'taskVersion')
        f.store.db.prepare('UPDATE tasks SET current_version=2 WHERE id=?').run(f.view.taskId);
      if (kind === 'expiry') vi.setSystemTime(f.store.now() + 600001);
      const reply = await f.decide(kind === 'hash' ? { argsHash: 'bad' } : {});
      expect(reply.ok).toBe(false);
      expect(f.files.get(f.source.fileId).currentVersionId).toBe(f.source.versionId);
      expect(
        f.store.db
          .prepare(
            "SELECT count(*) n FROM tool_calls WHERE tool_name='workspace.patch' AND status='dispatched'",
          )
          .get(),
      ).toEqual({ n: 0 });
    } finally {
      await f.close();
    }
  },
);
test('P06-02 T14 expired approval requires a fresh preview and a new explicit decision', async () => {
  const f = await prepared();
  try {
    const old = f.approval();
    f.store.db
      .prepare('UPDATE approvals SET expires_at=? WHERE id=?')
      .run(f.store.now() - 1, old.id);
    expect((await f.decide()).ok).toBe(false);
    const reply = await f.send(
      'approvals.refresh',
      { approvalId: old.id },
      f.work.repo.row(f.view.runId).revision,
    );
    expect(reply.ok).toBe(true);
    expect(f.approval().id).not.toBe(old.id);
    expect(f.files.get(f.source.fileId).currentVersionId).toBe(f.source.versionId);
    expect((await f.decide()).ok).toBe(true);
    const run = f.activate();
    expect(
      await f.gateway.resume(run, 'patch', () => f.work.repo.guard(run, 'fixture')),
    ).toHaveLength(1);
    expect(f.store.db.prepare('SELECT decision FROM approvals WHERE id=?').get(old.id)).toEqual({
      decision: 'expired',
    });
  } finally {
    await f.close();
  }
});
test('P06-02 T14 draft editing expires the old preview; rejection never switches tools', async () => {
  const f = await prepared();
  try {
    const old = f.approval();
    expect(
      (
        await f.send(
          'approvals.editDraft',
          { approvalId: old.id, newBusinessArgs: { ...f.args, content: '# 用户修改后的正文' } },
          f.work.repo.row(f.view.runId).revision,
        )
      ).ok,
    ).toBe(true);
    expect(f.approval().id).not.toBe(old.id);
    expect(f.store.db.prepare('SELECT decision FROM approvals WHERE id=?').get(old.id)).toEqual({
      decision: 'expired',
    });
    expect((await f.decide({ decision: 'rejected' })).ok).toBe(true);
    expect(f.work.repo.row(f.view.runId).status).toBe('paused');
    expect(f.files.get(f.source.fileId).currentVersionId).toBe(f.source.versionId);
  } finally {
    await f.close();
  }
});
test('P06-02 T14 grant revocation between approval and dispatch prevents any new version', async () => {
  const f = await prepared();
  try {
    expect((await f.decide({ scope: 'session' })).ok).toBe(true);
    const grant = f.store.db.prepare('SELECT id FROM grants').get() as { id: string };
    expect((await f.send('grants.revoke', { grantIds: [grant.id] })).ok).toBe(true);
    const run = f.activate();
    await expect(
      f.gateway.resume(run, 'patch', () => f.work.repo.guard(run, 'fixture')),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(f.files.get(f.source.fileId).currentVersionId).toBe(f.source.versionId);
  } finally {
    await f.close();
  }
});
test('P06-02 T19 forged files, imported originals and absent native capability fail closed', async () => {
  const f = await fixture();
  try {
    const view = await f.create(),
      run = f.work.repo.row(view.runId);
    const blob = await f.blobs.put(Buffer.from('x,y\n1,2\n'));
    const input = f.files.importBlob({
      blobId: blob.id,
      name: 'input.csv',
      relativePath: 'input.csv',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    await expect(
      f.gateway.execute(
        run,
        'x',
        {
          tool: 'workspace.patch',
          fileId: input.id,
          versionId: input.version.id,
          content: 'edited',
        },
        () => {},
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      f.gateway.execute(
        run,
        'x',
        { tool: 'workspace.patch', fileId: newId(), versionId: newId(), content: 'edited' },
        () => {},
      ),
    ).rejects.toThrow();
    const native = new WorkNativeTools(
      process.cwd(),
      f.artifacts,
      unavailableExecution('fixture'),
      {
        execute: async () => {
          throw Error('must not execute');
        },
      },
    );
    const gateway = new WorkToolGateway(f.artifacts, native);
    const state = f.work.repo.state(run);
    state.definition.refs = [{ kind: 'file', fileId: input.id, versionId: input.version.id }];
    f.store.db.transaction(() => f.work.repo.save(run, state))();
    f.store.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(run.id);
    await expect(
      gateway.execute(
        f.work.repo.row(run.id),
        'analyze',
        { tool: 'python.analyze', fileId: input.id, versionId: input.version.id },
        () => {},
      ),
    ).rejects.toThrow('SANDBOX_UNAVAILABLE');
    expect((await f.files.original(input.id)).bytes.toString()).toBe('x,y\n1,2\n');
  } finally {
    await f.close();
  }
});
