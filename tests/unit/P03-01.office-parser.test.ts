import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import ExcelJS from '../../packages/retrieval/node_modules/exceljs';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import {
  docxFixture,
  xlsxFixture,
  pptxFixture,
  officeZip,
  relationships,
} from '../fixtures/P03-office';

test('P03-01 DOCX keeps headings, runs, table rows and text locators without indexing field instructions or deleted text', async () => {
  const bytes = await officeZip(docxFixture()),
    before = createHash('sha256').update(bytes).digest('hex');
  const doc = await parseOfficeFile(bytes, 'docx');
  expect(doc.blocks.map((b) => [b.kind, b.text])).toEqual([
    ['heading', '中文标题'],
    ['paragraph', '第一段 第二个run\t尾部'],
    ['table', '表头\t内容'],
    ['paragraph', '保留文字'],
  ]);
  expect(doc.blocks[0]?.level).toBe(1);
  expect(doc.blocks[1]?.locator).toMatchObject({
    kind: 'text',
    start: 5,
    end: 18,
    paragraphId: 'paragraph-2',
  });
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(before);
});
test('P03-01 XLSX preserves sheet identity, sparse coordinates, rich strings and formulas with genuine cached values', async () => {
  const doc = await parseOfficeFile(await officeZip(xlsxFixture()), 'xlsx');
  expect(doc.sheets[0]).toMatchObject({ id: '7', name: '中文表', rows: 3, columns: 4 });
  expect(doc.sheets[0]?.cells).toEqual([
    { row: 1, column: 1, value: '富文本中文', calculated: true },
    { row: 1, column: 2, value: 4, calculated: true },
    { row: 1, column: 3, value: 8, formula: 'B1*2', calculated: true },
    { row: 1, column: 4, value: null, formula: 'B1/0', calculated: false },
    { row: 3, column: 1, value: '=保持字符串', calculated: true },
    { row: 3, column: 2, value: true, calculated: true },
  ]);
  expect(doc.quality.warnings).toContain('FORMULA_CACHE_MISSING');
  expect(doc.blocks[1]?.locator).toEqual({ kind: 'sheet', sheetId: '7', range: 'A3:B3' });
});
test('P03-01 PPTX uses presentation order rather than filenames and keeps notes separate from slide text', async () => {
  const doc = await parseOfficeFile(await officeZip(pptxFixture()), 'pptx');
  expect(doc.slides).toEqual([
    { index: 0, title: '实际第一张', notes: '演讲备注' },
    { index: 1, title: '', notes: '' },
  ]);
  expect(doc.blocks.map((b) => [b.kind, b.text, b.locator])).toEqual([
    ['paragraph', '实际第一张', { kind: 'slide', slideIndex: 0, shapeId: '2' }],
    ['notes', '演讲备注', { kind: 'slide', slideIndex: 0 }],
    ['paragraph', '实际第二张', { kind: 'slide', slideIndex: 1 }],
  ]);
});
test('P03-01 Office external relationships are recorded but never loaded; package traversal is rejected', async () => {
  const parts = {
    ...docxFixture(),
    'word/_rels/document.xml.rels': relationships([
      {
        id: 'external',
        kind: 'hyperlink',
        target: 'https://example.invalid/private',
        external: true,
      },
    ]),
  };
  expect((await parseOfficeFile(await officeZip(parts), 'docx')).quality.warnings).toContain(
    'EXTERNAL_RELATIONSHIP_IGNORED',
  );
  parts['word/_rels/document.xml.rels'] = relationships([
    { id: 'unsafe', kind: 'styles', target: '../../private.xml' },
  ]);
  await expect(parseOfficeFile(await officeZip(parts), 'docx')).rejects.toThrow('UNSAFE_ARCHIVE');
});
test('P03-01 unused XML entities, disguised macros, format mismatches and invalid XML fail before successful content', async () => {
  await expect(
    parseOfficeFile(
      await officeZip({
        ...docxFixture(),
        'unused.xml': '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///private">]><root>&x;</root>',
      }),
      'docx',
    ),
  ).rejects.toThrow('EXTERNAL_ENTITY');
  await expect(
    parseOfficeFile(
      await officeZip({ ...docxFixture(), 'word/vbaProject.bin': 'must not run' }),
      'docx',
    ),
  ).rejects.toThrow('MACRO_FORMAT');
  await expect(parseOfficeFile(await officeZip(docxFixture()), 'xlsx')).rejects.toThrow(
    'MAGIC_MISMATCH',
  );
  await expect(parseOfficeFile(Buffer.from('not zip'), 'docx')).rejects.toThrow('MAGIC_MISMATCH');
  await expect(
    parseOfficeFile(await officeZip({ ...docxFixture(), 'word/document.xml': '<broken>' }), 'docx'),
  ).rejects.toThrow('CORRUPT_FILE');
});
test('P03-01 spreadsheet row, column and aggregate cell limits include sparse dimensions and every worksheet', async () => {
  const bytes = await officeZip(xlsxFixture());
  await expect(parseOfficeFile(bytes, 'xlsx', { ...FILE_LIMITS, maxRows: 2 })).rejects.toThrow(
    'TABLE_LIMIT',
  );
  await expect(parseOfficeFile(bytes, 'xlsx', { ...FILE_LIMITS, maxColumns: 3 })).rejects.toThrow(
    'TABLE_LIMIT',
  );
  await expect(parseOfficeFile(bytes, 'xlsx', { ...FILE_LIMITS, maxCells: 5 })).rejects.toThrow(
    'TABLE_LIMIT',
  );
  const parts = xlsxFixture();
  parts['xl/worksheets/sheet2.xml'] = parts['xl/worksheets/sheet2.xml']!.replace('A1:D3', 'A1:GS1');
  await expect(parseOfficeFile(await officeZip(parts), 'xlsx')).rejects.toThrow('TABLE_LIMIT');
});
test('P03-01 malformed cell coordinates, duplicate cells and shared-string indexes reject partial sheet publication', async () => {
  for (const change of [
    (xml: string) => xml.replace('r="B1"', 'r="A1"'),
    (xml: string) => xml.replace('r="D1"', 'r="D2"'),
    (xml: string) => xml.replace('<v>0</v>', '<v>999</v>'),
  ]) {
    const parts = xlsxFixture();
    parts['xl/worksheets/sheet2.xml'] = change(parts['xl/worksheets/sheet2.xml']!);
    await expect(parseOfficeFile(await officeZip(parts), 'xlsx')).rejects.toThrow('CORRUPT_FILE');
  }
});
test('P03-01 a real ExcelJS-produced workbook retains formula caches and comments do not become cell text', async () => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('导出表');
  sheet.getCell('A1').value = '真实导出';
  sheet.getCell('B1').value = 3;
  sheet.getCell('C1').value = { formula: 'B1*7', result: 21 };
  sheet.getCell('D1').value = { formula: 'B1*9' };
  sheet.getCell('A1').note = '注释不加入正文';
  const doc = await parseOfficeFile(Buffer.from(await workbook.xlsx.writeBuffer()), 'xlsx');
  expect(doc.sheets[0]?.cells.map((c) => [c.value, c.formula, c.calculated])).toEqual([
    ['真实导出', undefined, true],
    [3, undefined, true],
    [21, 'B1*7', true],
    [null, 'B1*9', false],
  ]);
  expect(doc.blocks.map((b) => b.text).join('\n')).not.toContain('注释不加入正文');
});
test('P03-01 password-protected Office containers and namespace impostors are distinguished from readable documents', async () => {
  const encrypted = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('EncryptedPackage', 'utf16le'),
  ]);
  await expect(parseOfficeFile(encrypted, 'xlsx')).rejects.toThrow('ENCRYPTED_FILE');
  const parts = docxFixture();
  parts['word/document.xml'] = parts['word/document.xml']!.replace(
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'urn:impostor',
  );
  await expect(parseOfficeFile(await officeZip(parts), 'docx')).rejects.toThrow('MAGIC_MISMATCH');
});
