import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  FileRepository,
  FILE_PARSER_VERSION,
  BlobStore,
  openStore,
  newId,
  type Store,
} from '../../packages/storage/src';
import { ParsedDocumentSchema } from '../../packages/contracts/src';
import { CoreService } from '../../packages/core/src/service';
const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P03-01 files '));
  const store = await openStore(directory);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  const put = async (
    text: string,
    name = '资料.TXT',
    options: { replaceId?: string; skip?: boolean } = {},
  ) => {
    const b = await blobs.put(Buffer.from(text), 'text/plain');
    return files.importBlob({
      blobId: b.id,
      name,
      relativePath: '中文目录/' + name,
      owner: { type: 'library' },
      ...options,
    }).file;
  };
  const project = () => {
    const id = newId(),
      now = store.now();
    store.db
      .prepare('INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)')
      .run(id, store.profileId, now, now, '资料范围');
    return id;
  };
  const document = (text: string) =>
    ParsedDocumentSchema.parse({
      schemaVersion: 1,
      parserVersion: FILE_PARSER_VERSION,
      format: 'text',
      blocks: [
        { id: 'line-1', kind: 'text', text, locator: { kind: 'text', start: 0, end: text.length } },
      ],
      pages: [],
      sheets: [],
      slides: [],
      entries: [],
      quality: { needsOcr: false, warnings: [] },
    });
  return { store, directory, blobs, files, put, project, document };
}
test('P03-01 T08 a PDF structure requiring OCR preserves its original and reports original-only recovery instead of readable content', async () => {
  const { files, blobs, store } = await fixture();
  const bytes = Buffer.from('%PDF-1.7 synthetic original with no text'),
    blob = await blobs.put(bytes, 'application/pdf');
  const file = files.importBlob({
    blobId: blob.id,
    name: '扫描.pdf',
    relativePath: '扫描.pdf',
    owner: { type: 'library' },
  }).file;
  const job = files.jobs.claim('ocr-fixture')!;
  files.beginParse(job, file.version.id);
  await files.completeParse(
    job,
    file.version.id,
    ParsedDocumentSchema.parse({
      schemaVersion: 1,
      parserVersion: FILE_PARSER_VERSION,
      format: 'pdf',
      blocks: [],
      pages: [{ width: 200, height: 200 }],
      sheets: [],
      slides: [],
      entries: [],
      quality: { needsOcr: true, warnings: ['PAGES_WITHOUT_TEXT', 'OCR_UNSUPPORTED'] },
    }),
    new AbortController().signal,
  );
  expect(files.jobs.finish(job, 'completed', file.version.id)).toBe(true);
  expect(files.get(file.id)).toMatchObject({
    status: 'imported',
    version: {
      parseStatus: 'unsupported',
      errorCode: 'FORMAT_UNSUPPORTED',
      errorReason: 'OCR_REQUIRED',
    },
  });
  expect((await files.original(file.id)).bytes).toEqual(bytes);
  expect(
    store.db
      .prepare('SELECT body FROM file_search_documents WHERE file_version_id=?')
      .get(file.version.id),
  ).toEqual({ body: '' });
});

