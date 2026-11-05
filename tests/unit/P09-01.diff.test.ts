import { test, expect } from 'vitest';
import { codeLineDiff } from '../../apps/desktop/src/renderer/src/code-diff';

test('P09-01 insertion and deletion align unchanged lines with actual source numbers', () => {
  const inserted = codeLineDiff('a\nb\nc', 'note\na\nb\nc');
  expect(inserted.filter((r) => r.changed)).toEqual([
    { left: null, right: { number: 1, text: 'note' }, changed: true },
  ]);
  expect(inserted[1]).toEqual({
    left: { number: 1, text: 'a' },
    right: { number: 2, text: 'a' },
    changed: false,
  });
  const deleted = codeLineDiff('a\nb\nc', 'a\nc');
  expect(deleted[1]).toEqual({ left: { number: 2, text: 'b' }, right: null, changed: true });
  expect(deleted[2]?.right?.number).toBe(2);
});
test('P09-01 unchanged files have no change paint and absent sides have no numbered lines', () => {
  expect(codeLineDiff('a\nb\n', 'a\nb\n').every((r) => !r.changed)).toBe(true);
  expect(codeLineDiff(null, 'a').every((r) => r.left === null)).toBe(true);
  expect(codeLineDiff('a', null).every((r) => r.right === null)).toBe(true);
  expect(codeLineDiff(null, null)).toEqual([]);
});
test('P09-01 repeated lines and replacements reconstruct both exact sources', () => {
  for (const [a, b] of [
    ['a\nx\na\nb\n', 'a\na\ny\nb\n'],
    ['a\r\nb', 'a\nb'],
    ['', 'new'],
    ['old', ''],
  ]) {
    const rows = codeLineDiff(a!, b!);
    expect(rows.flatMap((r) => (r.left ? [r.left.text] : [])).join('\n')).toBe(a);
    expect(rows.flatMap((r) => (r.right ? [r.right.text] : [])).join('\n')).toBe(b);
  }
});
test('P09-01 large anchored diffs preserve line mapping without a quadratic matrix', () => {
  const text = Array.from({ length: 2200 }, (_, i) => 'line ' + i).join('\n'),
    next = 'inserted\n' + text.replace('line 1100', 'changed 1100');
  const rows = codeLineDiff(text, next);
  expect(rows.filter((r) => r.changed)).toHaveLength(2);
  expect(rows.find((r) => r.left?.number === 2200)?.right?.number).toBe(2201);
});
