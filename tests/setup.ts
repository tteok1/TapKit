import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
mkdirSync('.test-data', { recursive: true });
process.env.TAPKIT_DATA_DIR =
  process.env.TAPKIT_DATA_DIR ?? mkdtempSync(resolve('.test-data', '单元 集成-'));
mkdirSync(join(process.env.TAPKIT_DATA_DIR, 'tmp'), { recursive: true });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());
