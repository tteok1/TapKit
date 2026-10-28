import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
test('P06-02 T14 exact preview can be edited, approved and produces a new immutable artifact', async () => {
  test.setTimeout(180000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P06-02 isolated '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: [resolve('apps/desktop')],
      env,
      chromiumSandbox: true,
    });
    const page = await application.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByLabel('工作目标').fill('P06审批：初稿与修订');
    await form.getByLabel('成果数量').fill('2');
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('等待输入', { timeout: 30000 });
    await page.getByRole('button', { name: '权限与审批', exact: true }).click();
    const card = page.locator('.work-approval');
    await expect(card).toContainText('修改前');
    await expect(card).toHaveAccessibleName('待审阅操作');
    await card.getByRole('button', { name: '编辑后重新审阅', exact: true }).click();
    await mkdir('docs/evidence/P06-02/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P06-02/desktop/approval-edit.png' });
    await card
      .getByLabel('修改后', { exact: true })
      .fill('# 用户审阅修订\n\n这是用户编辑后批准的成果。');
    await card.getByRole('button', { name: '保存新预览', exact: true }).click();
    await expect(card).toContainText('用户编辑后批准');
    await card.getByRole('button', { name: '批准操作', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.locator('.work-open').filter({ hasText: 'P06审批：初稿与修订' }).first().click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 30000 });
    await page.getByRole('button', { name: '打开成果 1', exact: true }).last().click();
    await expect(page.locator('.artifact-panel')).toContainText('用户审阅修订');
    await mkdir('docs/evidence/P06-02/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P06-02/desktop/reviewed-artifact.png' });
  } finally {
    await application?.close();
  }
});
