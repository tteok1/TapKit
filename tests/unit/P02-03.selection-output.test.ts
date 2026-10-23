import { expect, it } from 'vitest';
import {
  translationLanguage,
  translationInstruction,
  unchangedTranslation,
} from '../../packages/core/src/selection-translation';
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

it('P02-03 translation resolves auto once and makes the target explicit', () => {
  expect(translationLanguage('An English sentence.', 'auto')).toBe('zh-CN');
  expect(translationLanguage('这是一段中文。', 'auto')).toBe('en');
  expect(translationLanguage('An English sentence.', 'en')).toBe('en');
  expect(translationInstruction('zh-CN')).toContain('本轮目标语言：简体中文（zh-CN）');
});

it('P02-03 unchanged foreign prose is detected without rejecting identifiers or code', () => {
  const english = 'The amber lighthouse guides a small boat safely home.';
  const chinese = '琥珀色的灯塔引导一艘小船安全归家。';
  expect(unchangedTranslation(english, english, 'zh-CN')).toBe(true);
  expect(unchangedTranslation(chinese, chinese, 'en')).toBe(true);
  expect(unchangedTranslation(english, chinese, 'zh-CN')).toBe(false);
  expect(unchangedTranslation(english, english, 'en')).toBe(false);
  for (const source of [
    'TapKit',
    'OpenAI GPT TapKit ChatGPT.',
    '12345',
    '`console.log("Hello world stays the same.");`',
    'https://example.com/a-b',
  ]) {
    expect(unchangedTranslation(source, source, 'zh-CN')).toBe(false);
  }
});
