import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { fixture } from './P06.fixture';
import { chartDeckFixture, badChartCache } from '../fixtures/P07-03.cache';
import { pdfFixture } from '../fixtures/P03-pdf';
import { SlideRepository } from '../../packages/storage/src';
import { readExecutionCapabilities } from '../../packages/tools/src';
import { FileParser } from '../../packages/core/src/file-parser';
for (const mode of ['valid', 'formula'] as const)
  test(
    'P07-03 native private chart cache ' + mode,
    async () => {
      const f = await fixture();
      try {
        const view = await f.create({ format: 'pptx' }),
          run = f.work.repo.row(view.runId),
          draft = await chartDeckFixture(),
          bytes = mode === 'valid' ? draft.bytes : await badChartCache(draft.bytes, 'formula');
        const blob = await f.blobs.put(bytes),
          pdfBlob = await f.blobs.put(pdfFixture('synthetic metadata fixture'));
        const file = f.files.importBlob({
          blobId: blob.id,
          name: 'cache.pptx',
          relativePath: 'cache.pptx',
          generatedByRunId: run.id,
          owner: { type: 'session', id: f.sessionId },
        }).file;
        const pdf = f.files.importBlob({
          blobId: pdfBlob.id,
          name: 'preview.pdf',
          relativePath: 'preview.pdf',
          generatedByRunId: run.id,
          owner: { type: 'session', id: f.sessionId },
        }).file;
        const owner = { type: 'task' as const, id: run.task_id };
        f.store.db.transaction(() => {
          f.files.link(file.id, file.version.id, owner);
          f.files.link(pdf.id, pdf.version.id, owner);
          new SlideRepository(f.files).record(file.id, file.version.id, owner, {
            schemaVersion: 1,
            kind: 'tapkit.slides',
            spec: draft.spec,
            preview: { kind: 'file', fileId: pdf.id, versionId: pdf.version.id },
            quality: { pages: 10, layoutVerified: true },
          });
        })();
        f.files.queueParse(file.version.id);
        const job = f.files.jobs.claim('P07-03-native-cache')!;
        expect(job).toBeDefined();
        const caps = await readExecutionCapabilities(resolve('.'));
        expect(caps.nativeExecution.status).toBe('available');
        const parser = new FileParser(resolve('.'), f.files, caps);
        if (mode === 'valid') {
          await parser.execute(job, new AbortController().signal);
          expect(f.files.get(file.id).version.parseStatus).toBe('ready');
          expect((await f.files.parsed(file.id)).slides).toHaveLength(10);
        } else {
          await expect(parser.execute(job, new AbortController().signal)).rejects.toThrow(
            'FORMAT_UNSUPPORTED',
          );
          expect(f.files.get(file.id).version.parseStatus).toBe('unsupported');
        }
        expect((await f.files.original(file.id)).bytes.equals(bytes)).toBe(true);
      } finally {
        await f.close();
      }
    },
    180000,
  );
