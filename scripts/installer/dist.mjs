import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Arch, build, Platform } from 'electron-builder';
import { parse } from 'yaml';
import { pnpm, root, runtimeLock } from '../lib.mjs';
import { assertPublicFiles } from '../scan-release.mjs';
import { materializeGraph } from '../package-graph.mjs';
import { bundleExportFont } from '../export-font.mjs';
import { inspectPayload, inventoryFile } from './payload.mjs';

const windows = process.platform === 'win32' && process.arch === 'x64';
if (!windows) throw Error('dist:win requires Windows x64.');
const acceptance = process.argv.length === 3 && process.argv[2] === '--acceptance';
if (process.argv.length !== 2 && !acceptance) throw Error('Expected no arguments or --acceptance.');
const version = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')).version;
function versionParts(value) {
  if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value))
    throw Error('Expected a numeric desktop version.');
  const parts = value.split('.').map(Number);
  if (parts.some((part) => part > 65535))
    throw Error('Desktop version exceeds Windows version range.');
  return parts;
}
const [major, minor, patch] = versionParts(version);
const releases = acceptance ? [version, [major, minor, patch + 1].join('.')] : [version];
for (const name of [
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_WEB_FIXTURE',
  'ELECTRON_RENDERER_URL',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
])
  delete process.env[name];
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_BUILDER_CACHE ??= join(root, '.cache/electron-builder');
// Keep packaging repeatable without the default level-9 compression of the full
// runtime tree. Both the download and installed size remain enforced below.
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = '3';
// Nsis7z cannot decode the ARM64 filter that 7-Zip picks for ARM64 launcher
// templates in LibreOffice's Python. Use the compatible x86 BCJ filter for all
// executable blocks and keep the locked runtime files intact.
process.env.ELECTRON_BUILDER_7Z_FILTER = 'BCJ';

// Bootstrap supplies the locked helper and runtimes. Rebuild the production JS before
// packaging, since Electron acceptance can leave a separate fixture build in out/.
await access(join(root, 'resources/runtime/helper/tapkit-windows-helper.exe'));
pnpm(['build:desktop']);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const work = join(root, 'release', '.building-windows-' + stamp);
const release = join(root, 'release', 'TapKit-windows-' + stamp);
const payload = join(work, 'payload');
const ui = join(work, 'ui');
const delivery = join(work, 'installers');
await mkdir(work, { recursive: true });
await mkdir(ui);
await cp(join(root, 'apps/desktop/out'), join(ui, 'out'), { recursive: true });
const core = await readFile(join(root, 'packages/core/dist/index.cjs'), 'utf8');
const host = await readFile(join(ui, 'out/main/index.js'), 'utf8');
if (core.includes('installChatFixture') || host.includes('tapkitBrowserWebFixture'))
  throw Error('Finish E2E before packaging a production build.');
await assertPublicFiles(
  ui,
  (await inspectPayload(ui)).map((file) => file.path),
);

