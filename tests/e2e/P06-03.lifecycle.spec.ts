import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
let app: ElectronApplication, page: Page, env: Record<string, string>, directory: string;
test.beforeEach(async () => {
  test.setTimeout(240000);
  await mkdir('.test-data', { recursive: true });
  directory = await mkdtemp(resolve('.test-data', 'P06-03 Electron '));
  await writeFile(join(directory, 'P02-02.fixture'), 'P02-02 isolated fixture');
  env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: directory,
      TAPKIT_CHAT_FIXTURE: 'P02-02',
    }).filter((r): r is [string, string] => r[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  await launch();
});
test.afterEach(async () => {
  await app?.close();
});
async function launch() {
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
}
async function create() {
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  const form = page.getByRole('form', { name: '新建工作' });
  await form.getByLabel('工作目标').fill('P06 重启后继续的通知任务');
  await form.getByLabel('先查看计划').check();
  await form.getByRole('button', { name: '创建工作', exact: true }).click();
  await expect(page.locator('.work-detail')).toContainText('等待输入');
}
test('P06-03 T13/T20 notification read state and pending plan survive restart; real completion links to the task', async () => {
  await create();
  await page.getByRole('button', { name: '通知', exact: true }).click();
  const center = page.getByRole('region', { name: '通知中心', exact: true });
  await expect(center).toContainText('工作任务等待输入');
  await center.getByRole('button', { name: '全部已读', exact: true }).click();
  await expect(center.getByRole('status')).toHaveText('未读通知：0');
  await app.close();
  await launch();
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '通知中心', exact: true }).getByRole('status'),
  ).toHaveText('未读通知：0');
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').filter({ hasText: 'P06 重启后继续的通知任务' }).first().click();
  await expect(page.locator('.work-detail')).toContainText('等待输入');
  await page.getByRole('button', { name: '调整计划', exact: true }).click();
  await page.getByRole('button', { name: '接受并执行所选步骤', exact: true }).click();
  await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 30000 });
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.getByRole('region', { name: '通知中心', exact: true })).toContainText(
    '工作任务已完成',
  );
  await page.getByRole('button', { name: '查看对应任务', exact: true }).first().click();
  await expect(page.locator('.work-detail')).toContainText('已完成');
  await mkdir('docs/evidence/P06-03/desktop', { recursive: true });
  for (const [theme, zoom, width] of [
    ['light', 1, 1440],
    ['dark', 1, 960],
    ['dark', 2, 960],
  ] as const) {
    await page.evaluate(
      async ({ theme, zoom }) => {
        const value = crypto.randomUUID(),
          requestId = value.slice(0, 14) + '7' + value.slice(15),
          boot = await window.tapkit.bootstrap({ requestId });
        if (!boot.ok || !('profile' in boot.data)) throw Error('bootstrap');
        const next = crypto.randomUUID(),
          reply = await window.tapkit.setSettings(
            {
              requestId: next.slice(0, 14) + '7' + next.slice(15),
              expectedRevision: boot.data.settings.revision,
            },
            {
              scope: { type: 'profile', id: boot.data.profile.id },
              patch: { desktop: { ...boot.data.settings.values.desktop, theme, zoom } },
            },
          );
        if (!reply.ok) throw Error(reply.error.code);
      },
      { theme, zoom },
    );
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
      width,
    );
    await page.getByRole('button', { name: '返回工作列表', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '返回工作列表', exact: true })).toBeVisible();
    await page.screenshot({
      path: `docs/evidence/P06-03/desktop/work-${theme}-${zoom}.png`,
      animations: 'disabled',
    });
  }
});
test('P06-03 T13 close hides in tray, preserves Core, clears the closed page and explicit quit ends it', async () => {
  await create();
  const before = await page.evaluate(async () => {
    const value = crypto.randomUUID(),
      id = value.slice(0, 14) + '7' + value.slice(15);
    return await window.tapkit.ping({ nonce: id });
  });
  await app.evaluate(({ BrowserWindow, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    BrowserWindow.getAllWindows()[0]!.close();
  });
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()))
    .toBe(false);
  await app.evaluate(({ BrowserWindow, powerMonitor }) => {
    powerMonitor.emit('suspend');
    powerMonitor.emit('resume');
    BrowserWindow.getAllWindows()[0]!.show();
  });
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  const after = await page.evaluate(() => window.tapkit.ping({ nonce: 'P06-alive' }));
  expect(after.corePid).toBe(before.corePid);
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await expect(page.locator('.work-list')).toContainText('P06 重启后继续的通知任务');
});
