import { prepareStandardUserKit } from '../../../../scripts/standard-user-kit.mjs';
import { executionFingerprint } from '../../../../scripts/runtime-inventory.mjs';
import { root } from '../../../../scripts/lib.mjs';
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile, lstat, readdir, statfs } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const seed = 'D:/TapKit/.test-data/P02-standard-user-20261019-4f9e';
const parent = 'D:/TapKit/.test-data';
const free = await statfs(parent);
if (Number(free.bavail) * Number(free.bsize) < 5 * 1024 ** 3)
  throw new Error('At least 5 GiB free space required on the seed drive.');
const before = await executionFingerprint(root);
if (process.argv.includes('--finalize-existing-seed')) {
  await readFile(join(seed, 'docs/evidence/P00-03/kit-origin.json'));
  try {
    await readFile(join(seed, 'local-standard-user-seed.json'));
    throw new Error('Finalized seeds must not be overwritten.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
} else await prepareStandardUserKit(seed);
await copyFile(
  new URL('./standard-user-attachment.mjs', import.meta.url),
  join(seed, 'scripts/local-standard-user-attachment.mjs'),
);
await copyFile(
  new URL('./run-standard-user.ps1', import.meta.url),
  join(seed, 'run-standard-user.ps1'),
);
const after = await executionFingerprint(root);
const copied = await executionFingerprint(seed);
if (before !== after || before !== copied) throw new Error('SEED_RUNTIME_FINGERPRINT_MISMATCH');
const entries = [
  'scripts/local-standard-user-attachment.mjs',
  'scripts/standard-user-kit.mjs',
  'scripts/standard-user-test.mjs',
  'scripts/p03-parser-probe.mjs',
  'run-standard-user.ps1',
  'pnpm-lock.yaml',
  'native-lock.json',
  'package.json',
  '.npmrc',
  'packages/retrieval/vite.worker.config.ts',
];
const entryHashes = {};
for (const file of entries)
  entryHashes[file] = createHash('sha256')
    .update(await readFile(join(seed, file)))
    .digest('hex');
let files = 0,
  bytes = 0;
async function audit(dir) {
  for (const name of await readdir(dir)) {
    const file = join(dir, name),
      info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error('SEED_REPARSE_POINT');
    const rel = relative(seed, file).replaceAll('\\', '/');
    const bundledPackage = rel.startsWith('.runtime/node/') || rel.startsWith('.cache/tools/pnpm/');
    if (
      ['.git', 'vault', 'secrets'].includes(name) ||
      (name === 'node_modules' && !bundledPackage) ||
      /\.(db|sqlite|sqlite3)(-|$)/i.test(name)
    )
      throw new Error('SEED_FORBIDDEN_DATA');
    if (info.isDirectory()) await audit(file);
    else if (info.isFile()) {
      files++;
      bytes += info.size;
    } else throw new Error('SEED_SPECIAL_FILE');
  }
}
await audit(seed);
if ((await readdir(join(seed, '.test-data'))).length !== 0)
  throw new Error('SEED_EXISTING_PROFILE');
const manifest = {
  schemaVersion: 1,
  purpose: 'P02-03 attachment dependency only',
  createdAt: new Date().toISOString(),
  executionFingerprint: copied,
  entryHashes,
  audit: {
    files,
    bytes,
    existingProfiles: 0,
    applicationNodeModules: 0,
    reparsePoints: 0,
    originalBusinessDataCopied: false,
  },
  scope: ['existing P00-03 native 22 cases', 'existing P03-01 native parser 3 cases'],
  excluded: [
    'P03-02 preview',
    'model requests',
    'original profile',
    'original application startup',
    'OS account creation',
    'manual ACL changes',
  ],
};
await writeFile(
  join(seed, 'local-standard-user-seed.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(
  new URL('./standard-user-seed-preparation.json', import.meta.url),
  JSON.stringify(
    {
      ...manifest,
      seed,
      status: 'prepared_not_executed',
      launcher: join(seed, 'run-standard-user.ps1'),
      sourceFingerprintBefore: before,
      sourceFingerprintAfter: after,
      tool: fileURLToPath(import.meta.url),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ seed, fingerprint: copied, audit: manifest.audit }));
