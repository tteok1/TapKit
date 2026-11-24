import {
  cp,
  mkdir,
  readFile,
  writeFile,
  realpath,
  readdir,
  lstat,
  rm,
  rename,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { root, runtimeLock, pnpm, lockedEnv } from './lib.mjs';
import { assertPublicFiles } from './scan-release.mjs';
import { bundleExportFont } from './export-font.mjs';
import { materializeGraph } from './package-graph.mjs';
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
const destination = join(root, 'release', 'TapKit-development-' + stamp);
await mkdir(join(root, 'release'), { recursive: true });
await mkdir(destination);
const sources = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (sources.status !== 0) throw Error('Cannot enumerate source snapshot');
const allowed = [
  ...new Set(
    sources.stdout
      .split('\0')
      .filter(
        (path) =>
          /^(?:apps\/desktop\/|packages\/|native\/windows-helper\/|migrations\/|scripts\/|tests\/|resources\/|docs\/adr\/)/.test(
            path,
          ) ||
          /^(?:README\.md|CHANGELOG\.md|CONTRIBUTING\.md|LICENSE|THIRD_PARTY_NOTICES\.md|Start-TapKit\.cmd|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|requirements\.lock|python-wheels\.lock\.json|\.gitattributes|\.gitignore|\.npmrc|\.prettierignore|\.prettierrc\.json|[^/]+-lock\.json|dependency-baseline\.json|[^/]+\.config\.[a-z]+|tsconfig[^/]*\.json)$/.test(
            path,
          ),
      ),
  ),
];
await assertPublicFiles(root, allowed);
for (const path of allowed) {
  if (path.includes('..') || resolve(destination, path).startsWith(destination + sep) === false)
    throw Error('Unsafe source path');
  await mkdir(dirname(join(destination, path)), { recursive: true });
  await cp(join(root, path), join(destination, path), { errorOnExist: true, force: false });
}
await bundleExportFont(join(destination, 'resources/fonts'));
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
const coreBundle = await readFile(join(destination, 'packages/core/dist/index.cjs'), 'utf8');
const hostBundle = await readFile(join(destination, 'apps/desktop/out/main/index.js'), 'utf8');
if (coreBundle.includes('installChatFixture') || hostBundle.includes('tapkitBrowserWebFixture'))
  throw Error('Development package requires a production Core build. Finish any E2E build first.');
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
const { dependencies, workspaceAliases } = await materializeGraph(destination);
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
  {
    cwd: destination,
    env: lockedEnv({ TAPKIT_RUNTIME_PROBE_EVIDENCE_DIR: 'docs/evidence/P00-03' }),
    stdio: 'inherit',
    windowsHide: true,
  },
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
    for (const child of (await readdir(path)).sort()) await inventory(join(path, child));
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
await assertPublicFiles(
  destination,
  files.map((file) => file.path),
  { bundle: true },
);
const receipt = {
  schemaVersion: 1,
  milestone: 'P11-01-development',
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
const manifest = JSON.stringify(receipt, null, 2) + '\n';
await writeFile(join(destination, 'snapshot-manifest.json'), manifest);
await writeFile(
  join(destination, 'SHA256SUMS.txt'),
  [
    ...files.map(({ sha256, path }) => `${sha256}  ${path}`),
    createHash('sha256').update(manifest).digest('hex') + '  snapshot-manifest.json',
  ].join('\n') + '\n',
);
const latest = join(root, 'release/latest-' + stamp + '.tmp');
await writeFile(
  latest,
  JSON.stringify(
    {
      directory: relative(root, destination).replaceAll('\\', '/'),
      nativeProbeExitCode: probe.status,
    },
    null,
    2,
  ),
);
await rename(latest, join(root, 'release/latest.json'));
console.log('Development directory ready: ' + relative(root, destination));
