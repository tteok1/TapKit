import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ArtifactRepository,
  BlobStore,
  FileRepository,
  openStore,
  newId,
  migrate,
  type Store,
} from '../../packages/storage/src';
import {
  ParsedDocumentSchema,
  FILE_PARSER_VERSION,
  unavailableExecution,
  type ParsedDocument,
  type FileOwner,
} from '../../packages/contracts/src';
import { ArtifactService } from '../../packages/core/src/artifact-service';
import { fileMaterial } from '../../packages/core/src/file-material';
import { CoreService } from '../../packages/core/src/service';
import { parseTextFile } from '../../packages/retrieval/src/ingest/text';
import { pdfFixture } from '../fixtures/P03-pdf';
import type { OfficeExecutor } from '../../packages/tools/src/execution/office-worker';

const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function document(format: ParsedDocument['format'] = 'pdf'): ParsedDocument {
  return ParsedDocumentSchema.parse({
    schemaVersion: 1,
    parserVersion: FILE_PARSER_VERSION,
    format,
    blocks:
      format === 'pdf'
        ? [
            {
              id: 'first',
              kind: 'text',
              text: '第一页固定内容',
              locator: {
                kind: 'pdf',
                pageIndex: 0,
                rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.1 }],
              },
            },
            {
              id: 'last',
              kind: 'text',
              text: '末页固定内容',
              locator: { kind: 'pdf', pageIndex: 1 },
            },
          ]
        : format === 'sheet'
          ? []
          : [
              {
                id: 'paragraph',
                kind: 'paragraph',
                text: '标题\n正文',
                locator: { kind: 'text', start: 0, end: 5 },
              },
            ],
    pages:
      format === 'pdf'
        ? [
            { width: 200, height: 300 },
            { width: 200, height: 300 },
          ]
        : [],
    sheets: [],
    slides: [],
    entries: [],
    quality: { needsOcr: false, warnings: [] },
  });
}
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P03-02 artifacts '));
  const store = await openStore(dir);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    repository = new ArtifactRepository(files);
  const service = new ArtifactService(
    resolve('.'),
    files,
    unavailableExecution('local-probe-not-used'),
  );
  const add = async (
    name = '材料.pdf',
    doc = document(),
    replaceId?: string,
    owner: FileOwner = { type: 'library' },
  ) => {
    const original = name.endsWith('.pdf') ? '%PDF-1.7 ' + newId() : 'synthetic ' + newId();
    const blob = await blobs.put(Buffer.from(original));
    const file = files.importBlob({
      blobId: blob.id,
      name,
      relativePath: name,
      owner,
      ...(replaceId ? { replaceId } : {}),
    }).file;
    const job = files.jobs.claim('P03-02 fixture')!;
    files.beginParse(job, file.version.id);
    await files.completeParse(job, file.version.id, doc, new AbortController().signal);
    files.jobs.finish(job, 'completed', file.version.id);
    return {
      file: files.get(file.id, { versionId: file.version.id }),
      access: { fileId: file.id, versionId: file.version.id },
      original,
    };
  };
  const owner = (kind: 'session' | 'project') => {
    const id = newId(),
      now = store.now();
    if (kind === 'project')
      store.db
        .prepare('INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)')
        .run(id, store.profileId, now, now, '项目');
    else {
      const reply = new CoreService(store).dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'sessions.create',
        payload: { title: '会话', mode: 'chat' },
      });
      if (!reply.ok || !('entityId' in reply.data)) throw new Error('session fixture failed');
      return { type: 'session', id: reply.data.entityId } as FileOwner;
    }
    return { type: kind, id } as FileOwner;
  };
  const call = (command: string, payload: unknown, requestId = newId()) =>
    service.dispatch({ protocolVersion: 1, requestId, command, payload, windowId: '0' });
  return { store, dir, blobs, files, repository, service, add, owner, call };
}
test('P03-02 T07 immutable versions open their own first/last page and retain reading positions independently', async () => {
  const f = await fixture(),
    old = await f.add();
  await f.repository.savePosition({
    ...old.access,
    position: { locator: { kind: 'pdf', pageIndex: 1 }, scrollTop: 50, zoom: 2, mode: 'preview' },
  });
  const latest = await f.add('新版.pdf', document(), old.file.id);
  const view = await f.service.open(
    { ...old.access, retry: false, locator: { kind: 'pdf', pageIndex: 0 } },
    '0',
  );
  expect(view).toMatchObject({
    status: 'ready',
    pageCount: 2,
    versionChanged: true,
    file: { version: { id: old.access.versionId } },
    position: { zoom: 2, locator: { pageIndex: 1 } },
  });
  expect(f.repository.position(latest.access)).toMatchObject({ zoom: 1, scrollTop: 0 });
  expect((await f.service.readAsset({ ...old.access, kind: 'original' })).base64).toBe(
    Buffer.from(old.original).toString('base64'),
  );
  const located = await f.call('artifacts.locate', {
    ...old.access,
    locator: { kind: 'pdf', pageIndex: 1 },
  });
  expect(located.ok).toBe(true);
  const invalid = await f.call('artifacts.locate', {
    ...old.access,
    locator: { kind: 'pdf', pageIndex: 2 },
  });
  expect(invalid).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
});
test('P03-02 no same-name fallback, cross-file version, deleted file or revoked project grant can expose preview bytes', async () => {
  const f = await fixture(),
    a = await f.add(),
    b = await f.add();
  await expect(
    f.service.readAsset({ ...a.access, versionId: b.access.versionId, kind: 'original' }),
  ).rejects.toThrow('NOT_FOUND');
  const owner = f.owner('project');
  f.files.link(a.file.id, a.access.versionId, owner);
  expect(await f.service.readAsset({ ...a.access, owner, kind: 'original' })).toHaveProperty(
    'base64',
  );
  const read = f.blobs.readVersion.bind(f.blobs);
  vi.spyOn(f.blobs, 'readVersion').mockImplementationOnce(async (version) => {
    const bytes = await read(version);
    f.files.unlink([a.file.id], owner);
    return bytes;
  });
  await expect(f.service.readAsset({ ...a.access, owner, kind: 'original' })).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  f.files.trash([a.file.id]);
  await expect(f.service.readAsset({ ...a.access, kind: 'original' })).rejects.toThrow('NOT_FOUND');
});
test('P03-02 verified selection hashes, PDF annotations and optimistic edits remain pinned and idempotent without changing originals', async () => {
  const f = await fixture(),
    a = await f.add();
  const locator = {
    kind: 'pdf' as const,
    pageIndex: 0,
    rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.1 }],
  };
  const selection = await f.repository.selection({
    ...a.access,
    locator,
    textRange: { start: 0, end: 3 },
  });
  expect(selection.selectedText).toBe('第一页');
  expect(selection.selectedTextHash).toBe(sha('第一页'));
  const payload = {
    fileVersionId: a.access.versionId,
    locator,
    textRange: { start: 0, end: 3 },
    selectedTextHash: selection.selectedTextHash,
    body: '本地备注',
    color: 'yellow',
  };
  const id = newId(),
    first = await f.call('annotations.upsert', payload, id),
    again = await f.call('annotations.upsert', payload, id);
  expect(first).toEqual(again);
  expect(f.repository.annotations(a.access.versionId)).toHaveLength(1);
  const annotation = f.repository.annotations(a.access.versionId)[0]!;
  expect(
    await f.call('annotations.upsert', {
      ...payload,
      id: annotation.id,
      body: '错误竞争',
      expectedRevision: 99,
    }),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  expect(
    await f.call('annotations.upsert', {
      ...payload,
      id: annotation.id,
      body: '更新备注',
      expectedRevision: 1,
    }),
  ).toMatchObject({ ok: true, data: { annotation: { revision: 2, body: '更新备注' } } });
  const newer = await f.add('替换.pdf', document(), a.file.id);
  expect(f.repository.annotations(newer.access.versionId)).toEqual([]);
  expect(
    (await f.files.original(a.file.id, { versionId: a.access.versionId })).bytes.toString(),
  ).toBe(a.original);
  expect(
    await f.call('annotations.delete', {
      fileVersionId: newer.access.versionId,
      ids: [annotation.id],
    }),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  expect(
    await f.call('annotations.delete', { fileVersionId: a.access.versionId, ids: [annotation.id] }),
  ).toMatchObject({ ok: true });
});
test('P03-02 rectangle selections resolve only intersecting versioned blocks and PPTX shape/notes locators are verified', async () => {
  const f = await fixture(),
    pdf = await f.add();
  const selected = await f.repository.selection({
    ...pdf.access,
    locator: { kind: 'pdf', pageIndex: 0, rects: [{ x: 0.8, y: 0.8, width: 0.1, height: 0.1 }] },
  });
  expect(selected.selectedText).toBe('');
  const doc = document('pptx');
  doc.blocks = [
    {
      id: 'title',
      kind: 'paragraph',
      text: '标题',
      locator: { kind: 'slide', slideIndex: 0, shapeId: '2' },
    },
    { id: 'note', kind: 'notes', text: '讲稿', locator: { kind: 'slide', slideIndex: 0 } },
  ];
  doc.slides = [{ index: 0, title: '标题', notes: '讲稿' }];
  const slide = await f.add('演示.pptx', doc);
  expect(
    (
      await f.repository.selection({
        ...slide.access,
        locator: { kind: 'slide', slideIndex: 0, shapeId: '2' },
      })
    ).selectedText,
  ).toBe('标题');
  expect(
    (await f.repository.selection({ ...slide.access, locator: { kind: 'slide', slideIndex: 0 } }))
      .selectedText,
  ).toBe('标题\n讲稿');
  await expect(
    f.repository.selection({
      ...slide.access,
      locator: { kind: 'slide', slideIndex: 0, shapeId: '3' },
    }),
  ).rejects.toThrow('CONFLICT');
});
test('P03-02 diff and long-source locate stay on the chosen file and authorized versions', async () => {
  const f = await fixture(),
    a = await f.add('source.ts', parseTextFile(Buffer.from('共同\n删除\n末行'), 'source.ts')),
    b = await f.add(
      'source.ts',
      parseTextFile(Buffer.from('共同\n新增\n末行'), 'source.ts'),
      a.file.id,
    ),
    other = await f.add('source.ts', parseTextFile(Buffer.from('其他'), 'source.ts'));
  const reply = await f.call('artifacts.diff', { ...b.access, otherVersionId: a.access.versionId });
  expect(reply).toMatchObject({
    ok: true,
    data: { diff: [{ kind: 'equal' }, { kind: 'removed' }, { kind: 'added' }, { kind: 'equal' }] },
  });
  expect(
    await f.call('artifacts.diff', { ...b.access, otherVersionId: other.access.versionId }),
  ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  const source = await f.add(
    '长代码.ts',
    parseTextFile(
      Buffer.from(Array.from({ length: 10000 }, (_, i) => 'line' + (i + 1)).join('\n')),
      '长代码.ts',
    ),
  );
  const located = await f.call('artifacts.blocks', {
    ...source.access,
    locator: { kind: 'code', path: '长代码.ts', lineStart: 9988, lineEnd: 9988 },
  });
  expect(located).toMatchObject({ ok: true, data: { offset: 9900, total: 10000 } });
});
test('P03-02 portable conversion fixture deduplicates observers, verifies cache identity and cleans staging without claiming native acceptance', async () => {
  const f = await fixture(),
    a = await f.add('转换.docx', document('docx'));
  let executions = 0,
    release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const executor: OfficeExecutor = {
    execute: async (command) => {
      executions++;
      await gate;
      await writeFile(
        join(command.payload.workspace, 'document.pdf'),
        pdfFixture('portable injected fixture'),
      );
      return {
        exitCode: 0,
        events: [
          { event: 'started', data: { appContainer: true, networkCapabilities: 0 } },
          { event: 'finished', data: { status: 'exited', exitCode: 0, activeProcesses: 0 } },
        ],
      };
    },
  };
  const capabilities = unavailableExecution('portable-injected-executor');
  capabilities.nativeExecution = { status: 'available' };
  capabilities.officeRender = { status: 'available' };
  const service = new ArtifactService(resolve('.'), f.files, capabilities, executor);
  const first = service.open({ ...a.access, retry: false }, 'first'),
    second = service.open({ ...a.access, retry: false }, 'second');
  await vi.waitFor(() => expect(executions).toBe(1));
  service.closeWindow('first');
  release();
  expect((await first).status).toBe('ready');
  expect((await second).status).toBe('ready');
  expect(executions).toBe(1);
  expect((await service.readAsset({ ...a.access, kind: 'preview' })).mime).toBe('application/pdf');
  expect((await service.open({ ...a.access, retry: false }, 'second')).status).toBe('ready');
  expect(executions).toBe(1);
  expect(await readdir(service.staging.base)).toEqual([]);
  f.store.db
    .prepare("UPDATE file_versions SET preview_renderer_version='old-policy' WHERE id=?")
    .run(a.access.versionId);
  await expect(service.readAsset({ ...a.access, kind: 'preview' })).rejects.toThrow('CONFLICT');
  expect((await service.open({ ...a.access, retry: false }, 'second')).status).toBe('ready');
  expect(executions).toBe(2);
  await service.stop();
});
test('P03-02 selection spoofing and invalid locator bounds fail; chat material resolves a selected PDF page through the same version/hash check', async () => {
  const f = await fixture(),
    a = await f.add();
  const selected = await f.repository.selection({
    ...a.access,
    locator: { kind: 'pdf', pageIndex: 1 },
  });
  const owner = f.owner('session');
  f.files.link(a.file.id, a.access.versionId, owner);
  expect(owner.type).toBe('session');
  if (owner.type !== 'session') throw new Error('fixture');
  const material = await fileMaterial(f.files, selected.ref, () => ({
    id: owner.id,
    project_id: null,
  }));
  expect(material.text).toBe('末页固定内容');
  await expect(
    fileMaterial(
      f.files,
      { ...selected.ref, selection: { selectedTextHash: '0'.repeat(64) } },
      () => ({ id: owner.id, project_id: null }),
    ),
  ).rejects.toThrow('CONFLICT');
  await expect(
    f.repository.selection({
      ...a.access,
      locator: { kind: 'pdf', pageIndex: 0 },
      textRange: { start: 0, end: 999 },
    }),
  ).rejects.toThrow('CONFLICT');
  await expect(
    f.repository.selection({ ...a.access, locator: { kind: 'text', start: 0, end: 1 } }),
  ).rejects.toThrow('CONFLICT');
});
test('P03-02 large sheets send at most 100 view rows, preserve formulas/merged cells and sort/filter deterministically without writing source', async () => {
  const f = await fixture(),
    doc = document('sheet');
  doc.sheets = [
    {
      id: 'sheet1',
      name: '公式合并',
      rows: 200000,
      columns: 2,
      cells: [
        { row: 1, column: 1, value: '标题', calculated: true },
        { row: 2, column: 1, value: 3, formula: '1+2', calculated: true },
        { row: 3, column: 1, value: null, formula: 'SUM(A2)', calculated: false },
        { row: 4, column: 1, value: 2, calculated: true },
      ],
      mergedRanges: ['A1:B1'],
    },
  ];
  const a = await f.add('资料.xlsx', doc);
  const response = await f.call('artifacts.sheet', { ...a.access, sheetId: 'sheet1', offset: 0 });
  expect(response).toMatchObject({
    ok: true,
    data: { grid: { totalRows: 200000, mergedRanges: ['A1:B1'] } },
  });
  if (!response.ok || !('grid' in response.data)) throw new Error('grid response');
  expect(response.data.grid.rows).toHaveLength(100);
  expect(response.data.grid.columnTypes).toEqual(['mixed', 'empty']);
  expect(response.data.grid.cells.find((c) => c.row === 3)).toMatchObject({
    formula: 'SUM(A2)',
    calculated: false,
    value: null,
  });
  const filtered = await f.call('artifacts.sheet', {
    ...a.access,
    sheetId: 'sheet1',
    filters: [{ column: 1, query: '2' }],
    sort: { column: 1, direction: 'desc' },
  });
  expect(filtered).toMatchObject({ ok: true, data: { grid: { rows: [4], totalRows: 1 } } });
  expect(
    await f.call('artifacts.sheet', { ...a.access, sheetId: 'sheet1', limit: 101 }),
  ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  expect((await f.files.original(a.file.id)).bytes.toString()).toBe(a.original);
});
test('P03-02 missing Office capability stays failed and never calls a converter or publishes ready', async () => {
  const f = await fixture(),
    a = await f.add('资料.docx', document('docx'));
  const execute = vi.fn();
  const service = new ArtifactService(
    resolve('.'),
    f.files,
    unavailableExecution('APPLICATION_CONTROL'),
    { execute },
  );
  expect(await service.open({ ...a.access, retry: false }, '0')).toMatchObject({
    format: 'docx',
    status: 'failed',
    errorCode: 'SANDBOX_UNAVAILABLE',
    asset: 'none',
  });
  expect(execute).not.toHaveBeenCalled();
  expect(f.files.get(a.file.id).version.previewStatus).toBe('failed');
});

test('P03-02 DOCX paragraph locators validate their own paragraph ID rather than unrelated block ID', async () => {
  const f = await fixture(),
    doc = document('docx');
  doc.blocks[0]!.id = 'block-1';
  doc.blocks[0]!.locator = { kind: 'text', start: 0, end: 5, paragraphId: 'paragraph-1' };
  const file = await f.add('段落.docx', doc);
  expect(
    (await f.repository.selection({ ...file.access, locator: doc.blocks[0]!.locator }))
      .selectedText,
  ).toBe('标题\n正文');
  await expect(
    f.repository.selection({
      ...file.access,
      locator: { kind: 'text', start: 0, end: 5, paragraphId: 'block-1' },
    }),
  ).rejects.toThrow('CONFLICT');
});
test('P03-02 migration is repeatable, reader/annotations persist after reopen and purge erases derived private content', async () => {
  const f = await fixture(),
    a = await f.add();
  await f.repository.savePosition({
    ...a.access,
    position: { scrollTop: 25, zoom: 1.5, mode: 'preview' },
  });
  await f.repository.upsert({
    fileVersionId: a.access.versionId,
    locator: { kind: 'pdf', pageIndex: 0, rects: [] },
    selectedTextHash: sha('第一页固定内容'),
    body: '保留',
    color: 'yellow',
  });
  await migrate(f.store.db, resolve(f.dir, 'backups'));
  expect(f.store.db.pragma('user_version', { simple: true })).toBe(12);
  f.store.close();
  const reopened = await openStore(f.dir);
  stores.push(reopened);
  const files = new FileRepository(reopened, new BlobStore(reopened)),
    repo = new ArtifactRepository(files);
  expect(repo.position(a.access)).toMatchObject({ scrollTop: 25, zoom: 1.5 });
  expect(repo.annotations(a.access.versionId)[0]?.body).toBe('保留');
  files.trash([a.file.id]);
  files.purge([a.file.id]);
  expect(reopened.db.prepare('SELECT count(*) n FROM pdf_annotations').get()).toEqual({ n: 0 });
  expect(reopened.db.prepare('SELECT count(*) n FROM reading_positions').get()).toEqual({ n: 0 });
});
