import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
if (process.env.TAPKIT_P08_UI_CHECK !== '1') throw Error('PERMISSION_DENIED');
if (readFileSync('packages/core/dist/index.cjs', 'utf8').includes('installChatFixture'))
  throw Error('TEST_BUILD_REFUSED');
const directory = mkdtempSync(resolve('.test-data/P08-02-ui-preflight-'));
const env = { ...process.env, TAPKIT_DATA_DIR: directory };
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_WEB_FIXTURE',
  'TAPKIT_BROWSER_FIXTURE',
  'NODE_OPTIONS',
])
  delete env[key];
let app;
try {
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工作', exact: true })
    .click();
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  const form = page.getByRole('form', { name: '新建工作' });
  await form.getByLabel('工作类型').selectOption('research');
  const goalLoose = await form.getByLabel('工作目标').count(),
    goalExact = await form.getByRole('textbox', { name: '工作目标', exact: true }).count();
  await form
    .getByRole('textbox', { name: '工作目标', exact: true })
    .fill('公开价格对照研究（合成验收资料）');
  await form.getByLabel('公开检索问题', { exact: false }).fill('两份资料分别如何描述公开价格？');
  await form
    .getByLabel('起始网页', { exact: false })
    .fill('https://example.com/\nhttps://example.net/');
  await form.getByLabel('研究用途', { exact: true }).fill('比较资料差异，保留不同证据');
  await form.getByLabel('成果格式').selectOption('pdf');
  await form.getByLabel('工作范围', { exact: true }).fill('仅使用指定的公开样本资料');
  mkdirSync('docs/evidence/P08-02/desktop', { recursive: true });
  const viewports = {};
  for (const [name, width, height] of [
    ['desktop', 1280, 960],
    ['compact', 960, 900],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await form.evaluate((n) => n.scrollIntoView({ block: 'start' }));
    viewports[name] = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    }));
    await page.screenshot({ path: 'docs/evidence/P08-02/desktop/create-' + name + '-current.png' });
  }
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    const accounts = db.prepare('SELECT count(*) n FROM provider_accounts').get().n;
    const attempts = db.prepare('SELECT count(*) n FROM provider_attempts').get().n;
    const runs = db.prepare('SELECT count(*) n FROM runs').get().n;
    if (accounts !== 0 || attempts !== 0 || runs !== 0) throw Error('UNEXPECTED_MODEL_REQUEST');
    writeFileSync(
      'docs/evidence/P08-02/desktop/ui-preflight.json',
      JSON.stringify(
        {
          result: 'passed',
          goalLoose,
          goalExact,
          accounts,
          attempts,
          runs,
          viewports,
          scope: 'production app; no account; UI controls only; no task submitted',
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
  console.log(JSON.stringify({ result: 'passed', goalLoose, goalExact, modelRequests: 0 }));
} finally {
  await app?.close();
}
