import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { createWorkDocument } from '../../packages/core/src/work-document';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { DocumentRepository } from '../../packages/storage/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

const spec = {
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '摘要', blocks: [{ type: 'paragraph', text: '原始内容' }] },
    { blockId: 'two', heading: '数值', blocks: [{ type: 'paragraph', text: '金额 123.45' }] },
  ],
};
const activate = (f: Awaited<ReturnType<typeof fixture>>, id: string) => {
  f.store.db
    .prepare(
      "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=lease_epoch+1,lease_expires_at=? WHERE id=?",
    )
    .run(f.store.now() + 30000, id);
  return f.work.repo.row(id);
};

test('P07-01 review binds a targeted change, preserves original and waits for the new version parse', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'docx' });
    let run = activate(f, view.runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const original = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '报告.docx',
      spec,
      () => f.work.repo.guard(run, 'fixture'),
      () => {},
    );
    if (original.kind !== 'file') throw Error('not a file');
    // The prior version is independently parsed before it can be modified.
    const originalBytes = (
      await f.files.original(original.fileId, { versionId: original.versionId })
    ).bytes;
    const job = f.files.jobs.claim('first-version')!;
    f.files.beginParse(job, original.versionId);
    await f.files.completeParse(
      job,
      original.versionId,
      await parseOfficeFile(originalBytes, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(job, 'completed');
    const file = f.files.get(original.fileId, { owner: { type: 'session', id: run.session_id } });
    const args = {
      tool: 'document.revise' as const,
      fileId: file.id,
      versionId: original.versionId,
      revision: file.revision,
      blockId: 'one',
      replacement: {
        blockId: 'one',
        heading: '摘要',
        blocks: [{ type: 'paragraph' as const, text: '修改后的内容' }],
      },
    };
    expect(
      await gateway.execute(run, 'revision', args, () => f.work.repo.guard(run, 'fixture')),
    ).toBeNull();
    const listed = await gateway.dispatchCommand({
      protocolVersion: 1,
      requestId: '0199b35d-9700-7000-8000-000000000001',
      command: 'approvals.list',
      payload: { runId: run.id },
    });
    if (!listed.ok || !('approvals' in listed.data)) throw Error('missing approval');
    const approval = listed.data.approvals[0]!;
    expect(approval.preview.before).toContain('原始内容');
    expect(approval.preview.after).toContain('修改后的内容');
    expect(f.files.get(file.id).currentVersionId).toBe(original.versionId);
    const decision = await f.send(
      'approvals.decide',
      {
        approvalId: approval.id,
        decision: 'approved',
        argsHash: approval.argsHash,
        contentVersionHash: approval.contentVersionHash,
        scope: 'once',
      },
      f.work.repo.row(run.id).revision,
    );
    expect(decision.ok).toBe(true);
    run = activate(f, view.runId);
    const result = gateway.resume(run, 'revision', () => f.work.repo.guard(run, 'fixture'));
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='document.revise' AND status='succeeded'",
          )
          .get(run.id),
    );
    const row = f.store.db
      .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='document.revise'")
      .get(run.id) as { result_ref: string };
    const changed = JSON.parse(row.result_ref);
    const changedBytes = (await f.files.original(changed.fileId, { versionId: changed.versionId }))
      .bytes;
    const secondJob = f.files.jobs.claim('second-version')!;
    f.files.beginParse(secondJob, changed.versionId);
    await f.files.completeParse(
      secondJob,
      changed.versionId,
      await parseOfficeFile(changedBytes, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(secondJob, 'completed');
    expect(await result).toEqual([changed]);
    const repo = new DocumentRepository(f.files),
      owner = { type: 'task' as const, id: run.task_id };
    expect(repo.read(file.id, changed.versionId, owner).sections[1]).toEqual(
      repo.read(file.id, original.versionId, owner).sections[1],
    );
    expect((await f.files.original(file.id, { versionId: original.versionId })).bytes).toEqual(
      originalBytes,
    );
    expect(changed.versionId).not.toBe(original.versionId);
  } finally {
    await f.close();
  }
});

