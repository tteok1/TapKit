import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { lockedEnv, root } from '../../scripts/lib.mjs';
test('P01-01 unconfigured diagnostics uses private Core catalog and a finite preload bridge', async ({}, testInfo) => {
  await mkdir('.test-data', { recursive: true });
  const dataDir = await mkdtemp(resolve('.test-data', 'P01-01-electron-'));
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    await page.getByRole('link', { name: 'Codex 连接诊断' }).click();
    await expect(page.getByTestId('codex-empty')).toHaveText('未配置');
    await expect(page.getByRole('combobox', { name: '登录方式' })).toHaveValue('browser');
    await page.getByRole('combobox', { name: '登录方式' }).selectOption('device_code');
    await expect(page.getByRole('combobox', { name: '登录方式' })).toHaveValue('device_code');
    const catalog = await page.evaluate(async () => {
      const time = Date.now().toString(16).padStart(12, '0');
      return window.tapkit.listProviders({
        requestId: time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15),
      });
    });
    expect(catalog.ok).toBe(true);
    if (!catalog.ok || !('models' in catalog.data)) throw new Error('Catalog missing');
    expect(catalog.data.accounts).toEqual([]);
    expect(catalog.data.models.length).toBeGreaterThan(0);
    expect(JSON.stringify(catalog)).not.toMatch(
      /"(?:access|refresh|credential|thinkingSignature)"/,
    );
    expect(
      await page.evaluate(() => 'ipcRenderer' in window || 'readCredential' in window.tapkit),
    ).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('diagnostic-desktop.png') });
    await page.setViewportSize({ width: 760, height: 560 });
    await page.screenshot({ path: testInfo.outputPath('diagnostic-compact.png') });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  } finally {
    await app.close();
  }
});

for (const empty of [false, true])
  test(
    'P01-01 ' +
      (empty
        ? 'clear account button removes an old unconfigured record'
        : 'logout button clears real DPAPI credentials and removes the account record'),
    async ({}, testInfo) => {
      await mkdir('.test-data', { recursive: true });
      const dataDir = await mkdtemp(resolve('.test-data', 'P01-01-live-logout-'));
      const env: NodeJS.ProcessEnv = lockedEnv({
        TAPKIT_DATA_DIR: dataDir,
        TAPKIT_LIVE_DATA_DIR: dataDir,
      });
      delete env.ELECTRON_RUN_AS_NODE;
      const electronExe = createRequire(import.meta.url)('electron') as string;
      function fixture(mode: string) {
        const result = spawnSync(electronExe, [resolve('tests/fixtures/P01-01.live.cjs'), mode], {
          cwd: root,
          env,
          windowsHide: true,
          timeout: 15000,
          encoding: 'utf8',
        });
        expect(Boolean(result.error), 'logout fixture failed to start').toBe(false);
        expect(result.status, 'logout seed or DPAPI verification failed').toBe(0);
      }
      fixture(empty ? '--seed-empty' : '--seed');
      const launchEnv = Object.fromEntries(
        Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      const app = await electron.launch({ args: [resolve('apps/desktop')], env: launchEnv });
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
        await page.getByRole('link', { name: 'Codex 连接诊断' }).click();
        const logout = page.getByRole('button', {
          name: empty ? '清除账户记录' : '注销',
          exact: true,
        });
        await expect(logout).toBeEnabled();
        if (empty)
          await expect(page.getByRole('button', { name: '检测连接', exact: true })).toBeDisabled();
        await logout.click();
        await expect(
          page.getByText(empty ? '账户记录已清除。' : '已注销，本机登录凭据和账户记录已清除。', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(logout).toHaveCount(0);
        await expect(page.getByRole('button', { name: '检测连接', exact: true })).toHaveCount(0);
        await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveCount(0);
        await expect(page.getByText('mock-live', { exact: true })).toHaveCount(0);
        await expect(page.getByTestId('codex-empty')).toHaveText('未配置');
        await page.screenshot({ path: testInfo.outputPath('logout-feedback.png') });
      } finally {
        await app.close();
      }
      fixture(empty ? '--verify-empty-clear' : '--verify-disconnect');
    },
  );
