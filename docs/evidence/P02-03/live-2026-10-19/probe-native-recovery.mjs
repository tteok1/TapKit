import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = ['docs/evidence/P00-03/runtime-probe.json', 'docs/evidence/P00-03/runtime-probe.log'];
const originals = await Promise.all(
  paths.map(async (path) => ({ path, bytes: await readFile(join(root, path)) })),
);
const checkedAt = new Date().toISOString();
const scopeArgs = process.argv.slice(3);
if (scopeArgs.length > 1 || (scopeArgs.length === 1 && scopeArgs[0] !== '--scope=current-user'))
  throw Error('Invalid probe scope');
const child = spawn(process.execPath, [join(root, 'scripts/runtime-probe.mjs'), ...scopeArgs], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '',
  stderr = '';
child.stdout.on('data', (b) => {
  stdout = (stdout + b.toString('utf8')).slice(-131072);
});
child.stderr.on('data', (b) => {
  stderr = (stderr + b.toString('utf8')).slice(-131072);
});
const result = await new Promise((resolveResult, reject) => {
  child.once('error', reject);
  child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal }));
});
const probeBytes = await readFile(join(root, paths[0]));
const logBytes = await readFile(join(root, paths[1]));
const probe = JSON.parse(probeBytes.toString('utf8'));
const destinationName = process.argv[2] ?? 'native-recovery';
if (!/^native-recovery(?:-[a-z0-9-]+)?$/.test(destinationName))
  throw Error('Invalid diagnostic destination');
const destination = join(dir, destinationName);
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'runtime-probe.json'), probeBytes, { flag: 'wx' });
// The fixed suite uses synthetic fixtures only; redact the local repository prefix
// from its report output. Never inspect the user's message/credential/native-model data.
const redact = (s) => s.replaceAll(root, '<repo>').replaceAll(root.replaceAll('\\', '/'), '<repo>');
await writeFile(join(destination, 'runtime-probe.log'), redact(logBytes.toString('utf8')), {
  flag: 'wx',
});
await writeFile(join(destination, 'console.log'), redact(stdout + '\n' + stderr), { flag: 'wx' });
const currentGenerated = [probeBytes, logBytes];
const preserved = [];
for (let i = 0; i < originals.length; i++) {
  const { path, bytes } = originals[i];
  if (sha(await readFile(join(root, path))) !== sha(currentGenerated[i]))
    throw Error('Probe output changed concurrently; not restoring');
  await writeFile(join(root, path), bytes);
  preserved.push({
    path,
    sha256: sha(bytes),
    restoredOriginalBytes: sha(await readFile(join(root, path))) === sha(bytes),
  });
}
const summary = {
  task: 'P02-03',
  dependency: 'P00-03/P03-01',
  localDate: '2026-10-19',
  checkedAt,
  completedAt: new Date().toISOString(),
  command:
    'locked Node scripts/runtime-probe.mjs' + (scopeArgs.length ? ' --scope=current-user' : ''),
  ...result,
  probeExitCode: probe.exitCode,
  standardUser: probe.standardUser,
  verification: probe.verification ?? null,
  capabilities: probe.capabilities,
  missingCases: probe.missingCases,
  historicalReportsPreserved: preserved,
  note: 'Run the official probe with the recorded explicit scope; preserve historical tracked reports byte-for-byte; the generated local capability report stays at resources/runtime/capabilities.json. Never fabricate available state or standard-user acceptance.',
  agentModelRequests: 0,
  businessDatabaseWrites: 0,
  credentialOrModelNativeReads: 0,
};
await writeFile(join(destination, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(summary));
process.exitCode = result.exitCode ?? 1;
