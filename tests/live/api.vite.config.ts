import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'tests/live/P01-02.api.ts',
    outDir: '.test-data/P01-02-live-runner',
    target: 'node24',
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
  },
  ssr: { noExternal: ['@tapkit/contracts', 'zod'] },
});
