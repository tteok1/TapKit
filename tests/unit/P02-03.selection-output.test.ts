import { expect, it } from 'vitest';
import { selectionOutput } from '../../packages/core/src/selection-output';

it('P02-03 selection output hides provider citation fragments at every stream boundary', () => {
  const marker = '[[evidence:01a15472-9232-7bbb-a8ea-de42bd615146]]';
  const raw = marker + '\n译文。';
  for (let end = 1; end <= raw.length; end++) {
    const visible = selectionOutput(raw.slice(0, end), 'An English sentence.', true);
    expect(visible).not.toMatch(/\[|evidence|01a15472/);
  }
  expect(selectionOutput(raw, 'An English sentence.', false)).toBe('译文。');
});

it('P02-03 selection output preserves selected code examples and ordinary brackets', () => {
  const original = 'The syntax is [[evidence:example]].';
  expect(selectionOutput('语法是 [[evidence:example]]。', original, false)).toBe(
    '语法是 [[evidence:example]]。',
  );
  expect(selectionOutput('数组 [1, 2]，字面量 [', 'Array [1, 2], literal [', false)).toBe(
    '数组 [1, 2]，字面量 [',
  );
  expect(selectionOutput('说明。[[evidence:invented]]', 'English source.', false)).toBe('说明。');
});
