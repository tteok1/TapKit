import { test, expect } from 'vitest';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { previewOfficeFixtures } from '../fixtures/P03-preview-office.mjs';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { officeZip, pptxFixture } from '../fixtures/P03-office';
test('P03-02 plain Office fixtures with inert empty embeddings directories remain readable, while real embedded files still fail', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P03-02 Office generator '));
  await previewOfficeFixtures(dir);
  for (const extension of ['docx', 'pptx'] as const)
    for (let i = 1; i <= 3; i++) {
      const name = (extension === 'docx' ? 'word-' : 'slides-') + i + '.' + extension;
      const doc = await parseOfficeFile(await readFile(join(dir, name)), extension);
      expect(doc.blocks.length).toBeGreaterThan(0);
      if (extension === 'pptx') expect(doc.slides[0]?.notes).toContain('讲者备注');
    }
  await expect(
    parseOfficeFile(
      await officeZip({ ...pptxFixture(), 'ppt/embeddings/hidden.bin': 'active payload' }),
      'pptx',
    ),
  ).rejects.toThrow('MACRO_FORMAT');
});
