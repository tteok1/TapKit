import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const node = join(root, '.runtime/node/node-v24.21.0-win-x64/node.exe');
const pnpm = join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs');
const powershell = 'pwsh.exe';
const env = { ...process.env };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
env[pathKey ?? 'Path'] = resolve(node, '..') + ';' + (env[pathKey] ?? '');
const plans = [
  ['check', node, [pnpm, 'check']],
  ['docs-check', node, [pnpm, 'docs:check']],
  ['diff-check', 'git', ['diff', '--check']],
  ['original-startup-check', powershell, ['-NoProfile', '-File', join(root, 'docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1'), '-CheckOnly']],
  ['isolated-startup-check', powershell, ['-NoProfile', '-File', join(evidence, 'start-manual.ps1'), '-CheckOnly']],
  ['summary-source-production-check', node, [join(evidence, 'summarize.mjs')]],
];
const checks = [];
for (const [name, executable, args] of plans) {
  console.log('Running ' + name);
  const started = new Date().toISOString(), log = name + '.log';
  const fd = openSync(join(evidence, log), 'w');
  let result;
  try { result = spawnSync(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 300000 }); }
  finally { closeSync(fd); }
  checks.push({ name, command: [executable, ...args], started, finished: new Date().toISOString(), exitCode: result.status, error: result.error?.message, log });
  await writeFile(join(evidence, 'final-checks.json'), JSON.stringify(checks, null, 2) + '\n');
  console.log(name + ': exit ' + result.status);
}
if (checks.some(c => c.exitCode !== 0)) process.exitCode = 1;
