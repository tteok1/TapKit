import { createHash } from 'node:crypto';
import { lstat, open, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
// Fingerprint all runtime bytes and paths, not just executables: DLLs and Python modules are executable input too.
/** @param {string} root @param {AbortSignal} [signal] */
export async function executionFingerprint(root, signal) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  async function file(path) {
    signal?.throwIfAborted();
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('RUNTIME_REPARSE_POINT');
    hash.update(relative(root, path).replaceAll('\\', '/') + '\0');
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await file(join(path, child));
    } else if (info.isFile()) {
      hash.update(String(info.size) + '\0');
      const handle = await open(path, 'r');
      try {
        for (;;) {
          signal?.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          hash.update(buffer.subarray(0, bytesRead));
        }
      } finally {
        await handle.close();
      }
    } else throw new Error('RUNTIME_SPECIAL_FILE');
  }
  for (const name of [
    'runtime-lock.json',
    'python-wheels.lock.json',
    'export-font-lock.json',
    'native/windows-helper/Cargo.toml',
    'native/windows-helper/Cargo.lock',
    'native/windows-helper/src',
    'resources/runtime/helper/tapkit-windows-helper.exe',
    'resources/runtime/code-python-launch.py',
    'resources/runtime/code-python-install.py',
    'scripts/runtime-inventory.mjs',
    'scripts/runtime-probe.mjs',
    'scripts/runtime-probe-results.mjs',
    'scripts/execution-verification.mjs',
    'scripts/p00-03-required-cases.mjs',
    'scripts/fixtures-office.mjs',
    'scripts/fixtures-office-security.mjs',
    'tests/fixtures/office-control-mappings.ps1',
    'tests/integration/office-security-control.ts',
    'tests/integration/native-helper.ts',
    'tests/integration/P00-03.office.test.ts',
    'tests/integration/P00-03.sandbox.test.ts',
    'tests/integration/P00-03.legacy-route.test.ts',
    'tests/integration/P00-03.git-broker.test.ts',
    'tests/integration/P00-03.capability.test.ts',
    'packages/contracts/src/execution.ts',
    'packages/tools/src/execution',
  ])
    await file(join(root, name));
  const lock = JSON.parse(
    await readFile(join(root, 'runtime-lock.json'), { encoding: 'utf8', signal }),
  );
  for (const name of ['node', 'python', 'git', 'libreoffice'])
    await file(join(root, '.runtime', name, lock.runtimes[name].directory));
  const installation = join(root, 'installation.json');
  if (
    await lstat(installation).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    })
  ) {
    await file(installation);
    await file(join(root, 'scripts/installer/probe.config.mjs'));
    await file(join(root, 'scripts/installer/payload.mjs'));
  }
  signal?.throwIfAborted();
  return hash.digest('hex');
}
