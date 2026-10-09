import { join } from 'node:path';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { FileService } from '../../packages/core/src/file-service';
import { FileSelections } from '../../packages/core/src/file-selections';
import { FileParser } from '../../packages/core/src/file-parser';
import { unavailableExecution } from '../../packages/contracts/src';

// Synthetic crash fixture: real importer/SQLite; parser mode pauses before any helper launch.
let stage = 'open';
async function run() {
  const base = process.argv[2]!;
  const store = await openStore(join(base, 'profile'));
  const files = new FileRepository(store, new BlobStore(store));
  const selections = new FileSelections();
  const service = new FileService(files, selections);
  const selected = await selections.select('1', [join(base, '第一.txt'), join(base, '第二.txt')]);
  const request = {
    protocolVersion: 1 as const,
    requestId: newId(),
    windowId: '1',
    command: 'files.import',
    payload: {
      selectionTokens: selected.map((s) => s.token),
      destination: { type: 'library' },
      duplicate: 'keep',
    },
  };
  if (process.argv[3] === 'parser') {
    stage = 'import';
    await service.dispatch(request);
    const job = files.jobs.claim('synthetic-parser-crash')!;
    const appRoot = join(base, 'synthetic-app');
    const adapterRoot = join(appRoot, 'packages/retrieval/dist');
    await mkdir(adapterRoot, { recursive: true });
    await copyFile(join(process.cwd(), 'runtime-lock.json'), join(appRoot, 'runtime-lock.json'));
    // This staging-only test never executes the adapter. Keep it independent of mutable build output.
    await writeFile(
      join(adapterRoot, 'parse.cjs'),
      '// synthetic adapter; executor stops before launch\n',
      { flag: 'wx' },
    );
    const parser = new FileParser(
      appRoot,
      files,
      { ...unavailableExecution('synthetic fixture'), nativeExecution: { status: 'available' } },
      {
        execute: async () => {
          process.send?.({ event: 'parser_staged', jobId: job.id });
          // Pause at the executor seam, without launching any native/helper process.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
          throw new Error('Parser fixture unexpectedly resumed');
        },
      },
    );
    stage = 'staging';
    await parser.execute(job, new AbortController().signal);
    throw new Error('Parser fixture unexpectedly completed');
  }
  const take = selections.take.bind(selections);
  selections.take = async (...args) => {
    if (args[1] === selected[1]!.token) {
      process.send?.({ event: 'first_committed_second_waiting', request });
      // The parent kills this exact fixture process after the first real commit.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      throw new Error('Crash fixture unexpectedly resumed');
    }
    return take(...args);
  };
  await service.dispatch(request);
  throw new Error('Crash fixture unexpectedly completed');
}
void run().catch((error: unknown) => {
  const raw = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code =
    typeof raw === 'string' && ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO'].includes(raw)
      ? raw
      : 'UNKNOWN';
  process.send?.({ event: 'fixture_failed', stage, code });
  process.exitCode = 1;
});
