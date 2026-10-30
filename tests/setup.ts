import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanupTestDirectories, mkdtempSync } from '../scripts/test-temp.mjs';
mkdirSync('.test-data', { recursive: true });
// Never expose an inherited account during collection, including entirely skipped files.
delete process.env.TAPKIT_DATA_DIR;
beforeAll(() => {
  // Allocate only when this file actually runs; skipped suites do not execute afterAll.
  process.env.TAPKIT_DATA_DIR = mkdtempSync(resolve('.test-data', '单元 集成-'));
  mkdirSync(join(process.env.TAPKIT_DATA_DIR, 'tmp'), { recursive: true });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

// Vitest's stack hook order closes suite resources before this setup-file hook.
afterAll(() => cleanupTestDirectories(), 30_000);
