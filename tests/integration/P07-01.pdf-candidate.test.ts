import { expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './P06.fixture';
import { FileParser, type ParserExecutor } from '../../packages/core/src/file-parser';
import { PreviewStaging } from '../../packages/core/src/preview-staging';
import { FILE_PARSER_VERSION, type ExecutionCapabilities } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';

const available: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'available' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'unused' },
};
const started = {
  event: 'started',
  data: {
    appContainer: true,
    networkCapabilities: 0,
    appContainerSid: 'synthetic',
    identitySid: 'synthetic',
    job: { killOnClose: true, breakaway: false },
  },
};
const finished = { event: 'finished', data: { status: 'exited', exitCode: 0, activeProcesses: 0 } };

test('P07-01 staged PDF inspection binds bytes and never publishes an artifact', async () => {
  const f = await fixture();
  const staging = new PreviewStaging(f.store, 'work');
  try {
    const versionId = newId(),
      directory = await staging.create(versionId),
      bytes = Buffer.from('%PDF-1.7\nsynthetic\n%%EOF');
    const executor: ParserExecutor = {
      async execute(request) {
        const input = JSON.parse(
          await readFile(join(request.payload.inputRoot, 'input.json'), 'utf8'),
        );
        expect(input.inspectDocumentImages).toBe(true);
        const document = emptyDocument('pdf');
        document.pages.push({ width: 595, height: 842 });
        document.paintedImages = 1;
        await writeFile(
          join(request.payload.workspace, 'parsed.json'),
          JSON.stringify({
            schemaVersion: 1,
            fileVersionId: input.fileVersionId,
            parserVersion: FILE_PARSER_VERSION,
            sourceSha256: input.sha256,
            document,
          }),
        );
        return { exitCode: 0, events: [started, finished] };
      },
    };
    const parser = new FileParser(resolve('.'), f.files, available, executor);
    const result = await parser.inspectWorkPdf(
      directory,
      versionId,
      bytes,
      true,
      () => {},
      new AbortController().signal,
    );
    expect(result.paintedImages).toBe(1);
    expect(f.store.db.prepare('SELECT count(*) AS n FROM files').get()).toEqual({ n: 0 });
    await expect(
      parser.inspectWorkPdf(f.dir, versionId, bytes, false, () => {}, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await staging.release(directory);
  } finally {
    await f.close();
  }
});

test('P07-01 staged PDF inspection rejects a forged non-isolated worker', async () => {
  const f = await fixture();
  const staging = new PreviewStaging(f.store, 'work');
  try {
    const versionId = newId(),
      directory = await staging.create(versionId);
    const parser = new FileParser(resolve('.'), f.files, available, {
      execute: async () => ({
        exitCode: 0,
        events: [{ event: 'started', data: { appContainer: false } }, finished],
      }),
    });
    await expect(
      parser.inspectWorkPdf(
        directory,
        versionId,
        Buffer.from('%PDF-1.7\n%%EOF'),
        false,
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_UNAVAILABLE' });
    await staging.release(directory);
  } finally {
    await f.close();
  }
});
