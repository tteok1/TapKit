import { test, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { BlobStore, FileRepository, openStore, newId } from '../../packages/storage/src';
import { ArtifactService } from '../../packages/core/src/artifact-service';
import { FileParser } from '../../packages/core/src/file-parser';
import { NativeSandboxExecutor } from '../../packages/tools/src/execution/native-executor';
import { previewOfficeFixtures } from '../fixtures/P03-preview-office.mjs';
import type {
  ExecutionCapabilities,
  HelperRequest,
  HelperEvent,
} from '../../packages/contracts/src';
const root = resolve('.'),
  evidence = resolve('docs/evidence/P03-02');
const available: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'available' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function observer(
  label: string,
  done?: (request: HelperRequest) => void,
  started?: (request: HelperRequest, event: HelperEvent) => void,
) {
  const native = new NativeSandboxExecutor(root, started);
  return {
    execute: async (request: HelperRequest, options?: { signal?: AbortSignal }) => {
      const result = await native.execute(request, options),
        first = result.events[0]!,
        last = result.events.at(-1)!;
      const workerStages = String(last.data.stdout ?? '')
        .split(/\r?\n/)
        .flatMap((line) => {
          try {
            const value = JSON.parse(line);
            return typeof value.stage === 'string' ? [value.stage.slice(0, 80)] : [];
          } catch {
            return [];
          }
        });
      await appendFile(
        join(evidence, 'native-preview-cases.jsonl'),
        JSON.stringify({
          case: label,
          runId: request.runId,
          operation: request.operation,
          appContainer: first.data.appContainer,
          identitySid: first.data.identitySid,
          appContainerSid: first.data.appContainerSid,
          networkCapabilities: first.data.networkCapabilities,
          job: first.data.job,
          helperExitCode: result.exitCode,
          status: last.data.status,
          payloadExitCode: last.data.exitCode,
          activeProcesses: last.data.activeProcesses,
          workerStages,
          stderr: String(last.data.stderr ?? '')
            .replaceAll(root, '<repo>')
            .replaceAll(process.env.USERPROFILE ?? '\0', '<user-profile>')
            .slice(0, 1500),
        }) + '\n',
      );
      expect(first.data.appContainer).toBe(true);
      expect(first.data.identitySid).toBe(first.data.appContainerSid);
      expect(first.data.networkCapabilities).toBe(0);
      expect(last.data.activeProcesses).toBe(0);
      if (done) {
        expect(last.data.status).toBe('exited');
        expect(last.data.exitCode).toBe(0);
        done(request);
      }
      return result;
    },
  };
}
test('P03-02 native preview converts six DOCX/PPTX samples through verified isolation and publishes fixed immutable caches', async () => {
  await mkdir(evidence, { recursive: true });
  // Match the longer independent standard-user kit path rather than validating
  // only the short checkout path. Office keeps the same timeout and confinement.
  const base = await mkdtemp(
      resolve('.test-data', 'P03-02 native samples ' + 'nested-kit-path-'.repeat(4)),
    ),
    input = join(base, 'input');
  await previewOfficeFixtures(input);
  let activeRenders = 0,
    peakRenders = 0;
  const store = await openStore(join(base, 'profile')),
    files = new FileRepository(store, new BlobStore(store)),
    artifacts = new ArtifactService(
      root,
      files,
      available,
      observer(
        'native-samples:render',
        () => {
          activeRenders--;
        },
        () => {
          activeRenders++;
          peakRenders = Math.max(peakRenders, activeRenders);
        },
      ),
    );
  const parser = new FileParser(root, files, available, {
    execute: (request, options) => observer('native-samples:parse').execute(request, options),
  });
  const samples: { name: string; fileId: string; versionId: string; previewSha256: string }[] = [];
  const prepared: {
    name: string;
    extension: string;
    bytes: Buffer;
    fileId: string;
    versionId: string;
  }[] = [];
  try {
    for (const extension of ['docx', 'pptx'])
      for (let i = 1; i <= 3; i++) {
        const name = (extension === 'docx' ? 'word-' : 'slides-') + i + '.' + extension,
          bytes = await readFile(join(input, name)),
          blob = await files.blobs.put(bytes);
        const file = files.importBlob({
            name,
            relativePath: name,
            blobId: blob.id,
            owner: { type: 'library' },
          }).file,
          job = files.jobs.claim('P03-02 native preview samples')!;
        expect(await parser.execute(job, new AbortController().signal)).toBe(file.version.id);
        expect(files.jobs.finish(job, 'completed', file.version.id)).toBe(true);
        prepared.push({ name, extension, bytes, fileId: file.id, versionId: file.version.id });
      }
    // Two real conversions overlap: occupied aliases must not consume a root or
    // prevent the second AppContainer from obtaining three different free drives.
    for (let offset = 0; offset < prepared.length; offset += 2)
      await Promise.all(
        prepared
          .slice(offset, offset + 2)
          .map(async ({ name, extension, bytes, fileId, versionId }) => {
            const access = { fileId, versionId },
              view = await artifacts.open({ ...access, retry: false }, '0');
            expect(view.status).toBe('ready');
            expect(view.asset).toBe('preview');
            const pdf = await artifacts.readAsset({ ...access, kind: 'preview' }),
              data = Buffer.from(pdf.base64, 'base64');
            expect(data.subarray(0, 5).toString()).toBe('%PDF-');
            expect(sha((await files.original(fileId, { versionId })).bytes)).toBe(sha(bytes));
            expect(sha(await readFile(join(input, name)))).toBe(sha(bytes));
            const cached = await artifacts.open({ ...access, retry: false }, '0');
            expect(cached.status).toBe('ready');
            if (extension === 'docx') {
              const doc = await artifacts.repository.document(access);
              for (const block of doc.blocks)
                expect(
                  (await artifacts.repository.selection({ ...access, locator: block.locator }))
                    .selectedText,
                ).toBe(block.text);
            }
            expect(sha(await files.blobs.readDerivedVersion(versionId, 'preview'))).toBe(sha(data));
            if (extension === 'pptx') expect(view.slides[0]?.notes).toContain('讲者备注');
            await writeFile(join(evidence, name + '.pdf'), data);
            samples.push({ name, ...access, previewSha256: sha(data) });
          }),
      );
    samples.sort((a, b) => a.name.localeCompare(b.name));
    expect(peakRenders).toBe(2);
    expect(activeRenders).toBe(0);
    expect(await readdir(artifacts.staging.base)).toEqual([]);
    await writeFile(
      join(evidence, 'native-preview-samples.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          source: 'real NativeSandboxExecutor/OfficeWorker',
          profile: relative(root, store.dataDir),
          peakConcurrentOfficeRenders: peakRenders,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    await artifacts.stop();
    await parser.staging.stop();
    store.close();
  }
}, 300000);
test('P03-02 native preview refuses late revoked scope after real Office finishes and retains the original', async () => {
  await mkdir(evidence, { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P03-02 native revocation ')),
    input = join(base, 'input');
  await previewOfficeFixtures(input);
  const store = await openStore(join(base, 'profile')),
    files = new FileRepository(store, new BlobStore(store));
  let artifacts: ArtifactService | undefined;
  try {
    const bytes = await readFile(join(input, 'word-1.docx')),
      blob = await files.blobs.put(bytes),
      projectId = newId(),
      now = store.now();
    store.db
      .prepare('INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)')
      .run(projectId, store.profileId, now, now, 'native scope');
    const owner = { type: 'project' as const, id: projectId },
      file = files.importBlob({
        name: 'scope.docx',
        relativePath: 'scope.docx',
        blobId: blob.id,
        owner,
      }).file,
      job = files.jobs.claim('P03-02 scope')!;
    const parser = new FileParser(root, files, available, {
      execute: (r, o) => observer('revocation:parse').execute(r, o),
    });
    await parser.execute(job, new AbortController().signal);
    files.jobs.finish(job, 'completed', file.version.id);
    artifacts = new ArtifactService(
      root,
      files,
      available,
      observer('revocation:render', () => {
        files.unlink([file.id], owner);
      }),
    );
    const access = { fileId: file.id, versionId: file.version.id, owner };
    await expect(artifacts.open({ ...access, retry: false }, '0')).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    expect(files.get(file.id).version.previewStatus).not.toBe('ready');
    expect(sha((await files.original(file.id)).bytes)).toBe(sha(bytes));
    await expect(artifacts.readAsset({ ...access, kind: 'preview' })).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    expect(await readdir(artifacts.staging.base)).toEqual([]);
  } finally {
    await artifacts?.stop();
    store.close();
  }
}, 150000);
test('P03-02 native preview cancels the last observer, drains its Job and retries from the same untouched original', async () => {
  await mkdir(evidence, { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P03-02 native cancellation ')),
    input = join(base, 'input');
  await previewOfficeFixtures(input);
  const store = await openStore(join(base, 'profile')),
    files = new FileRepository(store, new BlobStore(store));
  let artifacts: ArtifactService | undefined;
  try {
    const bytes = await readFile(join(input, 'slides-3.pptx')),
      blob = await files.blobs.put(bytes),
      file = files.importBlob({
        name: 'cancel.pptx',
        relativePath: 'cancel.pptx',
        blobId: blob.id,
        owner: { type: 'library' },
      }).file,
      job = files.jobs.claim('P03-02 native cancel')!;
    const parser = new FileParser(root, files, available, {
      execute: (r, o) => observer('cancel:parse').execute(r, o),
    });
    await parser.execute(job, new AbortController().signal);
    files.jobs.finish(job, 'completed', file.version.id);
    let aborted = false;
    artifacts = new ArtifactService(
      root,
      files,
      available,
      observer('cancel:render', undefined, () => {
        if (!aborted) {
          aborted = true;
          artifacts!.closeWindow('0');
        }
      }),
    );
    const access = { fileId: file.id, versionId: file.version.id },
      cancelled = await artifacts.open({ ...access, retry: false }, '0');
    expect(aborted).toBe(true);
    expect(cancelled).toMatchObject({ status: 'failed', errorCode: 'CANCELLED', asset: 'none' });
    expect(files.get(file.id).version.previewStatus).not.toBe('ready');
    expect(await readdir(artifacts.staging.base)).toEqual([]);
    expect((await artifacts.open({ ...access, retry: true }, '0')).status).toBe('ready');
    expect(sha((await files.original(file.id)).bytes)).toBe(sha(bytes));
  } finally {
    await artifacts?.stop();
    store.close();
  }
}, 150000);