test('P03-01 immutable replacement, restore and pinned links preserve historical bytes and IDs', async () => {
  const { files, put, project, blobs, store } = await fixture();
  const first = await put('原版本'),
    p = project();
  files.link(first.id, first.currentVersionId, { type: 'project', id: p });
  const second = await put('新版本', '资料.TXT', { replaceId: first.id });
  expect(second.id).toBe(first.id);
  expect(second.version.version).toBe(2);
  expect(second.currentVersionId).not.toBe(first.currentVersionId);
  expect((await blobs.readVersion(first.currentVersionId)).toString()).toBe('原版本');
  expect(files.usage(first.id).links[0]?.versionId).toBe(first.currentVersionId);
  expect(() =>
    files.get(first.id, { owner: { type: 'project', id: p }, versionId: second.currentVersionId }),
  ).toThrow('PERMISSION_DENIED');
  expect(
    files.get(first.id, { owner: { type: 'project', id: p }, versionId: first.currentVersionId })
      .version.id,
  ).toBe(first.currentVersionId);
  const restored = files.restoreVersion(first.id, first.currentVersionId, second.revision);
  expect(restored.version.version).toBe(3);
  expect(restored.version.sha256).toBe(first.version.sha256);
  expect(restored.currentVersionId).not.toBe(first.currentVersionId);
  expect(
    store.db
      .prepare('SELECT restored_from_version_id id FROM file_versions WHERE id=?')
      .get(restored.currentVersionId),
  ).toEqual({ id: first.currentVersionId });
  expect(() => files.restoreVersion(first.id, first.currentVersionId, second.revision)).toThrow(
    'CONFLICT',
  );
  expect(files.versions(first.id).map((v) => v.version)).toEqual([3, 2, 1]);
});
test('P03-01 scoped library listing, format filters, body search and default reads stay on the pinned version after a differently formatted replacement', async () => {
  const { files, put, project, document } = await fixture();
  const first = await put('第一版托管原件', '资料.TXT');
  const owner = { type: 'project', id: project() } as const;
  files.link(first.id, first.currentVersionId, owner);
  const parse = async (versionId: string, text: string) => {
    const job = files.jobs.claim('scoped-list')!;
    files.beginParse(job, versionId);
    await files.completeParse(job, versionId, document(text), new AbortController().signal);
    files.jobs.finish(job, 'completed');
  };
  await parse(first.currentVersionId, '只在固定旧版出现的正文');
  const current = await put('第二版托管原件', '资料.md', { replaceId: first.id });
  expect(files.get(first.id).status).toBe('imported');
  expect(files.get(first.id, { owner }).status).toBe('ready');
  await parse(current.currentVersionId, '只在新版出现的正文');
  const scoped = files.list({ owner }).files;
  expect(scoped).toHaveLength(1);
  expect(scoped[0]?.version.id).toBe(first.currentVersionId);
  expect(scoped[0]?.currentVersionId).toBe(current.currentVersionId);
  expect(scoped[0]?.extension).toBe('txt');
  expect(files.list({ owner, type: 'txt' }).files).toHaveLength(1);
  expect(files.list({ owner, type: 'md' }).files).toEqual([]);
  expect(files.list({ owner, query: '固定旧版' }).files.map((f) => f.version.id)).toEqual([
    first.currentVersionId,
  ]);
  expect(files.list({ owner, query: '新版出现' }).files).toEqual([]);
  expect(files.list({ owner: { type: 'library' }, query: '新版出现' }).files[0]?.version.id).toBe(
    current.currentVersionId,
  );
  expect(files.get(first.id, { owner }).version.id).toBe(first.currentVersionId);
  expect((await files.original(first.id, { owner })).bytes.toString()).toBe('第一版托管原件');
  expect((await files.parsed(first.id, { owner })).blocks[0]?.text).toBe('只在固定旧版出现的正文');
  expect(() => files.get(first.id, { owner, versionId: current.currentVersionId })).toThrow(
    'PERMISSION_DENIED',
  );
  files.unlink([first.id], owner);
  expect(files.list({ owner }).files).toEqual([]);
  expect(() => files.get(first.id, { owner })).toThrow('PERMISSION_DENIED');
});
test.each(['project', 'session'] as const)(
  'P03-01 %s scope chooses one source pin for sorting and rejects malformed pins without falling back to the library current version',
  async (type) => {
    const { files, put, project, store } = await fixture();
    const core = new CoreService(store);
    const created = core.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'sessions.create',
      payload: { mode: 'chat', title: '固定版本会话' },
    });
    if (!created.ok || !('entityId' in created.data)) throw Error('session fixture');
    const owner = { type, id: type === 'project' ? project() : created.data.entityId };
    const small = await put('x', '小文件.txt');
    files.link(small.id, small.currentVersionId, owner);
    const current = await put('新'.repeat(2000), '小文件.txt', { replaceId: small.id });
    const medium = await put('中'.repeat(30), '中等文件.txt');
    files.link(medium.id, medium.currentVersionId, owner);
    const now = store.now();
    store.db
      .prepare(
        "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role,pinned_version_id) VALUES(?,?,?,?,'file',?,?,?,'input',?)",
      )
      .run(
        newId(),
        store.profileId,
        now,
        now,
        small.id,
        owner.type,
        owner.id,
        current.currentVersionId,
      );
    const list = files.list({ owner, sort: 'size' }).files;
    expect(list.map((f) => f.id)).toEqual([medium.id, small.id]);
    expect(list[1]?.version.id).toBe(small.currentVersionId);
    expect(files.get(small.id, { owner, versionId: current.currentVersionId }).version.id).toBe(
      current.currentVersionId,
    );
    store.db
      .prepare(
        "UPDATE resource_links SET pinned_version_id=NULL WHERE resource_id=? AND owner_type=? AND owner_id=? AND role='source'",
      )
      .run(small.id, owner.type, owner.id);
    expect(files.list({ owner }).files.map((f) => f.id)).toEqual([medium.id]);
    expect(() => files.get(small.id, { owner })).toThrow('PERMISSION_DENIED');
    store.db
      .prepare(
        "UPDATE resource_links SET pinned_version_id=? WHERE resource_id=? AND owner_type=? AND owner_id=? AND role='source'",
      )
      .run(medium.currentVersionId, small.id, owner.type, owner.id);
    expect(files.list({ owner }).files.map((f) => f.id)).toEqual([medium.id]);
    expect(() => files.get(small.id, { owner })).toThrow('NOT_FOUND');
    files.link(small.id, current.currentVersionId, owner);
    expect(files.list({ owner, sort: 'size' }).files.map((f) => f.id)).toEqual([
      small.id,
      medium.id,
    ]);
    expect(files.get(small.id, { owner }).version.id).toBe(current.currentVersionId);
  },
);
test('P03-01 default pinned reads tolerate an unrelated library replacement but reject repinning during I/O; unscoped current reads still reject replacement', async () => {
  const { files, put, project, document, blobs } = await fixture();
  const first = await put('固定原件');
  const owner = { type: 'project', id: project() } as const;
  files.link(first.id, first.currentVersionId, owner);
  const job = files.jobs.claim('pinned-race')!;
  files.beginParse(job, first.currentVersionId);
  await files.completeParse(
    job,
    first.currentVersionId,
    document('固定结构'),
    new AbortController().signal,
  );
  files.jobs.finish(job, 'completed');
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = blobs.readVersion.bind(blobs);
  const pausedOriginal = vi
    .spyOn(blobs, 'readVersion')
    .mockImplementationOnce(async (versionId) => {
      await gate;
      return read(versionId);
    });
  const reading = files.original(first.id, { owner });
  const current = await put('库中新版', '资料.TXT', { replaceId: first.id });
  release();
  expect((await reading).bytes.toString()).toBe('固定原件');
  pausedOriginal.mockRestore();
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const readDerived = blobs.readDerivedVersion.bind(blobs);
  const pausedStructure = vi
    .spyOn(blobs, 'readDerivedVersion')
    .mockImplementationOnce(async (...args) => {
      await gate;
      return readDerived(...args);
    });
  const structure = files.parsed(first.id, { owner });
  const denied = expect(structure).rejects.toThrow('PERMISSION_DENIED');
  files.link(first.id, current.currentVersionId, owner);
  release();
  await denied;
  pausedStructure.mockRestore();
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pausedCurrent = vi.spyOn(blobs, 'readVersion').mockImplementationOnce(async (versionId) => {
    await gate;
    return read(versionId);
  });
  const latest = files.original(first.id);
  const conflict = expect(latest).rejects.toThrow('CONFLICT');
  await put('再次替换', '资料.TXT', { replaceId: first.id });
  release();
  await conflict;
  pausedCurrent.mockRestore();
});
test('P03-01 Chinese duplicate names share immutable blobs but retain independent files and copy histories', async () => {
  const { files, put, store, blobs } = await fixture();
  const first = await put('相同内容'),
    second = await put('相同内容');
  expect(first.id).not.toBe(second.id);
  expect(first.version.sha256).toBe(second.version.sha256);
  const skipped = await put('相同内容', '资料.TXT', { skip: true });
  expect([first.id, second.id]).toContain(skipped.id);
  const copy = files.copy(first.id, first.currentVersionId, '另存.txt', { type: 'library' });
  const replaced = await put('分叉修改', '另存.txt', { replaceId: copy.id });
  expect(replaced.version.version).toBe(2);
  expect((await blobs.readVersion(first.currentVersionId)).toString()).toBe('相同内容');
  expect((store.db.prepare('SELECT count(*) n FROM files').get() as { n: number }).n).toBe(3);
  expect(() =>
    files.copy(first.id, second.currentVersionId, '越权.txt', { type: 'library' }),
  ).toThrow('NOT_FOUND');
});
test('P03-01 folder ancestry, scope membership and revision checks reject cross-project and stale mutations', async () => {
  const { files, put, project, store } = await fixture();
  const f = await put('目录'),
    p = project(),
    other = project();
  files.link(f.id, f.currentVersionId, { type: 'project', id: p });
  expect(() => files.get(f.id, { owner: { type: 'project', id: other } })).toThrow(
    'PERMISSION_DENIED',
  );
  expect(() => files.get(f.id, { owner: { type: 'project', id: newId() } })).toThrow(
    'PERMISSION_DENIED',
  );
  const root = files.createFolder('根目录', null, { type: 'project', id: p });
  const child = files.createFolder('子目录', root.id, { type: 'project', id: p });
  expect(() => files.changeFolder(root.id, { parentId: child.id }, root.revision)).toThrow(
    'VALIDATION_ERROR',
  );
  expect(() => files.createFolder('跨项目', root.id, { type: 'project', id: other })).toThrow(
    'PERMISSION_DENIED',
  );
  const foreign = files.createFolder('隔离', null, { type: 'project', id: other });
  expect(() => files.move(f.id, foreign.id, f.revision)).toThrow('PERMISSION_DENIED');
  const moved = files.move(f.id, child.id, f.revision);
  expect(moved.folderId).toBe(child.id);
  expect(() => files.rename(f.id, '新名字.txt', f.revision)).toThrow('CONFLICT');
  const renamed = files.rename(f.id, '新名字.txt', moved.revision);
  expect(renamed.version.name).toBe('资料.TXT');
  expect(
    files.list({ owner: { type: 'project', id: p }, folderId: child.id }).files.map((f) => f.id),
  ).toEqual([f.id]);
  expect(store.db.pragma('foreign_key_check')).toEqual([]);
});

