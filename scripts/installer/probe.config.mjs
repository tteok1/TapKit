import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { root } from '../lib.mjs';

const work = process.env.TAPKIT_NATIVE_PROBE_WORK_DIR;
if (!work) throw Error('Packaged native probe requires an isolated work directory.');

export default defineConfig({
  cacheDir: join(work, 'vite'),
  resolve: {
    alias: {
      '@tapkit/storage': join(root, 'packages/storage/src/index.ts'),
      '@tapkit/contracts': join(root, 'packages/contracts/src/index.ts'),
      '@tapkit/network': join(root, 'packages/network/src/index.ts'),
    },
  },
  test: {
    include: ['tests/integration/P00-03.*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    maxWorkers: 1,
    sequence: { seed: 15092026 },
    testTimeout: 15_000,
  },
});