test('P07-01 stale proposal cannot be approved after its document revision changes', async () => {
  const f = await fixture();
  try {
    const run = activate(f, (await f.create({ format: 'docx' })).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const original = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '报告.docx',
      spec,
      () => f.work.repo.guard(run, 'fixture'),
      () => {},
    );
    if (original.kind !== 'file') throw Error('not a file');
    const file = f.files.get(original.fileId, { owner: { type: 'session', id: run.session_id } });
    const args = {
      tool: 'document.revise' as const,
      fileId: file.id,
      versionId: original.versionId,
      revision: file.revision,
      blockId: 'one',
      replacement: {
        blockId: 'one',
        heading: '摘要',
        blocks: [{ type: 'paragraph' as const, text: '新内容' }],
      },
    };
    expect(
      await gateway.execute(run, 'revision', args, () => f.work.repo.guard(run, 'fixture')),
    ).toBeNull();
    const approval = f.store.db
      .prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 1')
      .get() as { id: string; args_hash: string; content_version_hash: string };
    f.files.rename(file.id, '改名.docx', file.revision);
    const reply = await f.send(
      'approvals.decide',
      {
        approvalId: approval.id,
        decision: 'approved',
        argsHash: approval.args_hash,
        contentVersionHash: approval.content_version_hash,
        scope: 'once',
      },
      f.work.repo.row(run.id).revision,
    );
    expect(reply.ok).toBe(false);
    expect(f.files.get(file.id).currentVersionId).toBe(original.versionId);
    expect(
      f.store.db.prepare('SELECT decision FROM approvals WHERE id=?').get(approval.id),
    ).toEqual({ decision: 'pending' });
  } finally {
    await f.close();
  }
});

test('P07-01 approved field replacement creates a version and leaves all body sections unchanged', async () => {
  const f = await fixture();
  try {
    const view = await f.create({
      format: 'docx',
      documentOptions: { fields: { name: '原姓名', brand: '原品牌' } },
    });
    let run = activate(f, view.runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const original = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '报告.docx',
      spec,
      () => f.work.repo.guard(run, 'fixture'),
      () => {},
    );
    if (original.kind !== 'file') throw Error('not a file');
    const file = f.files.get(original.fileId, { owner: { type: 'session', id: run.session_id } });
    const args = {
      tool: 'document.fields' as const,
      fileId: file.id,
      versionId: original.versionId,
      revision: file.revision,
      fields: { name: '新姓名', date: '2026-10-28' },
    };
    expect(
      await gateway.execute(run, 'fields', args, () => f.work.repo.guard(run, 'fixture')),
    ).toBeNull();
    const listed = await gateway.dispatchCommand({
      protocolVersion: 1,
      requestId: '0199b35d-9700-7000-8000-000000000002',
      command: 'approvals.list',
      payload: { runId: run.id },
    });
    if (!listed.ok || !('approvals' in listed.data)) throw Error('missing approval');
    const approval = listed.data.approvals[0]!;
    expect(approval.preview.before).toContain('姓名：原姓名');
    expect(approval.preview.after).toContain('姓名：新姓名');
    expect(
      (
        await f.send(
          'approvals.decide',
          {
            approvalId: approval.id,
            decision: 'approved',
            argsHash: approval.argsHash,
            contentVersionHash: approval.contentVersionHash,
            scope: 'once',
          },
          f.work.repo.row(run.id).revision,
        )
      ).ok,
    ).toBe(true);
    run = activate(f, view.runId);
    const pending = gateway.resume(run, 'fields', () => f.work.repo.guard(run, 'fixture'));
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='document.fields' AND status='succeeded'",
          )
          .get(run.id),
    );
    const row = f.store.db
      .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='document.fields'")
      .get(run.id) as { result_ref: string };
    const changed = JSON.parse(row.result_ref);
    const bytes = (await f.files.original(changed.fileId, { versionId: changed.versionId })).bytes;
    const job = f.files.jobs.claim('new-fields')!;
    // The first parse job belongs to the original version; complete it before the new version.
    f.files.beginParse(job, original.versionId);
    const oldBytes = (await f.files.original(file.id, { versionId: original.versionId })).bytes;
    await f.files.completeParse(
      job,
      original.versionId,
      await parseOfficeFile(oldBytes, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(job, 'completed');
    const next = f.files.jobs.claim('new-fields')!;
    f.files.beginParse(next, changed.versionId);
    await f.files.completeParse(
      next,
      changed.versionId,
      await parseOfficeFile(bytes, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(next, 'completed');
    expect(await pending).toEqual([changed]);
    const repo = new DocumentRepository(f.files),
      owner = { type: 'task' as const, id: run.task_id };
    const old = repo.read(file.id, original.versionId, owner),
      updated = repo.read(file.id, changed.versionId, owner);
    expect(updated.sections).toEqual(old.sections);
    expect(updated.style.fields).toEqual({ name: '新姓名', date: '2026-10-28', brand: '原品牌' });
    expect(old.style.fields.name).toBe('原姓名');
    expect(changed.versionId).not.toBe(original.versionId);
  } finally {
    await f.close();
  }
});
