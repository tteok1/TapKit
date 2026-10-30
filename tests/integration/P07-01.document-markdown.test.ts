import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { DocumentRepository } from '../../packages/storage/src';
import { DocumentSpecSchema } from '../../packages/contracts/src';
import { parseTextFile } from '../../packages/retrieval/src/ingest/text';

const spec = DocumentSpecSchema.parse({
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '摘要', blocks: [{ type: 'paragraph', text: '原始内容' }] },
    { blockId: 'two', heading: '数字', blocks: [{ type: 'paragraph', text: '金额 123.45' }] },
  ],
});
const activate = (f: Awaited<ReturnType<typeof fixture>>, id: string) => {
  f.store.db
    .prepare(
      "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=lease_epoch+1,lease_expires_at=? WHERE id=?",
    )
    .run(f.store.now() + 30000, id);
  return f.work.repo.row(id);
};
async function finishParse(
  f: Awaited<ReturnType<typeof fixture>>,
  ref: { fileId: string; versionId: string },
) {
  const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
  const job = f.files.jobs.claim('markdown-fixture')!;
  f.files.beginParse(job, ref.versionId);
  await f.files.completeParse(
    job,
    ref.versionId,
    parseTextFile(bytes, '报告.md'),
    new AbortController().signal,
  );
  f.files.jobs.finish(job, 'completed');
  return bytes.toString('utf8');
}

test('P07-01 structured Markdown is parsed, verified and revised under approval', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'md' });
    let run = activate(f, view.runId);
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    const pending = gateway.execute(
      run,
      'create',
      { tool: 'document.create', name: '报告.md', spec },
      () => f.work.repo.guard(run, 'fixture'),
    );
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='document.create' AND status='succeeded'",
          )
          .get(run.id),
    );
    const row = f.store.db
      .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='document.create'")
      .get(run.id) as { result_ref: string };
    const first = JSON.parse(row.result_ref);
    expect(await gateway.verify(run, [first])).toBe(false);
    const oldText = await finishParse(f, first);
    expect(oldText).toContain('原始内容');
    expect(await pending).toEqual(first);
    expect(await gateway.verify(run, [first])).toBe(true);
    const current = f.files.get(first.fileId, { owner: { type: 'session', id: run.session_id } });
    const args = {
      tool: 'document.revise' as const,
      fileId: first.fileId,
      versionId: first.versionId,
      revision: current.revision,
      blockId: 'one',
      replacement: {
        blockId: 'one',
        heading: '摘要',
        blocks: [{ type: 'paragraph' as const, text: '新内容' }],
      },
    };
    expect(
      await gateway.execute(run, 'edit', args, () => f.work.repo.guard(run, 'fixture')),
    ).toBeNull();
    const a = f.store.db
      .prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 1')
      .get() as { id: string; args_hash: string; content_version_hash: string };
    expect(
      (
        await f.send(
          'approvals.decide',
          {
            approvalId: a.id,
            decision: 'approved',
            argsHash: a.args_hash,
            contentVersionHash: a.content_version_hash,
            scope: 'once',
          },
          f.work.repo.row(run.id).revision,
        )
      ).ok,
    ).toBe(true);
    run = activate(f, view.runId);
    const resumed = gateway.resume(run, 'edit', () => f.work.repo.guard(run, 'fixture'));
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='document.revise' AND status='succeeded'",
          )
          .get(run.id),
    );
    const change = f.store.db
      .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='document.revise'")
      .get(run.id) as { result_ref: string };
    const next = JSON.parse(change.result_ref);
    const newText = await finishParse(f, next);
    expect(await resumed).toEqual([next]);
    expect(newText).toContain('新内容');
    expect(newText).toContain('金额 123.45');
    expect(
      (await f.files.original(first.fileId, { versionId: first.versionId })).bytes.toString(),
    ).toBe(oldText);
    expect(
      new DocumentRepository(f.files).read(first.fileId, next.versionId, {
        type: 'task',
        id: run.task_id,
      }).sections[1],
    ).toEqual(spec.sections[1]);
  } finally {
    await f.close();
  }
});
