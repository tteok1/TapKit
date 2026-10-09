import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { lockedEnv } from '../../scripts/lib.mjs';
import { ProviderListSchema } from '../../packages/contracts/src/providers';
test('P01-02 real desktop UI stores both formats with DPAPI, restarts metadata and clears the selected account', async ({}, testInfo) => {
  const directory = await mkdtemp(resolve('.test-data', 'P01-02-electron-'));
  const env = Object.fromEntries(
    Object.entries(lockedEnv({ TAPKIT_DATA_DIR: directory })).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [resolve('apps/desktop')], env });
    let page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await expect(page.getByTestId('api-empty')).toBeVisible();
    for (const [preset, label, model] of [
      ['openai-compatible', 'OpenAI fixture', 'mock-openai'],
      ['anthropic-compatible', 'Anthropic fixture', 'mock-claude'],
    ]) {
      await page.getByLabel('服务预设').selectOption(preset!);
      await page.getByLabel('账户名称').fill(label!);
      await page.getByLabel('模型', { exact: true }).fill(model!);
      await page.getByLabel('API Key', { exact: true }).fill('fixture-private-key-' + preset);
      await page.getByRole('button', { name: '保存账户', exact: true }).click();
      await expect(page.getByText('已加密保存，请点击检测连接。', { exact: true })).toBeVisible();
      await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
      await expect(page.getByText(label!, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId('api-account')).toHaveCount(2);
    await expect(
      page.getByTestId('api-account').filter({ hasText: 'Anthropic fixture' }),
    ).toContainText('Anthropic Messages');
    await expect(page.getByTestId('api-account').first()).toContainText('待检测');
    await page.screenshot({
      path: testInfo.outputPath('api-accounts-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 760, height: 650 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath('api-accounts-compact.png'),
      fullPage: true,
    });
    await app.close();
    app = undefined;
    const secretFiles = (await readdir(join(directory, 'secrets'))).filter(
      (name) => !name.startsWith('opaque-'),
    );
    expect(secretFiles).toHaveLength(2);
    for (const file of secretFiles)
      expect((await readFile(join(directory, 'secrets', file))).toString()).not.toContain(
        'fixture-private-key',
      );
    expect((await readFile(join(directory, 'db', 'app.sqlite'))).toString()).not.toContain(
      'fixture-private-key',
    );
    app = await electron.launch({ args: [resolve('apps/desktop')], env });
    page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await expect(page.getByTestId('api-account')).toHaveCount(2);
    const chosen = page.getByTestId('api-account').filter({ hasText: 'OpenAI fixture' });
    await expect(chosen.getByRole('button', { name: '检测连接', exact: true })).toBeEnabled();
    await chosen.getByRole('button', { name: '清除账户记录', exact: true }).click();
    await expect(page.getByText('本机 API Key 和账户记录已清除。', { exact: true })).toBeVisible();
    await expect(page.getByTestId('api-account')).toHaveCount(1);
    expect(
      (await readdir(join(directory, 'secrets'))).filter(
        (name) => !name.startsWith('opaque-') && !name.startsWith('revoked-'),
      ),
    ).toHaveLength(1);
    await page.getByRole('link', { name: '运行状态', exact: true }).click();
    await page.getByRole('link', { name: 'Codex 连接诊断', exact: true }).click();
    await expect(page.getByTestId('codex-empty')).toBeVisible();
    expect(
      await page.evaluate(() => 'readCredential' in window.tapkit || 'invoke' in window.tapkit),
    ).toBe(false);
    // Clear the other account; no network or real API key is used by this UI test.
    await page.getByRole('link', { name: '运行状态', exact: true }).click();
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await page.getByRole('button', { name: '清除账户记录', exact: true }).click();
    await expect(page.getByTestId('api-empty')).toBeVisible();
    const cleared = await readdir(join(directory, 'secrets'));
    expect(cleared).toHaveLength(2);
    expect(cleared.every((name) => name.startsWith('revoked-'))).toBe(true);
    for (const file of cleared)
      expect((await readFile(join(directory, 'secrets', file))).toString()).not.toContain(
        'fixture-private-key',
      );
  } finally {
    await app?.close();
  }
});

test('P01-02 API diagnostic displays probe phase, business code and truncation through the real preload bridge', async ({}, testInfo) => {
  const directory = await mkdtemp(resolve('.test-data', 'P01-02-diagnostic-ui-'));
  const env = Object.fromEntries(
    Object.entries(lockedEnv({ TAPKIT_DATA_DIR: directory })).filter(
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
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await page.getByLabel('账户名称').fill('Zhipu fixture');
    await page.getByLabel('模型', { exact: true }).fill('glm-4.7-flash');
    await page.getByLabel('API Key', { exact: true }).fill('fixture-private-key');
    await page.getByRole('button', { name: '保存账户', exact: true }).click();
    await expect(page.getByTestId('api-account')).toHaveCount(1);
    const reply = await page.evaluate(async () => {
      const time = Date.now().toString(16).padStart(12, '0');
      return window.tapkit.listProviders({
        requestId: time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15),
      });
    });
    if (!reply.ok) throw new Error('Fixture account missing');
    const listing = ProviderListSchema.parse(reply.data);
    // UI-only fixture responses; adapter/Core integration is covered separately.
    // No live request is sent and no production IPC implementation is changed.
    await app.evaluate(({ ipcMain }, value) => {
      let checks = 0;
      ipcMain.removeHandler('tapkit:request');
      ipcMain.handle('tapkit:request', (_event, request) => {
        if (request.command === 'providers.list')
          return { ok: true, requestId: request.requestId, data: value };
        if (request.command !== 'providers.check') throw new Error('Unexpected fixture command');
        const truncated = checks++ > 0;
        return {
          ok: true,
          requestId: request.requestId,
          data: {
            accountId: value.accounts[0]!.accountId,
            modelId: 'glm-4.7-flash',
            status: 'unavailable',
            text: false,
            tools: false,
            errorCode: truncated ? 'OUTPUT_LIMIT_REACHED' : 'QUOTA_EXHAUSTED',
            diagnostic: {
              phase: 'text',
              reason: truncated ? 'output_truncated' : 'upstream_error',
              httpStatus: truncated ? 200 : 429,
              ...(truncated ? {} : { upstreamCode: '1113' }),
            },
          },
        };
      });
    }, listing);
    await page.getByRole('button', { name: '检测连接', exact: true }).click();
    await expect(page.getByText(/QUOTA_EXHAUSTED/)).toContainText('文本检测');
    await expect(page.getByText(/QUOTA_EXHAUSTED/)).toContainText('HTTP 429');
    await expect(page.getByText(/QUOTA_EXHAUSTED/)).toContainText('服务错误码 1113');
    await page.screenshot({ path: testInfo.outputPath('api-business-code.png'), fullPage: true });
    await page.getByRole('button', { name: '检测连接', exact: true }).click();
    await expect(page.getByText(/OUTPUT_LIMIT_REACHED/)).toContainText('输出达到 Token 上限');
    await expect(page.getByText(/OUTPUT_LIMIT_REACHED/)).not.toContainText('MODEL_UNSUPPORTED');
    await page.setViewportSize({ width: 760, height: 650 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath('api-truncation-compact.png'),
      fullPage: true,
    });
  } finally {
    await app.close();
  }
});
