import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { WorkReplySchema, type ResourceRef } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';

for (const exhaustedTools of [false, true]) {
  test(
    'P07-03 final allowed model call can finish its reviewed tool; tool limit still enforced ' +
      exhaustedTools,
    async () => {
      let source: Extract<ResourceRef, { kind: 'file' }> | undefined,
        calls = 0;
      const f = await fixture(async () => {
        calls++;
        return source
          ? {
              text: '修改',
              finished: true,
              calls: [
                {
                  tool: 'workspace.patch',
                  fileId: source.fileId,
                  versionId: source.versionId,
                  content: '# 新正文',
                },
              ],
            }
          : {
              text: '初稿',
              finished: true,
              calls: [{ tool: 'artifact.write', name: '初稿.md', content: '# 原正文' }],
            };
      });
      try {
        const initial = await f.create({
          format: 'md',
          planFirst: false,
          budgetOverrides: { tokens: 120000, activeMs: 60000, maxCalls: 2, maxTools: 2 },
        });
        await f.work.start();
        await until(() => f.work.repo.row(initial.runId).status === 'completed');
        const ref = f.work.repo.steps(initial.runId)[0]!.artifacts[0];
        if (ref?.kind !== 'file') throw Error('file');
        source = ref;
        const changed = await f.send(
          'runs.steer',
          { runId: initial.runId, text: '修改正文', refs: [], clientRequestId: newId() },
          f.work.repo.row(initial.runId).revision,
        );
        if (!changed.ok) throw Error(changed.error.code);
        const value = WorkReplySchema.parse(changed.data);
        if (!('work' in value)) throw Error('work');
        const id = value.work.runId;
        await until(() => f.work.repo.row(id).status === 'waiting_user');
        if (exhaustedTools) {
          // A prior failed retry still consumes a tool attempt. The ledger, not
          // the convenience runs.tools counter, is authoritative.
          const first = f.store.db
            .prepare("SELECT id FROM tool_calls WHERE run_id=? AND tool_name='artifact.write'")
            .get(initial.runId) as { id: string };
          f.store.db
            .prepare(
              'INSERT INTO tool_call_attempts(id,profile_id,tool_call_id,attempt_no,started_at,ended_at) VALUES(?,?,?,?,?,?)',
            )
            .run(newId(), f.store.profileId, first.id, 2, f.store.now(), f.store.now());
          expect(f.work.repo.rootUsage(f.work.repo.row(id)).tools).toBe(2);
        }
        const a = f.store.db
          .prepare(
            'SELECT id,args_hash,content_version_hash FROM approvals ORDER BY created_at DESC,rowid DESC LIMIT 1',
          )
          .get() as { id: string; args_hash: string; content_version_hash: string };
        const approved = await f.send(
          'approvals.decide',
          {
            approvalId: a.id,
            decision: 'approved',
            argsHash: a.args_hash,
            contentVersionHash: a.content_version_hash,
            scope: 'once',
          },
          f.work.repo.row(id).revision,
        );
        expect(approved.ok).toBe(true);
        await until(() => ['completed', 'budget_stopped'].includes(f.work.repo.row(id).status));
        expect(f.work.repo.row(id).status).toBe(exhaustedTools ? 'budget_stopped' : 'completed');
        expect(calls).toBe(2);
        expect(
          (await f.files.original(source.fileId, { versionId: source.versionId })).bytes.toString(),
        ).toBe('# 原正文');
        const current = f.files.get(source.fileId);
        if (exhaustedTools) {
          expect(current.currentVersionId).toBe(source.versionId);
          expect(
            f.store.db
              .prepare(
                "SELECT status,side_effect FROM tool_calls WHERE run_id=? AND tool_name='workspace.patch'",
              )
              .get(id),
          ).toEqual({ status: 'cancelled', side_effect: 'not_committed' });
          const oldCall = f.store.db
            .prepare("SELECT id FROM tool_calls WHERE run_id=? AND tool_name='workspace.patch'")
            .get(id) as { id: string };
          f.store.db
            .prepare("UPDATE tool_calls SET status='approved',side_effect='none' WHERE id=?")
            .run(oldCall.id);
          await f.work.recover();
          expect(
            f.store.db
              .prepare('SELECT status,side_effect FROM tool_calls WHERE id=?')
              .get(oldCall.id),
          ).toEqual({ status: 'cancelled', side_effect: 'not_committed' });
          f.store.db
            .prepare("UPDATE tool_calls SET status='unknown',side_effect='unknown' WHERE id=?")
            .run(oldCall.id);
          await f.work.recover();
          expect(
            f.store.db
              .prepare('SELECT status,side_effect FROM tool_calls WHERE id=?')
              .get(oldCall.id),
          ).toEqual({ status: 'unknown', side_effect: 'unknown' });
        } else {
          expect(current.currentVersionId).not.toBe(source.versionId);
          expect((await f.files.original(source.fileId)).bytes.toString()).toBe('# 新正文');
        }
      } finally {
        await f.close();
      }
    },
  );
}
