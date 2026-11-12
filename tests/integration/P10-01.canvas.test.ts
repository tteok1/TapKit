import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test, expect } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  CanvasReplySchema,
  unavailableExecution,
  type CanvasCommand,
  type CanvasView,
  type FileOwner,
} from '../../packages/contracts/src';
import {
  BlobStore,
  FileRepository,
  openStore,
  newId,
  SCHEMA_VERSION,
} from '../../packages/storage/src';
import {
  canvasText,
  canvasFromMarkdown,
  canvasDocumentSpec,
  renderDocumentDraft,
  validateDocumentContent,
  validateDocumentPdfLayout,
} from '../../packages/workflows/src';
import { readExecutionCapabilities } from '../../packages/tools/src';
import { ArtifactService } from '../../packages/core/src/artifact-service';
import { FileParser } from '../../packages/core/src/file-parser';
import { CanvasService } from '../../packages/core/src/canvas/service';
import { canvasTextHash } from '../../packages/core/src/canvas/edits';
import { installChatFixture } from '../../packages/core/src/chat-fixture';
import { ModelService } from '../../packages/core/src/model-service';
import { ProviderService } from '../../packages/core/src/provider-service';
import { solidPng } from '../fixtures/P07-01.images';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

const owner = { type: 'library' as const };
const source =
  '# 检查报告\n\n保留前段 目标文字 保留后段\n\n| 项目 | 数值 |\n|---|---|\n| 温度 | 42 |';
const base = (view: CanvasView) => ({
  documentId: view.documentId,
  baseVersion: view.versionId,
  revision: view.revision,
});

async function fixture(native = false) {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P10-01 canvas '));
  const store = await openStore(dir);
  const files = new FileRepository(store, new BlobStore(store));
  const models = new ModelService(
    store,
    new ProviderService(store, async () => {
      throw Error('No fixture vault');
    }),
  );
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  installChatFixture(models);
  const caps = native
    ? await readExecutionCapabilities(resolve('.'))
    : unavailableExecution('PROBE_REQUIRED');
  const artifacts = new ArtifactService(resolve('.'), files, caps);
  const parser = new FileParser(resolve('.'), files, caps);
  const service = new CanvasService(
    files,
    {
      canvasMessage: () => {
        throw Error('Unexpected message source');
      },
    },
    models,
    (id, bytes, spec, signal) =>
      artifacts.renderCanvasPdf(id, bytes, signal, async (directory, pdf) => {
        const parsed = await parser.inspectWorkPdf(
          directory,
          id,
          pdf,
          true,
          () => signal.throwIfAborted(),
          signal,
          undefined,
          'preview',
        );
        expect(validateDocumentContent(spec, parsed, 'pdf', true)).toBe(true);
        expect(validateDocumentPdfLayout(parsed)).toBe(true);
        expect(parsed.paintedImages).toBeGreaterThan(0);
      }),
  );
  const send = (command: CanvasCommand, payload: unknown, requestId = newId(), windowId = '1') =>
    service.dispatch({ protocolVersion: 1, requestId, windowId, command, payload });
  async function data(...args: Parameters<typeof send>) {
    const reply = await send(...args);
    if (!reply.ok) throw Error(reply.error.code);
    return CanvasReplySchema.parse(reply.data);
  }
  async function view(...args: Parameters<typeof send>) {
    const reply = await data(...args);
    if (!('canvas' in reply)) throw Error('Canvas response required');
    return reply.canvas;
  }
  async function importFile(name: string, bytes: Buffer, mime: string, scope: FileOwner = owner) {
    const blob = await files.blobs.put(bytes, mime);
    const { file } = files.importBlob({ blobId: blob.id, name, relativePath: name, owner: scope });
    return { fileId: file.id, versionId: file.version.id };
  }
  return {
    dir,
    store,
    files,
    models,
    send,
    view,
    data,
    importFile,
    caps,
    async close() {
      await service.stop();
      await artifacts.stop();
      await parser.staging.stop();
      store.close();
    },
  };
}

