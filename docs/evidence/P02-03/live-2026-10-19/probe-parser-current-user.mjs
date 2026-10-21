import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const destination = join(dir, 'parser-current-user');
await mkdir(destination);
const names = ['docs/evidence/P03-01/parser-probe.json', 'docs/evidence/P03-01/parser-probe.log'];
const saved = [];
for (const file of names) {
  try {
    saved.push({ file, bytes: await readFile(join(root, file)) });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const child = spawn(
  process.execPath,
  [join(root, 'scripts/p03-parser-probe.mjs'), '--scope=current-user'],
  { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let stdout = '',
  stderr = '';
child.stdout.on('data', (bytes) => {
  stdout += bytes.toString('utf8');
});
child.stderr.on('data', (bytes) => {
  stderr += bytes.toString('utf8');
});
const exit = await new Promise((resolveResult, reject) => {
  child.once('error', reject);
  child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal }));
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const generated = new Map();
for (const file of names) {
  const bytes = await readFile(join(root, file));
  generated.set(file, bytes);
  const output = file.endsWith('.json')
    ? bytes
    : bytes
        .toString('utf8')
        .replaceAll(root, '<repo>')
        .replaceAll(root.replaceAll('\\', '/'), '<repo>');
  await writeFile(join(destination, file.split('/').at(-1)), output, { flag: 'wx' });
}
const preserved = [];
for (const { file, bytes } of saved) {
  if (hash(await readFile(join(root, file))) !== hash(generated.get(file)))
    throw new Error('Concurrent parser report change; not restoring');
  await writeFile(join(root, file), bytes);
  preserved.push({
    file,
    sha256: hash(bytes),
    originalBytesRestored: hash(await readFile(join(root, file))) === hash(bytes),
  });
}
const probe = JSON.parse(generated.get(names[0]).toString('utf8'));
await writeFile(
  join(destination, 'console.log'),
  (stdout + stderr).replaceAll(root, '<repo>').replaceAll(root.replaceAll('\\', '/'), '<repo>'),
  { flag: 'wx' },
);
const summary = {
  command: 'locked Node scripts/p03-parser-probe.mjs --scope=current-user',
  ...exit,
  standardUser: probe.standardUser,
  verification: probe.verification,
  passed: probe.passed,
  tests: probe.tests,
  missingCases: probe.missingCases,
  adapterSha256: probe.adapterSha256,
  historicalReports: preserved,
  agentModelRequests: 0,
  originalProfileWrites: 0,
};
await writeFile(join(destination, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(summary));
process.exitCode = exit.exitCode ?? 1;
