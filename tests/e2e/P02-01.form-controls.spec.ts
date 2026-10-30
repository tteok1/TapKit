import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopCommand, HistoryCommand, SessionDetails } from '../../packages/contracts/src';
const evidence = resolve('docs/evidence/P02-03/forms-theme-2026-10-23');
const screenshots = resolve(evidence, 'final');
let app: ElectronApplication;
const id = () => {
  const s = randomUUID();
  return s.slice(0, 14) + '7' + s.slice(15);
};
async function launch() {
  await mkdir(evidence, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  const profile = await mkdtemp(resolve('.test-data/forms-theme/profile-'));
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: profile }).filter(
      (v): v is [string, string] => v[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TAPKIT_CHAT_FIXTURE;
  delete env.TAPKIT_TEST_BUILD;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
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
      if (!r.ok) throw Error(r.error.code);
      window.dispatchEvent(new Event('tapkit:history-changed'));
      return r.data;
    },
    { command, payload, desktop, requestId: id() },
  );
}
async function create(page: Page, title: string, mode: 'chat' | 'work' = 'work') {
  return ((await command(page, 'sessions.create', { title, mode }, true)) as { entityId: string })
    .entityId;
}
async function sidebar(page: Page) {
  const open = page.getByRole('button', { name: '展开侧栏', exact: true });
  if (await open.count()) await open.click();
  return page.locator('.sidebar');
}
async function route(page: Page, label: string) {
  await (await sidebar(page)).getByRole('link', { name: label, exact: true }).click();
}
async function settings(page: Page) {
  await route(page, '设置');
  await page.locator('.settings-tabs').getByRole('link', { name: '通用', exact: true }).click();
}
async function size(width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, s) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.unmaximize();
      w.setContentSize(...s);
    },
    [width, height] as [number, number],
  );
}
async function fit(dialog: Locator) {
  await expect(dialog).toBeVisible();
  const r = await dialog.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      right: b.right,
      bottom: b.bottom,
      w: innerWidth,
      h: innerHeight,
      client: e.clientWidth,
      scroll: e.scrollWidth,
    };
  });
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(r.w + 1);
  expect(r.bottom).toBeLessThanOrEqual(r.h + 1);
  expect(r.scroll).toBeLessThanOrEqual(r.client + 1);
  return r;
}
async function fieldFocus(field: Locator) {
  await field.focus();
  const s = await field.evaluate((e) => {
    const c = getComputedStyle(e);
    return {
      outline: c.outlineStyle,
      shadow: c.boxShadow,
      border: c.borderColor,
      expected: getComputedStyle(document.querySelector('.desktop-shell')!)
        .getPropertyValue('--border')
        .trim(),
    };
  });
  expect(s.outline).toBe('none');
  expect(s.shadow).not.toBe('none');
  return s;
}
async function rowGeometry(row: Locator) {
  return row.evaluate((e) => {
    const r = (s: string) => e.querySelector(s)!.getBoundingClientRect();
    const t = r('.history-session-title'),
      m = r('small'),
      a = r('.session-row-actions'),
      check = r('input');
    const c = getComputedStyle(e.querySelector('.history-link')!);
    return {
      title: t.toJSON(),
      meta: m.toJSON(),
      actions: a.toJSON(),
      check: check.toJSON(),
      border: c.borderWidth,
      background: c.backgroundColor,
      separator: getComputedStyle(e, '::after').backgroundImage,
      scroll: e.scrollWidth,
      client: e.clientWidth,
    };
  });
}
test.afterEach(async () => {
  await app?.close();
});
for (const [width, height, zoom, theme] of [
  [1440, 900, 1, 'light'],
  [1440, 900, 1, 'dark'],
  [960, 640, 1, 'light'],
  [960, 640, 2, 'dark'],
] as const) {
  test(`P02-01 themed forms preserve native choices and fit ${width}x${height} ${zoom} ${theme}`, async () => {
    test.setTimeout(180000);
    const page = await launch();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await size(width, height);
    await settings(page);
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    const groupId = (
      (await command(page, 'sidebar.create', { name: '圆角表单分组' })) as { entityId: string }
    ).entityId;
    const projectId = (
      (await command(page, 'projects.create', { name: '本地界面验证项目' }, true)) as {
        entityId: string;
      }
    ).entityId;
    const sessionId = await create(page, '主题与列表验证');
    await route(page, '工作');
    const list = page.locator('main .history-page');
    const row = list.locator(`[data-session-id="${sessionId}"]`);
    await expect(row).toBeVisible();
    const geometry = await rowGeometry(row);
    expect(geometry.border).toBe('0px');
    expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
    expect(geometry.separator).toContain('linear-gradient');
    expect(
      Math.abs(
        geometry.title.y + geometry.title.height / 2 - (geometry.meta.y + geometry.meta.height / 2),
      ),
    ).toBeLessThan(2);
    expect(geometry.meta.x).toBeGreaterThanOrEqual(geometry.title.right);
    expect(geometry.actions.x).toBeGreaterThanOrEqual(geometry.meta.right);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    await page.screenshot({ path: resolve(screenshots, `list-${width}-${zoom}-${theme}.png`) });
    await row.getByRole('button', { name: '会话信息主题与列表验证', exact: true }).click();
    const dialog = list.getByRole('dialog');
    const bounds = await fit(dialog);
    const focus = await fieldFocus(dialog.getByLabel('会话标题', { exact: true }));
    await dialog.getByLabel('会话标题', { exact: true }).fill('保存后的主题会话');
    await fieldFocus(dialog.getByLabel('会话备注', { exact: true }));
    await dialog.getByLabel('会话备注', { exact: true }).fill('表单样式验证，不调用任何模型。');
    const checkbox = dialog.getByRole('checkbox');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveCSS('border-radius', '50%');
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    const group = dialog.getByRole('combobox', { name: '分组', exact: true });
    await group.selectOption(groupId);
    await expect(group).toHaveValue(groupId);
    await expect(group).toHaveCSS('appearance', 'base-select');
    const project = dialog.getByRole('combobox', { name: '移入项目', exact: true });
    await project.scrollIntoViewIfNeeded();
    await project.click();
    expect(await project.evaluate((e) => e.matches(':open'))).toBe(true);
    const option = project.getByRole('option', { name: '本地界面验证项目', exact: true });
    await expect(option).toBeVisible();
    const picker = await project.evaluate((e) => {
      const c = getComputedStyle(e, '::picker(select)');
      const r = e.querySelector('option:last-child')!.getBoundingClientRect();
      return {
        appearance: c.appearance,
        radius: c.borderRadius,
        background: c.backgroundColor,
        border: c.borderColor,
        box: r.toJSON(),
        w: innerWidth,
        h: innerHeight,
      };
    });
    expect(picker.appearance).toBe('base-select');
    expect(picker.radius).toBe('16px');
    expect(picker.box.right).toBeLessThanOrEqual(picker.w + 1);
    expect(picker.box.bottom).toBeLessThanOrEqual(picker.h + 1);
    await page.screenshot({ path: resolve(screenshots, `picker-${width}-${zoom}-${theme}.png`) });
    await option.click();
    await expect(project).toHaveValue(projectId);
    await project.focus();
    await page.keyboard.press('Space');
    expect(await project.evaluate((e) => e.matches(':open'))).toBe(true);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(project).toHaveValue('');
    await page.keyboard.press('Space');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(project).toHaveValue(projectId);
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    await save.scrollIntoViewIfNeeded();
    const pills = await dialog.locator('.action-group > button').evaluateAll((es) =>
      es.map((e) => {
        const s = getComputedStyle(e);
        return {
          radius: s.borderRadius,
          rect: e.getBoundingClientRect().toJSON(),
          gap: getComputedStyle(e.parentElement!).columnGap,
        };
      }),
    );
    expect(pills.length).toBe(5);
    for (const p of pills) {
      expect(p.radius).toBe('999px');
      expect(p.gap).toBe('10px');
    }
    await fit(dialog);
    await page.screenshot({ path: resolve(screenshots, `form-${width}-${zoom}-${theme}.png`) });
    await save.click();
    await expect(dialog).toHaveCount(0);
    const details = (await command(page, 'sessions.get', { sessionId })) as SessionDetails;
    expect(details.session.title).toBe('保存后的主题会话');
    expect(details.session.note).toContain('不调用任何模型');
    expect(details.session.projectId).toBe(projectId);
    expect(details.session.sectionId).toBe(groupId);
    await row.getByRole('button', { name: '会话信息保存后的主题会话', exact: true }).click();
    await dialog.getByLabel('会话标题', { exact: true }).fill('取消后不应保存');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect(
      ((await command(page, 'sessions.get', { sessionId })) as SessionDetails).session.title,
    ).toBe('保存后的主题会话');
    await writeFile(
      resolve(evidence, `geometry-${width}-${zoom}-${theme}.json`),
      JSON.stringify({ bounds, focus, picker, pills, geometry, errors }, null, 2),
    );
    expect(errors).toEqual([]);
  });
}
test('P02-01 global controls share styles across settings models files projects memory and search', async () => {
  test.setTimeout(180000);
  const page = await launch();
  await size(1440, 900);
  await settings(page);
  const samples: object[] = [];
  async function audit(name: string) {
    const controls = await page.locator('main select').evaluateAll((es) =>
      es.map((e) => ({
        label: e.getAttribute('aria-label') ?? e.closest('label')?.textContent?.trim().slice(0, 45),
        appearance: getComputedStyle(e).appearance,
        disabled: (e as HTMLSelectElement).disabled,
      })),
    );
    for (const c of controls) expect(c.appearance).toBe('base-select');
    const checks = await page.locator('main input[type="checkbox"]').evaluateAll((es) =>
      es.map((e) => ({
        type: (e as HTMLInputElement).type,
        radius: getComputedStyle(e).borderRadius,
      })),
    );
    for (const c of checks) {
      expect(c.type).toBe('checkbox');
      expect(c.radius).toBe('50%');
    }
    samples.push({ name, controls, checks });
  }
  await audit('settings');
  await expect(page.getByRole('combobox', { name: '界面语言', exact: true })).toBeDisabled();
  await page.locator('.settings-tabs').getByRole('link', { name: '个人资料', exact: true }).click();
  await fieldFocus(page.getByLabel('昵称', { exact: true }));
  await audit('personal');
  await page
    .locator('.settings-tabs')
    .getByRole('link', { name: '模型与用量', exact: true })
    .click();
  await expect(page.locator('.model-settings')).toBeVisible();
  await audit('models');
  await page.screenshot({ path: resolve(screenshots, 'models-controls.png') });
  await route(page, '文件');
  await expect(page.locator('.file-library')).toBeVisible();
  await audit('files');
  await page.locator('.file-filters input').first().fill('synthetic');
  await fieldFocus(page.locator('.file-filters input').first());
  const checks = page.locator('.file-filters input[type="checkbox"]');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(checks.nth(0)).toBeChecked();
  await expect(checks.nth(1)).toBeChecked();
  await checks.nth(1).uncheck();
  await checks.nth(0).uncheck();
  await page.screenshot({ path: resolve(screenshots, 'files-controls.png') });
  await route(page, '项目');
  await expect(page.locator('.projects-page')).toBeVisible();
  await audit('projects');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: '搜索', exact: true });
  await expect(search).toBeVisible();
  const scope = search.getByRole('combobox', { name: '搜索范围', exact: true });
  await expect(scope).toHaveCSS('appearance', 'base-select');
  await scope.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(scope).toHaveValue('all');
  await page.keyboard.press('Escape');
  await route(page, '设置');
  await page.locator('.settings-tabs').getByRole('link', { name: '个性化', exact: true }).click();
  await expect(page.locator('.memory-manager')).toBeVisible();
  await audit('memory');
  await page.screenshot({ path: resolve(screenshots, 'memory-controls.png') });
  await writeFile(resolve(evidence, 'global-controls.json'), JSON.stringify(samples, null, 2));
});
test('P02-03 circular multi-selection retains batch archive restore and delete preview', async () => {
  test.setTimeout(180000);
  const page = await launch();
  await size(1440, 900);
  const a = await create(page, '批量会话甲', 'chat'),
    b = await create(page, '批量会话乙', 'chat');
  await route(page, '聊天');
  const list = page.locator('main .history-page');
  await expect(list.locator('.history-row')).toHaveCount(2);
  for (const sid of [a, b])
    await list.locator(`[data-session-id="${sid}"]`).getByRole('checkbox').check();
  await expect(list.locator('.history-batch')).toContainText('已选 2');
  await list.locator('.history-batch').getByRole('button', { name: '归档', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(0);
  await list.locator('.history-filters').getByRole('button', { name: '归档', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(2);
  for (const sid of [a, b])
    await list.locator(`[data-session-id="${sid}"]`).getByRole('checkbox').check();
  await list
    .locator('.history-batch')
    .getByRole('button', { name: '取消归档', exact: true })
    .click();
  await expect(list.locator('.history-row')).toHaveCount(0);
  await list.locator('.history-filters').getByRole('button', { name: '最近', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(2);
  await list.locator(`[data-session-id="${a}"]`).getByRole('checkbox').check();
  await list
    .locator('.history-batch')
    .getByRole('button', { name: '移入回收站', exact: true })
    .click();
  const preview = page.getByRole('dialog');
  await expect(preview).toBeVisible();
  await fit(preview);
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(2);
});
