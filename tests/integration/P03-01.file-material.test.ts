import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BlobStore,
  FileRepository,
  openStore,
  newId,
  type Store,
} from '../../packages/storage/src';
import { ChatService } from '../../packages/core/src/chat-service';
import { CoreService } from '../../packages/core/src/service';
import {
  CreatedEntitySchema,
  ChatMaterialSchema,
  ChatMaterialsViewSchema,
  DEFAULT_MODEL_PREFERENCES,
  FILE_PARSER_VERSION,
  ParsedDocumentSchema,
  type ParsedDocument,
  type Reply,
} from '../../packages/contracts/src';
const stores: Store[] = [],
  chats: ChatService[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of chats.splice(0)) await c.stop();
  for (const s of stores.splice(0)) if (s.db.open) s.close();
});
const req = (command: string, payload: unknown) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
});
function data(r: Reply) {
  if (!r.ok) throw Error(r.error.code);
  return r.data;
}
const doc = (text = '已读取的中文内容', format: ParsedDocument['format'] = 'docx') =>
  ParsedDocumentSchema.parse({
    schemaVersion: 1,
    parserVersion: FILE_PARSER_VERSION,
    format,
    blocks: [
      { id: 'block1', kind: 'text', text, locator: { kind: 'text', start: 0, end: text.length } },
    ],
    pages: [],
    sheets: [],
    slides: [],
    entries: [],
    quality: { needsOcr: false, warnings: [] },
  });
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P03-01 file material ')));
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store);
  const chat = new ChatService(store, blobs, {
    catalog: async () => [],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream() {
        throw Error('No model in material fixture');
      },
    },
  });
  chats.push(chat);
  const session = CreatedEntitySchema.parse(
    data(core.dispatch(req('sessions.create', { mode: 'chat', title: '只读材料会话' }))),
  ).entityId;
  const project = () =>
    CreatedEntitySchema.parse(data(core.dispatch(req('projects.create', { name: '合成隔离项目' }))))
      .entityId;
  const put = async (name = '资料.docx', document = doc()) => {
    // Synthetic trusted parser output tests the material consumer, not Office/native parsing.
    const original = Buffer.from([255, 254, 0, 80, 75, 1, 2]);
    const blob = await blobs.put(original, 'application/octet-stream');
    const file = files.importBlob({
      blobId: blob.id,
      name,
      relativePath: name,
      owner: { type: 'library' },
    }).file;
    const job = files.jobs.claim('synthetic parser output')!;
    files.beginParse(job, file.currentVersionId);
    await files.completeParse(job, file.currentVersionId, document, new AbortController().signal);
    files.jobs.finish(job, 'completed');
    return {
      file: files.get(file.id),
      original,
      ref: { kind: 'file' as const, fileId: file.id, versionId: file.currentVersionId },
    };
  };
  return { store, blobs, files, core, chat, session, project, put };
}
test.each([
  ['docx', 'docx'],
  ['pdf', 'pdf'],
  ['xlsx', 'sheet'],
  ['pptx', 'pptx'],
] as const)(
  'P03-01 %s material uses pinned parsed blocks without decoding or rereading binary originals',
  async (extension, format) => {
    const f = await fixture(),
      item = await f.put('资料.' + extension, doc('已读取的中文内容', format));
    const source = vi.spyOn(f.blobs, 'readVersion');
    expect(await f.chat.material(item.ref, f.session)).toMatchObject({
      name: '资料.' + extension,
      state: 'ready',
      text: '已读取的中文内容',
      source: '本地已读取文件',
    });
    expect(source).not.toHaveBeenCalled();
    source.mockRestore();
    const replacement = await f.blobs.put(Buffer.from('另一个版本'), 'text/plain');
    f.files.importBlob({
      blobId: replacement.id,
      name: '资料.' + extension,
      relativePath: '资料.' + extension,
      owner: { type: 'library' },
      replaceId: item.file.id,
    });
    expect(await f.chat.material(item.ref, f.session)).toMatchObject({ text: '已读取的中文内容' });
    expect((await f.files.original(item.file.id, { versionId: item.ref.versionId })).bytes).toEqual(
      item.original,
    );
  },
);
test('P03-01 project material requires an explicit pinned session/project link and rechecks withdrawal after derived I/O', async () => {
  const f = await fixture(),
    item = await f.put(),
    project = f.project(),
    other = f.project();
  f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
  const read = vi.spyOn(f.blobs, 'readDerivedVersion');
  await expect(f.chat.material(item.ref, f.session)).rejects.toThrow('PERMISSION_DENIED');
  expect(read).not.toHaveBeenCalled();
  f.files.link(item.file.id, item.ref.versionId, { type: 'project', id: other });
  await expect(f.chat.material(item.ref, f.session)).rejects.toThrow('PERMISSION_DENIED');
  f.files.link(item.file.id, item.ref.versionId, { type: 'project', id: project });
  expect(await f.chat.material(item.ref, f.session)).toMatchObject({ state: 'ready' });
  const actual = f.blobs.readDerivedVersion.bind(f.blobs);
  read.mockRestore();
  vi.spyOn(f.blobs, 'readDerivedVersion').mockImplementationOnce(async (...args) => {
    const bytes = await actual(...args);
    f.files.unlink([item.file.id], { type: 'project', id: project });
    return bytes;
  });
  await expect(f.chat.material(item.ref, f.session)).rejects.toThrow('PERMISSION_DENIED');
});
test('P03-01 project reference chooser lists its pinned old file version and excludes unrelated library files', async () => {
  const f = await fixture(),
    item = await f.put(),
    other = await f.put('项目外.docx'),
    project = f.project();
  f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
  f.files.link(item.file.id, item.ref.versionId, { type: 'project', id: project });
  const replacement = await f.blobs.put(Buffer.from('新版原件'), 'application/octet-stream');
  f.files.importBlob({
    blobId: replacement.id,
    name: '资料.docx',
    relativePath: '资料.docx',
    owner: { type: 'library' },
    replaceId: item.file.id,
  });
  const materials = ChatMaterialsViewSchema.parse(
    data(await f.chat.dispatch(req('inputs.references', { sessionId: f.session }))),
  ).materials;
  const refs = materials.filter((m) => m.ref.kind === 'file');
  expect(refs).toHaveLength(1);
  expect(refs[0]).toMatchObject({ ref: item.ref, text: '已读取的中文内容' });
  expect(refs.some((m) => m.ref.kind === 'file' && m.ref.fileId === other.file.id)).toBe(false);
});
test('P03-01 changing session project or deleting a file during material I/O rejects stale content', async () => {
  const f = await fixture(),
    item = await f.put(),
    project = f.project();
  const actual = f.blobs.readDerivedVersion.bind(f.blobs);
  vi.spyOn(f.blobs, 'readDerivedVersion').mockImplementationOnce(async (...args) => {
    const bytes = await actual(...args);
    f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
    return bytes;
  });
  await expect(f.chat.material(item.ref, f.session)).rejects.toThrow('CONFLICT');
  f.store.db.prepare('UPDATE sessions SET project_id=NULL WHERE id=?').run(f.session);
  vi.spyOn(f.blobs, 'readDerivedVersion').mockImplementationOnce(async (...args) => {
    const bytes = await actual(...args);
    f.files.trash([item.file.id]);
    return bytes;
  });
  await expect(f.chat.material(item.ref, f.session)).rejects.toThrow('NOT_FOUND');
});
test('P03-01 P02 text attachment retains exact selected text and becomes an explicit session grant in projects', async () => {
  const f = await fixture(),
    project = f.project();
  f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
  const material = ChatMaterialSchema.parse(
    data(
      await f.chat.dispatch(
        req('inputs.attach', {
          sessionId: f.session,
          name: '旧版文本.txt',
          bytes: Buffer.from('第一行\r\n第二行').toString('base64'),
        }),
      ),
    ),
  );
  expect(
    await f.chat.material(
      { ...material.ref, locator: { kind: 'text', start: 5, end: 8 } } as Extract<
        typeof material.ref,
        { kind: 'file' }
      >,
      f.session,
    ),
  ).toMatchObject({ state: 'ready', text: '第二行' });
});
test('P03-01 parsed material bounds text and rejects stale/OCR/missing binary structure without an original-text fallback', async () => {
  const f = await fixture(),
    large = await f.put('较长.docx', doc('中'.repeat(100001)));
  await expect(f.chat.material(large.ref, f.session)).rejects.toThrow('FILE_TOO_LARGE');
  const ocr = doc('');
  ocr.quality.needsOcr = true;
  const scanned = await f.put('扫描.pdf', ocr);
  expect(await f.chat.material(scanned.ref, f.session)).toMatchObject({ state: 'unsupported' });
  expect(await f.chat.material(scanned.ref, f.session)).not.toHaveProperty('text');
  const binary = await f.put('二进制.pdf');
  f.store.db
    .prepare('UPDATE file_versions SET parser_version=NULL WHERE id=?')
    .run(binary.ref.versionId);
  const source = vi.spyOn(f.blobs, 'readVersion');
  await expect(f.chat.material(binary.ref, f.session)).rejects.toThrow('FORMAT_UNSUPPORTED');
  expect(source).not.toHaveBeenCalled();
  f.store.db
    .prepare('UPDATE file_versions SET parser_version=? WHERE id=?')
    .run(FILE_PARSER_VERSION, binary.ref.versionId);
  f.store.db
    .prepare('UPDATE parsed_documents SET deleted_at=1 WHERE file_version_id=?')
    .run(binary.ref.versionId);
  await expect(f.chat.material(binary.ref, f.session)).rejects.toThrow('NOT_FOUND');
  expect(source).not.toHaveBeenCalled();
});
