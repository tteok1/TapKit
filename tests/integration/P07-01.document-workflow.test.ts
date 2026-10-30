import { expect, test } from 'vitest';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkService } from '../../packages/core/src/work-service';
import { DocumentSpecSchema } from '../../packages/contracts/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

test('P07-01 work service delivers a checked DOCX through a committed tool receipt', async () => {
  const f = await fixture();
  let work: WorkService | undefined;
  try {
    const view = await f.create({ format: 'docx' });
    const gateway = new WorkToolGateway(
      f.artifacts,
      undefined,
      new ChatService(f.store, f.blobs, {} as never),
    );
    const spec = DocumentSpecSchema.parse({
      schemaVersion: 1,
      title: '验收报告',
      audience: '用户',
      language: '中文',
      sections: [
        {
          blockId: 'one',
          heading: '摘要',
          blocks: [{ type: 'paragraph', text: '可以编辑的正文与数值 42。' }],
        },
      ],
    });
    let modelCalls = 0;
    work = new WorkService(
      f.store,
      async () => {
        modelCalls++;
        return {
          text: '完成',
          calls: [{ tool: 'document.create', name: '报告.docx', spec }],
          finished: true,
        };
      },
      gateway,
      async () => {},
    );
    await work.start();
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(view.runId),
    );
    const call = f.store.db
      .prepare('SELECT result_ref FROM tool_calls WHERE run_id=?')
      .get(view.runId) as { result_ref: string };
    const ref = JSON.parse(call.result_ref);
    expect(f.work.repo.row(view.runId).status).not.toBe('completed');
    const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx');
    const job = f.files.jobs.claim('p07-acceptance-fixture')!;
    f.files.beginParse(job, ref.versionId);
    await f.files.completeParse(job, ref.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    await until(() => f.work.repo.row(view.runId).status === 'completed');
    expect(modelCalls).toBe(1);
    expect(f.work.repo.view(view.runId).steps[0]?.artifacts).toEqual([ref]);
  } finally {
    await work?.stop();
    await f.close();
  }
});
