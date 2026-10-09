import { beforeAll, expect, test } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { RequestSchema, FileImportViewSchema, type Reply } from '../../packages/contracts/src';
import { FileSelections } from '../../packages/core/src/file-selections';
import { FileService } from '../../packages/core/src/file-service';
const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
let fixture: string;
beforeAll(async () => {
  await mkdir('.test-data', { recursive: true });
  const bundle = await mkdtemp(resolve('.test-data', 'P03-01 import crash bundle '));
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'tests/fixtures/P03-import-crash.vite.config.ts',
      '--outDir',
      bundle,
    ],
    { timeout: 15000, windowsHide: true },
  );
  fixture = join(bundle, 'import-crash.cjs');
});
function view(r: Reply) {
  if (!r.ok || !('import' in r.data)) throw new Error('Expected recovered import');
  return FileImportViewSchema.parse(r.data.import);
}
test('P03-01 killed importer recovers committed items without source grants or duplicate versions and reselects only the unfinished original', async () => {
  const base = await mkdtemp(resolve('.test-data', 'P03-01 import hard kill '));
  const sources = [join(base, '第一.txt'), join(base, '第二.txt')];
  await Promise.all(sources.map((path, i) => writeFile(path, '不可变原件 ' + i)));
  const hash = async (path: string) =>
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  const hashes = await Promise.all(sources.map(hash));
  const child = spawn(node, [fixture, base], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request;
  try {
    const message = await Promise.race([
      once(child, 'message').then(([message]) => message),
      exited.then(() => {
        throw new Error('Crash fixture exited before checkpoint');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Crash fixture checkpoint timeout')), 10000);
      }),
    ]);
    expect(message).toMatchObject({ event: 'first_committed_second_waiting' });
    request = RequestSchema.parse((message as { request: unknown }).request);
  } finally {
    if (timer) clearTimeout(timer);
    child.kill();
    await exited;
  }
  const store = await openStore(join(base, 'profile'));
  const files = new FileRepository(store, new BlobStore(store));
  const selections = new FileSelections();
  const service = new FileService(files, selections);
  const command = (name: string, payload: unknown) =>
    service.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      windowId: '1',
      command: name,
      payload,
    });
  try {
    expect(files.list({}).files).toHaveLength(1);
    const recovered = view(
      await command('files.importStatus', { importRequestId: request.requestId }),
    );
    expect(recovered.status).toBe('interrupted');
    expect(recovered.items[0]).toMatchObject({
      name: '第一.txt',
      status: 'imported',
      fileId: expect.any(String),
    });
    expect(recovered.items[1]).toMatchObject({
      name: '第二.txt',
      status: 'failed',
      errorCode: 'PERMISSION_DENIED',
      fileId: null,
    });
    expect(await command('files.importHistory', {})).toMatchObject({
      ok: true,
      data: { imports: [recovered] },
    });
    expect(view(await service.dispatch(request))).toEqual(recovered);
    expect(view(await service.dispatch(request))).toEqual(recovered);
    expect(await service.dispatch({ ...request, windowId: '2' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(
      await service.dispatch({
        ...request,
        payload: { ...(request.payload as object), duplicate: 'skip' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(files.list({}).files).toHaveLength(1);
    expect(files.versions(recovered.items[0]!.fileId!)).toHaveLength(1);
    expect(store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='file.parse'").get()).toEqual({
      n: 1,
    });
    const [selected] = await selections.select('1', [sources[1]!]);
    const retry = view(
      await command('files.import', {
        selectionTokens: [selected!.token],
        destination: { type: 'library' },
        duplicate: 'keep',
      }),
    );
    expect(retry.items[0]).toMatchObject({ name: '第二.txt', status: 'imported' });
    expect(files.list({}).files).toHaveLength(2);
    expect(await Promise.all(sources.map(hash))).toEqual(hashes);
    expect(await command('files.dismissImport', { importRequestId: newId() })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(
      await command('files.dismissImport', { importRequestId: request.requestId }),
    ).toMatchObject({ ok: true, data: { changedIds: [request.requestId] } });
    const another = new FileService(files, new FileSelections());
    expect(
      await another.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        windowId: '2',
        command: 'files.importHistory',
        payload: {},
      }),
    ).toMatchObject({ ok: true, data: { imports: [] } });
    expect(view(await another.dispatch(request))).toEqual(recovered);
    await another.stop();
    expect(files.list({}).files).toHaveLength(2);
  } finally {
    await service.stop();
    store.close();
  }
});
