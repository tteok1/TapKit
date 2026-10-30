import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
// Vitest 5's root CLI exclusion does not reach this inline project. CI runs
// these cases in office-native with a report bound to that runner instead.
const separateP07Native = process.env.TAPKIT_CI_SEPARATE_P07_NATIVE === '1';
export default defineConfig({
  resolve: { alias: { '@tapkit/storage': resolve('packages/storage/src/index.ts') } },
  test: {
    sequence: { seed: 15092026 },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          // Each native file needs the machine's fixed CPU/IO budget. Run files
          // independently; preview cases still overlap two real Office Jobs.
          maxWorkers: 1,
          exclude: [
            'tests/integration/**/*.perf.test.ts',
            ...(separateP07Native ? ['tests/integration/P07-*.native-*.test.ts'] : []),
          ],
          setupFiles: ['tests/setup.ts'],
          testTimeout: 15_000,
        },
      },
      {
        test: {
          name: 'perf',
          include: ['tests/integration/**/*.perf.test.ts'],
          setupFiles: ['tests/setup.ts'],
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
