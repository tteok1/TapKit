import { pnpm, run, nodeExe, root } from './lib.mjs';
import { join } from 'node:path';
pnpm(['exec', 'tsc', '--project', 'tsconfig.json']);
pnpm(['exec', 'tsc', '--project', 'apps/desktop/tsconfig.renderer.json']);
pnpm(['exec', 'eslint', 'scripts', 'eslint.config.mjs']);
run(nodeExe(), [join(root, 'scripts/check-format.mjs')]);
run(nodeExe(), [join(root, 'scripts/check-boundaries.mjs')]);
run(nodeExe(), [join(root, 'scripts/check-manifests.mjs')]);
