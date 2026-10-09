import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync } from 'node:fs';
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
  renderer: { plugins: [tailwindcss()], server: { host: '127.0.0.1' } },
});