test('P03-01 linked files in another scope folder remain visible at the receiving root without moving the shared file', async () => {
  const { files, put, project, store } = await fixture();
  const library = { type: 'library' } as const;
  const source = { type: 'project', id: project() } as const;
  const target = { type: 'project', id: project() } as const;
  const core = new CoreService(store);
  const created = core.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'sessions.create',
    payload: { mode: 'chat', title: '跨目录会话' },
  });
  if (!created.ok || !('entityId' in created.data)) throw Error('session fixture');
  const session = { type: 'session', id: created.data.entityId } as const;
  const f = await put('目录内原件');
  for (const owner of [source, target, session]) files.link(f.id, f.currentVersionId, owner);
  const libraryFolder = files.createFolder('库内目录', null, library);
  const sourceFolder = files.createFolder('来源项目目录', null, source);
  const moved = files.move(f.id, libraryFolder.id, f.revision);
  expect(files.list({ owner: library, folderId: libraryFolder.id }).files[0]?.folderId).toBe(
    libraryFolder.id,
  );
  for (const owner of [source, target, session]) {
    expect(files.list({ owner, folderId: null }).files.map((f) => f.id)).toEqual([f.id]);
    expect(files.get(f.id, { owner }).folderId).toBeNull();
    expect(() => files.list({ owner, folderId: libraryFolder.id })).toThrow('PERMISSION_DENIED');
  }
  const projectMoved = files.move(f.id, sourceFolder.id, moved.revision);
  expect(files.list({ owner: source, folderId: null }).files).toEqual([]);
  expect(files.list({ owner: source, folderId: sourceFolder.id }).files[0]?.folderId).toBe(
    sourceFolder.id,
  );
  for (const owner of [library, target, session]) {
    expect(files.list({ owner, folderId: null }).files.map((f) => f.id)).toEqual([f.id]);
    expect(files.get(f.id, { owner }).folderId).toBeNull();
  }
  expect(files.get(f.id).folderId).toBe(sourceFolder.id);
  expect(projectMoved.revision).toBe(moved.revision + 1);
  expect((await files.original(f.id, { owner: target })).bytes.toString()).toBe('目录内原件');
  store.db.prepare('UPDATE folders SET deleted_at=? WHERE id=?').run(store.now(), sourceFolder.id);
  expect(files.list({ owner: source, folderId: null }).files[0]?.folderId).toBeNull();
  expect(files.get(f.id, { owner: source }).folderId).toBeNull();
  expect(() => files.list({ owner: source, folderId: sourceFolder.id })).toThrow('NOT_FOUND');
  expect(files.get(f.id).folderId).toBe(sourceFolder.id);
  files.unlink([f.id], target);
  expect(files.list({ owner: target, folderId: null }).files).toEqual([]);
  expect(() => files.get(f.id, { owner: target })).toThrow('PERMISSION_DENIED');
});
test('P03-01 cancelling an exact historical parse version fences late output and leaves the current version queued for its own job', async () => {
  const { files, put, document, blobs } = await fixture();
  const first = await put('旧版原件'),
    job = files.jobs.claim('cancel-version')!;
  files.beginParse(job, first.version.id);
  const newer = await put('新版原件', '资料.TXT', { replaceId: first.id });
  expect(files.cancelParse(first.version.id)).toEqual([job.id]);
  expect(files.get(first.id, { versionId: first.version.id }).version.parseStatus).toBe(
    'cancelled',
  );
  expect(files.get(first.id).version.parseStatus).toBe('pending');
  await expect(
    files.completeParse(job, first.version.id, document('陈旧结果'), new AbortController().signal),
  ).rejects.toThrow('CANCELLED');
  expect(await blobs.readVersion(first.version.id)).toEqual(Buffer.from('旧版原件'));
  expect(await blobs.readVersion(newer.version.id)).toEqual(Buffer.from('新版原件'));
  expect(files.cancelParse(first.version.id)).toEqual([]);
  expect(files.queueParse(first.version.id)).toBe(job.id);
  expect(files.store.db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id)).toEqual({
    status: 'queued',
  });
  expect(() => files.cancelParse('0195abc0-0000-7000-8000-000000000099')).toThrow('NOT_FOUND');
});

