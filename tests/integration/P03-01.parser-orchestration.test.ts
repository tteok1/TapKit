import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { BlobStore, FileRepository, openStore, type Store } from '../../packages/storage/src';
import { FileParser, type ParserExecutor } from '../../packages/core/src/file-parser';
import { unavailableExecution, type ExecutionCapabilities } from '../../packages/contracts/src';
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});
async function fixture(name = '原件.txt', bytes = Buffer.from('原件保留')) {
  await mkdir('.test-data', { recursive: true });
  const store = await openStore(
    await mkdtemp(resolve('.test-data', 'P03-01 parse orchestration ')),
  );
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    blob = await blobs.put(bytes, 'application/octet-stream');
  const file = files.importBlob({
    blobId: blob.id,
    name,
    relativePath: name,
    owner: { type: 'library' },
  }).file;
  const job = files.jobs.claim('orchestration')!;
  return { files, file, job, blobs };
}
const available: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
};
test('P03-01 failed local capability never invokes any executor and leaves immutable originals downloadable', async () => {
  const { files, file, job, blobs } = await fixture();
  let called = false;
  const executor: ParserExecutor = {
    execute: async () => {
      called = true;
      throw new Error('must not execute');
    },
  };
  const parser = new FileParser(
    resolve('.'),
    files,
    unavailableExecution('APPLICATION_CONTROL'),
    executor,
  );
  await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(
    'SANDBOX_UNAVAILABLE',
  );
  expect(called).toBe(false);
  expect(files.get(file.id).version).toMatchObject({
    parseStatus: 'failed',
    errorCode: 'SANDBOX_UNAVAILABLE',
    errorReason: 'SANDBOX_UNAVAILABLE',
  });
  expect((await blobs.readVersion(file.currentVersionId)).toString()).toBe('原件保留');
});
test('P03-01 T07 image audio and video originals stay unsupported without invoking a parser even when native capability is blocked', async () => {
  for (const name of ['图片.PNG', '音频.MP3', '视频.MP4', '矢量.svg']) {
    const bytes = Buffer.from('opaque synthetic media original ' + name);
    const { files, file, job, blobs } = await fixture(name, bytes);
    let called = false;
    const parser = new FileParser(
      resolve('.'),
      files,
      unavailableExecution('APPLICATION_CONTROL'),
      {
        execute: async () => {
          called = true;
          throw new Error('media must never execute');
        },
      },
    );
    await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(
      'FORMAT_UNSUPPORTED',
    );
    expect(called).toBe(false);
    expect(files.get(file.id).version).toMatchObject({
      parseStatus: 'unsupported',
      errorCode: 'FORMAT_UNSUPPORTED',
      errorReason: 'FORMAT_UNSUPPORTED',
      parserVersion: null,
    });
    expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
    expect(
      files.store.db
        .prepare('SELECT 1 FROM parsed_documents WHERE file_version_id=?')
        .get(file.currentVersionId),
    ).toBeUndefined();
    expect(files.jobs.finish(job, 'failed')).toBe(true);
  }
});
test('P03-01 a substituted trusted PDF asset is rejected before native execution and preserves the original', async () => {
  const bytes = Buffer.from('%PDF-1.7 fixture'),
    { files, file, job, blobs } = await fixture('原件.pdf', bytes);
  const root = await mkdtemp(resolve('.test-data', 'P03-01 asset substitution '));
  const dist = join(root, 'packages/retrieval/dist'),
    pdf = join(dist, 'pdf');
  await mkdir(pdf, { recursive: true });
  await writeFile(join(dist, 'parse.cjs'), '// synthetic trusted adapter, never executed');
  const expected = Buffer.from('fixed asset'),
    filesManifest = ['pdf.mjs', 'pdf.worker.mjs'].map((path) => ({
      path,
      sizeBytes: expected.length,
      sha256: createHash('sha256').update(expected).digest('hex'),
    }));
  await writeFile(
    join(pdf, 'assets.json'),
    JSON.stringify({ schemaVersion: 1, pdfjsVersion: '6.3.289', files: filesManifest }),
  );
  await writeFile(join(pdf, 'pdf.mjs'), Buffer.from('false asset'));
  await writeFile(join(pdf, 'pdf.worker.mjs'), expected);
  let called = false;
  const parser = new FileParser(root, files, available, {
    execute: async () => {
      called = true;
      throw new Error('must not execute');
    },
  });
  await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow('SOURCE_CHANGED');
  expect(called).toBe(false);
  expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
  expect(files.get(file.id).version.parseStatus).toBe('failed');
});
test('P03-01 request uses fixed Node adapter and limits and rejects a forged non-AppContainer finish', async () => {
  const { files, file, job } = await fixture();
  const executor: ParserExecutor = {
    execute: async (request) => {
      expect(request.operation).toBe('diagnostic.execute');
      expect(request.payload.executable).toMatch(/node\.exe$/);
      expect(request.payload.args.slice(0, 2)).toEqual([
        '--preserve-symlinks',
        '--preserve-symlinks-main',
      ]);
      expect(request.payload.args[2]).toMatch(/parse\.cjs$/);
      expect(request.payload.args.slice(3)).toEqual([
        request.payload.inputRoot,
        request.payload.workspace,
      ]);
      expect(request.payload.args).toHaveLength(5);
      expect(request.payload.timeoutMs).toBe(120000);
      expect(request.payload.terminal).toBe(false);
      expect(request.payload.processLimit).toBe(2);
      return {
        exitCode: 0,
        events: [
          { event: 'started', data: { appContainer: false } },
          { event: 'finished', data: { status: 'exited', exitCode: 0, activeProcesses: 0 } },
        ],
      };
    },
  };
  const parser = new FileParser(resolve('.'), files, available, executor);
  await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(
    'SANDBOX_UNAVAILABLE',
  );
  expect(files.get(file.id).version.parseStatus).toBe('failed');
  expect(files.list({ query: 'parsed output' }).files).toEqual([]);
});

test.each([
  { stdout: '', reason: 'SANDBOX_UNAVAILABLE' },
  {
    stdout: JSON.stringify({ stage: 'parser_failed', reason: 'CORRUPT_FILE' }),
    reason: 'CORRUPT_FILE',
  },
  {
    stdout: JSON.stringify({ stage: 'parser_failed', reason: 'MAGIC_MISMATCH' }),
    reason: 'MAGIC_MISMATCH',
  },
])(
  'P03-01 worker exit reports $reason without publishing or changing the original',
  async ({ stdout, reason }) => {
    const { files, file, job, blobs } = await fixture();
    const parser = new FileParser(resolve('.'), files, available, {
      execute: async () => ({
        exitCode: 0,
        events: [
          {
            event: 'started',
            data: {
              appContainer: true,
              networkCapabilities: 0,
              appContainerSid: 'synthetic-container',
              identitySid: 'synthetic-container',
              job: { killOnClose: true, breakaway: false },
            },
          },
          {
            event: 'finished',
            data: {
              status: 'exited',
              exitCode: 1,
              activeProcesses: 0,
              stdout,
              stderr: stdout ? '' : "EPERM: operation not permitted, lstat 'D:\\\\'",
            },
          },
        ],
      }),
    });
    await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(reason);
    expect(files.get(file.id).version).toMatchObject({
      parseStatus: 'failed',
      errorReason: reason,
    });
    expect(
      files.store.db
        .prepare('SELECT 1 FROM parsed_documents WHERE file_version_id=?')
        .get(file.currentVersionId),
    ).toBeUndefined();
    expect((await blobs.readVersion(file.currentVersionId)).toString()).toBe('原件保留');
  },
);
