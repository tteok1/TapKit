import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'tests/live/P01-01.diagnostic.ts',
    outDir: '.test-data/P01-01-diagnostic-runner',
    target: 'node24',
    minify: false,
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
  ssr: { noExternal: ['@tapkit/contracts', '@tapkit/providers', '@earendil-works/pi-ai', 'zod'] },
});
