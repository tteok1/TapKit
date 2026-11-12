import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron } from './test';

test('P10-03 T20 privacy controls export, import and confirm a durable clear from the desktop', async () => {
  test.setTimeout(165000);
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P10-03 Electron '));
  const path = join(root, 'portable.zip');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: root }).filter(
      (item): item is [string, string] => item[1] !== undefined,
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
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByRole('link', { name: '隐私政策', exact: true }).click();
    const history = page.getByRole('checkbox', { name: '保存聊天记录', exact: true });
    const created = await page.evaluate(() =>
      window.tapkit.desktopCommand(
        { requestId: '019953fa-0000-7000-8000-000000000003' },
        'sessions.create',
        { title: 'T20 desktop fixture', mode: 'chat' },
      ),
    );
    expect(created.ok).toBe(true);
    await expect(history).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: '产品反馈默认附带脱敏诊断' }),
    ).not.toBeChecked();
    await history.uncheck();
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.getByText('设置已保存', { exact: true })).toBeVisible();

    const blocked = await page.evaluate(() =>
      window.tapkit.desktopCommand(
        { requestId: '019953fa-0000-7000-8000-000000000004' },
        'sessions.create',
        { title: 'Blocked history', mode: 'chat' },
      ),
    );
    expect(blocked).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, path);
    const panel = page.getByRole('article', { name: '本机数据管理' });
    await panel.getByRole('button', { name: '立即备份' }).click();
    await expect(panel.getByRole('region', { name: '数据操作进度' })).toContainText('备份 · 完成', {
      timeout: 20000,
    });
    await panel.getByRole('button', { name: '导出数据包' }).click();
    await expect(panel.getByRole('status')).toContainText('已导出 会话 1');
    expect((await readFile(path)).subarray(0, 2).toString()).toBe('PK');
    await panel.getByRole('button', { name: '导入数据包' }).click();
    await expect(panel.getByRole('status')).toContainText('已导入 会话 1');
    await expect(
      panel.getByRole('checkbox', { name: '同时清理含这些资料的本机备份' }),
    ).toBeChecked();
    await panel.getByRole('button', { name: '预览清理影响' }).click();
    await expect(panel.getByRole('region', { name: '清理影响' })).toContainText('会话 2');
    await panel.getByRole('button', { name: '确认永久清理' }).click();
    await expect(panel.getByRole('region', { name: '数据操作进度' })).toContainText('清理 · 完成', {
      timeout: 20000,
    });
  } finally {
    await app.close();
  }
});
