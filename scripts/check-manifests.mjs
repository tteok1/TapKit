import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { root } from './lib.mjs';
import { parseAllDocuments } from 'yaml';
import { checkImport } from './check-boundaries.mjs';
const require = createRequire(join(root, 'packages/contracts/package.json'));
const { z } = require('zod');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const runtimeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  lockedAt: z.iso.datetime(),
  platform: z.literal('win32'),
  arch: z.literal('x64'),
  runtimes: z.record(
    z.string(),
    z.object({
      version: z.string().min(1),
      url: z.url().startsWith('https://'),
      mirrorUrls: z.array(z.url().startsWith('https://')).max(2).optional(),
      sha256: hash,
      license: z.string().min(1),
      licenseUrl: z.url(),
      archive: z.enum(['zip', 'tar.xz', 'msi']),
      directory: z.string(),
      executable: z.string(),
      scope: z.enum(['development', 'bundled']),
    }),
  ),
});
const runtimes = runtimeSchema.parse(
  JSON.parse(await readFile(join(root, 'runtime-lock.json'), 'utf8')),
);
for (const name of ['node', 'python', 'rust', 'libreoffice', 'git'])
  if (!runtimes.runtimes[name]) throw new Error('Missing runtime ' + name);
const baseline = JSON.parse(await readFile(join(root, 'dependency-baseline.json'), 'utf8'));
const lockDocuments = parseAllDocuments(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).map(
  (document) => {
    if (document.errors.length) throw document.errors[0];
    return document.toJS();
  },
);
const lock = lockDocuments.find((document) => document.importers?.['.']?.devDependencies);
if (!lock) throw new Error('Missing application lock document');
for (const name of ['pnpm', '@pnpm/exe.win32-x64']) {
  const expected = baseline.packages[name];
  const entry = lockDocuments
    .flatMap((document) => Object.entries(document.packages ?? {}))
    .find(([key]) => key === name + '@' + expected.version)?.[1];
  if (entry?.resolution?.integrity !== expected.integrity)
    throw new Error('Package manager integrity mismatch');
}
const folders = [
  '.',
  'apps/desktop',
  ...(await readdir(join(root, 'packages'))).map((n) => 'packages/' + n),
];
const used = new Set(['pnpm', '@pnpm/exe.win32-x64']);
for (const folder of folders) {
  const manifest = JSON.parse(await readFile(join(root, folder, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (version === 'workspace:*') {
      if (folder.startsWith('packages/'))
        checkImport(folder.split('/')[1], name, join(root, folder, 'src/index.ts'));
      continue;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Non-exact dependency ' + name);
    if (baseline.packages[name]?.version !== version) throw new Error('Baseline mismatch ' + name);
    const importer = lock.importers[folder];
    const item = importer?.dependencies?.[name] ?? importer?.devDependencies?.[name];
    if (item?.specifier !== version) throw new Error('Lock importer mismatch ' + name);
    const entry = lock.packages[name + '@' + version];
    if (entry?.resolution?.integrity !== baseline.packages[name].integrity)
      throw new Error('Lock integrity mismatch ' + name);
    used.add(name);
  }
}
for (const name of Object.keys(baseline.packages))
  if (!used.has(name)) throw new Error('Unused baseline dependency ' + name);
const wheels = JSON.parse(await readFile(join(root, 'python-wheels.lock.json'), 'utf8')).wheels;
const requirements = await readFile(join(root, 'requirements.lock'), 'utf8');
for (const wheel of wheels) {
  hash.parse(wheel.sha256);
  if (!requirements.includes(wheel.name + '==' + wheel.version + ' --hash=sha256:' + wheel.sha256))
    throw new Error('Wheel lock mismatch');
}
console.log('Runtime/dependency/wheel manifests verified');
