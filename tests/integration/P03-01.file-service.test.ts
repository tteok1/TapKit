import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  BlobStore,
  FileRepository,
  openStore,
  newId,
  type Store,
} from '../../packages/storage/src';
import { FileSelections } from '../../packages/core/src/file-selections';
import { FileService } from '../../packages/core/src/file-service';
import { FileImportViewSchema, type Reply } from '../../packages/contracts/src';
const fixtures: { service: FileService; store: Store }[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    await f.service.stop();
    f.store.close();
  }
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P03-01 file service '));
  const store = await openStore(join(base, 'managed')),
    blobs = new BlobStore(store);
  const files = new FileRepository(store, blobs),
    selections = new FileSelections();
  const service = new FileService(files, selections);
  fixtures.push({ service, store });
  const request = (command: string, payload: unknown, extra = {}) => ({
    protocolVersion: 1 as const,
    requestId: newId(),
    windowId: '1',
    command,
    payload,
    ...extra,
  });
  const put = async (name = '中文.TXT', bytes = '保留原件') => {
    const path = join(base, name);
    await writeFile(path, bytes);
    return path;
  };
  const input = (
    tokens: string[],
    duplicate: 'keep' | 'skip' | 'replace' = 'keep',
    extra = {},
  ) => ({ selectionTokens: tokens, destination: { type: 'library' }, duplicate, ...extra });
  return { base, store, files, blobs, selections, service, request, put, input };
}
function view(reply: Reply) {
  if (!reply.ok || !('import' in reply.data)) throw new Error('Expected import result');
  return FileImportViewSchema.parse(reply.data.import);
}
test('P03-01 file service durably imports selected originals, queues parse separately and replays after service restart', async () => {
  const f = await fixture(),
    path = await f.put();
  const [selected] = await f.selections.select('1', [path]);
  const r = f.request('files.import', f.input([selected!.token]));
  const result = await f.service.dispatch(r),
    item = view(result).items[0]!;
  expect(item.status).toBe('imported');
  expect(f.files.get(item.fileId!).version.parseStatus).toBe('pending');
  expect(f.files.get(item.fileId!).status).toBe('imported');
  expect((await f.blobs.readVersion(item.versionId!)).toString()).toBe('保留原件');
  expect(await readFile(path, 'utf8')).toBe('保留原件');
  await f.service.stop();
  const restarted = new FileService(f.files, new FileSelections());
  expect(await restarted.dispatch(r)).toEqual(result);
  expect(f.files.versions(item.fileId!)).toHaveLength(1);
  expect(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='file.parse'").get()).toEqual({
    n: 1,
  });
  expect(
    view(
      await restarted.dispatch(f.request('files.importStatus', { importRequestId: r.requestId })),
    ),
  ).toEqual(view(result));
  await restarted.stop();
});
test('P03-01 file service refuses raw paths, forged grants, another window and inaccessible destinations before blob writes', async () => {
  const f = await fixture(),
    path = await f.put();
  const [selected] = await f.selections.select('1', [path]);
  for (const r of [
    f.request('files.import', { ...f.input([selected!.token]), path }),
    f.request('files.import', f.input([newId()])),
    f.request('files.import', f.input([selected!.token]), { windowId: '2' }),
    f.request(
      'files.import',
      f.input([selected!.token], 'keep', { destination: { type: 'project', id: newId() } }),
    ),
  ])
    expect((await f.service.dispatch(r)).ok).toBe(false);
  expect(f.store.db.prepare('SELECT count(*) n FROM blobs').get()).toEqual({ n: 0 });
  expect(f.files.list({}).files).toHaveLength(0);
  expect(
    view(await f.service.dispatch(f.request('files.import', f.input([selected!.token])))).items[0]
      ?.status,
  ).toBe('imported');
});
test('P03-01 partial file imports report changed sources individually and preserve successful originals', async () => {
  const f = await fixture(),
    first = await f.put('一.txt'),
    second = await f.put('二.txt');
  const selected = await f.selections.select('1', [first, second]);
  await writeFile(second, '源文件已经变更');
  const result = view(
    await f.service.dispatch(f.request('files.import', f.input(selected.map((s) => s.token)))),
  );
  expect(result.items.map((i) => i.status)).toEqual(['imported', 'failed']);
  expect(result.items[1]?.errorCode).toBe('CONFLICT');
  expect(f.files.list({}).files).toHaveLength(1);
  expect((await f.blobs.readVersion(result.items[0]!.versionId!)).toString()).toBe('保留原件');
  expect(await readFile(second, 'utf8')).toBe('源文件已经变更');
});
test('P03-01 keep, skip and explicit replacement preserve independent files and immutable versions', async () => {
  const f = await fixture(),
    path = await f.put('同名.txt');
  const run = async (duplicate: 'keep' | 'skip' | 'replace', fileId?: string) => {
    const [s] = await f.selections.select('1', [path]);
    return view(
      await f.service.dispatch(
        f.request(
          'files.import',
          f.input(
            [s!.token],
            duplicate,
            fileId ? { replacements: [{ token: s!.token, fileId }] } : {},
          ),
        ),
      ),
    ).items[0]!;
  };
  const first = await run('keep'),
    second = await run('keep'),
    skipped = await run('skip');
  expect(first.fileId).not.toBe(second.fileId);
  expect(skipped.status).toBe('skipped');
  expect([first.fileId, second.fileId]).toContain(skipped.fileId);
  await writeFile(path, '新版内容');
  const replaced = await run('replace', first.fileId!);
  expect(replaced.fileId).toBe(first.fileId);
  expect(replaced.versionId).not.toBe(first.versionId);
  expect(f.files.versions(first.fileId!)).toHaveLength(2);
  expect((await f.blobs.readVersion(first.versionId!)).toString()).toBe('保留原件');
  expect(f.files.versions(second.fileId!)).toHaveLength(1);
});
test('P03-01 file service creates the selected folder hierarchy atomically with each imported version', async () => {
  const f = await fixture(),
    root = join(f.base, '资料目录'),
    nested = join(root, '子目录');
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, '资料.md'), '# 内容');
  const selected = await f.selections.select('1', [root], true);
  const item = view(
    await f.service.dispatch(f.request('files.import', f.input(selected.map((s) => s.token)))),
  ).items[0]!;
  const folders = f.files.folders({ type: 'library' }),
    rootFolder = folders.find((d) => d.name === '资料目录')!,
    child = folders.find((d) => d.name === '子目录')!;
  expect(child.parentId).toBe(rootFolder.id);
  expect(f.files.get(item.fileId!)).toMatchObject({
    folderId: child.id,
    relativePath: '资料目录/子目录/资料.md',
  });
});
test('P03-01 cancellation after staging does not publish a file and another window cannot cancel the import', async () => {
  const f = await fixture(),
    [selected] = await f.selections.select('1', [await f.put()]);
  let release!: () => void, entered!: () => void;
  const staged = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const put = f.blobs.put.bind(f.blobs);
  vi.spyOn(f.blobs, 'put').mockImplementation(async (...args) => {
    entered();
    await hold;
    return put(...args);
  });
  const r = f.request('files.import', f.input([selected!.token])),
    pending = f.service.dispatch(r);
  await staged;
  expect(
    await f.service.dispatch(
      f.request('files.cancelImport', { importRequestId: r.requestId }, { windowId: '2' }),
    ),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  await f.service.dispatch(f.request('files.cancelImport', { importRequestId: r.requestId }));
  release();
  expect(view(await pending)).toMatchObject({
    status: 'cancelled',
    items: [{ status: 'cancelled', errorCode: 'CANCELLED', fileId: null }],
  });
  expect(f.files.list({}).files).toHaveLength(0);
  expect(f.store.db.prepare('SELECT count(*) n FROM jobs').get()).toEqual({ n: 0 });
});
test('P03-01 T08 per-item cancellation fences the staged file, skips a waiting file, preserves completed items and retries only a reselected original', async () => {
  const f = await fixture();
  const paths = await Promise.all(
    ['完成.txt', '取消读取.txt', '取消等待.txt', '继续.txt'].map((name) => f.put(name, name)),
  );
  const selected = await f.selections.select('1', paths);
  let entered!: () => void,
    release!: () => void,
    calls = 0;
  const staged = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const put = f.blobs.put.bind(f.blobs);
  vi.spyOn(f.blobs, 'put').mockImplementation(async (...args) => {
    if (++calls === 2) {
      entered();
      await hold;
    }
    return put(...args);
  });
  const request = f.request('files.import', f.input(selected.map((v) => v.token))),
    pending = f.service.dispatch(request);
  await staged;
  const cancel = (selectionToken: string, extra = {}) =>
    f.service.dispatch(
      f.request(
        'files.cancelImport',
        { importRequestId: request.requestId, selectionToken },
        extra,
      ),
    );
  expect(await cancel(selected[1]!.token, { windowId: '2' })).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' },
  });
  expect(await cancel(newId())).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  expect(view(await cancel(selected[0]!.token)).items[0]!.status).toBe('imported');
  await cancel(selected[1]!.token);
  await cancel(selected[2]!.token);
  release();
  const reply = await pending,
    result = view(reply);
  expect(result.status).toBe('completed');
  expect(result.items.map((v) => v.status)).toEqual([
    'imported',
    'cancelled',
    'cancelled',
    'imported',
  ]);
  expect(result.items[1]).toMatchObject({ errorCode: 'CANCELLED', fileId: null, versionId: null });
  expect(result.items[2]).toMatchObject({ readBytes: 0, fileId: null, versionId: null });
  expect(f.files.list({}).files).toHaveLength(2);
  expect(await f.service.dispatch(request)).toEqual(reply);
  expect(calls).toBe(3);
  const restarted = new FileService(f.files, new FileSelections());
  expect(
    view(
      await restarted.dispatch(
        f.request('files.importStatus', { importRequestId: request.requestId }),
      ),
    ),
  ).toEqual(result);
  await restarted.stop();
  const [retry] = await f.selections.select('1', [paths[1]!]);
  const retried = view(await f.service.dispatch(f.request('files.import', f.input([retry!.token]))))
    .items[0]!;
  expect(retried.status).toBe('imported');
  expect(f.files.versions(retried.fileId!)).toHaveLength(1);
  for (const path of paths) expect(await readFile(path, 'utf8')).toBe(path.split(/[\\/]/).at(-1));
});

