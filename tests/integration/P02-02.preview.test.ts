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
import {
  ChatMaterialSchema,
  CreatedEntitySchema,
  DEFAULT_MODEL_PREFERENCES,
  FILE_PARSER_VERSION,
  unavailableExecution,
  type Reply,
} from '../../packages/contracts/src';
import { ArtifactService } from '../../packages/core/src/artifact-service';
import { ChatService } from '../../packages/core/src/chat-service';
import { CoreService } from '../../packages/core/src/service';

const stores: Store[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
const request = (command: string, payload: unknown) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  windowId: '0',
});
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P02-02 legacy preview '));
  const store = await openStore(dir);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    service = new ArtifactService(resolve('.'), files, unavailableExecution('preview-fixture'));
  const chat = new ChatService(store, blobs, {
    catalog: async () => [],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream() {
        throw new Error('No model calls in preview fixture');
      },
    },
  });
  const session = CreatedEntitySchema.parse(
    data(
      new CoreService(store).dispatch(request('sessions.create', { mode: 'chat', title: '预览' })),
    ),
  ).entityId;
  const attach = async (name: string, bytes: Buffer) => {
    const material = ChatMaterialSchema.parse(
      data(
        await chat.dispatch(
          request('inputs.attach', { sessionId: session, name, bytes: bytes.toString('base64') }),
        ),
      ),
    );
    if (material.ref.kind !== 'file') throw new Error('Expected file attachment');
    return {
      fileId: material.ref.fileId,
      versionId: material.ref.versionId,
      owner: { type: 'session' as const, id: session },
    };
  };
  return { dir, store, blobs, files, service, chat, session, attach };
}

test('P02-02 T05 long pasted attachments preview exact text and retain fixed-version selections after restart', async () => {
  const f = await fixture(),
    text = '第一行\r\n🙂' + '长'.repeat(20001),
    access = await f.attach('粘贴内容.txt', Buffer.from(text));
  expect(await f.service.open({ ...access, retry: false }, '0')).toMatchObject({
    status: 'ready',
    format: 'text',
    blockCount: 1,
  });
  const selected = await f.service.repository.selection({
    ...access,
    locator: { kind: 'text', start: 0, end: text.length },
    textRange: { start: 5, end: 11 },
  });
  expect(selected.selectedText).toBe(text.slice(5, 11));
  expect(await f.chat.material(selected.ref, f.session)).toMatchObject({
    text: selected.selectedText,
  });
  await expect(
    f.service.repository.selection({
      ...access,
      locator: { kind: 'text', start: 0, end: text.length },
      expectedTextHash: '0'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  const replacement = await f.blobs.put(Buffer.from('新版文本'));
  f.files.importBlob({
    blobId: replacement.id,
    name: '新版.txt',
    relativePath: '新版.txt',
    replaceId: access.fileId,
    owner: { type: 'library' },
  });
  expect((await f.service.repository.document(access)).blocks[0]?.text).toBe(text);
  await f.chat.stop();
  await f.service.stop();
  f.store.close();
  const reopened = await openStore(f.dir);
  stores.push(reopened);
  const service = new ArtifactService(
    resolve('.'),
    new FileRepository(reopened, new BlobStore(reopened)),
    unavailableExecution('preview-fixture'),
  );
  expect(await service.open({ ...access, retry: false }, '0')).toMatchObject({
    status: 'ready',
    versionChanged: true,
  });
  expect((await service.repository.document(access)).blocks[0]?.text).toBe(text);
  expect(reopened.db.prepare('SELECT count(*) n FROM parsed_documents').get()).toEqual({ n: 0 });
});

test.each(['md', 'html', 'csv', 'ts'])(
  'P02-02 T07 legacy %s attachments preserve literal text without parsing markup',
  async (extension) => {
    const f = await fixture(),
      text = '<script>throw new Error("inactive")</script>\r\n# 标题,🙂',
      access = await f.attach('literal.' + extension, Buffer.from(text));
    expect(await f.service.open({ ...access, retry: false }, '0')).toMatchObject({
      status: 'ready',
      format: 'text',
    });
    expect((await f.service.repository.document(access)).blocks[0]?.text).toBe(text);
  },
);

test.each([
  ['binary.pdf', Buffer.from('binary marked ready'), 'FORMAT_UNSUPPORTED'],
  ['invalid.txt', Buffer.from([0xff, 0xfe, 0x61]), 'FORMAT_UNSUPPORTED'],
  ['nul-text.txt', Buffer.from('a\0b'), 'FORMAT_UNSUPPORTED'],
  ['long.txt', Buffer.from('长'.repeat(100001)), 'FILE_TOO_LARGE'],
  ['large.txt', Buffer.alloc(400001, 97), 'FILE_TOO_LARGE'],
] as const)(
  'P02-02 T08 legacy preview rejects %s even when marked ready',
  async (name, bytes, code) => {
    const f = await fixture(),
      access = await f.attach(name, bytes);
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='ready' WHERE id=?")
      .run(access.versionId);
    const reply = await f.service.dispatch(request('artifacts.open', access));
    expect(reply).toMatchObject({ ok: false, error: { code } });
  },
);

test('P02-02 T19 parsed files with missing structures never fall back to original text', async () => {
  const f = await fixture(),
    access = await f.attach('parsed.txt', Buffer.from('not a derived structure'));
  f.store.db
    .prepare('UPDATE file_versions SET parser_version=? WHERE id=?')
    .run(FILE_PARSER_VERSION, access.versionId);
  const original = vi.spyOn(f.blobs, 'readVersion');
  expect(await f.service.dispatch(request('artifacts.open', access))).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' },
  });
  expect(original).not.toHaveBeenCalled();
});

test.each(['unlink', 'delete', 'status', 'parser'] as const)(
  'P02-02 T19 legacy preview rejects %s during original I/O',
  async (change) => {
    const f = await fixture(),
      access = await f.attach('owned.md', Buffer.from('# 私有文本'));
    const read = f.blobs.readVersion.bind(f.blobs);
    vi.spyOn(f.blobs, 'readVersion').mockImplementationOnce(async (versionId) => {
      const bytes = await read(versionId);
      if (change === 'unlink')
        f.store.db
          .prepare('UPDATE resource_links SET deleted_at=? WHERE resource_id=? AND owner_id=?')
          .run(f.store.now(), access.fileId, f.session);
      if (change === 'delete') f.files.trash([access.fileId]);
      if (change === 'status')
        f.store.db
          .prepare("UPDATE file_versions SET parse_status='pending' WHERE id=?")
          .run(versionId);
      if (change === 'parser')
        f.store.db
          .prepare('UPDATE file_versions SET parser_version=? WHERE id=?')
          .run(FILE_PARSER_VERSION, versionId);
      return bytes;
    });
    const reply = await f.service.dispatch(request('artifacts.open', access));
    expect(reply).toMatchObject({ ok: false });
    if (reply.ok) throw new Error('Stale text was exposed');
    expect(reply.error.code).toBe(
      change === 'unlink'
        ? 'PERMISSION_DENIED'
        : change === 'delete'
          ? 'NOT_FOUND'
          : change === 'status'
            ? 'INDEX_NOT_READY'
            : 'CONFLICT',
    );
  },
);
