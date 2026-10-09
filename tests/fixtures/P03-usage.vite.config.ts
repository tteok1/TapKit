import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const sqlite = createRequire(resolve('packages/storage/package.json')).resolve('better-sqlite3');
export default defineConfig({
  resolve: {
    alias: {
      '@tapkit/storage': resolve('packages/storage/src/index.ts'),
      'better-sqlite3': sqlite,
    },
  },
  ssr: {
    noExternal: [
      '@tapkit/storage',
      '@tapkit/contracts',
      '@tapkit/tools',
      '@tapkit/providers',
      'zod',
    ],
  },
  build: {
    ssr: 'tests/fixtures/P03-usage.ts',
    target: 'node24',
    minify: false,
    rollupOptions: { external: [sqlite], output: { format: 'cjs', entryFileNames: 'usage.cjs' } },
  },
});
