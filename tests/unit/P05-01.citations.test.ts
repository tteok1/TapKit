import { test, expect } from 'vitest';
import { verifySourceClaims } from '../../packages/retrieval/src/claim-support';
import { citationMarkdown } from '../../packages/ui/src/citations';
import { safeChatURL } from '../../packages/ui/src/chat-safety';
test('P05-01 mixed file/web comparisons validate joint source support and reject forged or uncovered claims', () => {
  const sources = [
    { key: 'evidence:file', text: '旧价格 42 元。' },
    { key: 'web:page', text: '新价格 55 元。' },
  ];
  const answer = '价格从 42 元变成 55 元[[evidence:file]][[web:page]]';
  expect(verifySourceClaims(answer, sources, true)).toHaveLength(2);
  for (const value of [
    '价格 999 元[[web:page]]',
    '价格 55 元[[web:forged]]',
    answer + '。还有无依据的结论',
    '不带引用的事实',
    '“编造的原话”[[web:page]]',
  ])
    expect(() => verifySourceClaims(value, sources, true)).toThrow();
  expect(
    citationMarkdown(
      '价格[[web:page]]',
      [{ kind: 'web', sourceId: 'page', revision: 1 }],
      '来源',
      '未验证',
    ),
  ).toBe('价格[来源 1](#tapkit-citation-0)');
  expect(citationMarkdown('[[web:forged]]', [], '来源', '未验证')).toBe('未验证');
  expect(safeChatURL('#tapkit-citation-0')).toBe('#tapkit-citation-0');
  expect(safeChatURL('#other')).toBe('');
});
