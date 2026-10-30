import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { fixture, until } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { WorkService } from '../../packages/core/src/work-service';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { modelWorkDriver } from '../../packages/core/src/work-driver';
import { DEFAULT_MODEL_PREFERENCES, FILE_LIMITS } from '../../packages/contracts/src';
import {
  newId,
  openStore,
  BlobStore,
  FileRepository,
  WorkRepository,
  type Store,
} from '../../packages/storage/src';
import { WorkArtifacts } from '../../packages/core/src/work-artifacts';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';
import { createWorkDocument } from '../../packages/core/src/work-document';
import type { WorkNativeTools } from '../../packages/core/src/work-native';
import type { ModelService } from '../../packages/core/src/model-service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
async function source(f: Awaited<ReturnType<typeof fixture>>) {
  const blob = await f.blobs.put(png, 'image/png');
  const file = f.files.importBlob({
    blobId: blob.id,
    name: '素材.png',
    relativePath: '素材.png',
    owner: { type: 'session', id: f.sessionId },
  }).file;
  const initial = f.files.jobs.claim('source')!;
  f.files.jobs.finish(initial, 'failed');
  f.store.db
    .prepare("UPDATE file_versions SET parse_status='unsupported' WHERE id=?")
    .run(file.version.id);
  return { kind: 'file' as const, fileId: file.id, versionId: file.version.id };
}
function activate(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  f.store.db
    .prepare(
      "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=lease_epoch+1,lease_expires_at=? WHERE id=?",
    )
    .run(f.store.now() + 30000, id);
  return f.work.repo.row(id);
}

test('P07-01 authorized PNG creates an immutable DOCX and rechecks access at verification', async () => {
  const f = await fixture();
  try {
    const ref = await source(f),
      run = activate(f, (await f.create({ format: 'docx', refs: [ref] })).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never),
      gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const spec = {
      schemaVersion: 1,
      title: '含图片报告',
      audience: '用户',
      language: '中文',
      sections: [
        {
          blockId: 'one',
          heading: '素材',
          blocks: [{ type: 'image', fileVersionId: ref.versionId, alt: '合成图片' }],
        },
      ],
    };
    const pending = gateway.execute(
      run,
      'image',
      {
        tool: 'document.create',
        name: '报告.docx',
        spec: (await import('../../packages/contracts/src')).DocumentSpecSchema.parse(spec),
      },
      () => f.work.repo.guard(run, 'fixture'),
    );
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const row = f.store.db
        .prepare('SELECT result_ref FROM tool_calls WHERE run_id=?')
        .get(run.id) as { result_ref: string },
      out = JSON.parse(row.result_ref);
    expect(await gateway.verify(run, [out])).toBe(false);
    const bytes = (await f.files.original(out.fileId, { versionId: out.versionId })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx', FILE_LIMITS, true);
    expect(parsed.embeddedPngHashes).toEqual([createHash('sha256').update(png).digest('hex')]);
    const job = f.files.jobs.claim('generated')!;
    f.files.beginParse(job, out.versionId);
    await f.files.completeParse(job, out.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    expect(await pending).toEqual(out);
    expect(await gateway.verify(run, [out])).toBe(true);
    expect(await f.artifacts.verify(run, [out])).toBe(false);
    expect(await f.artifacts.verify(run, [out], async () => Buffer.from('incorrect bytes'))).toBe(
      false,
    );
    f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(Date.now(), ref.fileId);
    expect(await gateway.verify(run, [out])).toBe(false);
  } finally {
    await f.close();
  }
});

test('P07-01 selected PNG is metadata-only for document work and remains unsupported for Markdown', async () => {
  const f = await fixture();
  let work: WorkService | undefined;
  try {
    const ref = await source(f),
      chat = new ChatService(f.store, f.blobs, {} as never),
      gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    work = new WorkService(
      f.store,
      async () => ({ text: '', calls: [], finished: true }),
      gateway,
      (item, session) => chat.material(item, session),
    );
    const make = (format: string) =>
      work!.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'runs.create',
        payload: { sessionId: f.sessionId, goal: '插入图片', format, refs: [ref] },
      });
    const docx = await make('docx');
    expect(docx.ok).toBe(true);
    const markdown = await make('md');
    expect(markdown.ok).toBe(false);
    if (!docx.ok || !('work' in docx.data)) throw Error('missing run');
    const run = f.work.repo.row(docx.data.work.runId);
    let messages: any[] = [];
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(request: any) {
          messages = request.request.messages;
          yield {
            type: 'model.event',
            attemptId: 'fixture',
            event: { type: 'finish', reason: 'stop' },
          };
        },
      },
    } as unknown as ModelService;
    await modelWorkDriver(models, chat)(
      run,
      f.work.repo.steps(run.id)[0]!,
      new AbortController().signal,
    );
    const data = messages.map((item) => item.text).join('\n');
    expect(data).toContain('static_image');
    expect(data).toContain(ref.versionId);
    expect(data).not.toContain(png.toString('base64'));
  } finally {
    await work?.stop();
    await f.close();
  }
});