test('P03-01 injected disk-full failure retains the source and does not report an imported version', async () => {
  const f = await fixture(),
    path = await f.put(),
    [selected] = await f.selections.select('1', [path]);
  vi.spyOn(f.blobs, 'put').mockRejectedValue(
    Object.assign(new Error('synthetic disk-full'), { code: 'ENOSPC' }),
  );
  const result = view(
    await f.service.dispatch(f.request('files.import', f.input([selected!.token]))),
  );
  expect(result.items[0]).toMatchObject({ status: 'failed', errorCode: 'DISK_FULL', fileId: null });
  expect(await readFile(path, 'utf8')).toBe('保留原件');
  expect(f.files.list({}).files).toHaveLength(0);
});
test('P03-01 file mutations require revision and replay without extra changes', async () => {
  const f = await fixture(),
    [selected] = await f.selections.select('1', [await f.put()]);
  const item = view(await f.service.dispatch(f.request('files.import', f.input([selected!.token]))))
      .items[0]!,
    file = f.files.get(item.fileId!);
  expect(
    await f.service.dispatch(f.request('files.rename', { fileId: file.id, name: '新名字.txt' })),
  ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  const r = f.request(
    'files.rename',
    { fileId: file.id, name: '新名字.txt' },
    { expectedRevision: file.revision },
  );
  const result = await f.service.dispatch(r);
  expect(result.ok).toBe(true);
  expect(await f.service.dispatch(r)).toEqual(result);
  expect(f.files.get(file.id).revision).toBe(file.revision + 1);
});
test('P03-01 concurrent delivery of one import request shares the operation and rejects changed arguments', async () => {
  const f = await fixture(),
    [selected] = await f.selections.select('1', [await f.put()]);
  let release!: () => void, entered!: () => void;
  const staged = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const put = f.blobs.put.bind(f.blobs);
  const spy = vi.spyOn(f.blobs, 'put').mockImplementation(async (...args) => {
    entered();
    await hold;
    return put(...args);
  });
  const r = f.request('files.import', f.input([selected!.token])),
    first = f.service.dispatch(r);
  await staged;
  const second = f.service.dispatch(r);
  expect(
    await f.service.dispatch({ ...r, payload: f.input([selected!.token], 'skip') }),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  release();
  expect(await second).toEqual(await first);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(f.files.list({}).files).toHaveLength(1);
});
test('P03-01 replacing a selected file refuses a concurrent revision change after staging', async () => {
  const f = await fixture(),
    path = await f.put(),
    [first] = await f.selections.select('1', [path]);
  const original = view(
    await f.service.dispatch(f.request('files.import', f.input([first!.token]))),
  ).items[0]!;
  await writeFile(path, '替换内容');
  const [selected] = await f.selections.select('1', [path]);
  const put = f.blobs.put.bind(f.blobs);
  vi.spyOn(f.blobs, 'put').mockImplementation(async (...args) => {
    const blob = await put(...args),
      file = f.files.get(original.fileId!);
    f.files.rename(file.id, '并发更名.txt', file.revision);
    return blob;
  });
  const result = view(
    await f.service.dispatch(
      f.request(
        'files.import',
        f.input([selected!.token], 'replace', {
          replacements: [{ token: selected!.token, fileId: original.fileId }],
        }),
      ),
    ),
  );
  expect(result.items[0]).toMatchObject({ status: 'failed', errorCode: 'CONFLICT', fileId: null });
  expect(f.files.versions(original.fileId!)).toHaveLength(1);
  expect((await f.blobs.readVersion(original.versionId!)).toString()).toBe('保留原件');
  expect(await readFile(path, 'utf8')).toBe('替换内容');
});
test('P03-01 dismissed selections release only their own window quota and report actual disk space before import', async () => {
  const f = await fixture(),
    [selected] = await f.selections.select('1', [await f.put()]);
  const info = await f.service.dispatch(f.request('files.importInfo', {}));
  expect(info).toMatchObject({
    ok: true,
    data: {
      importInfo: {
        limits: { maxBatchFiles: 20, maxFileBytes: 104857600 },
        availableBytes: expect.any(Number),
      },
    },
  });
  expect(JSON.stringify(info)).not.toContain(f.base);
  expect(
    await f.service.dispatch(
      f.request(
        'files.releaseSelection',
        { selectionTokens: [selected!.token] },
        { windowId: '2' },
      ),
    ),
  ).toMatchObject({ ok: true, data: { changedIds: [] } });
  expect(f.selections.inspect('1', [selected!.token])).toHaveLength(1);
  expect(
    await f.service.dispatch(
      f.request('files.releaseSelection', { selectionTokens: [selected!.token] }),
    ),
  ).toMatchObject({ ok: true, data: { changedIds: [selected!.token] } });
  expect(() => f.selections.inspect('1', [selected!.token])).toThrow('PERMISSION_DENIED');
  expect(await f.selections.select('1', [await f.put('下次.txt')])).toHaveLength(1);
});
test('P03-01 date filters use current file timestamps and trash detail readers retain versions without reviving originals', async () => {
  const f = await fixture(),
    [selected] = await f.selections.select('1', [await f.put()]);
  const imported = view(
      await f.service.dispatch(f.request('files.import', f.input([selected!.token]))),
    ).items[0]!,
    file = f.files.get(imported.fileId!);
  const list = await f.service.dispatch(
    f.request('files.list', { updatedAfter: file.updatedAt, updatedBefore: file.updatedAt }),
  );
  expect(list.ok && 'files' in list.data ? list.data.files.length : -1).toBe(1);
  const empty = await f.service.dispatch(
    f.request('files.list', { updatedAfter: file.updatedAt + 1 }),
  );
  expect(empty.ok && 'files' in empty.data ? empty.data.files.length : -1).toBe(0);
  expect(
    await f.service.dispatch(
      f.request('files.list', { updatedAfter: file.updatedAt + 1, updatedBefore: file.updatedAt }),
    ),
  ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  f.files.trash([file.id]);
  expect(
    await f.service.dispatch(f.request('files.versions', { fileId: file.id, trash: true })),
  ).toMatchObject({ ok: true, data: { versions: [{ id: imported.versionId }] } });
  expect(
    await f.service.dispatch(f.request('files.usage', { fileId: file.id, trash: true })),
  ).toMatchObject({ ok: true, data: { usage: { versionCount: 1 } } });
  expect(
    await f.service.dispatch(
      f.request('files.impact', { fileIds: [file.id], owner: { type: 'library' } }),
    ),
  ).toMatchObject({
    ok: true,
    data: { impact: [{ id: file.id, name: file.name, deletedAt: expect.any(Number) }] },
  });
  expect(await f.service.dispatch(f.request('files.get', { fileId: file.id }))).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' },
  });
});

test('P03-01 deletion impact is complete and owner fenced before confirming a batch', async () => {
  const f = await fixture();
  const selection = await f.selections.select('1', [
    await f.put('第一.txt'),
    await f.put('第二.txt'),
  ]);
  const imported = view(
    await f.service.dispatch(f.request('files.import', f.input(selection.map((s) => s.token)))),
  );
  const ids = imported.items.map((i) => i.fileId!);
  const result = await f.service.dispatch(
    f.request('files.impact', { fileIds: ids, owner: { type: 'library' } }),
  );
  expect(result).toMatchObject({
    ok: true,
    data: {
      impact: [
        { id: ids[0], owners: [{ type: 'library' }] },
        { id: ids[1], owners: [{ type: 'library' }] },
      ],
    },
  });
  for (const payload of [
    { fileIds: [...ids, newId()] },
    { fileIds: ids, owner: { type: 'session', id: newId() } },
    { fileIds: ids, rawPath: f.base },
  ]) {
    const failed = await f.service.dispatch(f.request('files.impact', payload));
    expect(failed.ok).toBe(false);
    expect('data' in failed).toBe(false);
  }
  expect(f.files.list({}).files).toHaveLength(2);
});