test('P10-01 pins original bytes, saves a conflict copy, restores history and reopens schema 24', async () => {
  const f = await fixture();
  let savedId = '';
  try {
    const original = await f.importFile('中文.md', Buffer.from(source), 'text/markdown');
    const document = await f.view('canvas.open', { source: { kind: 'file', ...original, owner } });
    savedId = document.documentId;
    const first = await f.view('canvas.save', {
      ...base(document),
      title: '窗口一',
      content: document.content,
    });
    const requestId = newId();
    const input = {
      ...base(document),
      title: '窗口二',
      content: canvasFromMarkdown('保留冲突修改', newId),
    };
    const result = await f.data('canvas.save', input, requestId, '2');
    expect(result).toMatchObject({ canvas: { title: '窗口二', revision: 1 }, conflict: true });
    expect(await f.data('canvas.save', input, requestId, '2')).toEqual(result);
    expect((await f.view('canvas.get', { documentId: savedId })).versionId).toBe(first.versionId);
    const restored = await f.view('canvas.restore', {
      ...base(first),
      versionId: document.versionId,
    });
    expect(restored.revision).toBe(3);
    expect(restored.content).toEqual(document.content);
    const copy = await f.view('canvas.copy', {
      documentId: savedId,
      versionId: document.versionId,
    });
    expect(copy.documentId).not.toBe(savedId);
    expect(copy.source).toEqual({
      kind: 'canvas',
      documentId: savedId,
      versionId: document.versionId,
    });
    expect(copy.content).toEqual(document.content);
    expect((await f.files.original(original.fileId, original)).bytes.toString()).toBe(source);
    expect(await f.data('canvas.history', { documentId: savedId })).toMatchObject({
      canvasVersions: [
        { revision: 3, parentVersionId: first.versionId },
        { revision: 2 },
        { revision: 1 },
      ],
    });
  } finally {
    await f.close();
  }
  const reopened = await openStore(f.dir);
  try {
    expect(reopened.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(
      reopened.db.prepare('SELECT revision FROM canvas_documents WHERE id=?').get(savedId),
    ).toEqual({ revision: 3 });
  } finally {
    reopened.close();
  }
});

test('P10-01 imports only the parsed DOCX version and keeps its heading and table', async () => {
  const f = await fixture();
  try {
    const spec = canvasDocumentSpec({
      title: '导入样本',
      content: canvasFromMarkdown(source, newId),
      threads: [],
    });
    const { docx } = await renderDocumentDraft(spec);
    const file = await f.importFile(
      '固定正文.docx',
      docx,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const request = { source: { kind: 'file', ...file, owner } };
    expect(await f.send('canvas.open', request)).toMatchObject({
      ok: false,
      error: { code: 'INDEX_NOT_READY' },
    });
    const parsed = await parseOfficeFile(docx, 'docx');
    const job = f.files.jobs.claim('P10-01 DOCX fixture')!;
    f.files.beginParse(job, file.versionId);
    await f.files.completeParse(job, file.versionId, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed', file.versionId);
    const imported = await f.view('canvas.open', request);
    expect(imported.source).toEqual(request.source);
    expect(imported.content.content.find((block) => block.type === 'heading')).toBeDefined();
    expect(canvasText(imported.content.content.find((block) => block.type === 'table')!)).toContain(
      '温度42',
    );
    expect((await f.files.original(file.fileId, file)).bytes).toEqual(docx);
  } finally {
    await f.close();
  }
});

test('P10-01 AI proposal uses the root usage ledger, rejects stale responses and only changes the chosen range', async () => {
  const f = await fixture();
  try {
    const reference = await f.importFile('参考.md', Buffer.from('测试参考内容'), 'text/markdown');
    const document = await f.view('canvas.open', { source: { kind: 'file', ...reference } });
    const current = await f.view('canvas.save', {
      ...base(document),
      title: '正文',
      content: canvasFromMarkdown(source, newId),
    });
    const para = current.content.content[1]!;
    const selection = {
      blockId: String(para.attrs!.blockId),
      from: 5,
      to: 9,
      textHash: canvasTextHash('目标文字'),
    };
    const request = {
      ...base(current),
      selection,
      action: 'proofread',
      instruction: '',
      reference,
    };
    const adapter = f.models.router.deps.adapter;
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    f.models.router.deps.adapter = (id) => {
      const original = adapter(id)!;
      return {
        ...original,
        async *stream(...args) {
          started.resolve();
          await finish.promise;
          yield* original.stream(...args);
        },
      };
    };
    const stale = f.send('canvas.aiEdit', request);
    try {
      await Promise.race([
        started.promise,
        stale.then(() => {
          throw Error('Model did not start');
        }),
      ]);
      await f.view('canvas.save', {
        ...base(current),
        title: '修改发生于模型运行时',
        content: current.content,
      });
    } finally {
      finish.resolve();
    }
    expect(await stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    f.models.router.deps.adapter = adapter;
    const latest = await f.view('canvas.get', { documentId: current.documentId });
    const callId = newId();
    const result = await f.data('canvas.aiEdit', { ...request, ...base(latest) }, callId);
    if (!('canvasProposal' in result)) throw Error('Proposal missing');
    const proposal = result.canvasProposal;
    expect(proposal.items[0]).toMatchObject({ before: '目标文字', replacement: '修订目标文字' });
    const apply = {
      ...base(latest),
      proposalId: proposal.proposalId,
      blockId: selection.blockId,
      accept: true,
    };
    expect(await f.send('canvas.apply', apply, newId(), '2')).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    const edited = await f.view('canvas.apply', apply);
    expect(canvasText(edited.content.content[1]!)).toBe('保留前段 修订目标文字 保留后段');
    expect(edited.content.content[0]).toEqual(latest.content.content[0]);
    expect(edited.content.content[2]).toEqual(latest.content.content[2]);
    expect(f.models.ledger.attempts(callId)).toHaveLength(1);
    expect(await f.send('canvas.aiEdit', { ...request, ...base(latest) }, callId)).toMatchObject({
      ok: false,
    });
  } finally {
    await f.close();
  }
});

test('P10-01 exports Chinese tables and fixed static images to Markdown and Word; PDF fails closed without isolation', async () => {
  const f = await fixture();
  try {
    const png = await f.importFile('标记.png', solidPng(), 'image/png');
    const doc = await f.view('canvas.open', { source: { kind: 'blank' } });
    const content = canvasFromMarkdown(source, newId);
    content.content.push({ type: 'image', attrs: { blockId: newId(), ...png, alt: '静态标记' } });
    const saved = await f.view('canvas.save', { ...base(doc), title: '中文画布', content });
    for (const format of ['md', 'docx'] as const) {
      const result = await f.data('canvas.export', {
        documentId: saved.documentId,
        versionId: saved.versionId,
        format,
      });
      if (!('canvasExport' in result)) throw Error('Export missing');
      const output = await f.files.original(result.canvasExport.fileId, {
        versionId: result.canvasExport.versionId,
      });
      if (format === 'md') {
        expect(output.bytes.toString()).toContain('| 温度 | 42 |');
        expect(output.bytes.toString()).toContain('![静态标记](data:image/png;base64,');
      } else {
        const parsed = await parseOfficeFile(output.bytes, 'docx', undefined, true);
        expect(
          parsed.blocks.some((block) => block.kind === 'table' && block.text.includes('温度')),
        ).toBe(true);
        expect(parsed.embeddedPngHashes).toHaveLength(1);
      }
    }
    expect(
      await f.send('canvas.export', {
        documentId: saved.documentId,
        versionId: saved.versionId,
        format: 'pdf',
      }),
    ).toMatchObject({ ok: false, error: { code: 'SANDBOX_UNAVAILABLE' } });
    expect(f.store.db.prepare('SELECT count(*) n FROM canvas_exports').get()).toEqual({ n: 2 });
  } finally {
    await f.close();
  }
});

test.skipIf(process.env.TAPKIT_P10_NATIVE !== '1')(
  'P10-01 T07 validates Chinese PDF text, table and rendered image through Windows isolation',
  async () => {
    const f = await fixture(true);
    try {
      expect(f.caps.officeRender.status).toBe('available');
      const png = await f.importFile('标记.png', solidPng(), 'image/png');
      const doc = await f.view('canvas.open', { source: { kind: 'blank' } });
      const content = canvasFromMarkdown(source, newId);
      content.content.push({ type: 'image', attrs: { blockId: newId(), ...png, alt: '静态标记' } });
      const saved = await f.view('canvas.save', { ...base(doc), title: '中文画布', content });
      const result = await f.data('canvas.export', {
        documentId: saved.documentId,
        versionId: saved.versionId,
        format: 'pdf',
      });
      if (!('canvasExport' in result)) throw Error('PDF missing');
      const { bytes } = await f.files.original(result.canvasExport.fileId, {
        versionId: result.canvasExport.versionId,
      });
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await f.close();
    }
  },
  120_000,
);