test('P03-01 lease fencing prevents cancelled or stale parse completion, retry reuses the same job', async () => {
  const { files, put, document, blobs } = await fixture();
  const f = await put('保留原件'),
    job = files.jobs.claim('old-parser')!;
  files.beginParse(job, f.currentVersionId);
  expect(files.get(f.id).status).toBe('parsing');
  files.jobs.cancel(job.id);
  expect(files.get(f.id).version.parseStatus).toBe('cancelled');
  await expect(
    files.completeParse(
      job,
      f.currentVersionId,
      document('过期内容'),
      new AbortController().signal,
    ),
  ).rejects.toThrow('CANCELLED');
  expect(files.queueParse(f.currentVersionId)).toBe(job.id);
  const retry = files.jobs.claim('new-parser')!;
  expect(retry.lease_epoch).toBeGreaterThan(job.lease_epoch);
  await expect(
    files.completeParse(job, f.currentVersionId, document('旧租约'), new AbortController().signal),
  ).rejects.toThrow('CANCELLED');
  files.beginParse(retry, f.currentVersionId);
  await files.completeParse(
    retry,
    f.currentVersionId,
    document('真实读取'),
    new AbortController().signal,
  );
  expect(files.jobs.finish(retry, 'completed', f.currentVersionId)).toBe(true);
  expect(files.get(f.id).version.parseStatus).toBe('ready');
  expect(files.list({ query: '真实读取' }).files.map((f) => f.id)).toEqual([f.id]);
  expect((await blobs.readVersion(f.currentVersionId)).toString()).toBe('保留原件');
});
test('P03-01 old parse results cannot replace the current version index; failure retains download and retry', async () => {
  const { files, put, document, blobs } = await fixture();
  const first = await put('旧原件'),
    oldJob = files.jobs.claim('parser')!;
  files.beginParse(oldJob, first.currentVersionId);
  const second = await put('新原件', '资料.TXT', { replaceId: first.id });
  await files.completeParse(
    oldJob,
    first.currentVersionId,
    document('旧版检索'),
    new AbortController().signal,
  );
  files.jobs.finish(oldJob, 'completed');
  expect(files.get(first.id).version.id).toBe(second.currentVersionId);
  expect(files.list({ query: '旧版检索' }).files).toEqual([]);
  const job = files.jobs.claim('parser')!;
  files.beginParse(job, second.currentVersionId);
  files.failParse(job, second.currentVersionId, 'PARSE_FAILED', 'CORRUPT_FILE');
  files.jobs.finish(job, 'failed');
  expect(files.get(first.id).version.errorReason).toBe('CORRUPT_FILE');
  expect((await blobs.readVersion(second.currentVersionId)).toString()).toBe('新原件');
  expect(files.queueParse(second.currentVersionId)).toBe(job.id);
});
test('P03-01 unlink, reversible trash and permanent deletion have distinct effects and cannot be restored by a backup', async () => {
  const { files, put, project, document, store, blobs, directory } = await fixture();
  const f = await put('永久删除原件'),
    p = project();
  files.link(f.id, f.currentVersionId, { type: 'project', id: p });
  files.unlink([f.id], { type: 'project', id: p });
  expect(files.usage(f.id).links).toEqual([]);
  expect(await blobs.readVersion(f.currentVersionId)).toBeDefined();
  const job = files.jobs.claim('parser')!;
  files.beginParse(job, f.currentVersionId);
  await files.completeParse(
    job,
    f.currentVersionId,
    document('不可复活索引'),
    new AbortController().signal,
  );
  files.jobs.finish(job, 'completed');
  files.trash([f.id]);
  expect(files.list({}).files).toEqual([]);
  expect(files.list({ trash: true }).files[0]?.purgeAfter).toBeGreaterThan(store.now());
  expect(() => blobs.readVersion(f.currentVersionId)).toThrow('NOT_FOUND');
  files.restore([f.id]);
  expect(await blobs.readVersion(f.currentVersionId)).toBeDefined();
  expect(() => files.purge([f.id])).toThrow('CONFLICT');
  await blobs.backup(newId());
  files.trash([f.id]);
  files.purge([f.id]);
  expect(() => files.restore([f.id])).toThrow('NOT_FOUND');
  expect(files.list({ trash: true }).files).toEqual([]);
  expect(store.db.prepare('SELECT count(*) n FROM file_search_documents').get()).toEqual({ n: 0 });
  store.close();
  for (const suffix of ['', '-wal', '-shm'])
    await rm(join(directory, 'db/app.sqlite' + suffix), { force: true });
  const recovered = await openStore(directory);
  stores.push(recovered);
  const recoveredFiles = new FileRepository(recovered, new BlobStore(recovered));
  expect(recoveredFiles.list({ query: '不可复活索引', trash: true }).files).toEqual([]);
  expect(recovered.db.prepare('SELECT count(*) n FROM file_search_documents').get()).toEqual({
    n: 0,
  });
  expect(() => recoveredFiles.restore([f.id])).toThrow('NOT_FOUND');
  expect(recovered.db.pragma('foreign_key_check')).toEqual([]);
});
test('P03-01 cursor is bound to filters and hostile names do not alter SQL or expose paths', async () => {
  const { files, put } = await fixture();
  await put('甲', "引号'词.TXT");
  await put('乙', '中文.txt');
  const page = files.list({ limit: 1 });
  expect(page.files).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = files.list({ limit: 1, cursor: page.nextCursor });
  expect(next.files[0]?.id).not.toBe(page.files[0]?.id);
  expect(() => files.list({ limit: 1, cursor: page.nextCursor, query: '另一范围' })).toThrow(
    'VALIDATION_ERROR',
  );
  expect(files.list({ query: "' OR 1=1 --" }).files).toEqual([]);
  expect(JSON.stringify(files.list({}))).not.toContain('.test-data');
});
test('P03-01 GC collects only unreferenced bytes, preserves backup references and permits safe reimport', async () => {
  const { files, put, store, blobs, directory, document } = await fixture();
  const shared = await put('共享原件'),
    other = await put('共享原件');
  const row = store.db
    .prepare('SELECT relative_key,id FROM blobs WHERE sha256=?')
    .get(shared.version.sha256) as { relative_key: string; id: string };
  const job = files.jobs.claim('parser')!;
  files.beginParse(job, shared.currentVersionId);
  await files.completeParse(
    job,
    shared.currentVersionId,
    document('衍生结构'),
    new AbortController().signal,
  );
  files.jobs.finish(job, 'completed');
  files.trash([shared.id]);
  files.purge([shared.id]);
  await blobs.gc();
  expect(await blobs.readVersion(other.currentVersionId)).toBeDefined();
  files.trash([other.id]);
  files.purge([other.id]);
  expect(await blobs.gc()).toBeGreaterThan(0);
  await expect(readFile(join(directory, row.relative_key))).rejects.toThrow();
  const reimported = await put('共享原件');
  expect(reimported.id).not.toBe(shared.id);
  expect((await blobs.readVersion(reimported.currentVersionId)).toString()).toBe('共享原件');
  expect(
    store.db.prepare('SELECT reference_count n,state FROM blobs WHERE id=?').get(row.id),
  ).toEqual({ n: 1, state: 'ready' });
  const backup = await put('备份保留'),
    backupRow = store.db
      .prepare('SELECT relative_key FROM blobs WHERE sha256=?')
      .get(backup.version.sha256) as { relative_key: string };
  await blobs.backup(newId());
  files.trash([backup.id]);
  files.purge([backup.id]);
  await blobs.gc();
  expect((await readFile(join(directory, backupRow.relative_key))).toString()).toBe('备份保留');
  expect(store.db.pragma('foreign_key_check')).toEqual([]);
});
test('P03-01 original downloads verify stored size and hash instead of returning substituted bytes', async () => {
  const { files, put, store, blobs, directory } = await fixture();
  const f = await put('原件内容');
  const row = store.db
    .prepare('SELECT relative_key FROM blobs WHERE sha256=?')
    .get(f.version.sha256) as { relative_key: string };
  await writeFile(join(directory, row.relative_key), Buffer.from('被改内容'));
  await expect(blobs.readVersion(f.currentVersionId)).rejects.toThrow('DATABASE_RECOVERY_REQUIRED');
  expect(files.get(f.id).version.sha256).toBe(f.version.sha256);
});
test('P03-01 storage counts shared blobs once and clearing preview caches preserves parsed structure and backup retention', async () => {
  const { files, put, store, blobs, document } = await fixture();
  const first = await put('共享原件'),
    second = await put('共享原件');
  const doc = document('读取内容'),
    job = files.jobs.claim('storage-count')!;
  files.beginParse(job, first.currentVersionId);
  await files.completeParse(job, first.currentVersionId, doc, new AbortController().signal);
  files.jobs.finish(job, 'completed');
  const derivedSize = Buffer.byteLength(JSON.stringify(doc)),
    previewBytes = Buffer.from('合成预览缓存');
  const preview = await blobs.put(previewBytes);
  store.db
    .prepare("UPDATE file_versions SET preview_blob_id=?,preview_status='ready' WHERE id IN (?,?)")
    .run(preview.id, first.currentVersionId, second.currentVersionId);
  store.db.prepare('UPDATE blobs SET reference_count=reference_count+2 WHERE id=?').run(preview.id);
  expect(await files.storage()).toEqual({
    originalBytes: Buffer.byteLength('共享原件'),
    derivedBytes: derivedSize + previewBytes.length,
    backupRetainedBytes: 0,
    fileCount: 2,
    trashCount: 0,
  });
  await blobs.backup(newId());
  expect(() => files.deletePreviews([first.id, newId()])).toThrow('NOT_FOUND');
  expect(files.get(first.id).version.previewStatus).toBe('ready');
  files.deletePreviews([first.id, second.id]);
  expect(files.get(first.id).version.previewStatus).toBe('pending');
  expect(await files.parsed(first.id)).toEqual(doc);
  expect(await blobs.readVersion(second.currentVersionId)).toEqual(Buffer.from('共享原件'));
  expect(await files.storage()).toMatchObject({
    originalBytes: Buffer.byteLength('共享原件'),
    derivedBytes: derivedSize,
    backupRetainedBytes: previewBytes.length,
    fileCount: 2,
    trashCount: 0,
  });
  files.trash([first.id]);
  expect(await files.storage()).toMatchObject({ fileCount: 1, trashCount: 1 });
  files.purge([first.id]);
  await blobs.gc();
  expect(await files.storage()).toEqual({
    originalBytes: Buffer.byteLength('共享原件'),
    derivedBytes: 0,
    backupRetainedBytes: previewBytes.length + derivedSize,
    fileCount: 1,
    trashCount: 0,
  });
  expect(store.db.pragma('foreign_key_check')).toEqual([]);
});
test('P03-01 parsed structures require profile, owner and pinned-version membership and recheck after asynchronous reads', async () => {
  const { files, put, project, document } = await fixture();
  const file = await put('解析原件'),
    owner = { type: 'project', id: project() } as const;
  files.link(file.id, file.currentVersionId, owner);
  const job = files.jobs.claim('parsed-membership')!;
  files.beginParse(job, file.currentVersionId);
  await files.completeParse(
    job,
    file.currentVersionId,
    document('固定版本'),
    new AbortController().signal,
  );
  files.jobs.finish(job, 'completed');
  expect((await files.parsed(file.id, { owner })).blocks[0]?.text).toBe('固定版本');
  await expect(
    files.parsed(file.id, { owner: { type: 'project', id: project() } }),
  ).rejects.toThrow('PERMISSION_DENIED');
  const next = await put('替换原件', '资料.TXT', { replaceId: file.id });
  await expect(files.parsed(file.id, { owner, versionId: next.currentVersionId })).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  const reading = files.parsed(file.id, { owner, versionId: file.currentVersionId });
  files.unlink([file.id], owner);
  await expect(reading).rejects.toThrow('PERMISSION_DENIED');
});
