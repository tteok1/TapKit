import { defineConfig } from 'vite';
export default defineConfig({
  build: { ssr: 'docs/evidence/P05-01/hosted-live.ts', outDir: '.test-data/P05-01-hosted-live-runner',
    target: 'node24', minify: false, rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  ssr: { noExternal: ['@tapkit/contracts', '@tapkit/providers', '@tapkit/network', '@tapkit/tools', '@earendil-works/pi-ai', 'zod', 'parse5'] },
});
