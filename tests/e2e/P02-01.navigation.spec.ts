import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopCommand, HistoryCommand } from '../../packages/contracts/src';

const evidence = resolve('docs/evidence/P02-03/navigation-icons-2026-10-23');
let app: ElectronApplication, profile: string;
const requestId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
async function launch(existing?: string) {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  profile = existing ?? (await mkdtemp(resolve('.test-data/P02-01 shell details ')));
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: profile }).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  return page;
}
async function command(
  page: Page,
  command: HistoryCommand | DesktopCommand,
  payload: object = {},
  desktop = false,
) {
  return page.evaluate(
    async ({ command, payload, desktop, requestId }) => {
      const r = desktop
        ? await window.tapkit.desktopCommand({ requestId }, command as DesktopCommand, payload)
        : await window.tapkit.historyCommand({ requestId }, command as HistoryCommand, payload);
      if (!r.ok) throw new Error(r.error.code);
      window.dispatchEvent(new Event('tapkit:history-changed'));
      return r.data;
    },
    { command, payload, desktop, requestId: requestId() },
  );
}
async function create(page: Page, title: string, mode: 'chat' | 'work' = 'chat') {
  return ((await command(page, 'sessions.create', { title, mode }, true)) as { entityId: string })
    .entityId;
}
async function setSize(width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, dimensions) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.unmaximize();
      w.setContentSize(...dimensions);
    },
    [width, height] as [number, number],
  );
}
async function showSidebar(page: Page) {
  const expand = page.getByRole('button', { name: '展开侧栏', exact: true });
  if (await expand.count()) await expand.click();
}
test.afterEach(async () => {
  await app?.close();
});

async function order(page: Page) {
  return page
    .getByRole('navigation', { name: '主导航', exact: true })
    .locator('[data-navigation-key]')
    .evaluateAll((nodes) => nodes.map((el) => el.getAttribute('data-navigation-key')));
}
async function hold(page: Page, key: string) {
  const link = page.locator(`[data-navigation-key="${key}"]`);
  await link.scrollIntoViewIfNeeded();
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(link).toHaveClass(/navigation-dragging/);
  return link;
}
async function dragFirst(page: Page, key: string) {
  const link = await hold(page, key);
  const target = page.locator('[data-navigation-key]').first();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 2, { steps: 12 });
  await expect.poll(() => link.evaluate((el) => getComputedStyle(el).order)).toBe('0');
  await page.mouse.up();
  await expect(link).not.toHaveClass(/navigation-dragging/);
}

test('P02-01 navigation long press reorders without opening a page, and persists on restart', async () => {
  test.setTimeout(180_000);
  let page = await launch();
  await setSize(1440, 900);
  await showSidebar(page);
  const nav = page.getByRole('navigation', { name: '主导航', exact: true });
  await expect(nav.locator('details,input[type=checkbox]')).toHaveCount(0);
  await expect(page.getByText('调整导航入口', { exact: true })).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(['chats', 'work', 'projects', 'files']);
  // Ordinary clicks still navigate, with no hold or reorder state.
  await nav.getByRole('link', { name: '聊天', exact: true }).click();
  await expect(nav.getByRole('link', { name: '聊天', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await dragFirst(page, 'files');
  await expect.poll(() => order(page)).toEqual(['files', 'chats', 'work', 'projects']);
  await expect(nav.getByRole('link', { name: '聊天', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: '文件', exact: true })).not.toHaveAttribute(
    'aria-current',
  );
  const sid = await create(page, '图标检查会话');
  await page.locator('.sidebar-footer').getByRole('link', { name: '设置', exact: true }).click();
  const settings = page.getByRole('navigation', { name: '设置分类', exact: true });
  await expect(settings.locator('svg')).toHaveCount(0);
  await settings.getByRole('link', { name: '用户协议', exact: true }).click();
  await expect(page.getByRole('heading', { name: '用户协议', exact: true })).toBeVisible();
  await page.locator(`[data-session-id="${sid}"]`).hover();
  await page.screenshot({ path: resolve(evidence, 'rounded-icons-light.png') });
  await page.locator('.sidebar').screenshot({ path: resolve(evidence, 'sidebar-icons-light.png') });
  const saved = profile;
  await app.close();
  page = await launch(saved);
  await showSidebar(page);
  await expect.poll(() => order(page)).toEqual(['files', 'chats', 'work', 'projects']);
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
});

test('P02-01 navigation cancels early moves and Escape, supports keyboard sorting and restores hidden entries', async () => {
  test.setTimeout(180_000);
  const page = await launch();
  await setSize(1440, 900);
  await page.evaluate(() => {
    const key = 'tapkit.layout.' + window.tapkit.windowSlot;
    const layout = JSON.parse(localStorage.getItem(key)!);
    layout.navigation = ['files', 'notifications', 'chats'];
    localStorage.setItem(key, JSON.stringify(layout));
  });
  await page.reload();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  await showSidebar(page);
  await expect.poll(() => order(page)).toEqual(['files', 'chats', 'work', 'projects']);
  const original = await order(page);
  const file = page.locator('[data-navigation-key="files"]');
  await file.scrollIntoViewIfNeeded();
  const start = (await file.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + start.height / 2 + 20, { steps: 2 });
  await page.mouse.up();
  await expect(file).not.toHaveClass(/navigation-dragging/);
  await expect.poll(() => order(page)).toEqual(original);
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
  const project = await hold(page, 'projects');
  const top = (await file.boundingBox())!;
  await page.mouse.move(top.x + 20, top.y + 2, { steps: 8 });
  await expect.poll(() => project.evaluate((el) => getComputedStyle(el).order)).toBe('0');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(original);
  await expect(project).not.toHaveClass(/navigation-dragging/);
  await project.focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => order(page)).toEqual(['files', 'chats', 'projects', 'work']);
  await expect(project).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(project).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('navigation', { name: '主导航', exact: true }).locator('[data-navigation-key]'),
  ).toHaveCount(4);
  await expect(page.getByRole('link', { name: '收藏', exact: true })).toHaveCount(0);
});

test('P02-01 navigation rounded icons and long press remain usable in a narrow dark 200 percent drawer', async () => {
  test.setTimeout(180_000);
  const page = await launch();
  await setSize(960, 640);
  await showSidebar(page);
  await page.locator('.sidebar-footer').getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await showSidebar(page);
  await dragFirst(page, 'files');
  await expect.poll(() => order(page)).toEqual(['files', 'chats', 'work', 'projects']);
  await expect(page.getByRole('heading', { name: '通用', exact: true })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '设置分类', exact: true }).locator('svg'),
  ).toHaveCount(0);
  const sidebar = page.locator('.sidebar');
  for (const link of await sidebar.locator('[data-navigation-key]').all()) {
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport({ ratio: 0.98 });
  }
  await page.screenshot({ path: resolve(evidence, 'rounded-icons-dark-200.png') });
  await sidebar.screenshot({ path: resolve(evidence, 'sidebar-icons-dark-200.png') });
  await writeFile(
    resolve(evidence, 'navigation-geometry.json'),
    JSON.stringify(
      await page.locator('[data-navigation-key]').evaluateAll((nodes) =>
        nodes.map((el) => ({
          key: el.getAttribute('data-navigation-key'),
          box: el.getBoundingClientRect().toJSON(),
        })),
      ),
      null,
      2,
    ),
  );
});
