import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
let application: ElectronApplication, page: Page;
test.beforeEach(async () => {
  test.setTimeout(180000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P06 isolated '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (row): row is [string, string] => row[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  page = await application.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
});
test.afterEach(async () => {
  await application?.close();
});
test('P06-01 T13 work center creates a real plan-first task, edits plan and opens verified artifact', async () => {
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  const form = page.getByRole('form', { name: '新建工作' });
  await form.getByLabel('工作目标').fill('P06 生成可验证的工作成果');
  await form.getByLabel('先查看计划').check();
  await form.getByRole('button', { name: '创建工作', exact: true }).click();
  await expect(page.locator('.work-detail')).toContainText('等待输入');
  await page.getByRole('button', { name: '调整计划', exact: true }).click();
  await page.getByRole('button', { name: '接受并执行所选步骤', exact: true }).click();
  await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 30000 });
  await page.getByRole('button', { name: '打开成果 1', exact: true }).click();
  await expect(page.locator('.artifact-panel')).toContainText('隔离工作验收');
  await mkdir('docs/evidence/P06-01/desktop', { recursive: true });
  await page.screenshot({ path: 'docs/evidence/P06-01/desktop/work-completed.png' });
});
