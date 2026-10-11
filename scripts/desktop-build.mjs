import { join } from 'node:path';
import { isMain, pnpm, root } from './lib.mjs';
import { bundleEmbeddingModel } from './embedding-model.mjs';

export async function buildCore() {
  pnpm(['exec', 'vite', 'build', '--config', 'packages/retrieval/vite.worker.config.ts']);
  pnpm(['exec', 'vite', 'build', '--config', 'packages/storage/vite.config.ts']);
  pnpm(['exec', 'vite', 'build', '--config', 'packages/core/vite.config.ts']);
  await bundleEmbeddingModel(join(root, 'packages/core/dist/models'));
}

export async function buildDesktop() {
  await buildCore();
  pnpm(['exec', 'electron-vite', 'build'], { cwd: join(root, 'apps/desktop') });
}

if (isMain(import.meta.url)) await buildDesktop();
