import { _electron as electron, expect } from '@playwright/test';
import { existsSync, lstatSync, realpathSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const requested = process.env.TAPKIT_P10_LIVE_DATA_DIR;
if (process.env.TAPKIT_P10_LIVE_R13 !== '1' || !requested) {
  console.error(
    'P10-01 live NOT RUN: R13 requires opt-in and an isolated, configured TapKit test profile.',
  );
  process.exit(2);
}
if (!isAbsolute(requested) || !existsSync(requested) || lstatSync(requested).isSymbolicLink())
  throw Error('INVALID_LIVE_PROFILE');
const directory = realpathSync(requested);
if (
  dirname(directory).toLowerCase() !== realpathSync(resolve('.test-data')).toLowerCase() ||
  !basename(directory).startsWith('P10-01-live-') ||
  existsSync(join(directory, 'P02-02.fixture'))
)
  throw Error('INVALID_LIVE_PROFILE');
if (readFileSync(resolve('packages/core/dist/index.cjs'), 'utf8').includes('installChatFixture'))
  throw Error('TEST_BUILD_REFUSED');
const env = { ...process.env, TAPKIT_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.TAPKIT_CHAT_FIXTURE;
delete env.TAPKIT_WEB_FIXTURE;

const app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
try {
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  await page.getByRole('link', { name: '文档画布', exact: true }).click();
  await page.getByRole('button', { name: '新建画布' }).click();
  const body = page.getByRole('textbox', { name: '文档正文' });
  await body.focus();
  await page.keyboard.insertText('甲段保留');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('月亮');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('乙段保留');
  await expect(page.getByText('已保存 · v2', { exact: true })).toBeVisible();
  await body.locator('p').filter({ hasText: '月亮' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'AI 修改', exact: true }).click();
  await page.getByLabel('修改方式').selectOption('translate');
  await page.getByLabel('修改要求').fill('将所选词翻译成英文，只返回英文单词，不添加标点。');
  await page.getByRole('button', { name: '生成修改建议' }).click();
  await expect(page.locator('.canvas-change dd').last()).toHaveText(/^moon$/i, { timeout: 70000 });
  await expect(body.locator('p')).toHaveText(['甲段保留', '月亮', '乙段保留']);
  await page.getByRole('button', { name: '接受', exact: true }).click();
  await expect(body.locator('p')).toHaveText(['甲段保留', /^moon$/i, '乙段保留']);
  console.log(
    JSON.stringify({
      task: 'P10-01',
      resource: 'R13',
      status: 'passed',
      syntheticSelection: true,
      surroundingBlocksPreserved: true,
    }),
  );
} finally {
  await app.close();
}
