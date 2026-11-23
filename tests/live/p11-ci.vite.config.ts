import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'tests/live/P11-01.ci-api.ts',
    outDir: 'test-results/P11-01-live/runner',
    target: 'node24',
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
  },
  ssr: { noExternal: ['@tapkit/contracts', 'zod'] },
});
