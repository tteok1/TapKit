import { test, expect } from 'vitest';
import { xlsxFixture, officeZip } from '../fixtures/P03-office';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
test('P03-02 parsed merged ranges retain bounded original coordinates, rejecting overlaps and excessive dimensions', async () => {
  const sample = (ranges: string) => {
    const parts = xlsxFixture();
    const path = 'xl/worksheets/sheet2.xml';
    parts[path] = parts[path]!.replace(
      '</worksheet>',
      `<mergeCells>${ranges
        .split(',')
        .map((ref) => '<mergeCell ref="' + ref + '"/>')
        .join('')}</mergeCells></worksheet>`,
    );
    return officeZip(parts);
  };
  const doc = await parseOfficeFile(await sample('A4:C6,D4:D8'), 'xlsx');
  expect(doc.sheets[0]?.mergedRanges).toEqual(['A4:C6', 'D4:D8']);
  expect(doc.sheets[0]?.rows).toBe(8);
  await expect(parseOfficeFile(await sample('A4:C6,B6:D9'), 'xlsx')).rejects.toThrow(
    'CORRUPT_FILE',
  );
  await expect(parseOfficeFile(await sample('A4:GS6'), 'xlsx')).rejects.toThrow('TABLE_LIMIT');
});
