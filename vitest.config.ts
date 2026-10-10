import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
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
          // Native cases create real Jobs and Office processes. Bound suite
          // fan-out while retaining the explicit concurrent preview checks.
          maxWorkers: 2,
          exclude: ['tests/integration/**/*.perf.test.ts'],
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
