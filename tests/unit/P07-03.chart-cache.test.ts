import { expect, test } from 'vitest';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { chartDeckFixture, badChartCache, zipParts } from '../fixtures/P07-03.cache';
import { officeZip } from '../fixtures/P03-office';
test('P07-03 native chart caches require an explicit trusted inspection flag', async () => {
  const draft = await chartDeckFixture();
  await expect(parseOfficeFile(draft.bytes, 'pptx')).rejects.toMatchObject({
    reason: 'MACRO_FORMAT',
  });
  const parsed = await parseOfficeFile(draft.bytes, 'pptx', undefined, false, true);
  expect(parsed.slides).toHaveLength(10);
});
for (const kind of ['formula', 'nested', 'external', 'defined'] as const)
  test('P07-03 static chart cache refuses ' + kind, async () => {
    const draft = await chartDeckFixture(),
      bytes = await badChartCache(draft.bytes, kind);
    await expect(parseOfficeFile(bytes, 'pptx', undefined, false, true)).rejects.toMatchObject({
      reason: kind === 'nested' ? 'MACRO_FORMAT' : 'FORMAT_UNSUPPORTED',
    });
  });
test('P07-03 package relationships cannot point outside the validated internal chart workbook', async () => {
  const draft = await chartDeckFixture(),
    parts = await zipParts(draft.bytes),
    key = Object.keys(parts).find((n) => /^ppt\/charts\/_rels\//.test(n))!;
  parts[key] = Buffer.from(
    parts[key]!.toString().replace('<Relationship ', '<Relationship TargetMode="External" '),
  );
  await expect(
    parseOfficeFile(await officeZip(parts), 'pptx', undefined, false, true),
  ).rejects.toMatchObject({ reason: 'MACRO_FORMAT' });
});
