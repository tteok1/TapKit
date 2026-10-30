import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { DocumentSpecSchema } from '../../packages/contracts/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

const spec = DocumentSpecSchema.parse({
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '成果内容' }] },
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

test('P07-01 gateway commits once and waits for parsed structure before returning', async () => {
  const f = await fixture();
  try {
    const run = activate(f, (await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const args = { tool: 'document.create' as const, name: '报告.docx', spec };
    const pending = gateway.execute(run, 'draft', args, () => f.work.repo.guard(run, 'fixture'));
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const row = f.store.db
      .prepare('SELECT result_ref,status,side_effect FROM tool_calls WHERE run_id=?')
      .get(run.id) as { result_ref: string; status: string; side_effect: string };
    const ref = JSON.parse(row.result_ref);
    expect(row.status).toBe('succeeded');
    expect(row.side_effect).toBe('committed');
    expect(await gateway.verify(run, [ref])).toBe(false);
    const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx');
    const job = f.files.jobs.claim('p07-fixture')!;
    f.files.beginParse(job, ref.versionId);
    await f.files.completeParse(job, ref.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    expect(await pending).toEqual(ref);
    expect(
      await gateway.execute(run, 'draft', args, () => f.work.repo.guard(run, 'fixture')),
    ).toEqual(ref);
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='报告.docx'").get(),
    ).toEqual({ n: 1 });
  } finally {
    await f.close();
  }
});

test('P07-01 legacy P06 catalog rejects new document tool while existing tools remain usable', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    f.store.db
      .prepare(
        "UPDATE runs SET work_json=json_set(work_json,'$.toolCatalogVersion','p06-tools-1') WHERE id=?",
      )
      .run(view.runId);
    const run = activate(f, view.runId);
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    await expect(
      gateway.execute(run, 'draft', { tool: 'document.create', name: '报告.docx', spec }, () =>
        f.work.repo.guard(run, 'fixture'),
      ),
    ).rejects.toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
    const ref = await gateway.execute(
      run,
      'text',
      { tool: 'artifact.write', name: '结果.md', content: '正文' },
      () => f.work.repo.guard(run, 'fixture'),
    );
    expect(ref?.kind).toBe('file');
  } finally {
    await f.close();
  }
});

test('P07-01 retry preserves the tool catalog of an existing P06 task version', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    f.store.db
      .prepare(
        "UPDATE runs SET status='failed',work_json=json_set(work_json,'$.toolCatalogVersion','p06-tools-1') WHERE id=?",
      )
      .run(view.runId);
    const old = f.work.repo.row(view.runId);
    const reply = await f.send(
      'runs.retry',
      { runId: old.id, reuseVerifiedArtifacts: true },
      old.revision,
    );
    if (!reply.ok || !('work' in reply.data)) throw Error('retry failed');
    expect(f.work.repo.state(f.work.repo.row(reply.data.work.runId)).toolCatalogVersion).toBe(
      'p06-tools-1',
    );
  } finally {
    await f.close();
  }
});

test('P07-01 parse failure preserves the committed receipt and does not publish a success result', async () => {
  const f = await fixture();
  try {
    const run = activate(f, (await f.create()).runId);
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    const pending = gateway.execute(
      run,
      'draft',
      { tool: 'document.create', name: '报告.docx', spec },
      () => f.work.repo.guard(run, 'fixture'),
    );
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const call = f.store.db
      .prepare('SELECT id,result_ref FROM tool_calls WHERE run_id=?')
      .get(run.id) as { id: string; result_ref: string };
    const ref = JSON.parse(call.result_ref);
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='failed' WHERE id=?")
      .run(ref.versionId);
    await expect(pending).rejects.toMatchObject({ code: 'PARSE_FAILED' });
    expect(
      f.store.db.prepare('SELECT status,side_effect FROM tool_calls WHERE id=?').get(call.id),
    ).toEqual({ status: 'succeeded', side_effect: 'committed' });
    expect(await gateway.verify(run, [ref])).toBe(false);
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='报告.docx'").get(),
    ).toEqual({ n: 1 });
  } finally {
    await f.close();
  }
});

test('P07-01 recovery waits for an already committed document instead of regenerating it', async () => {
  const f = await fixture();
  try {
    const view = await f.create();
    const run = activate(f, view.runId);
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    const controller = new AbortController();
    const pending = gateway.execute(
      run,
      'draft',
      { tool: 'document.create', name: '报告.docx', spec },
      () => f.work.repo.guard(run, 'fixture'),
      controller.signal,
    );
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const call = f.store.db
      .prepare('SELECT result_ref FROM tool_calls WHERE run_id=?')
      .get(run.id) as { result_ref: string };
    const ref = JSON.parse(call.result_ref);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    const resumedRun = activate(f, view.runId);
    const resumed = gateway.resume(resumedRun, 'draft', () =>
      f.work.repo.guard(resumedRun, 'fixture'),
    );
    const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx');
    const job = f.files.jobs.claim('recovery-fixture')!;
    f.files.beginParse(job, ref.versionId);
    await f.files.completeParse(job, ref.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    expect(await resumed).toEqual([ref]);
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='报告.docx'").get(),
    ).toEqual({ n: 1 });
  } finally {
    await f.close();
  }
});

test('P07-01 revoked sources prevent completion even if the document parses successfully', async () => {
  const f = await fixture();
  try {
    const source = await f.blobs.put(Buffer.from('原始资料'), 'text/plain');
    const input = f.files.importBlob({
      blobId: source.id,
      name: '来源.txt',
      relativePath: '来源.txt',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    f.files.cancelParse(input.version.id);
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='ready' WHERE id=?")
      .run(input.version.id);
    const sourceRef = { kind: 'file' as const, fileId: input.id, versionId: input.version.id };
    const run = activate(f, (await f.create({ refs: [sourceRef] })).runId);
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    const sourcedSpec = DocumentSpecSchema.parse({
      ...spec,
      citations: [{ label: '材料', ref: sourceRef }],
    });
    const pending = gateway.execute(
      run,
      'draft',
      { tool: 'document.create', name: '报告.docx', spec: sourcedSpec },
      () => f.work.repo.guard(run, 'fixture'),
    );
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const call = f.store.db
      .prepare('SELECT result_ref FROM tool_calls WHERE run_id=?')
      .get(run.id) as { result_ref: string };
    const ref = JSON.parse(call.result_ref);
    const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx');
    const job = f.files.jobs.claim('source-revoked')!;
    f.files.beginParse(job, ref.versionId);
    await f.files.completeParse(job, ref.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(Date.now(), input.id);
    await expect(pending).rejects.toMatchObject({ code: 'PARSE_FAILED' });
    expect(await gateway.verify(run, [ref])).toBe(false);
  } finally {
    await f.close();
  }
});
