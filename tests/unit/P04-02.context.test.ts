import { test, expect } from 'vitest';
import {
  budget,
  countTokens,
  stableSerialize,
  checkpoint,
  validateCheckpoint,
  validatedCompaction,
  assemble,
  ContextCache,
} from '../../packages/context/src';
import type { SourceMessage } from '../../packages/context/src';
import type { CanonicalMessage } from '../../packages/contracts/src';
import gold from '../evals/compaction/gold.json';
const source = (text: string, n = 1, role = 'user'): SourceMessage => ({
  id: `019953fa-0000-7000-8000-${String(n).padStart(12, '0')}`,
  revision: 1,
  role,
  text,
  seq: n,
});
test('P04-02 Chinese byte upper bound, tokenizer, reasoning subsets and exact budget thresholds', () => {
  expect(countTokens('中文')).toBe(8);
  expect(countTokens('中文', () => 2)).toBe(2);
  expect(() => countTokens('x', () => NaN)).toThrow('VALIDATION_ERROR');
  const limits = {
    contextWindow: 10000,
    inputLimit: 64000,
    outputLimit: 1000,
    reasoningTokens: 500,
    reasoningIncludedInOutput: true,
    nextToolTokens: 1000,
    safetyTokens: 1000,
  };
  expect(budget(limits, 4550)).toMatchObject({
    effective: 7000,
    reasoning: 0,
    evaluate: true,
    stopLargeResults: false,
    target: 3500,
  });
  expect(budget({ ...limits, reasoningIncludedInOutput: false }, 5200)).toMatchObject({
    effective: 6500,
    reasoning: 500,
    stopLargeResults: true,
  });
  expect(budget({ ...limits, rootRemaining: 4000 }, 1001).fits).toBe(false);
});
test('P04-02 deterministic serialization keeps the stable prefix independent of object insertion order', () => {
  expect(stableSerialize({ b: 2, a: { z: 1, b: 0 } })).toBe(
    stableSerialize({ a: { b: 0, z: 1 }, b: 2 }),
  );
});
test('P04-02 T12 three compactions retain 100% of IDs money dates negations and newest correction', () => {
  const rows = [
    source('目标ID TK-2026-99；金额￥1,234.50；期限2026-10-31；不要创建PR，不得合入main。'),
  ];
  for (let n = 0; n < 3; n++) {
    rows.push(source('中文普通背景'.repeat(2000), 10 + n, 'assistant'));
    rows.push(source(`第${n + 1}次纠正：仅允许只读；目标变更为步骤${n + 1}。`, 20 + n));
    const state = checkpoint(rows);
    expect(validateCheckpoint(state, rows, [], state.literals)).toEqual(state);
    const messages: CanonicalMessage[] = rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      text: r.text,
    }));
    const result = assemble({
      systemModules: [{ id: 'product', text: '可信规则' }],
      messages,
      tools: [],
      state,
      limits: { contextWindow: 64000, inputLimit: 64000, outputLimit: 8192 },
    });
    expect(result.compacted).toBe(true);
    expect(result.stats.inputTokens).toBeLessThanOrEqual(result.stats.target);
    const text = JSON.stringify(result.messages);
    for (const row of rows.filter((r) => r.role === 'user')) expect(text).toContain(row.text);
  }
});
test('P04-02 pending tool pairs and approvals survive compaction; no invented tool results', () => {
  const row = source('仅批准call-01，不要执行其他动作。');
  const execution = [
    {
      id: source('', 4).id,
      callId: 'call-01',
      name: 'files.read',
      status: 'approved' as const,
      argsHash: 'a'.repeat(64),
      approvalId: source('', 5).id,
      arguments: { fileVersionId: row.id },
    },
  ];
  const state = checkpoint([row], execution);
  const tail: CanonicalMessage[] = [
    { role: 'user', text: row.text },
    {
      role: 'assistant',
      text: '',
      calls: [{ id: 'pending-1', name: 'files.read', arguments: { fileVersionId: row.id } }],
    },
  ];
  const result = assemble({
    systemModules: [],
    messages: [{ role: 'assistant', text: '背景'.repeat(30000) }, ...tail],
    tools: [],
    state,
    limits: { contextWindow: 64000, inputLimit: 64000, outputLimit: 8192 },
  });
  expect(result.messages.slice(-2)).toEqual(tail);
  expect(JSON.stringify(result.messages)).toContain(execution[0]!.argsHash);
  expect(result.messages.some((m) => m.role === 'tool')).toBe(false);
});
test('P04-02 invalid schema/source/literal/execution retries once then retains previous valid checkpoint', async () => {
  const rows = [source('必须保留ID A-123与￥500。')],
    state = checkpoint(rows);
  for (const invalid of [
    { ...state, constraints: [], goal: [] },
    { ...state, literals: ['fake'] },
    { ...state, execution_refs: [{}] },
    { ...state, goal: [{ text: '修改事实', sources: state.goal[0]!.sources }] },
  ]) {
    let calls = 0;
    const result = await validatedCompaction(
      () => {
        calls++;
        return invalid;
      },
      (v) => validateCheckpoint(v, rows, [], state.literals),
      state,
    );
    expect(result).toMatchObject({ accepted: false, state, attempts: 2 });
    expect(calls).toBe(2);
  }
});
test('P04-02 permissions and source versions invalidate cached data even on a hit', () => {
  const cache = new ContextCache<string>();
  const scope = {
    profile: 'p',
    scope: 's',
    permissionVersion: '1',
    sourceVersions: ['v1'],
    model: 'm',
    taskVersion: 1,
  };
  cache.set(scope, 'private');
  expect(cache.stats().bytes).toBeGreaterThan(0);
  expect(cache.get(scope, () => {})).toBe('private');
  expect(cache.stats().hits).toBe(1);
  expect(cache.get({ ...scope, sourceVersions: ['v2'] }, () => {})).toBeUndefined();
  expect(() =>
    cache.get(scope, () => {
      throw new Error('PERMISSION_DENIED');
    }),
  ).toThrow('PERMISSION_DENIED');
  expect(cache.get(scope, () => {})).toBeUndefined();
});
test('P04-02 small model windows re-budget and irreducible user constraints stop explicitly', () => {
  const row = source('不允许省略'.repeat(2000)),
    state = checkpoint([row]);
  expect(() =>
    assemble({
      systemModules: [],
      messages: [{ role: 'user', text: row.text }],
      tools: [],
      state,
      limits: { contextWindow: 16000, inputLimit: 64000, outputLimit: 1024 },
    }),
  ).toThrow('BUDGET_EXCEEDED');
});
test('P04-02 80% large tool results are externalized with exact literals and original call pairing', () => {
  const result = assemble({
    systemModules: [],
    messages: [
      { role: 'user', text: '读取授权文件。' },
      {
        role: 'assistant',
        text: '',
        calls: [
          { id: 'call-123', name: 'files.read', arguments: { fileVersionId: source('', 99).id } },
        ],
      },
      {
        role: 'tool',
        callId: 'call-123',
        name: 'files.read',
        isError: false,
        text: '金额￥500，日期2026-10-31。\n' + '无编号背景'.repeat(20000),
      },
    ],
    tools: [],
    limits: { contextWindow: 64000, inputLimit: 64000, outputLimit: 8192 },
  });
  expect(result.externalized).toBe(1);
  expect(result.stats.fits).toBe(true);
  expect(result.messages[1]).toMatchObject({ role: 'assistant', calls: [{ id: 'call-123' }] });
  expect(result.messages[2]).toMatchObject({ role: 'tool', callId: 'call-123' });
  expect(result.messages[2]!.text).toContain('￥500');
  expect(result.messages[2]!.text).toContain('2026-10-31');
});
test.each(gold.cases)(
  'P04-02 independent gold $id scores exact constraints across three compactions',
  (sample) => {
    const rows: SourceMessage[] = [];
    for (const [index, turn] of sample.turns.entries()) {
      rows.push(
        source(turn, index * 2 + 1),
        source('可检索的普通背景段落'.repeat(5000), index * 2 + 2, 'assistant'),
      );
      const state = checkpoint(rows);
      const result = assemble({
        systemModules: [],
        messages: rows.map((r) => ({ role: r.role as 'user' | 'assistant', text: r.text })),
        tools: [],
        state,
        limits: { contextWindow: 64000, inputLimit: 64000, outputLimit: 8192 },
      });
      const text = JSON.stringify(result.messages);
      for (const original of sample.turns.slice(0, index + 1)) expect(text).toContain(original);
      expect(state.goal[0]!.text).toBe(turn);
      expect(result.stats.inputTokens).toBeLessThanOrEqual(result.stats.target);
      if (index === 2) for (const literal of sample.required) expect(text).toContain(literal);
    }
  },
);
