import { defineConfig } from 'vite';
export default defineConfig({
  define: { __TAPKIT_TEST_BUILD__: JSON.stringify(process.env.TAPKIT_TEST_BUILD === '1') },
  build: {
    ssr: 'packages/core/src/index.ts',
    outDir: 'packages/core/dist',
    target: 'node24',
    minify: false,
    rollupOptions: {
      external: ['@tapkit/storage'],
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
  ssr: { noExternal: ['@tapkit/contracts', '@tapkit/tools', '@tapkit/providers', 'zod'] },
});
