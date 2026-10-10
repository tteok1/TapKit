import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../scripts/lib.mjs';
import { buildCore } from '../../scripts/desktop-build.mjs';
function coreSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? coreSources(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
export default defineConfig({
  main: {
    plugins: [
      {
        name: 'tapkit-core-watch',
        buildStart() {
          for (const pkg of ['core', 'storage', 'contracts', 'providers', 'tools'])
            for (const file of coreSources(join(root, 'packages', pkg, 'src')))
              this.addWatchFile(file);
        },
        watchChange(id) {
          if (id.replaceAll('\\', '/').includes('/packages/')) {
            buildCore();
          }
        },
      },
    ],
    build: { externalizeDeps: { exclude: ['@tapkit/contracts', 'zod'] } },
  },
  preload: { build: { externalizeDeps: { exclude: ['@tapkit/contracts', 'zod'] } } },
  renderer: {
    plugins: [
      tailwindcss(),
      {
        name: 'tapkit-pdf-reading-assets',
        generateBundle() {
          const base = join(root, 'apps/desktop/node_modules/pdfjs-dist');
          for (const kind of ['cmaps', 'standard_fonts'])
            for (const name of readdirSync(join(base, kind))) {
              if (!/^[\w.-]+\.(bcmap|pfb|ttf)$/.test(name)) continue;
              this.emitFile({
                type: 'asset',
                fileName: 'pdfjs/' + kind + '/' + name,
                source: readFileSync(join(base, kind, name)),
              });
            }
        },
        configureServer(server) {
          server.middlewares.use('/pdfjs/', (request, response, next) => {
            const match = /^\/(cmaps|standard_fonts)\/([\w.-]+\.(?:bcmap|pfb|ttf))$/.exec(
              (request.url ?? '').split('?')[0]!,
            );
            if (!match) {
              next();
              return;
            }
            try {
              const bytes = readFileSync(
                join(root, 'apps/desktop/node_modules/pdfjs-dist', match[1]!, match[2]!),
              );
              response.setHeader('Content-Type', 'application/octet-stream');
              response.end(bytes);
            } catch {
              response.statusCode = 404;
              response.end();
            }
          });
        },
      },
    ],
    server: { host: '127.0.0.1' },
  },
});
