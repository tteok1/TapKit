import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
let app: ElectronApplication, dir: string;
async function launch() {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir }).filter(
      (row): row is [string, string] => row[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  return page;
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P02-01 新用户 '));
  await mkdir('docs/evidence/P02-01', { recursive: true });
});
test.afterEach(async () => {
  if (app) await app.close();
});
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
test('P02-01 T01 empty navigation, real records, keyboard search, draft examples and restart settings', async () => {
  let page = await launch();
  await expect(page.getByRole('heading', { name: '从这里开始' })).toBeVisible();
  await page.getByRole('button', { name: '帮我把这段文字整理成清晰的要点', exact: true }).click();
  await expect(page.getByLabel('输入草稿')).toHaveValue('帮我把这段文字整理成清晰的要点');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '隐藏示例', exact: true }).click();
  await expect(page.locator('.suggestions')).not.toBeAttached();
  await page.keyboard.press('Control+n');
  await expect(page.getByRole('heading', { name: '新聊天', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '置顶新聊天', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消置顶新聊天', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('搜索标题与正文').fill('新聊天');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称').fill('验收项目');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByText('验收项目', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '个人资料与设置', exact: true }).click();
  await page.getByLabel('昵称', { exact: true }).fill('本地验收');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('设置已保存');
  await page.getByRole('link', { name: '通用', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: '个性化', exact: true }).click();
  await page
    .getByRole('region', { name: '聊天默认偏好' })
    .getByLabel('回答语言', { exact: true })
    .selectOption('en');
  await page
    .getByRole('region', { name: '工作默认偏好' })
    .getByLabel('回答语言', { exact: true })
    .selectOption('zh-CN');
  await page.getByLabel('长期自定义指令').fill('离线验收指令');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('设置已保存');
  await page.getByLabel('启用个性化').uncheck();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByLabel('长期自定义指令')).toBeDisabled();
  const custom = await page.evaluate(async () => {
    const reply = await window.tapkit.bootstrap({
      requestId: '019a32b0-0000-7000-8000-000000000004',
    });
    if (!reply.ok || !('profile' in reply.data)) throw new Error('bootstrap failed');
    return reply.data.settings.values.personalization;
  });
  expect(custom).toMatchObject({
    enabled: false,
    instructions: '离线验收指令',
    chat: { language: 'en' },
    work: { language: 'zh-CN' },
  });
  await page.getByRole('button', { name: '恢复个性化默认值', exact: true }).click();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByLabel('长期自定义指令')).toHaveValue('');
  await page.getByRole('link', { name: '通用', exact: true }).click();
  await page.locator('main').evaluate((el) => {
    el.scrollTop = 100;
  });
  await expect.poll(() => page.locator('main').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('separator', { name: '调整侧栏宽度' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.screenshot({ path: 'docs/evidence/P02-01/dark-settings.png' });
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await app.close();
  page = await launch();
  await expect(page.getByLabel('展开侧栏')).toBeVisible();
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('dark');
  await expect.poll(() => page.locator('main').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tapkit.layout.' + window.tapkit.windowSlot)!).sidebarWidth,
    ),
  ).toBe(270);
  await noOverflow(page);
});
test('P02-01 T22 responsive 1200/960 and 200 percent, focus, drawer and isolated windows', async () => {
  const page = await launch();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setSize(1200, 800);
  });
  await page.screenshot({ path: 'docs/evidence/P02-01/light-home-1200.png' });
  await noOverflow(page);
  await page.getByRole('button', { name: '详情面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '关闭详情', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 640));
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await noOverflow(page);
  await page.locator('main').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: 'docs/evidence/P02-01/settings-960-200.png' });
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await page.getByLabel('输入草稿').focus();
  await expect(page.getByLabel('输入草稿')).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('搜索标题与正文')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('输入草稿')).toBeFocused();
  const secondPromise = app.waitForEvent('window');
  await page.keyboard.press('Control+Shift+n');
  const second = await secondPromise;
  await expect(second.getByTestId('core-status')).toHaveText('本地核心已连接');
  await expect(second.getByRole('heading', { name: '从这里开始' })).toBeVisible();
  expect(await second.evaluate(() => window.tapkit.windowSlot)).not.toBe(
    await page.evaluate(() => window.tapkit.windowSlot),
  );
  expect(
    await page.evaluate(() => ({
      require: typeof (window as unknown as Record<string, unknown>).require,
      process: typeof (window as unknown as Record<string, unknown>).process,
    })),
  ).toEqual({ require: 'undefined', process: 'undefined' });
});

