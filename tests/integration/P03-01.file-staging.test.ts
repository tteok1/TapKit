import { afterEach, beforeAll, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import {
  openStore,
  BlobStore,
  FileRepository,
  newId,
  type Store,
} from '../../packages/storage/src';
import { FileStaging } from '../../packages/core/src/file-staging';
const stores: Store[] = [];
const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
let crashFixture: string;
beforeAll(async () => {
  await mkdir('.test-data', { recursive: true });
  const bundle = await mkdtemp(resolve('.test-data', 'P03-01 staging crash bundle '));
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
    { windowsHide: true, timeout: 15000 },
  );
  crashFixture = join(bundle, 'import-crash.cjs');
});
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});
async function fixture() {
  const base = await mkdtemp(resolve('.test-data', 'P03-01 staging safe cleanup '));
  const store = await openStore(join(base, 'profile'));
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  const blob = await blobs.put(Buffer.from('原件永远保留'));
  const file = files.importBlob({
    blobId: blob.id,
    name: '原件.txt',
    relativePath: '原件.txt',
    owner: { type: 'library' },
  }).file;
  const job = files.jobs.claim('synthetic-current-lease')!;
  const staging = new FileStaging(store),
    root = join(store.dataDir, 'tmp/ingest');
  await mkdir(root, { recursive: true });
  const directory = join(root, newId());
  await mkdir(directory);
  await staging.mark(directory, job, file.currentVersionId);
  return { base, store, blobs, files, file, job, staging, root, directory };
}
test('P03-01 actual parser-process termination leaves marked staging; current lease is retained and reclaimed old staging is removed without deleting originals', async () => {
  const base = await mkdtemp(resolve('.test-data', 'P03-01 parser hard kill '));
  await writeFile(join(base, '第一.txt'), '第一原件');
  await writeFile(join(base, '第二.txt'), '第二原件');
  const child = spawn(node, [crashFixture, base, 'parser'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let jobId: string;
  try {
    const message = await Promise.race([
      once(child, 'message').then(([value]) => value),
      exited.then(() => {
        throw new Error('Parser fixture exited before staging');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Parser fixture checkpoint timeout')), 10000);
      }),
    ]);
    expect(message).toEqual({ event: 'parser_staged', jobId: expect.any(String) });
    jobId = (message as { jobId: string }).jobId;
  } finally {
    if (timer) clearTimeout(timer);
    child.kill();
    await exited;
  }
  const store = await openStore(join(base, 'profile'));
  stores.push(store);
  const files = new FileRepository(store, new BlobStore(store)),
    staging = new FileStaging(store);
  const root = join(store.dataDir, 'tmp/ingest');
  expect(await readdir(root)).toHaveLength(1);
  expect(await staging.sweep()).toMatchObject({ removed: 0, retained: 1 });
  store.db.prepare('UPDATE jobs SET lease_expires_at=0 WHERE id=?').run(jobId);
  expect(await staging.sweep()).toMatchObject({ removed: 0, retained: 1 });
  const reclaimed = files.jobs.claim('synthetic-recovered-worker')!;
  expect(reclaimed).toMatchObject({ id: jobId, lease_epoch: 2 });
  expect(await staging.sweep()).toEqual({ removed: 1, retained: 0, unrecognized: 0 });
  expect(await readdir(root)).toHaveLength(0);
  const originals = files.list({}).files;
  expect(originals).toHaveLength(2);
  expect(
    (await files.original(originals.find((f) => f.name === '第一.txt')!.id)).bytes.toString(),
  ).toBe('第一原件');
  expect(await readFile(join(base, '第一.txt'), 'utf8')).toBe('第一原件');
  expect(await readFile(join(base, '第二.txt'), 'utf8')).toBe('第二原件');
});
test('P03-01 concurrent sweeps retain current staging then clear an obsolete regular tree while preserving managed blob bytes', async () => {
  const f = await fixture();
  await mkdir(join(f.directory, 'input'));
  await mkdir(join(f.directory, 'workspace'));
  await writeFile(join(f.directory, 'workspace/parsed.json'), 'synthetic derived output');
  const a = f.staging.sweep(),
    b = f.staging.sweep();
  expect(a).toBe(b);
  expect(await a).toMatchObject({ removed: 0, retained: 1 });
  expect(f.files.jobs.finish(f.job, 'failed')).toBe(true);
  expect(await f.staging.sweep()).toMatchObject({ removed: 1 });
  expect(await readdir(f.root)).toHaveLength(0);
  expect((await f.blobs.readVersion(f.file.currentVersionId)).toString()).toBe('原件永远保留');
});
test('P03-01 cleanup refuses missing, malformed, foreign-profile and wrong-job markers plus excessive nesting', async () => {
  const f = await fixture();
  f.files.jobs.finish(f.job, 'failed');
  const marker = JSON.parse(await readFile(join(f.directory, '.tapkit-ingest.json'), 'utf8'));
  for (const change of [
    undefined,
    'not-json',
    { ...marker, profileId: newId() },
    { ...marker, fileVersionId: newId() },
  ]) {
    const id = newId(),
      path = join(f.root, id);
    await mkdir(path);
    if (change !== undefined)
      await writeFile(
        join(path, '.tapkit-ingest.json'),
        typeof change === 'string' ? change : JSON.stringify({ ...change, directoryId: id }),
      );
  }
  let nested = f.directory;
  for (let i = 0; i < 17; i++) {
    nested = join(nested, 'nested');
    await mkdir(nested);
  }
  await writeFile(join(nested, 'sentinel'), '保留未知内容');
  expect(await f.staging.sweep()).toEqual({ removed: 0, retained: 5, unrecognized: 0 });
  expect(await readFile(join(nested, 'sentinel'), 'utf8')).toBe('保留未知内容');
  expect(await readdir(f.root)).toHaveLength(5);
});
test('P03-01 nested and root junctions never make recursive cleanup reach outside private staging', async () => {
  const f = await fixture();
  f.files.jobs.finish(f.job, 'failed');
  const outside = join(f.base, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'sentinel.txt'), '外部合成原件');
  await symlink(
    outside,
    join(f.directory, 'workspace'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(await f.staging.sweep()).toMatchObject({ removed: 0, retained: 1 });
  expect(await readFile(join(outside, 'sentinel.txt'), 'utf8')).toBe('外部合成原件');
  const other = await openStore(join(f.base, 'other-profile'));
  stores.push(other);
  await mkdir(join(other.dataDir, 'tmp'), { recursive: true });
  await symlink(
    outside,
    join(other.dataDir, 'tmp/ingest'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(await new FileStaging(other).sweep()).toEqual({
    removed: 0,
    retained: 0,
    unrecognized: 1,
  });
  expect(await readFile(join(outside, 'sentinel.txt'), 'utf8')).toBe('外部合成原件');
  await expect(f.staging.mark(outside, f.job, f.file.currentVersionId)).rejects.toThrow(
    'Invalid staging child',
  );
});

test('P03-01 stopping staging maintenance waits for its scan and prevents work against a closed store', async () => {
  const f = await fixture();
  f.files.jobs.finish(f.job, 'failed');
  const scan = f.staging.sweep();
  await f.staging.stop();
  expect(await scan).toMatchObject({ removed: 0, retained: 1 });
  expect(await readdir(f.root)).toHaveLength(1);
  expect((await f.blobs.readVersion(f.file.currentVersionId)).toString()).toBe('原件永远保留');
  f.store.close();
  stores.splice(stores.indexOf(f.store), 1);
  expect(await f.staging.sweep()).toEqual({ removed: 0, retained: 0, unrecognized: 0 });
});
