import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(resolve('packages/retrieval/package.json'));
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
export default defineConfig({
  plugins: [
    {
      name: 'locked-pdf-text-assets',
      async generateBundle() {
        const pkg = JSON.parse(await readFile(join(pdfRoot, 'package.json'), 'utf8'));
        if (pkg.version !== '6.3.289') throw new Error('PDF_RUNTIME_VERSION_MISMATCH');
        const files: { path: string; sizeBytes: number; sha256: string }[] = [];
        const emit = async (source: string, path: string) => {
          const meta = await lstat(source);
          if (!meta.isFile() || meta.isSymbolicLink()) throw new Error('PDF_RUNTIME_REPARSE_POINT');
          const bytes = await readFile(source);
          this.emitFile({ type: 'asset', fileName: 'pdf/' + path, source: bytes });
          files.push({
            path,
            sizeBytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
        };
        await emit(join(pdfRoot, 'legacy/build/pdf.mjs'), 'pdf.mjs');
        await emit(join(pdfRoot, 'legacy/build/pdf.worker.mjs'), 'pdf.worker.mjs');
        for (const directory of ['cmaps', 'standard_fonts']) {
          for (const name of (await readdir(join(pdfRoot, directory))).sort()) {
            if (!/^[\w.-]+$/.test(name)) throw new Error('PDF_RUNTIME_PATH_INVALID');
            await emit(join(pdfRoot, directory, name), directory + '/' + name);
          }
        }
        this.emitFile({
          type: 'asset',
          fileName: 'pdf/assets.json',
          source: JSON.stringify({
            schemaVersion: 1,
            pdfjsVersion: pkg.version,
            files,
          }),
        });
      },
    },
  ],
  ssr: { noExternal: true },
  build: {
    ssr: 'packages/retrieval/src/ingest/entry.ts',
    outDir: 'packages/retrieval/dist',
    target: 'node24',
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'parse.cjs' } },
  },
});
