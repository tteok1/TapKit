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
import type { DesktopCommand, HistoryCommand, SessionPage } from '../../packages/contracts/src';

const evidence = resolve('docs/evidence/P02-03/shell-details-2026-10-22');
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
async function sort(page: Page, label: '最近更新' | '手动排序') {
  const sidebar = page.locator('.sidebar');
  await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  const menu = page.getByRole('region', { name: '会话列表选项', exact: true });
  await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  await menu.getByRole('button', { name: label, exact: true }).click();
}
test.afterEach(async () => {
  await app?.close();
});

test('P02-01 shell details home alignment, rounded controls, icon hints and full sidebar collapse', async () => {
  test.setTimeout(240_000);
  const page = await launch();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setSize(1440, 900);
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
  for (const label of ['首页', 'TapKit 首页'])
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  for (const label of ['后退', '前进'])
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  await expect(sidebar.locator('nav').getByText('搜索', { exact: true })).toHaveCount(0);
  await expect(sidebar.locator('nav').getByText('通知', { exact: true })).toHaveCount(0);
  for (const label of ['最近', '归档', '回收站', '全部', '默认列表'])
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  const bell = sidebar.getByRole('button', { name: '通知', exact: true }),
    search = sidebar.getByRole('button', { name: '搜索', exact: true });
  expect((await bell.boundingBox())!.x).toBeLessThan((await search.boundingBox())!.x);
  await search.hover();
  await expect(page.getByRole('tooltip', { name: '搜索（Ctrl+K）', exact: true })).toBeVisible();
  await search.click();
  await expect(page.getByRole('dialog', { name: '搜索', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await bell.click();
  await expect(page.locator('main')).toContainText('通知');
  await page.keyboard.press('Control+n');
  const samples = [];
  for (const [width, height, zoom, theme] of [
    [1440, 900, 1, 'light'],
    [960, 640, 1, 'light'],
    [1440, 900, 2, 'dark'],
    [960, 640, 2, 'dark'],
  ] as const) {
    await setSize(width, height);
    await showSidebar(page);
    await sidebar.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    // Narrow layouts expose the sidebar as a drawer; close it before checking the workspace.
    const close = page.getByRole('button', { name: '收起侧栏', exact: true });
    if (await close.count()) await close.click();
    await page.keyboard.press('Control+n');
    await expect(sidebar).toBeHidden();
    const bounds = await page.evaluate(() => {
      const b = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect().toJSON();
      const questions = [...document.querySelectorAll('.start-questions button')];
      return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        input: b('.composer'),
        questions: b('.start-questions'),
        last: questions.at(-1)!.getBoundingClientRect().toJSON(),
        toggle: b('.suggestions-toggle'),
        workspace: b('.workspace'),
        shell: b('.desktop-shell'),
        padding:
          parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).paddingLeft) *
          parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).zoom),
        scroll: b('.start-page-scroll'),
        radius: getComputedStyle(questions[0]!).borderRadius,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(bounds.overflow).toBe(false);
    expect(Math.abs(bounds.workspace.x - bounds.shell.x - bounds.padding)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(bounds.workspace.width - bounds.shell.width + bounds.padding * 2),
    ).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds.questions.x - bounds.input.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds.toggle.right - bounds.input.right)).toBeLessThanOrEqual(2);
    expect(parseFloat(bounds.radius)).toBeGreaterThanOrEqual(100);
    if (zoom === 1) {
      expect(bounds.input.top - bounds.last.bottom).toBeGreaterThanOrEqual(8);
      expect(bounds.input.top - bounds.last.bottom).toBeLessThanOrEqual(24);
    }
    await page.screenshot({
      path: resolve(evidence, `home-final-${width}-${zoom}-${theme}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
    await expect(sidebar).toBeHidden();
    samples.push({ width, height, zoom, theme, ...bounds });
  }
  await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  expect(errors).toEqual([]);
});

test('P02-01 shell details manual drag sorting persists per group and launch returns home', async () => {
  test.setTimeout(240_000);
  let page = await launch();
  await setSize(1440, 900);
  const a = await create(page, '排序会话甲'),
    b = await create(page, '排序会话乙'),
    c = await create(page, '另一组会话');
  const group = (
    (await command(page, 'sidebar.create', { name: '独立分组' })) as { entityId: string }
  ).entityId;
  const other = (
    (await command(page, 'sidebar.create', { name: '另一分组' })) as { entityId: string }
  ).entityId;
  await command(page, 'sessions.move', { sessionIds: [a, b], sectionId: group });
  await command(page, 'sessions.move', { sessionIds: [c], sectionId: other });
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.locator('.history-row')).toHaveCount(3);
  await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  await page
    .getByRole('region', { name: '会话列表选项', exact: true })
    .getByRole('button', { name: '会话排列顺序', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: '会话列表选项', exact: true })
      .getByRole('button', { name: '最近更新', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await sort(page, '手动排序');
  const groupRows = sidebar.locator(`[data-section-id="${group}"]`);
  await expect(
    groupRows.getByRole('button', { name: '折叠分组独立分组', exact: true }),
  ).toBeEnabled();
  await expect(groupRows.locator('.history-row')).toHaveCount(2);
  const before = await groupRows
    .locator('.history-row')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id')!));
  await groupRows
    .locator(`[data-session-id="${before[1]}"]`)
    .dragTo(groupRows.locator(`[data-session-id="${before[0]}"]`));
  await expect
    .poll(() =>
      groupRows
        .locator('.history-row')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
    )
    .toEqual([...before].reverse());
  const after = [...before].reverse();
  await groupRows.locator(`[data-session-id="${after[1]}"] .history-link`).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect
    .poll(() =>
      groupRows
        .locator('.history-row')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
    )
    .toEqual(before);
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(() =>
      groupRows
        .locator('.history-row')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
    )
    .toEqual(after);
  expect(
    (
      (await command(page, 'sessions.list', { sectionId: other, sort: 'manual' })) as SessionPage
    ).sessions.map((s) => s.id),
  ).toEqual([c]);
  const row = sidebar.locator(`[data-session-id="${after[0]}"]`);
  await page.getByLabel('输入草稿', { exact: true }).focus();
  await page.mouse.move(1300, 100);
  await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  await row.getByRole('button', { name: /^置顶/ }).focus();
  await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  await row.getByRole('button', { name: /^置顶/ }).click();
  await row.getByRole('button', { name: /^取消置顶/ }).click();
  await row.locator('.history-link').click();
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', after[0]!);
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  const saved = profile;
  await app.close();
  page = await launch(saved);
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: '侧栏', exact: true })).toBeHidden();
  await showSidebar(page);
  await expect
    .poll(() =>
      page
        .locator(`[data-section-id="${group}"] .history-row`)
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
    )
    .toEqual(after);
  const settings = await page.evaluate(async (requestId) => {
    const r = await window.tapkit.bootstrap({ requestId });
    if (!r.ok || !('profile' in r.data)) throw new Error('BOOT');
    return r.data.settings.values.desktop.historySort;
  }, requestId());
  expect(settings).toBe('manual');
  await sort(page, '最近更新');
  // Explicit Open in new window continues to honor the entity route.
  const next = app.waitForEvent('window');
  await page.evaluate(async (id) => window.tapkit.openEntity({ type: 'session', id }), a);
  const second = await next;
  await expect(second.locator('.chat-surface')).toHaveAttribute('data-session-id', a, {
    timeout: 125_000,
  });
  await page.screenshot({ path: resolve(evidence, 'sidebar-manual.png') });
});

test('P02-01 shell details settings archive and trash pages search, restore and confirm permanent deletion', async () => {
  test.setTimeout(240_000);
  const page = await launch();
  await setSize(1440, 900);
  const a = await create(page, '归档筛选甲'),
    b = await create(page, '归档筛选乙', 'work'),
    c = await create(page, '回收站恢复');
  await command(page, 'sessions.archive', { sessionIds: [a, b], archived: true });
  await command(page, 'sessions.trash', { sessionIds: [c] });
  await page.getByRole('link', { name: '设置', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '设置分类', exact: true });
  await nav.getByRole('link', { name: '已归档的聊天', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已归档的聊天', exact: true })).toBeVisible();
  const list = page.locator('.history-settings');
  await expect(list.locator('.history-row')).toHaveCount(2);
  await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('甲');
  await expect(list.locator('.history-row')).toHaveCount(1);
  await list.getByRole('button', { name: '取消归档', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(0);
  await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('');
  await page.getByLabel('会话类型', { exact: true }).selectOption('work');
  await expect(list.locator('.history-row')).toHaveCount(1);
  await page.screenshot({ path: resolve(evidence, 'settings-archive-final.png') });
  await list.getByRole('button', { name: '移入回收站归档筛选乙', exact: true }).click();
  const impact = page.getByRole('dialog', { name: '记忆删除影响', exact: true });
  await expect(impact).toBeVisible();
  await impact.getByRole('button', { name: '删除会话并处理记忆', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(0);
  await nav.getByRole('link', { name: '回收站', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(2);
  await list
    .locator(`[data-session-id="${c}"]`)
    .getByRole('button', { name: '恢复', exact: true })
    .click();
  await expect(list.locator(`[data-session-id="${c}"]`)).toHaveCount(0);
  await list.getByRole('button', { name: '永久删除归档筛选乙', exact: true }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm).toContainText('永久');
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(1);
  await list.getByRole('button', { name: '永久删除归档筛选乙', exact: true }).click();
  await confirm.getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(0);
  await expect(list).toContainText('回收站是空的');
  expect(
    ((await command(page, 'sessions.list', { state: 'active' })) as SessionPage).sessions
      .map((s) => s.id)
      .sort(),
  ).toEqual([a, c].sort());
  await page.screenshot({ path: resolve(evidence, 'settings-trash-final.png') });
});