// Only runtime inputs and the fixed machine-local native acceptance suite are staged.
const sources = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'runtime-lock.json',
  'native-lock.json',
  'python-wheels.lock.json',
  'export-font-lock.json',
  'embedding-model-lock.json',
  'migrations',
  'native/windows-helper/Cargo.toml',
  'native/windows-helper/Cargo.lock',
  'native/windows-helper/src',
  'packages/core/dist',
  'packages/retrieval/dist',
  'resources/catalogs',
  'resources/prompts',
  'resources/fonts/OFL.txt',
  'resources/runtime/helper/tapkit-windows-helper.exe',
  'resources/runtime/code-python-install.py',
  'resources/runtime/code-python-launch.py',
  'scripts/execution-verification.mjs',
  'scripts/fixtures-office.mjs',
  'scripts/fixtures-office-security.mjs',
  'scripts/lib.mjs',
  'scripts/p00-03-required-cases.mjs',
  'scripts/runtime-inventory.mjs',
  'scripts/runtime-probe.mjs',
  'scripts/runtime-probe-results.mjs',
  'scripts/test-temp.mjs',
  'scripts/installer/payload.mjs',
  'scripts/installer/probe.config.mjs',
  'scripts/installer/storage.mjs',
  'tests/setup.ts',
  'tests/fixtures/office-control-mappings.ps1',
  'tests/integration/native-helper.ts',
  'tests/integration/office-security-control.ts',
  ...['capability', 'git-broker', 'legacy-route', 'office', 'sandbox'].map(
    (name) => 'tests/integration/P00-03.' + name + '.test.ts',
  ),
  ...[
    'contracts',
    'core',
    'network',
    'providers',
    'retrieval',
    'storage',
    'tools',
    'workflows',
  ].flatMap((name) => ['package.json', 'src'].map((part) => 'packages/' + name + '/' + part)),
  ...['node', 'python', 'git', 'libreoffice'].map(
    (name) => '.runtime/' + name + '/' + runtimeLock.runtimes[name].directory,
  ),
];
try {
  for (const path of sources) {
    const destination = join(payload, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, path), destination, { recursive: true });
  }
  await bundleExportFont(join(payload, 'resources/fonts'));
  console.log('Materializing the locked production and native-probe dependency graph.');
  await materializeGraph(payload, { copySources: false });
  console.log('Verifying the staged runtime and native-probe payload.');
  const payloadFiles = await inspectPayload(payload);
  await assertPublicFiles(
    payload,
    payloadFiles.map((file) => file.path),
    { bundle: true },
  );
  await mkdir(delivery);
  const require = createRequire(import.meta.url);
  const electronDist = join(dirname(require.resolve('electron/package.json')), 'dist');
  const settings = parse(await readFile(join(root, 'electron-builder.yml'), 'utf8'));
  const artifacts = [];
  for (const target of releases) {
    await writeFile(
      join(ui, 'package.json'),
      JSON.stringify({
        name: 'tapkit',
        description: 'TapKit Windows development test build',
        author: 'TapKit',
        version: target,
        main: 'out/main/index.js',
      }),
    );
    const metadata = JSON.stringify(
      { product: 'TapKit', channel: 'development', version: target, repository: 'tteok1/TapKit' },
      null,
      2,
    );
    await writeFile(join(payload, 'installation.json'), metadata);
    const directory = join(work, 'output-' + target);
    let unpacked;
    let unpackedBytes;
    await build({
      projectDir: root,
      targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
      publish: 'never',
      config: {
        ...settings,
        electronDist,
        // Electron's ASAR only contains the bundled Host/Preload/Renderer. The
        // separately staged, already verified Node graph belongs to Core and the probe.
        beforeBuild: async () => false,
        directories: { app: ui, output: directory, buildResources: join(root, 'build') },
        files: ['out/**/*', 'package.json'],
        afterPack: async ({ appOutDir }) => {
          unpacked = appOutDir;
          // Publish the exact verified tree by moving its directory on the same
          // volume. It includes dot directories and native files verbatim.
          const files = await inspectPayload(appOutDir);
          const prefix = 'resources/tapkit/';
          files.push({
            path: prefix + 'installation.json',
            sha256: createHash('sha256').update(metadata).digest('hex'),
            bytes: Buffer.byteLength(metadata),
          });
          for (const file of payloadFiles) files.push({ ...file, path: prefix + file.path });
          unpackedBytes = files.reduce((total, file) => total + file.bytes, 0);
          if (unpackedBytes > 4 * 1024 ** 3) throw Error('Installed payload exceeds 4 GiB.');
          await rename(payload, join(appOutDir, 'resources/tapkit'));
          await writeFile(
            join(appOutDir, inventoryFile),
            JSON.stringify({ schemaVersion: 1, files }),
          );
        },
      },
    });
    const name = 'TapKit-' + target + '-windows-x64-development.exe';
    const file = join(directory, name);
    const hash = createHash('sha256');
    let installerBytes = 0;
    for await (const bytes of createReadStream(file)) {
      hash.update(bytes);
      installerBytes += bytes.length;
    }
    if (!unpackedBytes || installerBytes > 1.5 * 1024 ** 3)
      throw Error('Installer size is invalid.');
    const sha256 = hash.digest('hex');
    await rename(file, join(delivery, name));
    await writeFile(join(delivery, name + '.sha256'), sha256 + '  ' + name + '\n');
    artifacts.push({ version: target, name, sha256, installerBytes, unpackedBytes });
    if (target !== releases.at(-1)) {
      await rm(join(unpacked, inventoryFile));
      await rename(join(unpacked, 'resources/tapkit'), payload);
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 4 });
  }
  await writeFile(
    join(delivery, 'build-receipt.json'),
    JSON.stringify({ channel: 'development', signed: false, artifacts }, null, 2) + '\n',
  );
  await rename(delivery, release);
  console.log('Windows development installer: ' + release);
} finally {
  await rm(work, { recursive: true, force: true, maxRetries: 4 }).catch(() =>
    console.warn('Could not remove the installer build’s private working directory: ' + work),
  );
}
