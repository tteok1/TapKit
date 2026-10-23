import { expect, test } from 'vitest';
import { ClipboardTextSchema } from '../../packages/contracts/src';
import { tableToTSV } from '../../packages/ui/src/clipboard';

test('P02-02 clipboard accepts the largest draft exactly and rejects an oversized payload', () => {
  const text = ' \t中文🙂e\u0301\n'.repeat(300_000).slice(0, 2_000_000);
  expect(ClipboardTextSchema.parse(text)).toBe(text);
  expect(() => ClipboardTextSchema.parse('字'.repeat(2_000_001))).toThrow();
  expect(() => ClipboardTextSchema.parse({ text: 'invalid' })).toThrow();
});
test('P02-02 table TSV retains empty columns, unicode, quotes, tabs and multi-line cells', () => {
  expect(
    tableToTSV([
      ['列一', '', '列三'],
      ['中文🙂', 'a\tb', 'line 1\n"line 2"'],
    ]),
  ).toBe('列一\t\t列三\n中文🙂\t"a\tb"\t"line 1\n""line 2"""');
});
