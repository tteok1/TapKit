import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@tapkit/storage': resolve('packages/storage/src/index.ts') } },
  test: { include: ['docs/evidence/P05-01/hosted-source-live.test.ts'], maxWorkers: 1, testTimeout: 120000 },
});
