import { cp, mkdir, readFile, writeFile, realpath, readdir, lstat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { root, runtimeLock, pnpm, lockedEnv } from './lib.mjs';
// A development directory snapshot, deliberately separate from the P11 installer.
for (const name of [
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_WEB_FIXTURE',
  'ELECTRON_RENDERER_URL',
])
  delete process.env[name];
pnpm(['build']);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = join(root, 'release', 'TapKit-chat-M1-' + stamp);
await mkdir(join(root, 'release'), { recursive: true });
await mkdir(destination);
const sources = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (sources.status !== 0) throw Error('Cannot enumerate source snapshot');
const allowed = sources.stdout
  .split('\0')
  .filter(
    (path) => path && !/^(docs\/evidence\/|docs\/progress\/|\.agents\/|\.codex\/)/.test(path),
  );
for (const path of allowed) {
  if (path.includes('..') || resolve(destination, path).startsWith(destination + sep) === false)
    throw Error('Unsafe source path');
  await mkdir(dirname(join(destination, path)), { recursive: true });
  await cp(join(root, path), join(destination, path), { errorOnExist: true, force: false });
}
for (const path of [
  'apps/desktop/out',
  'packages/core/dist',
  'packages/storage/dist',
  'packages/retrieval/dist',
  'resources/runtime/helper',
  '.cache/tools/pnpm/package',
]) {
  await cp(join(root, path), join(destination, path), {
    recursive: true,
    dereference: path === '.cache/tools/pnpm/package',
    errorOnExist: true,
    force: false,
  });
}
for (const name of ['node', 'python', 'git', 'libreoffice']) {
  console.log('Bundling runtime ' + name + ' ' + runtimeLock.runtimes[name].version);
  await cp(join(root, '.runtime', name), join(destination, '.runtime', name), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
const require = createRequire(join(root, 'package.json'));
const electronRoot = dirname(require.resolve('electron/package.json'));
await cp(join(electronRoot, 'dist'), join(destination, 'electron'), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
// Materialize the exact installed production graph without absolute junctions or a dependency on this checkout.
const installed = new Map(),
  first = new Map(),
  dependencies = [];
async function packageRoot(name, from) {
  let at = from;
  while (true) {
    const candidate = join(at, 'node_modules', name);
    try {
      const actual = await realpath(candidate);
      const manifest = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'));
      if (manifest.name === name) return actual;
    } catch {}
    const parent = dirname(at);
    if (parent === at) throw Error('Missing installed dependency ' + name);
    at = parent;
  }
}
async function install(name, sourceParent, parentTarget = destination) {
  const source = await packageRoot(name, sourceParent);
  let shadowed = false;
  for (let at = parentTarget; at.startsWith(destination); at = dirname(at)) {
    const visible = installed.get(join(at, 'node_modules', name));
    if (visible === source) return;
    if (visible) {
      shadowed = true;
      break;
    }
  }
  let target =
    shadowed || (first.has(name) && first.get(name).source !== source)
      ? join(parentTarget, 'node_modules', name)
      : join(destination, 'node_modules', name);
  if (installed.get(target) === source) return;
  if (installed.has(target)) throw Error('Dependency collision ' + name);
  if (!first.has(name)) first.set(name, { source, target });
  installed.set(target, source);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) =>
      path === source || !relative(source, path).split(sep).includes('node_modules'),
  });
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  dependencies.push({
    name,
    version: manifest.version,
    path: relative(destination, target).replaceAll('\\', '/'),
  });
  for (const child of Object.keys(manifest.dependencies ?? {}))
    await install(child, source, target);
  for (const child of Object.keys(manifest.optionalDependencies ?? {})) {
    try {
      await packageRoot(child, source);
    } catch {
      continue;
    }
    await install(child, source, target);
  }
}
const workspaceAliases = [];
for (const name of (await readdir(join(root, 'packages'))).sort()) {
  const folder = join(root, 'packages', name),
    manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  // Workspace packages contain the same frozen sources and their compiled assets.
  const target = join(destination, 'node_modules', manifest.name);
  await mkdir(dirname(target), { recursive: true });
  await cp(folder, target, {
    recursive: true,
    filter: (path) =>
      path === folder || !relative(folder, path).split(sep).includes('node_modules'),
  });
  installed.set(target, await realpath(folder));
  installed.set(join(destination, 'packages', name), await realpath(folder));
  workspaceAliases.push({ find: manifest.name, path: 'packages/' + name + '/src/index.ts' });
  first.set(manifest.name, { source: await realpath(folder), target });
}
const seeds = ['vitest', 'vite'].map((name) => ({
  name,
  sourceParent: root,
  parentTarget: destination,
}));
for (const name of (await readdir(join(root, 'packages'))).sort()) {
  const folder = join(root, 'packages', name),
    manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  for (const [dep, version] of Object.entries(manifest.dependencies ?? {}))
    if (version !== 'workspace:*')
      seeds.push({
        name: dep,
        sourceParent: folder,
        parentTarget: join(destination, 'node_modules', manifest.name),
      });
  for (const [dep, version] of Object.entries(manifest.dependencies ?? {}))
    if (version !== 'workspace:*')
      seeds.push({
        name: dep,
        sourceParent: folder,
        parentTarget: join(destination, 'packages', name),
      });
}
for (const seed of seeds)
  if (!first.has(seed.name))
    first.set(seed.name, {
      source: await packageRoot(seed.name, seed.sourceParent),
      target: join(destination, 'node_modules', seed.name),
    });
for (const seed of seeds) await install(seed.name, seed.sourceParent, seed.parentTarget);
for (const [target, source] of installed) {
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  for (const name of new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])) {
    let expected;
    try {
      expected = await packageRoot(name, source);
    } catch (error) {
      if (name in (manifest.optionalDependencies ?? {})) continue;
      throw error;
    }
    const actual = await packageRoot(name, target);
    if (!actual.startsWith(destination + sep)) throw Error('Dependency escaped snapshot');
    const expectedVersion = JSON.parse(
      await readFile(join(expected, 'package.json'), 'utf8'),
    ).version;
    if (
      JSON.parse(await readFile(join(actual, 'package.json'), 'utf8')).version !== expectedVersion
    )
      throw Error('Materialized dependency version mismatch: ' + name);
  }
}
await mkdir(join(destination, 'node_modules/.bin'), { recursive: true });
await writeFile(
  join(destination, 'node_modules/.bin/vitest.cmd'),
  '@echo off\r\n"%~dp0..\\..\\.runtime\\node\\node-v24.21.0-win-x64\\node.exe" "%~dp0..\\vitest\\vitest.mjs" %*\r\n',
);
// Flat workspace copies cannot preserve source-relative imports back to resources/scripts.
// Probe the canonical packages/ sources, and preserve the original config and all test settings.
await cp(join(destination, 'vitest.config.ts'), join(destination, 'vitest.source.config.ts'));
const aliasSource = workspaceAliases
  .map(
    ({ find, path }) =>
      `{find:${JSON.stringify(find)},replacement:resolve(${JSON.stringify(path)})}`,
  )
  .join(',');
