import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

test('P08-03 desktop assigns roles and dependencies, pauses a branch, steers failure and navigates verified child results', async () => {
  test.setTimeout(360000);
  const dir = await mkdtemp(resolve('.test-data', 'P08-03 desktop '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const source = join(dir, '委派样本.txt');
  await writeFile(source, '合成验收资料：甲延迟42毫秒。\n此资料未做外部独立核验。');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
    for (const stream of [app.process().stdout, app.process().stderr])
      stream?.on('data', (chunk) => {
        for (const line of String(chunk).split('\n'))
          if (line.includes('TAPKIT_STARTUP_DIAGNOSTIC') || line.includes('TAPKIT_CORE_'))
            console.log(line);
      });
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form
      .getByRole('textbox', { name: '工作目标', exact: true })
      .fill('P08-03 合成资料子任务汇总');
    await form.getByLabel('先查看计划', { exact: true }).check();
    await form.locator('input[type=file]').setInputFiles(source);
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const panel = page.getByRole('region', { name: '子任务协调', exact: true });
    await expect(panel).toBeVisible({ timeout: 120000 });
    await panel
      .getByRole('checkbox', {
        name: '仅汇总子任务结论、逐字依据与缺口（不追加主模型请求）',
        exact: true,
      })
      .check();
    await panel.getByText('添加只读子任务', { exact: true }).click();
    const add = panel.getByRole('form', { name: '添加子任务', exact: true });
    await add.getByLabel('子任务目标', { exact: true }).fill('甲分支核对原文');
    await add.getByRole('button', { name: '委派子任务', exact: true }).click();
    await expect(panel.locator('.subtask-row')).toHaveCount(1);
    const a = panel
      .locator('.subtask-row')
      .filter({ has: page.getByRole('button', { name: '甲分支核对原文', exact: true }) });
    await a.getByRole('button', { name: '暂停此子任务', exact: true }).click();
    await expect(a).toContainText('已暂停');
    if (!(await add.isVisible())) await panel.getByText('添加只读子任务', { exact: true }).click();
    await add.getByLabel('负责人', { exact: true }).selectOption('reviewer');
    await add.getByLabel('子任务目标', { exact: true }).fill('合成失败分支核对原文');
    await add.getByRole('button', { name: '委派子任务', exact: true }).click();
    await expect(panel.locator('.subtask-row')).toHaveCount(2);
    await page.getByRole('button', { name: '确认计划并开始子任务', exact: true }).click();
    const b = panel
      .locator('.subtask-row')
      .filter({ has: page.getByRole('button', { name: '合成失败分支核对原文', exact: true }) });
    await expect(b).toContainText('失败', { timeout: 60000 });
    await expect(page.locator('.work-detail > p[role=status]')).toContainText('等待');
    await b.getByLabel('补充要求', { exact: true }).fill('恢复分支并核对原文');
    await b.getByRole('button', { name: '创建修订子任务', exact: true }).click();
    await expect(panel.locator('.subtask-row')).toHaveCount(3);
    const currentB = panel
      .locator('.subtask-row')
      .filter({ has: page.getByRole('button', { name: '合成失败分支核对原文', exact: true }) })
      .filter({ hasNotText: '历史版本' });
    await expect(currentB).toContainText('已完成', { timeout: 60000 });
    await a.getByRole('button', { name: '继续此子任务', exact: true }).click();
    await expect(a).toContainText('已完成', { timeout: 60000 });
    await expect(page.locator('.work-detail > p[role=status]')).toContainText('已完成', {
      timeout: 60000,
    });
    await expect(panel).toContainText('甲延迟42毫秒');
    await mkdir('docs/evidence/P08-03/desktop', { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P08-03/desktop/children-light.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(980, 900));
    await page.evaluate(() =>
      document.querySelector('.desktop-shell')!.setAttribute('data-theme', 'dark'),
    );
    await panel.scrollIntoViewIfNeeded();
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: 'docs/evidence/P08-03/desktop/children-dark.png' });
    await a.getByRole('button', { name: '甲分支核对原文', exact: true }).click();
    await expect(page.getByRole('button', { name: '返回主任务', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '子任务关系', exact: true })).toContainText(
      '原文位置已核对',
    );
    await page
      .getByRole('region', { name: '子任务关系', exact: true })
      .getByRole('button', { name: '查看依据 1', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: '子任务原文', exact: true }).locator('mark'),
    ).toContainText('甲延迟42毫秒');
    await page.getByRole('button', { name: '返回主任务', exact: true }).click();
    await expect(page.getByRole('region', { name: '子任务协调', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看模型用量与费用', exact: true }).click();
    await expect(page.getByTestId('usage-items')).toBeVisible();
  } finally {
    await app?.close();
  }
});
