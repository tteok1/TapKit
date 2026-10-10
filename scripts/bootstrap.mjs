import { root, nodeExe, pnpm, run } from './lib.mjs';
import { prepareRuntimes } from './runtime-fetch.mjs';
import { prepareEmbeddingModel } from './embedding-model.mjs';
import { join } from 'node:path';
await prepareRuntimes();
await prepareEmbeddingModel();
run(nodeExe(), ['--version']);
pnpm(['install', '--frozen-lockfile', '--ignore-scripts']);
// Electron's installer verifies the upstream Electron archive checksum.
run(nodeExe(), [join(root, 'node_modules/electron/install.js')]);
run(nodeExe(), [join(root, 'scripts/prepare-native.mjs')]);
run(nodeExe(), [join(root, 'scripts/build.mjs')]);
// Probe the verified Node-API module inside the real utilityProcess ABI, never the development Node ABI.
pnpm(['test:e2e', '--', '--grep', 'P00-01.*ABI']);
console.log('BOOTSTRAP_OK');
