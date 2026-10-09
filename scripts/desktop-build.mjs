import { join } from 'node:path';
import { isMain, pnpm, root } from './lib.mjs';

export function buildCore() {
  pnpm(['exec', 'vite', 'build', '--config', 'packages/retrieval/vite.worker.config.ts']);
  pnpm(['exec', 'vite', 'build', '--config', 'packages/storage/vite.config.ts']);
  pnpm(['exec', 'vite', 'build', '--config', 'packages/core/vite.config.ts']);
}

export function buildDesktop() {
  buildCore();
  pnpm(['exec', 'electron-vite', 'build'], { cwd: join(root, 'apps/desktop') });
}

if (isMain(import.meta.url)) buildDesktop();
