import { test, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { P06LiveBudget } from '../live/P06.budget';
function fresh() {
  mkdirSync('.test-data', { recursive: true });
  const b = new P06LiveBudget(
    join(mkdtempSync(resolve('.test-data', 'P06 budget ')), 'budget.json'),
  );
  b.initialize();
  return b;
}
test('P06-03 live cap persists across process instances and rejects the seventh reservation', () => {
  const b = fresh();
  for (let i = 0; i < 6; i++) {
    b.reserve(100, 2048);
    b.wire();
  }
  const resumed = new P06LiveBudget(b.path);
  expect(() => resumed.reserve(1, 1)).toThrow('BUDGET_EXCEEDED');
  expect(resumed.state().wireRequests).toBe(6);
  expect(() => b.initialize()).toThrow();
});
test('P06-03 live cap rejects oversized output and cumulative input before dispatch', () => {
  const b = fresh();
  expect(() => b.reserve(1, 2049)).toThrow('BUDGET_EXCEEDED');
  b.reserve(47952, 2048);
  expect(() => b.reserve(1, 1)).toThrow('BUDGET_EXCEEDED');
  expect(b.state().reservedTokens).toBe(50000);
});
