import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import path, { join, resolve, relative } from 'node:path';
import { root, isMain } from './lib.mjs';
export function isOutsideWorkspace(source, destination, paths = path) {
  const rel = paths.relative(paths.resolve(source), paths.resolve(destination));
  return rel !== '' && (paths.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + paths.sep));
}
export async function prepareStandardUserKit(destination) {
  if (!destination) throw new Error('A new destination directory is required');
  const target = resolve(destination);
  if (!isOutsideWorkspace(root, target))
    throw new Error('Destination must be outside the source workspace');
  try {
    await access(target);
    throw new Error('Destination already exists');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await mkdir(target);
  const roots = ['apps', 'packages', 'scripts', 'tests', 'resources', 'native', 'migrations'];
  for (const directory of roots)
    await cp(join(root, directory), join(target, directory), {
      recursive: true,
      filter: (source) =>
        !relative(join(root, directory), source)
          .split(/[\\/]/)
          .some((n) => ['node_modules', 'dist', 'out', 'target'].includes(n)),
    });
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'runtime-lock.json',
    'embedding-model-lock.json',
    'native-lock.json',
    'dependency-baseline.json',
    'python-wheels.lock.json',
    'requirements.lock',
    'vitest.config.ts',
    'tsconfig.base.json',
    'tsconfig.json',
    '.npmrc',
  ])
    await cp(join(root, file), join(target, file));
  for (const runtime of ['node', 'python', 'git', 'libreoffice']) {
    console.log('Copying locked runtime: ' + runtime);
    await cp(join(root, '.runtime', runtime), join(target, '.runtime', runtime), {
      recursive: true,
    });
  }
  await cp(join(root, '.cache/tools/pnpm'), join(target, '.cache/tools/pnpm'), { recursive: true });
  await mkdir(join(target, 'docs/evidence/P00-03'), { recursive: true });
  await mkdir(join(target, '.test-data'), { recursive: true });
  await writeFile(
    join(target, 'docs/evidence/P00-03/kit-origin.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        source: 'TapKit working tree P00-03',
        note: 'Copied source, locked runtimes and helper. No existing destination replaced.',
      },
      null,
      2,
    ),
  );
  console.log('Standard-user fixture prepared at ' + target);

  return target;
}
if (isMain(import.meta.url)) await prepareStandardUserKit(process.argv[2]);
