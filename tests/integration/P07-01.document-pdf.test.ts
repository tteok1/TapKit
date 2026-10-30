import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { createWorkDocument } from '../../packages/core/src/work-document';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import type { WorkNativeTools } from '../../packages/core/src/work-native';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';

const spec = {
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '金额 123.45 元' }] },
  ],
};

test('P07-01 converted PDF requires parsed pages and the document content before completion', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pdf', audience: '读者', language: '中文' });
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=1,lease_expires_at=? WHERE id=?",
      )
      .run(f.store.now() + 30000, view.runId);
    const run = f.work.repo.row(view.runId),
      chat = new ChatService(f.store, f.blobs, {} as never);
    const source = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '报告.docx',
      spec,
      () => f.work.repo.guard(run, 'fixture'),
      () => {},
    );
    if (source.kind !== 'file') throw Error('not a file');
    const original = (await f.files.original(source.fileId, { versionId: source.versionId })).bytes;
    const first = f.files.jobs.claim('source-parse')!;
    f.files.beginParse(first, source.versionId);
    await f.files.completeParse(
      first,
      source.versionId,
      await parseOfficeFile(original, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(first, 'completed');
    const native = {
      execute: async (
        _run: unknown,
        _args: unknown,
        guard: () => void,
        committed: (ref: any) => void,
      ) =>
        f.artifacts.publishBytes(
          run,
          '转换成果.pdf',
          Buffer.from('%PDF-1.7\nfixture\n%%EOF'),
          'application/pdf',
          guard,
          committed,
        ),
    } as unknown as WorkNativeTools;
    const gateway = new WorkToolGateway(f.artifacts, native, chat);
    const pending = gateway.execute(
      run,
      'convert',
      { tool: 'office.convert', fileId: source.fileId, versionId: source.versionId },
      () => f.work.repo.guard(run, 'fixture'),
    );
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='office.convert' AND status='succeeded'",
          )
          .get(run.id),
    );
    const call = f.store.db
      .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='office.convert'")
      .get(run.id) as { result_ref: string };
    const ref = JSON.parse(call.result_ref);
    expect(await gateway.verify(run, [ref])).toBe(false);
    const pdf = emptyDocument('pdf');
    pdf.pages.push({ width: 595, height: 842 });
    for (const [i, text] of ['报告', '目标读者：读者', '正文', '金额 123.45 元'].entries())
      pdf.blocks.push({
        id: 'p' + i,
        kind: 'text',
        text,
        locator: {
          kind: 'pdf',
          pageIndex: 0,
          rects: [{ x: 0.1, y: 0.1 + i * 0.1, width: 0.3, height: 0.03 }],
        },
      });
    const second = f.files.jobs.claim('pdf-parse')!;
    f.files.beginParse(second, ref.versionId);
    await f.files.completeParse(second, ref.versionId, pdf, new AbortController().signal);
    f.files.jobs.finish(second, 'completed');
    expect(await pending).toEqual(ref);
    expect(await gateway.verify(run, [ref])).toBe(true);
    f.store.db
      .prepare('UPDATE document_specs SET spec_json=? WHERE file_version_id=?')
      .run(JSON.stringify({ ...spec, title: '缺失的标题' }), source.versionId);
    expect(await gateway.verify(run, [ref])).toBe(false);
    f.store.db.prepare('DELETE FROM document_specs WHERE file_version_id=?').run(source.versionId);
    expect(() => f.artifacts.documentSourceSpec(run, source.fileId, source.versionId)).toThrow();
    expect(await gateway.verify(run, [ref])).toBe(false);
  } finally {
    await f.close();
  }
});
