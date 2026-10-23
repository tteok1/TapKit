import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopCommand, HistoryCommand } from '../../packages/contracts/src';

const evidence = resolve('docs/evidence/P02-03/group-tooltips-2026-10-22');
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

test('P02-01 refinements: mode hints stay below, all controls share rounded hints and recommendations have no arrow', async () => {
  test.setTimeout(240_000);
  const page = await launch();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const samples = [];
  for (const [width, height, zoom, theme] of [
    [1440, 900, 1, 'light'],
    [960, 640, 1, 'dark'],
    [960, 640, 2, 'dark'],
  ] as const) {
    await setSize(width, height);
    await showSidebar(page);
    await page.locator('.sidebar-footer').getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    const close = page.getByRole('button', { name: '收起侧栏', exact: true });
    if (await close.count()) await close.click();
    await page.keyboard.press('Control+n');
    const radio = page.getByRole('radio', { name: '临时聊天', exact: true });
    await radio.scrollIntoViewIfNeeded();
    await radio.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('一次性讨论');
    const geometry = await page.evaluate(() => {
      const mode = document.querySelector('.start-modes')!.getBoundingClientRect();
      const heading = document.querySelector('.start-heading h1')!.getBoundingClientRect();
      const tip = document.querySelector('[role="tooltip"]')!.getBoundingClientRect();
      return {
        gap: mode.top - heading.bottom,
        tip: { top: tip.top, left: tip.left, right: tip.right, bottom: tip.bottom },
        modeBottom: mode.bottom,
        viewport: [innerWidth, innerHeight],
      };
    });
    expect(geometry.gap).toBeGreaterThanOrEqual(height > 720 ? 35 : 19);
    expect(geometry.tip.top).toBeGreaterThanOrEqual(geometry.modeBottom);
    expect(geometry.tip.left).toBeGreaterThanOrEqual(0);
    expect(geometry.tip.right).toBeLessThanOrEqual(geometry.viewport[0]!);
    await expect(tooltip).toHaveCSS('border-radius', '10px');
    await expect(page.locator('.start-questions .ui-icon')).toHaveCount(0);
    await page.screenshot({
      path: resolve(evidence, `settings-mode-hint-${width}-${zoom}-${theme}.png`),
    });
    await page.keyboard.press('Escape');
    const send = page.getByRole('button', { name: '发送', exact: true });
    await expect(send).toBeDisabled();
    await send.hover();
    await expect(tooltip).toHaveText('连接模型后发送');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveCSS('border-radius', '10px');
    await page.screenshot({
      path: resolve(evidence, `settings-send-hint-${width}-${zoom}-${theme}.png`),
    });
    await page.keyboard.press('Escape');
    await showSidebar(page);
    const settings = page
      .locator('.sidebar-footer')
      .getByRole('link', { name: '设置', exact: true });
    await page.getByLabel('输入草稿', { exact: true }).focus();
    await settings.focus();
    await expect(tooltip).toHaveText('设置');
    await expect(tooltip).toBeVisible();
    await expect(settings).toHaveAttribute('aria-describedby', /.+/);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(settings).not.toHaveAttribute('aria-describedby');
    // Every native hint authored by the renderer was migrated; iframe's title names its document.
    await expect(page.locator('[title]:not(iframe)')).toHaveCount(0);
    samples.push({ width, height, zoom, theme, ...geometry });
  }
  await writeFile(
    resolve(evidence, 'settings-hint-geometry.json'),
    JSON.stringify(samples, null, 2),
  );
  expect(errors).toEqual([]);
});

test('P02-01 refinements: group arrow controls its own paginated sessions and menu labels stay in one row', async () => {
  test.setTimeout(240_000);
  const page = await launch();
  await setSize(1440, 900);
  const name = '分组里包含很长很长的文字仍然保持在同一行';
  const groupId = ((await command(page, 'sidebar.create', { name })) as { entityId: string })
    .entityId;
  const ids = [];
  for (let i = 0; i < 53; i++) ids.push(await create(page, '分组分页会话 ' + i));
  const ungrouped = await create(page, '未分组会话');
  await command(page, 'sessions.move', { sessionIds: ids, sectionId: groupId });
  await showSidebar(page);
  const sidebar = page.locator('.sidebar');
  const group = sidebar.locator(`[data-section-id="${groupId}"]`);
  const header = group.locator('.history-group-header');
  const arrow = header.getByRole('button', { name: '折叠分组' + name, exact: true });
  await expect(arrow).toHaveAttribute('aria-expanded', 'true');
  await expect(group.locator('.history-row')).toHaveCount(50);
  await expect(sidebar.locator(`[data-session-id="${ungrouped}"]`)).toHaveCount(1);
  const aligned = await header.locator('button').evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, center: r.y + r.height / 2 };
    }),
  );
  expect(
    Math.max(...aligned.map((r) => r.center)) - Math.min(...aligned.map((r) => r.center)),
  ).toBeLessThanOrEqual(1);
  await header.screenshot({ path: resolve(evidence, 'group-header.png') });
  await group.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(group.locator('.history-row')).toHaveCount(53);
  await expect(sidebar.locator('.history-row')).toHaveCount(54);
  await arrow.click();
  await expect(group.locator('.history-row')).toHaveCount(0);
  await expect(sidebar.locator('.history-row')).toHaveCount(1);
  await header.getByRole('button', { name: '展开分组' + name, exact: true }).click();
  await expect(group.locator('.history-row')).toHaveCount(50);
  await header.getByRole('button', { name: '折叠分组' + name, exact: true }).click();
  await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  const menu = page.getByRole('region', { name: '会话列表选项', exact: true });
  async function inline(buttonName: string) {
    const b = menu.getByRole('button', { name: buttonName, exact: true });
    const parts = await b.locator(':scope > svg,:scope > span').evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, right: r.right, center: r.y + r.height / 2 };
      }),
    );
    expect(
      Math.max(...parts.map((r) => r.center)) - Math.min(...parts.map((r) => r.center)),
    ).toBeLessThanOrEqual(1);
    return parts;
  }
  await inline('新建分组');
  await inline('会话排列顺序');
  await menu.screenshot({ path: resolve(evidence, 'recent-menu.png') });
  await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  await inline('会话排列顺序');
  const selected = await inline('最近更新');
  expect(selected[1]!.x).toBeGreaterThan(selected[0]!.right);
  await menu.screenshot({ path: resolve(evidence, 'sort-menu.png') });
  await menu.getByRole('button', { name: '手动排序', exact: true }).click();
  await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  await expect(menu.getByRole('button', { name: '手动排序', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const manual = await inline('手动排序');
  expect(manual[1]!.x).toBeGreaterThan(manual[0]!.right);
  await page.keyboard.press('Escape');
  const saved = profile;
  await app.close();
  const reopened = await launch(saved);
  await showSidebar(reopened);
  const restored = reopened.locator(`.sidebar [data-section-id="${groupId}"]`);
  await expect(restored.locator('.history-row')).toHaveCount(0);
  await expect(
    restored.getByRole('button', { name: '展开分组' + name, exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await restored.getByRole('button', { name: '展开分组' + name, exact: true }).click();
  await expect(restored.locator('.history-row')).toHaveCount(50);
  await expect(reopened.locator('.sidebar .history-row')).toHaveCount(51);
  await writeFile(
    resolve(evidence, 'group-geometry.json'),
    JSON.stringify(
      { aligned, grouped: 53, initialPage: 50, root: 1, collapsePersisted: true },
      null,
      2,
    ),
  );
});
