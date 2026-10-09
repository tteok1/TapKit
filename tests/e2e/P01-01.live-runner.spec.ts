import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pnpm, lockedEnv, root } from '../../scripts/lib.mjs';

test('P01-01 mock live runner cancels during generation, restarts a process, refreshes DPAPI credentials and logs out', async () => {
  pnpm(['exec', 'vite', 'build', '--config', 'tests/live/vite.config.ts']);
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P01-01-live-mock-'));
  const env: NodeJS.ProcessEnv = lockedEnv({
    TAPKIT_LIVE_DATA_DIR: directory,
    TAPKIT_CODEX_LIVE_R01: '1',
    TAPKIT_LIVE_MODEL: 'gpt-5.5',
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = createRequire(import.meta.url)('electron') as string;
  const fixture = resolve('tests/fixtures/P01-01.live.cjs');
  const runner = resolve('.test-data/P01-01-live-runner/index.cjs');
  function run(args: string[]) {
    const result = spawnSync(electron, args, {
      cwd: root,
      env,
      windowsHide: true,
      timeout: 30_000,
      encoding: 'utf8',
    });
    // Avoid printing fixture credentials or subprocess internals on failures.
    expect(Boolean(result.error), 'runner process timed out or failed to start').toBe(false);
    const stage = (result.stdout + result.stderr).match(/"stage":"([a-z-]+)"/)?.[1] ?? 'startup';
    const code = (result.stdout + result.stderr).match(/"errorCode":"([A-Z_]+)"/)?.[1] ?? '';
    expect(result.status, 'runner phase failed at ' + stage + ' ' + code).toBe(0);
    return result.stdout;
  }
  run([fixture, '--seed']);
  expect(run(['-r', fixture, runner, '--phase', 'conversation'])).toContain('ready_for_restart');
  const checkpoint = JSON.parse(
    await readFile(join(directory, 'P01-01-live-checkpoint.json'), 'utf8'),
  ) as { pid: number; checks: string[]; expiredVersion: number };
  expect(checkpoint.checks).toEqual(['text', 'two-turn-native', 'echo', 'cancel']);
  expect(checkpoint.expiredVersion).toBe(2);
  const output = run(['-r', fixture, runner, '--phase', 'restart-refresh']);
  expect(output).toContain('"status":"passed"');
  expect(output).toContain('restart-refresh');
  expect(output).toContain('logout');
  expect(output).not.toMatch(/mock-initial|mock-rotated|credential|access_token/);
  await expect(access(join(directory, 'P01-01-live-checkpoint.json'))).rejects.toThrow();
  run([fixture, '--verify']);
});