await writeFile(
  join(destination, 'vitest.config.ts'),
  `import original from './vitest.source.config';\nimport {resolve} from 'node:path';\nconst alias=[${aliasSource}];\nexport default {...original,resolve:{...original.resolve,alias},test:{...original.test,projects:original.test.projects.map(project=>({...project,resolve:{...project.resolve,alias}}))}};\n`,
);
await mkdir(join(destination, 'resources/runtime'), { recursive: true });
await writeFile(
  join(destination, 'resources/runtime/capabilities.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      executionPolicy: 'appcontainer-lok-v1',
      capabilities: Object.fromEntries(
        ['nativeExecution', 'officeRender', 'terminal'].map((name) => [
          name,
          { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'PROBE_REQUIRED' },
        ]),
      ),
    },
    null,
    2,
  ),
);
await cp(join(root, 'docs/chat-milestone.md'), join(destination, 'README-聊天开发版.md'));
await writeFile(
  join(destination, 'Start-TapKit.cmd'),
  '@echo off\r\nsetlocal\r\nset TAPKIT_CHAT_FIXTURE=\r\nset TAPKIT_WEB_FIXTURE=\r\nset TAPKIT_TEST_BUILD=\r\nset ELECTRON_RUN_AS_NODE=\r\nset ELECTRON_RENDERER_URL=\r\nset TAPKIT_DATA_DIR=\r\ncd /d "%~dp0"\r\nstart "" "%~dp0electron\\electron.exe" "%~dp0apps\\desktop"\r\n',
);
console.log(
  'Revalidating native isolation inside the new directory; no existing capability report was copied.',
);
const probe = spawnSync(
  join(
    destination,
    '.runtime/node',
    runtimeLock.runtimes.node.directory,
    runtimeLock.runtimes.node.executable,
  ),
  [join(destination, 'scripts/runtime-probe.mjs'), '--scope=current-user'],
  { cwd: destination, env: lockedEnv(), stdio: 'inherit', windowsHide: true },
);
const files = [];
const removedProbeArtifacts = [];
if (probe.status !== 0) {
  await writeFile(
    join(destination, 'snapshot-failure.json'),
    JSON.stringify(
      {
        nativeProbeExitCode: probe.status,
        reason: 'Fresh native acceptance did not pass; this directory is not a deliverable.',
      },
      null,
      2,
    ),
  );
  throw Error(
    'Fresh package isolation probe failed; reports retained, no successful latest pointer written.',
  );
}
if (probe.status === 0)
  for (const name of ['.test-data', 'test-results']) {
    const target = resolve(destination, name),
      meta = await lstat(target).catch(() => undefined);
    if (!meta) continue;
    if (
      !target.startsWith(destination + sep) ||
      !meta.isDirectory() ||
      meta.isSymbolicLink() ||
      (await realpath(target)).toLowerCase() !== target.toLowerCase()
    )
      throw Error('Unsafe probe scratch cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    removedProbeArtifacts.push(name);
  }
async function inventory(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw Error('Package contains a nonportable junction');
  if (info.isDirectory()) {
    for (const child of (await readdir(path)).sort())
      if (!['.test-data', 'test-results'].includes(child)) await inventory(join(path, child));
  } else if (info.isFile()) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    files.push({
      path: relative(destination, path).replaceAll('\\', '/'),
      sizeBytes: info.size,
      sha256: hash.digest('hex'),
    });
  } else throw Error('Package contains a special file');
}
await inventory(destination);
const receipt = {
  schemaVersion: 1,
  milestone: 'chat-M1-development',
  createdAt: stamp,
  nativeProbeExitCode: probe.status,
  removedProbeArtifacts,
  dependencies,
  probeConfiguration: {
    original: 'vitest.source.config.ts',
    canonicalWorkspaceAliases: workspaceAliases,
  },
  files,
};
await writeFile(join(destination, 'snapshot-manifest.json'), JSON.stringify(receipt, null, 2));
await writeFile(
  join(root, 'release/latest.json'),
  JSON.stringify(
    {
      directory: relative(root, destination).replaceAll('\\', '/'),
      nativeProbeExitCode: probe.status,
    },
    null,
    2,
  ),
);
console.log('Development directory ready: ' + relative(root, destination));
if (probe.status !== 0) process.exitCode = 1;