test('P07-01 a PDF missing its image cannot be accepted even if its text is complete', async () => {
  const f = await fixture();
  try {
    const ref = await source(f),
      run = activate(f, (await f.create({ format: 'pdf', refs: [ref] })).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const spec = {
      schemaVersion: 1,
      title: '图片报告',
      audience: '用户',
      language: '中文',
      sections: [
        {
          blockId: 'one',
          heading: '素材',
          blocks: [{ type: 'image', fileVersionId: ref.versionId, alt: '合成图片' }],
        },
      ],
    };
    const sourceDoc = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '图片.docx',
      spec,
      () => f.work.repo.guard(run, 'fixture'),
      () => {},
    );
    if (sourceDoc.kind !== 'file') throw Error('not a file');
    const docBytes = (await f.files.original(sourceDoc.fileId, { versionId: sourceDoc.versionId }))
      .bytes;
    const first = f.files.jobs.claim('docx')!;
    f.files.beginParse(first, sourceDoc.versionId);
    await f.files.completeParse(
      first,
      sourceDoc.versionId,
      await parseOfficeFile(docBytes, 'docx', FILE_LIMITS, true),
      new AbortController().signal,
    );
    f.files.jobs.finish(first, 'completed');
    const native = {
      execute: async (
        _run: unknown,
        _args: unknown,
        guard: () => void,
        committed: (result: any) => void,
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
      { tool: 'office.convert', fileId: sourceDoc.fileId, versionId: sourceDoc.versionId },
      () => f.work.repo.guard(run, 'fixture'),
    );
    const outcome = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await until(
      () =>
        !!f.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='office.convert' AND status='succeeded'",
          )
          .get(run.id),
    );
    const row = f.store.db
        .prepare("SELECT result_ref FROM tool_calls WHERE run_id=? AND tool_name='office.convert'")
        .get(run.id) as { result_ref: string },
      output = JSON.parse(row.result_ref);
    const pdf = emptyDocument('pdf');
    pdf.pages.push({ width: 595, height: 842 });
    pdf.paintedImages = 0;
    for (const [index, text] of ['图片报告', '用户本人', '素材', '合成图片'].entries())
      pdf.blocks.push({
        id: 'p' + index,
        kind: 'text',
        text,
        locator: {
          kind: 'pdf',
          pageIndex: 0,
          rects: [{ x: 0.1, y: 0.1 + index * 0.1, width: 0.3, height: 0.03 }],
        },
      });
    const job = f.files.jobs.claim('pdf')!;
    f.files.beginParse(job, output.versionId);
    await f.files.completeParse(job, output.versionId, pdf, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    expect(await outcome).toMatchObject({ error: { code: 'PARSE_FAILED' } });
    expect(await gateway.verify(run, [output])).toBe(false);
    expect(
      (await f.files.original(sourceDoc.fileId, { versionId: sourceDoc.versionId })).bytes,
    ).toEqual(docBytes);
  } finally {
    await f.close();
  }
});

test('P07-01 image document receipt survives reopening the store and resumes without regeneration', async () => {
  const f = await fixture();
  let closed = false,
    reopened: Store | undefined;
  try {
    const input = await source(f),
      view = await f.create({ format: 'docx', refs: [input] }),
      run = activate(f, view.runId);
    const chat = new ChatService(f.store, f.blobs, {} as never),
      gateway = new WorkToolGateway(f.artifacts, undefined, chat);
    const spec = (await import('../../packages/contracts/src')).DocumentSpecSchema.parse({
      schemaVersion: 1,
      title: '图片报告',
      audience: '用户',
      language: '中文',
      sections: [
        {
          blockId: 'one',
          heading: '素材',
          blocks: [{ type: 'image', fileVersionId: input.versionId, alt: '合成图片' }],
        },
      ],
    });
    const controller = new AbortController();
    const pending = gateway.execute(
      run,
      'image',
      { tool: 'document.create', name: '图片.docx', spec },
      () => f.work.repo.guard(run, 'fixture'),
      controller.signal,
    );
    await until(
      () =>
        !!f.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
    );
    const row = f.store.db
        .prepare('SELECT result_ref FROM tool_calls WHERE run_id=?')
        .get(run.id) as { result_ref: string },
      result = JSON.parse(row.result_ref);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await f.work.stop();
    f.store.close();
    closed = true;
    reopened = await openStore(f.dir);
    const blobs = new BlobStore(reopened),
      files = new FileRepository(reopened, blobs),
      repo = new WorkRepository(reopened);
    reopened.db
      .prepare(
        "UPDATE runs SET status='running',lease_owner='fixture',lease_epoch=lease_epoch+1,lease_expires_at=? WHERE id=?",
      )
      .run(reopened.now() + 30000, view.runId);
    const resumedRun = repo.row(view.runId),
      resumedGateway = new WorkToolGateway(
        new WorkArtifacts(files, blobs),
        undefined,
        new ChatService(reopened, blobs, {} as never),
      );
    const resumed = resumedGateway.resume(resumedRun, 'image', () =>
      repo.guard(resumedRun, 'fixture'),
    );
    const bytes = (await files.original(result.fileId, { versionId: result.versionId })).bytes;
    const job = files.jobs.claim('image-recovery')!;
    files.beginParse(job, result.versionId);
    await files.completeParse(
      job,
      result.versionId,
      await parseOfficeFile(bytes, 'docx', FILE_LIMITS, true),
      new AbortController().signal,
    );
    files.jobs.finish(job, 'completed');
    expect(await resumed).toEqual([result]);
    expect(
      reopened.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='图片.docx'").get(),
    ).toEqual({ n: 1 });
    expect(await blobs.readVersion(input.versionId)).toEqual(png);
  } finally {
    if (!closed) await f.close();
    reopened?.close();
  }
});
