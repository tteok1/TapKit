import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanupTestDirectories, mkdtempSync, testRoot } from '../scripts/test-temp.mjs';
import { closeLocalEmbedder } from '../packages/retrieval/src/embedding';
mkdirSync(testRoot, { recursive: true });
// Never expose an inherited account during collection, including entirely skipped files.
delete process.env.TAPKIT_DATA_DIR;
beforeAll(() => {
  // Allocate only when this file actually runs; skipped suites do not execute afterAll.
  process.env.TAPKIT_DATA_DIR = mkdtempSync(join(testRoot, '单元 集成-'));
  mkdirSync(join(process.env.TAPKIT_DATA_DIR, 'tmp'), { recursive: true });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

// Vitest's stack hook order closes suite resources before this setup-file hook.
afterAll(async () => {
  await closeLocalEmbedder();
  await cleanupTestDirectories();
}, 30_000);
