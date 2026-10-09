import { defineConfig } from 'vite';
export default defineConfig({
  ssr: { noExternal: ['@tapkit/contracts', 'zod'] },
  build: {
    ssr: 'packages/storage/src/index.ts',
    outDir: 'packages/storage/dist',
    target: 'node24',
    minify: false,
    rollupOptions: {
      external: ['better-sqlite3'],
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
});
