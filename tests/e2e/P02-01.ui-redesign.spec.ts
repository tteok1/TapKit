import { openSessionFixture } from './session-fixture';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const evidence = resolve(process.env.TAPKIT_UI_EVIDENCE_DIR ?? 'docs/evidence/UI-redesign');
let app: ElectronApplication | undefined;
const capture = async (page: Page, name: string, fromTop = true) => {
  if (fromTop)
    await page.locator('main').evaluate((el) => {
      el.scrollTop = 0;
    });
  await page.screenshot({ path: join(evidence, name + '.png'), animations: 'disabled' });
};
async function launch(profile?: string, fixture = false) {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = profile ?? (await mkdtemp(resolve('.test-data', 'UI-redesign ')));
  if (fixture) await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      ...(fixture ? { TAPKIT_CHAT_FIXTURE: 'P02-02' } : {}),
    }).filter((r): r is [string, string] => r[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  await size(1440, 900);
  return page;
}
async function size(width: number, height: number) {
  await app!.evaluate(
    ({ BrowserWindow }, dimensions) => BrowserWindow.getAllWindows()[0]!.setSize(...dimensions),
    [width, height] as [number, number],
  );
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.workspace')).toBeVisible();
}
async function centeredDialog(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  const box = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      cx: r.x + r.width / 2,
      cy: r.y + r.height / 2,
      width: innerWidth,
      height: innerHeight,
    };
  });
  expect(box.x).toBeGreaterThan(0);
  expect(box.y).toBeGreaterThan(0);
  expect(box.right).toBeLessThanOrEqual(box.width);
  expect(box.bottom).toBeLessThanOrEqual(box.height);
  expect(Math.abs(box.cx - box.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.cy - box.height / 2)).toBeLessThan(3);
}
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test('P02-01 UI primary Save action remains readable during hover and keyboard press', async () => {
  const page = await launch();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('字体大小', { exact: true }).selectOption('large');
  const save = page.getByRole('button', { name: '保存设置', exact: true });
  await expect(save).toBeEnabled();
  const contrast = () =>
    save.evaluate((el) => {
      const style = getComputedStyle(el);
      const luminance = (color: string) => {
        const components = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const n = value / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          });
        return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
      };
      const foreground = luminance(style.color),
        background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  await save.hover();
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await capture(page, 'save-hover-contrast', false);
  await page.mouse.move(0, 0);
  await save.focus();
  await page.keyboard.down('Space');
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await capture(page, 'save-keyboard-contrast', false);
  await page.keyboard.up('Space');
  await expect(page.getByRole('status')).toHaveText('设置已保存');
});

test('P02-01 UI simplified input keeps keyboard editing reachable at 200 percent', async () => {
  test.setTimeout(180_000);
  const page = await launch();
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page.getByLabel('输入草稿').fill('保留原有草稿与键盘编辑逻辑');
  await page.getByRole('button', { name: '输入与工具信息', exact: true }).click();
  await expect(page.getByRole('region', { name: '输入与工具信息', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '输入与工具信息', exact: true }).click();
  await expect(page.locator('.composer-more')).toHaveCount(0);
  await page.getByLabel('输入草稿').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await expect(page.getByLabel('输入草稿')).toHaveValue('');
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('输入草稿')).toHaveValue('保留原有草稿与键盘编辑逻辑');
  await page.keyboard.press('Control+y');
  await expect(page.getByLabel('输入草稿')).toHaveValue('');
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('light');
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await size(960, 640);
  await page.keyboard.press('Control+n');
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page.getByLabel('输入草稿').fill('在 200% 缩放下，输入和发送操作均可通过键盘到达。');
  await page.getByLabel('输入草稿').scrollIntoViewIfNeeded();
  await page.getByLabel('输入草稿').focus();
  await expect(page.getByLabel('输入草稿')).toBeFocused();
  await capture(page, 'composer-input-960-200', false);
  await fits(page);
});

