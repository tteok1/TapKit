import { expect, test } from 'vitest';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { parseTextFile } from '../../packages/retrieval/src/ingest/text';
const bytes = (value: string) => Buffer.from(value);
test('P03-01 text parsing preserves Chinese line and paragraph offsets in a normalized version', () => {
  const result = parseTextFile(bytes('第一行\r\n第二行\r末行'), '资料/正文.TXT');
  expect(result.blocks.map((b) => [b.text, b.locator])).toEqual([
    ['第一行', { kind: 'text', start: 0, end: 3 }],
    ['第二行', { kind: 'text', start: 4, end: 7 }],
    ['末行', { kind: 'text', start: 8, end: 10 }],
  ]);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文', 'utf16le')]);
  expect(parseTextFile(utf16, 'utf16.txt').blocks[0]?.text).toBe('中文');
  expect(() => parseTextFile(Buffer.from([0xc0, 0xaf]), '坏编码.txt')).toThrow('TEXT_ENCODING');
});
test('P03-01 text code and markdown locators cannot invent paths or execute embedded source', () => {
  const source = 'throw new Error("必须只读");\nconsole.log("不执行");';
  const result = parseTextFile(bytes(source), '代码/test.TS');
  expect(result.blocks[1]?.locator).toEqual({
    kind: 'code',
    path: '代码/test.TS',
    lineStart: 2,
    lineEnd: 2,
  });
  expect(result.blocks[0]?.text).toContain('必须只读');
  expect(parseTextFile(bytes('## 标题\n段落'), 'note.md').blocks[0]).toMatchObject({
    kind: 'heading',
    level: 2,
  });
  expect(() => parseTextFile(bytes(source), '../secret.ts')).toThrow();
});
test('P03-01 HTML becomes plain text and never retains executable blocks or external resource tags', () => {
  const html =
    '<h1>资料</h1><script>fetch("https://invalid.example")</script><p>正文<img src="https://invalid.example/pic"></p>';
  const result = parseTextFile(bytes(html), '网页.html');
  const text = result.blocks.map((b) => b.text).join('\n');
  expect(text).toContain('资料');
  expect(text).toContain('正文');
  expect(text).not.toContain('fetch');
  expect(text).not.toContain('invalid.example');
  expect(text).not.toContain('<img');
});
test('P03-01 CSV preserves quotes, multiline values and formula-looking strings without evaluating them', () => {
  const result = parseTextFile(
    bytes('列1,列2\r\n"中文,内容","a""b"\r\n"两\n行",=SUM(A1:A2)\r\n'),
    '表.CSV',
  );
  expect(result.sheets[0]).toMatchObject({ rows: 3, columns: 2 });
  expect(result.sheets[0]?.cells.map((c) => c.value)).toEqual([
    '列1',
    '列2',
    '中文,内容',
    'a"b',
    '两\n行',
    '=SUM(A1:A2)',
  ]);
  expect(result.sheets[0]?.cells.at(-1)?.formula).toBeUndefined();
  expect(result.blocks[2]?.locator).toEqual({ kind: 'sheet', sheetId: 'sheet1', range: 'A3:B3' });
  expect(parseTextFile(bytes('甲\t乙\n一\t二'), '表.tsv').sheets[0]?.cells[3]?.value).toBe('二');
});
test('P03-01 corrupt and over-limit tables fail instead of returning a truncated successful sheet', () => {
  expect(() => parseTextFile(bytes('a,"unterminated'), '表.csv')).toThrow('CORRUPT_FILE');
  expect(() => parseTextFile(bytes('"a"tail,b'), '表.csv')).toThrow('CORRUPT_FILE');
  expect(() => parseTextFile(bytes('a,b\nx,y'), '表.csv', { ...FILE_LIMITS, maxRows: 1 })).toThrow(
    'TABLE_LIMIT',
  );
  expect(() => parseTextFile(bytes('a,b,c'), '表.csv', { ...FILE_LIMITS, maxColumns: 2 })).toThrow(
    'TABLE_LIMIT',
  );
  expect(() => parseTextFile(bytes('a,b\nx,y'), '表.csv', { ...FILE_LIMITS, maxCells: 3 })).toThrow(
    'TABLE_LIMIT',
  );
});
test('P03-01 JSON/XML validation blocks corrupt structures and external entities', () => {
  expect(() => parseTextFile(bytes('{bad'), 'data.json')).toThrow('CORRUPT_FILE');
  expect(parseTextFile(bytes('{"中文":true}'), 'data.json').blocks[0]?.text).toContain('中文');
  expect(() => parseTextFile(bytes('<a>oops'), 'data.xml')).toThrow('CORRUPT_FILE');
  expect(() =>
    parseTextFile(
      bytes('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'),
      'data.xml',
    ),
  ).toThrow('EXTERNAL_ENTITY');
});
test('P03-01 empty files, unsupported macro formats and disguised binary input have distinct failures', () => {
  expect(() => parseTextFile(bytes(''), '空.txt')).toThrow('EMPTY_FILE');
  expect(() => parseTextFile(bytes(' \n'), '空.txt')).toThrow('EMPTY_FILE');
  expect(() => parseTextFile(bytes('%PDF-1.7'), '伪装.txt')).toThrow('MAGIC_MISMATCH');
  expect(() => parseTextFile(bytes('PK\x03\x04'), '伪装.md')).toThrow('MAGIC_MISMATCH');
  expect(() => parseTextFile(bytes('opaque'), '旧.doc')).toThrow('FORMAT_UNSUPPORTED');
  expect(() => parseTextFile(bytes('opaque'), '宏.xlsm')).toThrow('MACRO_FORMAT');
});
