import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, dirname, resolve, delimiter } from 'node:path';
import { prepareStandardUserKit } from './standard-user-kit.mjs';
import { runtimeLock } from './lib.mjs';

const destinationArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));

const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (
  groups.status !== 0 ||
  groups.stdout.includes('S-1-5-32-544') ||
  !groups.stdout.includes('S-1-16-8192')
) {
  throw new Error('Sign in with the independent standard user test. Do not run as administrator.');
}
if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is unavailable');
const destination = resolve(
  destinationArg ??
    join(
      process.env.LOCALAPPDATA,
      'TapKit-P00-03-' + new Date().toISOString().replace(/[:.]/g, '-'),
    ),
);
const preparedKit = process.argv.includes('--prepared-kit');
let target;
if (preparedKit) {
  target = destination;
  await access(target);
  console.log('Using the pre-prepared standard-user test directory: ' + target);
} else {
  console.log(
    'Preparing a fresh standard-user test directory. Copying runtimes can take several minutes.',
  );
  console.log('Destination: ' + destination);
  target = await prepareStandardUserKit(destination);
}
const node = join(
  target,
  '.runtime/node',
  runtimeLock.runtimes.node.directory,
  runtimeLock.runtimes.node.executable,
);
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.Path = dirname(node) + delimiter + (process.env.Path ?? process.env.PATH ?? '');
try {
  const commands = [
    [join(target, 'scripts/prepare-native.mjs')],
    // The fresh kit intentionally copies source rather than dist. Prepare the
    // fixed parser once, before probes; parallel tests never rebuild it.
    [
      join(target, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'packages/retrieval/vite.worker.config.ts',
    ],
    [join(target, 'scripts/runtime-probe.mjs')],
    [join(target, 'scripts/p03-parser-probe.mjs')],
    [join(target, 'scripts/p03-preview-probe.mjs')],
  ];
  if (!preparedKit) {
    commands.unshift([
      join(target, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ]);
  }
  for (const args of commands) {
    console.log('Running: ' + args.join(' '));
    const result = spawnSync(node, args, { cwd: target, env, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  console.log('Evidence directory: ' + join(target, 'docs/evidence/P00-03'));
}
