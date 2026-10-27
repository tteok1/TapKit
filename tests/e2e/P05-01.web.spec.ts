import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openSessionFixture, reopenSessionFixture } from './session-fixture';
let app: ElectronApplication, page: Page, dir: string;
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P05-01 Electron synthetic '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await writeFile(resolve(dir, 'P05.fixture'), 'P05 isolated web fixture');
  await mkdir('docs/evidence/P05-01/desktop', { recursive: true });
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      TAPKIT_CHAT_FIXTURE: 'P02-02',
      TAPKIT_WEB_FIXTURE: 'P05-01',
    }).filter((r): r is [string, string] => r[1] !== undefined),
  );
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
});
test.afterEach(async () => {
  await app?.close();
});
async function send(text: string) {
  await page.getByLabel('输入草稿').fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText(
    /公开价格|无法读取来源|未启用联网/,
    { timeout: 30000 },
  );
  await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
}
async function webSettings() {
  await page.getByRole('button', { name: /^联网与来源：/ }).click();
  return page.getByRole('dialog', { name: '联网与来源', exact: true });
}
async function appearance(theme: 'light' | 'dark', zoom: number) {
  await page.evaluate(
    async ({ theme, zoom }) => {
      const id = () => {
        const value = crypto.randomUUID();
        return value.slice(0, 14) + '7' + value.slice(15);
      };
      const bootstrap = await window.tapkit.bootstrap({ requestId: id() });
      if (!bootstrap.ok || !('profile' in bootstrap.data)) throw new Error('bootstrap');
      const reply = await window.tapkit.setSettings(
        { requestId: id(), expectedRevision: bootstrap.data.settings.revision },
        {
          scope: { type: 'profile', id: bootstrap.data.profile.id },
          patch: { desktop: { ...bootstrap.data.settings.values.desktop, theme, zoom } },
        },
      );
      if (!reply.ok) throw new Error(reply.error.code);
    },
    { theme, zoom },
  );
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', theme);
}
async function capture(path: string) {
  const image = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'),
  );
  await writeFile(path, Buffer.from(image, 'base64'));
}
test('P05-01 T09 anonymous source flows from chat to archived panel and survives reload', async () => {
  test.setTimeout(90000);
  const sid = await openSessionFixture(page);
  await send('P05来源 查证 https://example.com/page1');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('公开价格 42 元');
  await page.getByRole('link', { name: '来源 1', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '网页来源', exact: true });
  await panel.getByRole('button', { name: '公开价格来源', exact: true }).click();
  await expect(panel).toContainText('已归档正文，断网也可查看');
  await expect(panel).toContainText('不可信网页测试文本');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { privateKey?: string }).privateKey))
    .toBeUndefined();
  await mkdir('docs/evidence/P05-01/desktop-v3', { recursive: true });
  await capture('docs/evidence/P05-01/desktop-v3/source-panel.png');
  await appearance('dark', 1);
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: '关闭网页来源' })
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe('rgb(25, 30, 27)');
  await capture('docs/evidence/P05-01/desktop-v3/source-dark.png');
  const previousWidth = await page.evaluate(() => innerWidth);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(960, 720),
  );
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(previousWidth);
  await capture('docs/evidence/P05-01/desktop-v3/source-960.png');
  await appearance('dark', 2);
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await expect(panel.getByRole('button', { name: '关闭网页来源' })).toBeVisible();
  const closeBounds = await panel
    .getByRole('button', { name: '关闭网页来源' })
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
  expect(closeBounds.x).toBeGreaterThanOrEqual(0);
  expect(closeBounds.right).toBeLessThanOrEqual(closeBounds.width);
  expect(closeBounds.y).toBeGreaterThanOrEqual(0);
  expect(closeBounds.bottom).toBeLessThanOrEqual(closeBounds.height);
  expect(
    await panel.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth),
  ).toBe(true);
  await writeFile(
    'docs/evidence/P05-01/desktop-v3/bounds-200.json',
    JSON.stringify(closeBounds, null, 2),
  );
  await capture('docs/evidence/P05-01/desktop-v3/source-200.png');
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setContentSize(1440, 900);
  });
  await appearance('light', 1);
  await panel.getByRole('button', { name: '关闭网页来源' }).click();
  await page.reload();
  await reopenSessionFixture(page, sid);
  await webSettings();
  await page.getByRole('button', { name: '网页来源', exact: true }).click();
  await page
    .getByRole('complementary', { name: '网页来源', exact: true })
    .getByRole('button', { name: '公开价格来源', exact: true })
    .click();
  await expect(page.locator('.web-source-text')).toContainText('公开价格 42 元');
});
test('P05-01 T19 off mode, absent key and CAPTCHA show truthful states without fabricated sources', async () => {
  let settings = await webSettings();
  await settings.getByLabel('联网搜索', { exact: true }).selectOption('off');
  await settings.getByRole('button', { name: '关闭联网设置' }).click();
  await send('P05来源 查证 https://example.com/');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('当前未启用联网');
  settings = await webSettings();
  await expect(settings.getByLabel('联网搜索', { exact: true })).toHaveValue('off');
  await settings.getByRole('button', { name: '联网与来源', exact: true }).click();
  await expect(page.getByRole('region', { name: '联网与来源', exact: true })).toContainText(
    '当前通道不支持托管搜索',
  );
  await page.keyboard.press('Escape');
  await settings.getByLabel('联网搜索', { exact: true }).selectOption('on');
  await settings.getByRole('button', { name: '关闭联网设置' }).click();
  await send('P05来源 查证 https://example.com/captcha');
  await expect(page.locator('.chat-message.assistant').last()).toContainText('WEB_CAPTCHA');
  await webSettings();
  await page.getByRole('button', { name: '网页来源', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '网页来源', exact: true })).toContainText(
    '还没有已读取的网页',
  );
});
