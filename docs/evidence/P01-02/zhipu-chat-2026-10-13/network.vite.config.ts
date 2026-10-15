import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'docs/evidence/P01-02/zhipu-chat-2026-10-13/network-preflight.ts',
    outDir: '.test-data/P01-02-live-network-preflight',
    target: 'node24',
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
  },
});
