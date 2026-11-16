import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cpus, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron } from '../e2e/test';
import { readRuntimeCapabilities, waitRuntimeCapabilities } from '../e2e/core-ready';

test('P11-01 performance: desktop first profile, restart and idle working set', async () => {
  test.setTimeout(550_000);
  await mkdir('.test-data', { recursive: true });
  const profile = await mkdtemp(resolve('.test-data', 'P11-01 performance '));
  const runtime = process.env.TAPKIT_P11_DEV_PACKAGE;
  const bundle = runtime ? resolve(runtime) : undefined;
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: profile,
      TAPKIT_STARTUP_DIAGNOSTICS: '1',
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
    'ELECTRON_RENDERER_URL',
  ])
    delete env[key];
  const samples = [];
  for (const kind of [
    'first-profile',
    'same-profile-restart',
    'same-profile-restart',
    'same-profile-restart',
  ]) {
    const started = performance.now();
    const app = await electron.launch({
      ...(bundle ? { executablePath: join(bundle, 'electron/electron.exe') } : {}),
      args: [bundle ? join(bundle, 'apps/desktop') : resolve('apps/desktop')],
      env,
      chromiumSandbox: true,
    });
    const stages: string[] = [];
    const stdout = app.process().stdout;
    if (stdout)
      createInterface({ input: stdout }).on('line', (line) => {
        if (/^TAPKIT_CORE_STARTUP [a-z-]+ \d+ \d+$/.test(line)) stages.push(line);
      });
    try {
      const page = await app.firstWindow();
      await expect(page.getByRole('heading', { name: '你的想法，从这里开始' })).toBeVisible();
      const shellMs = performance.now() - started;
      await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', {
        timeout: 125_000,
      });
      const coreReadyMs = performance.now() - started;
      const atCoreReady = await readRuntimeCapabilities(page);
      const verified = await waitRuntimeCapabilities(page);
      const nativeSettledMs = performance.now() - started;
      const idleSamples = [];
      for (let i = 0; i < 3; i++) {
        await delay(1000);
        const processes = await app.evaluate(({ app }) =>
          app.getAppMetrics().map(({ type, serviceName, memory }) => ({
            type,
            service: serviceName,
            workingSetMiB: memory.workingSetSize / 1024,
          })),
        );
        idleSamples.push({
          processes,
          totalMiB: processes.reduce((total, metric) => total + metric.workingSetMiB, 0),
        });
      }
      samples.push({
        profile: kind,
        shellMs,
        coreReadyMs,
        nativeSettledMs,
        atCoreReady,
        verified,
        idleMiB: Math.max(...idleSamples.map(({ totalMiB }) => totalMiB)),
        idleSamples,
        stages,
      });
    } finally {
      await app.close();
    }
  }

  const limits = { firstProfileMs: 5000, restartMs: 2000, idleMiB: 700 };
  const draft = {
    checkedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    hardware: {
      os: release(),
      arch: process.arch,
      threads: cpus().length,
      cpu: cpus()[0]?.model,
      ramBytes: totalmem(),
    },
    scope:
      'This host, application restart and new profile, no OS cache flush or provider calls. Idle measures maximum of three 1-second samples after verification settles.',
    runtime: bundle ? 'development directory' : 'source build',
    limits,
    samples,
    meetsLimits: {
      firstProfile: samples[0]!.coreReadyMs <= limits.firstProfileMs,
      restart: samples.slice(1).every((sample) => sample.coreReadyMs <= limits.restartMs),
      idle: samples.every((sample) => sample.idleMiB <= limits.idleMiB),
    },
    nativeVerified: samples.every(({ verified }) =>
      Object.values(verified).every(({ status }) => status === 'available'),
    ),
    nativeGatedAtCoreReady: samples.some(
      ({ atCoreReady }) =>
        atCoreReady.nativeExecution.status === 'failed' &&
        atCoreReady.nativeExecution.reason === 'PROBE_IN_PROGRESS',
    ),
  };
  const report = resolve('test-results/P11-01/desktop-perf.json');
  await mkdir(dirname(report), { recursive: true });
  await writeFile(report, JSON.stringify(draft, null, 2) + '\n');
  if (bundle) {
    const core = await readFile(join(bundle, 'packages/core/dist/index.cjs'), 'utf8');
    expect(core).not.toContain('installChatFixture');
  }
  expect(draft.nativeVerified).toBe(true);
  if (
    samples.some(({ stages }) => {
      const ready = stages.findIndex((stage) =>
        stage.startsWith('TAPKIT_CORE_STARTUP core-ready '),
      );
      const native = stages.findIndex((stage) =>
        stage.startsWith('TAPKIT_CORE_STARTUP native-verified '),
      );
      return ready !== -1 && native > ready;
    })
  )
    expect(draft.nativeGatedAtCoreReady).toBe(true);
  expect(draft.meetsLimits).toEqual({ firstProfile: true, restart: true, idle: true });
});
