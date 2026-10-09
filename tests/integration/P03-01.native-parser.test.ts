import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FileParser, type ParserExecutor } from '../../packages/core/src/file-parser';
import {
  BlobStore,
  FileRepository,
  openStore,
  type Store,
  type Job,
} from '../../packages/storage/src';
import { NativeSandboxExecutor } from '../../packages/tools/src/execution/native-executor';
import { helperPath } from '../../packages/tools/src/execution';
import type { ExecutionCapabilities } from '../../packages/contracts/src';
import { officeZip, docxFixture, xlsxFixture, pptxFixture } from '../fixtures/P03-office';
import { pdfFixture } from '../fixtures/P03-pdf';
import { startNativeHelper } from './native-helper';

const root = resolve('.'),
  node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
const stores: Store[] = [];
const available: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
};
beforeAll(async () => {
  await mkdir(join(root, 'docs/evidence/P03-01'), { recursive: true });
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'packages/retrieval/vite.worker.config.ts',
    ],
    { windowsHide: true, timeout: 15000 },
  );
});
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});
async function fixture() {
  vi.useRealTimers();
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P03-01 native parser 中文 ')));
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  async function put(name: string, bytes: Buffer) {
    const blob = await blobs.put(bytes, 'application/octet-stream');
    return files.importBlob({
      blobId: blob.id,
      name,
      relativePath: name,
      owner: { type: 'library' },
    }).file;
  }
  return { store, blobs, files, put };
}
function observing(native: NativeSandboxExecutor, label: string): ParserExecutor {
  return {
    async execute(request, options) {
      const result = await native.execute(request, options);
      const first = result.events[0]!,
        last = result.events.at(-1)!;
      const safeOutput = (value: unknown) =>
        typeof value === 'string'
          ? value
              .replaceAll(root, '<synthetic-repo>')
              .replaceAll(root.replaceAll('\\', '/'), '<synthetic-repo>')
              .slice(0, 8000)
          : undefined;
      const diagnostics =
        last.data.exitCode === 0
          ? undefined
          : {
              stdout: safeOutput(last.data.stdout),
              stderr: safeOutput(last.data.stderr),
            };
      await appendFile(
        join(root, 'docs/evidence/P03-01/native-parser-cases.jsonl'),
        JSON.stringify({
          case: label,
          runId: request.runId,
          leaseEpoch: request.leaseEpoch,
          appContainer: first.data.appContainer,
          identitySid: first.data.identitySid,
          appContainerSid: first.data.appContainerSid,
          networkCapabilities: first.data.networkCapabilities,
          job: first.data.job,
          helperExitCode: result.exitCode,
          status: last.data.status,
          payloadExitCode: last.data.exitCode,
          activeProcesses: last.data.activeProcesses,
          ...(diagnostics ? { diagnostics } : {}),
        }) + '\n',
      );
      expect(first.data.appContainer).toBe(true);
      if (diagnostics)
        console.error('P03_SYNTHETIC_WORKER_DIAGNOSTIC', JSON.stringify(diagnostics));
      expect(first.data.identitySid).toBe(first.data.appContainerSid);
      expect(first.data.networkCapabilities).toBe(0);
      expect(last.event).toBe('finished');
      expect(last.data.activeProcesses).toBe(0);
      return result;
    },
  };
}
function claim(files: FileRepository): Job {
  const job = files.jobs.claim('native-parser-test');
  expect(job?.kind).toBe('file.parse');
  return job!;
}
async function cleaned(store: Store) {
  expect(await readdir(join(store.dataDir, 'tmp/ingest'))).toEqual([]);
}
// These cases actually start the helper. Run them on the authorised Windows CI test host;
// an unavailable/blocked local helper must fail, never skip or fall back to a host process.
test('P03-01 native parser publishes text and Office structure from a read-only AppContainer input', async () => {
  const { store, files, blobs, put } = await fixture();
  const parser = new FileParser(
    root,
    files,
    available,
    observing(new NativeSandboxExecutor(root), 'formats'),
  );
  const samples = [
    ['原件.txt', Buffer.from('原件文本唯一检索'), '原件文本唯一检索'],
    ['原件.DOCX', await officeZip(docxFixture()), '中文标题'],
    ['原件.XLSX', await officeZip(xlsxFixture()), '富文本中文'],
    ['原件.PPTX', await officeZip(pptxFixture()), '实际第一张'],
    ['原件.PDF', pdfFixture('Native PDF marker'), 'Native PDF marker'],
  ] as const;
  for (const [name, bytes, query] of samples) {
    const file = await put(name, bytes),
      job = claim(files);
    expect(await parser.execute(job, new AbortController().signal)).toBe(file.currentVersionId);
    expect(files.jobs.finish(job, 'completed', file.currentVersionId)).toBe(true);
    expect(files.get(file.id).version.parseStatus).toBe('ready');
    expect(files.list({ query }).files.map((f) => f.id)).toContain(file.id);
    expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
    await cleaned(store);
  }
}, 30000);
test('P03-01 native parser rejects corrupt and hostile Office packages while originals remain downloadable', async () => {
  const { store, files, blobs, put } = await fixture();
  const parser = new FileParser(
    root,
    files,
    available,
    observing(new NativeSandboxExecutor(root), 'rejection'),
  );
  for (const [name, bytes, reason] of [
    ['损坏.docx', Buffer.from('corrupt'), 'MAGIC_MISMATCH'],
    ['加密.pdf', pdfFixture('Encrypted original', 1, false, 'public-test-pass'), 'ENCRYPTED_FILE'],
    [
      '实体.docx',
      await officeZip({
        ...docxFixture(),
        'unused.xml': '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///private">]><root>&x;</root>',
      }),
      'EXTERNAL_ENTITY',
    ],
  ] as const) {
    const file = await put(name, bytes),
      job = claim(files);
    await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(reason);
    expect(files.jobs.finish(job, 'failed')).toBe(true);
    expect(files.get(file.id).version).toMatchObject({
      parseStatus: 'failed',
      errorReason: reason,
    });
    expect(
      store.db
        .prepare('SELECT 1 FROM parsed_documents WHERE file_version_id=?')
        .get(file.currentVersionId),
    ).toBeUndefined();
    expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
    await cleaned(store);
  }
}, 30000);
test('P03-01 native parser cancellation and helper kill preserve the version and allow one fenced retry', async () => {
  const { store, files, blobs, put } = await fixture();
  const bytes = Buffer.from('取消和重试原件\n'.repeat(5000)),
    file = await put('取消.txt', bytes);
  const job = claim(files),
    controller = new AbortController();
  const native = new NativeSandboxExecutor(root, () => {
    files.jobs.cancel(job.id);
    controller.abort();
  });
  await expect(
    new FileParser(root, files, available, observing(native, 'cancel')).execute(
      job,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(files.get(file.id).version.parseStatus).toBe('cancelled');
  expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
  await cleaned(store);
  expect(files.queueParse(file.currentVersionId)).toBe(job.id);
  const retry = claim(files);
  expect(retry.lease_epoch).toBeGreaterThan(job.lease_epoch);
  const killer: ParserExecutor = {
    async execute(request) {
      const helper = startNativeHelper(helperPath(root), request);
      await helper.started;
      helper.child.kill();
      const result = await helper.closed;
      await appendFile(
        join(root, 'docs/evidence/P03-01/native-parser-cases.jsonl'),
        JSON.stringify({
          case: 'helper-hard-kill',
          runId: request.runId,
          helperExitCode: result.code,
          helperSignal: result.signal,
          receivedEvents: helper.events.map((e) => e.event),
        }) + '\n',
      );
      return { exitCode: result.code ?? -1, events: helper.events };
    },
  };
  await expect(
    new FileParser(root, files, available, killer).execute(retry, new AbortController().signal),
  ).rejects.toThrow();
  expect(files.jobs.finish(retry, 'failed')).toBe(true);
  expect(files.get(file.id).version.parseStatus).toBe('failed');
  expect(
    store.db
      .prepare('SELECT 1 FROM parsed_documents WHERE file_version_id=?')
      .get(file.currentVersionId),
  ).toBeUndefined();
  expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
  await cleaned(store);
  expect(files.queueParse(file.currentVersionId)).toBe(job.id);
  const final = claim(files),
    parser = new FileParser(
      root,
      files,
      available,
      observing(new NativeSandboxExecutor(root), 'retry-after-kill'),
    );
  expect(await parser.execute(final, new AbortController().signal)).toBe(file.currentVersionId);
  expect(files.jobs.finish(final, 'completed', file.currentVersionId)).toBe(true);
  expect(files.get(file.id).version.parseStatus).toBe('ready');
  expect(
    store.db
      .prepare('SELECT count(*) n FROM parsed_documents WHERE file_version_id=?')
      .get(file.currentVersionId),
  ).toEqual({ n: 1 });
  expect(await blobs.readVersion(file.currentVersionId)).toEqual(bytes);
  await cleaned(store);
}, 30000);
