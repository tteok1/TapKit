import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'docs/evidence/P01-02/zhipu-chat-2026-10-13/prepare.ts',
    outDir: '.test-data/P01-02-live-prepare-runner',
    target: 'node24',
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
  },
  ssr: { noExternal: ['@tapkit/contracts', 'zod'] },
});
