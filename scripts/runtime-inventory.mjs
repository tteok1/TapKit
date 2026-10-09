import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
// Fingerprint all runtime bytes and paths, not just executables: DLLs and Python modules are executable input too.
export async function executionFingerprint(root) {
  const hash = createHash('sha256');
  async function file(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('RUNTIME_REPARSE_POINT');
    hash.update(relative(root, path).replaceAll('\\', '/') + '\0');
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await file(join(path, child));
    } else if (info.isFile()) {
      hash.update(String(info.size) + '\0');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
    } else throw new Error('RUNTIME_SPECIAL_FILE');
  }
  for (const name of [
    'runtime-lock.json',
    'python-wheels.lock.json',
    'native/windows-helper/Cargo.toml',
    'native/windows-helper/Cargo.lock',
    'native/windows-helper/src',
    'resources/runtime/helper/tapkit-windows-helper.exe',
    'scripts/runtime-inventory.mjs',
    'scripts/runtime-probe.mjs',
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
  const lock = JSON.parse(await readFile(join(root, 'runtime-lock.json'), 'utf8'));
  for (const name of ['node', 'python', 'git', 'libreoffice'])
    await file(join(root, '.runtime', name, lock.runtimes[name].directory));
  return hash.digest('hex');
}