test('P02-01 UI redesign covers navigation, six project views, settings and diagnostics with actual forms intact', async () => {
  test.setTimeout(180000);
  const page = await launch();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.product-icon')).toBeVisible();
  expect(
    await page.locator('.product-icon').evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await capture(page, 'home-light-1440');
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '项目', exact: true })
    .click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('界面验收项目');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(
    page.locator('main').getByRole('link', { name: '界面验收项目', exact: true }),
  ).toBeVisible();
  await page.locator('main').getByRole('link', { name: '界面验收项目', exact: true }).click();
  for (const [index, name] of ['会话', '任务', '资料', '来源', '成果', '设置'].entries()) {
    await page.locator('.projects-page > nav').getByRole('button', { name, exact: true }).click();
    await expect(
      page.locator('.projects-page > nav').getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await capture(page, 'project-' + index);
  }
  await page.getByRole('link', { name: '设置', exact: true }).click();
  for (const [index, name] of [
    '个人资料',
    '通用',
    '个性化',
    '模型连接',
    '隐私政策',
    '用户协议',
  ].entries()) {
    await page
      .getByRole('navigation', { name: '设置分类' })
      .getByRole('link', { name, exact: true })
      .click();
    await expect(page.locator('.settings-body')).toBeVisible();
    await capture(page, 'settings-' + index);
  }
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('link', { name: '模型连接', exact: true })
    .click();
  await page.locator('main').getByRole('link', { name: 'API Key 账户', exact: true }).click();
  await expect(page.locator('.api-form')).toBeVisible();
  await capture(page, 'api-accounts');
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('link', { name: '模型连接', exact: true })
    .click();
  await page.locator('main').getByRole('link', { name: 'Codex 订阅账户', exact: true }).click();
  await capture(page, 'subscription-accounts');
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('link', { name: '模型与用量', exact: true })
    .click();
  await capture(page, 'models-usage');
  for (const [index, name] of ['聊天', '工作', '项目', '文件'].entries()) {
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name, exact: true })
      .click();
    await capture(page, 'navigation-' + index);
    await fits(page);
  }
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.locator('main')).toContainText('通知');
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('搜索标题与正文')).toBeFocused();
  await centeredDialog(page, '搜索');
  await capture(page, 'search-dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('P02-01 UI redesign preserves full conversation list, send/stop controls, themes and narrow zoom workbench', async () => {
  test.setTimeout(150000);
  const page = await launch(undefined, true);
  await openSessionFixture(page);
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  await expect(page.locator('.chat-messages')).toBeVisible();
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page.getByLabel('输入草稿').fill('请把这份资料整理成三个清晰的要点。');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('隔离测试回复');
  await expect(page.locator('.chat-message.assistant')).not.toContainText('正在回答');
  await expect(page.locator('.history .history-link')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
  await page.locator('.chat-messages').evaluate((el) => {
    el.scrollTop = 0;
  });
  await capture(page, 'conversation-light-1440');
  await page.getByRole('button', { name: '详情面板', exact: true }).click();
  await expect(page.locator('.detail-panel')).toBeVisible();
  await capture(page, 'workbench-light-1440');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'settings-dark-1440');
  await page.getByLabel('主题', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await size(960, 640);
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await capture(page, 'settings-light-960-200');
  await fits(page);
  await page.getByLabel('主题', { exact: true }).scrollIntoViewIfNeeded();
  await capture(page, 'settings-controls-960-200', false);
  await page.keyboard.press('Control+n');
  await page.getByLabel('输入草稿').scrollIntoViewIfNeeded();
  await page.getByLabel('输入草稿').focus();
  await expect(page.getByLabel('输入草稿')).toBeFocused();
  await page.locator('.composer').evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await expect(page.getByLabel('输入草稿')).toBeInViewport({ ratio: 0.25 });
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeInViewport();
  await capture(page, 'composer-light-960-200', false);
  await page.keyboard.press('Control+k');
  await centeredDialog(page, '搜索');
  await capture(page, 'search-dialog-960-200', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '详情面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '关闭详情', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
});

test('P02-01 UI redesign workbench renders existing fixed-version PDF, Markdown, code, sheet, image and ZIP surfaces', async () => {
  test.setTimeout(180000);
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'UI-redesign viewer '));
  const bundle = join(root, 'bundle');
  const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'tests/fixtures/P03-preview.vite.config.ts',
      '--outDir',
      bundle,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  await promisify(execFile)(node, [join(bundle, 'preview.cjs'), root], {
    windowsHide: true,
    timeout: 30000,
  });
  const fixtures = JSON.parse(await readFile(join(root, 'fixtures.json'), 'utf8')) as Record<
    string,
    { fileId: string; versionId: string }
  >;
  const page = await launch(join(root, 'profile'));
  const panel = page.getByRole('region', { name: '文件预览', exact: true });
  for (const name of ['pdf', 'markdown', 'code', 'sheet', 'image', 'zip']) {
    if (await page.locator('.detail-panel').count())
      await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '文件', exact: true })
      .click();
    await page
      .locator('#file-' + fixtures[name]!.fileId)
      .getByRole('button', { name: '排版预览', exact: true })
      .click();
    await expect(panel.locator('.viewer-file')).toHaveAttribute(
      'data-viewer-version',
      fixtures[name]!.versionId,
    );
    if (name === 'pdf')
      await expect(panel.locator('.pdf-scroll canvas')).toHaveAttribute('data-rendered-page', '0');
    if (name === 'markdown')
      await expect(panel.getByRole('heading', { name: '阅读标题', exact: true })).toBeVisible();
    await capture(page, 'viewer-' + name);
    await fits(page);
  }
  await page.locator('.file-name').filter({ hasText: '阅读.md' }).click();
  await centeredDialog(page, '文件详情');
  await capture(page, 'file-details-dialog');
  await page.keyboard.press('Escape');
  await size(1200, 800);
  await capture(page, 'workbench-1200');
  await size(960, 640);
  await capture(page, 'workbench-960');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await expect(page.getByRole('button', { name: '展开侧栏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '文件', exact: true })
    .click();
  await page.locator('.file-name').filter({ hasText: '阅读.md' }).click();
  await centeredDialog(page, '文件详情');
  await capture(page, 'file-details-dialog-960-200', false);
  await page.keyboard.press('Escape');
});