test('P02-01 connection error, masked fixture key, avatar and personal form conflict', async () => {
  const page = await launch();
  const avatarFile = resolve(dir, 'avatar.png');
  const { writeFile } = await import('node:fs/promises');
  const pixel = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.from([0, 128, 80, 255]), { width: 1, height: 1 })
      .toPNG()
      .toString('base64'),
  );
  await writeFile(avatarFile, Buffer.from(pixel, 'base64'));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, avatarFile);
  await page.getByRole('link', { name: '个人资料与设置', exact: true }).click();
  await page.getByRole('button', { name: '选择头像', exact: true }).click();
  await expect(page.getByRole('img', { name: '本地头像' })).toBeVisible();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('设置已保存');
  // Browser-generated WebP fixture verifies the Chromium decoder path.
  const webp = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#32675d';
    context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL('image/webp').split(',')[1]!;
  });
  await writeFile(avatarFile, Buffer.from(webp, 'base64'));
  await page.getByRole('button', { name: '选择头像', exact: true }).click();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('设置已保存');
  await page.getByLabel('昵称', { exact: true }).fill('保留中的草稿');
  await page.evaluate(async () => {
    const bridge = window.tapkit,
      bootstrap = await bridge.bootstrap({ requestId: '019a32b0-0000-7000-8000-000000000001' });
    if (!bootstrap.ok || !('profile' in bootstrap.data)) throw new Error('bootstrap failed');
    await bridge.setSettings(
      {
        requestId: '019a32b0-0000-7000-8000-000000000002',
        expectedRevision: bootstrap.data.settings.revision,
      },
      {
        scope: { type: 'profile', id: bootstrap.data.profile.id },
        patch: { historyEnabled: false },
      },
    );
  });
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('设置已被其他窗口修改');
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('保留中的草稿');
  await page.getByRole('link', { name: '模型连接', exact: true }).click();
  await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
  await page.getByLabel('账户名称').fill('离线错误验收');
  await page.getByLabel('模型', { exact: true }).fill('fixture-model');
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-p02-fixture-1234');
  await page.getByRole('button', { name: '保存账户', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(page.getByText('API Key ····1234', { exact: true })).toBeVisible();
  await app.evaluate(({ ipcMain }) => {
    const handlers = (
      ipcMain as unknown as {
        _invokeHandlers: Map<string, (event: unknown, request: any) => unknown>;
      }
    )._invokeHandlers;
    const original = handlers.get('tapkit:request')!;
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', (event, request) =>
      request.command === 'providers.check'
        ? {
            ok: true,
            requestId: request.requestId,
            data: {
              accountId: request.payload.accountId,
              status: 'unavailable',
              modelId: 'fixture-model',
              text: false,
              tools: false,
              errorCode: 'NETWORK_ERROR',
              diagnostic: { phase: 'text', reason: 'request_failed' },
            },
          }
        : original(event, request),
    );
  });
  await page.getByRole('button', { name: '检测连接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('NETWORK_ERROR');
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/evidence/P02-01/connection-error.png' });
  await page.getByLabel('API Key', { exact: true }).fill('unsaved-fixture-full-key');
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.getByRole('heading', { name: '从这里开始', exact: true })).toBeVisible();
  expect(
    await page
      .locator('input')
      .evaluateAll((inputs) =>
        inputs.some((input) => (input as HTMLInputElement).value.includes('fixture-full-key')),
      ),
  ).toBe(false);
  await app.evaluate(({ ipcMain }) => {
    const handlers = (
        ipcMain as unknown as {
          _invokeHandlers: Map<string, (event: unknown, request: any) => unknown>;
        }
      )._invokeHandlers,
      original = handlers.get('tapkit:request')!;
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', (event, request) =>
      request.command === 'providers.list'
        ? {
            ok: false,
            requestId: request.requestId,
            error: {
              code: 'AUTH_REQUIRED',
              message: '离线账户读取失败',
              retryable: false,
              recoveryActions: [],
              traceId: '019a32b0-0000-7000-8000-000000000005',
            },
          }
        : original(event, request),
    );
  });
  await page.reload();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  await expect(page.getByText('模型账户暂不可用；本地设置仍可使用。')).toBeVisible();
  await page.getByRole('link', { name: '个人资料与设置', exact: true }).click();
  await expect(page.getByLabel('昵称', { exact: true })).toBeEnabled();
});
