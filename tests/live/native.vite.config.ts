import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: true,
    outDir: '.test-data/P01-02-native-runner',
    target: 'node24',
    minify: false,
    rollupOptions: {
      input: {
        profile: 'tests/live/P01-02.native-profile.ts',
        runner: 'tests/live/P01-02.native-runner.ts',
      },
      external: ['electron', '@tapkit/storage'],
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: 'shared-[hash].cjs',
        paths: { '@tapkit/storage': '../../packages/storage/dist/index.cjs' },
      },
    },
  },
  ssr: { noExternal: ['@tapkit/contracts', '@tapkit/providers', 'zod', '@earendil-works/pi-ai'] },
});
