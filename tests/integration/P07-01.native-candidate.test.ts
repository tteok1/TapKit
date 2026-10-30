import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { fixture } from './P06.fixture';
import { FileParser } from '../../packages/core/src/file-parser';
import { PreviewStaging } from '../../packages/core/src/preview-staging';
import { readExecutionCapabilities } from '../../packages/tools/src';
import { newId } from '../../packages/storage/src';
import { pdfFixture } from '../fixtures/P03-pdf';

test('P07-01 transient PDF inspection runs in the native sandbox without publishing', async () => {
  const f = await fixture();
  const staging = new PreviewStaging(f.store, 'work');
  try {
    const root = resolve('.'),
      caps = await readExecutionCapabilities(root);
    expect(caps.nativeExecution.status).toBe('available');
    const versionId = newId(),
      directory = await staging.create(versionId),
      bytes = pdfFixture('P07 candidate 123.45');
    const parsed = await new FileParser(root, f.files, caps).inspectWorkPdf(
      directory,
      versionId,
      bytes,
      true,
      () => {},
      new AbortController().signal,
    );
    expect(parsed.blocks.map((b) => b.text).join(' ')).toContain('P07 candidate 123.45');
    expect(parsed.paintedImages).toBe(0);
    expect(f.store.db.prepare('SELECT count(*) AS n FROM files').get()).toEqual({ n: 0 });
    expect(await staging.release(directory)).toBe(true);
  } finally {
    await f.close();
  }
}, 180000);
