import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, delimiter } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeLock = JSON.parse(readFileSync(join(root, 'runtime-lock.json'), 'utf8'));
export function runtimeExe(name) {
  const r = runtimeLock.runtimes[name];
  return join(root, '.runtime', name, r.directory, r.executable);
}
export function nodeExe() {
  const exe = runtimeExe('node');
  return existsSync(exe) ? exe : process.execPath;
}
export function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: lockedEnv(),
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(executable + ' exited ' + result.status);
}
export function pnpm(args, options = {}) {
  run(nodeExe(), [join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'), ...args], options);
}
export function isMain(url) {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);
}

export function lockedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const key = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  const currentPath = key ? env[key] : '';
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.Path = dirname(nodeExe()) + delimiter + currentPath;
  return env;
}
