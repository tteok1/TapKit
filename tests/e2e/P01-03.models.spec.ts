import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { lockedEnv, root } from '../../scripts/lib.mjs';
test('P01-03 real desktop model preferences, compatibility, scope and usage persist without real provider calls', async ({}, info) => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P01-03-model-ui-'));
  const env = Object.fromEntries(
    Object.entries(lockedEnv({ TAPKIT_DATA_DIR: directory })).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [resolve('apps/desktop')], env });
    let page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    await app.evaluate(async (_electron, source) => {
      const { openStore, newId } = process.getBuiltinModule('module').createRequire(source)(source);
      const store = await openStore(process.env.TAPKIT_DATA_DIR!);
      store.db
        .prepare(
          "INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,settings_json,last_activity_at) VALUES(?,?,?,?,?,'chat',?,?)",
        )
        .run(
          newId(),
          store.profileId,
          store.now(),
          store.now(),
          '范围 fixture',
          '{"schemaVersion":1,"values":{}}',
          store.now(),
        );
      store.close();
    }, resolve('packages/storage/dist/index.cjs'));
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await page.getByLabel('服务预设').selectOption('openai-compatible');
    await page.getByLabel('账户名称').fill('Models fixture');
    await page.getByLabel('模型', { exact: true }).fill('mock-unprobed-model');
    await page.getByLabel('API Key', { exact: true }).fill('fixture-private-key');
    await page.getByRole('button', { name: '保存账户', exact: true }).click();
    await expect(page.getByText('已加密保存，请点击检测连接。', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '运行状态', exact: true }).click();
    await page.getByRole('link', { name: '模型与用量', exact: true }).click();
    const snapshot = await page.evaluate(() => {
      const time = Date.now().toString(16).padStart(12, '0');
      return window.tapkit.modelCommand(
        {
          requestId: time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15),
        },
        'models.catalog',
        {},
      );
    });
    expect(snapshot.ok, JSON.stringify(snapshot)).toBe(true);
    await expect(page.getByTestId('model-card')).toHaveCount(1);
    await expect(page.getByTestId('model-card')).toContainText('待连接或检测');
    await expect(page.getByTestId('model-card')).toContainText('价格 未知');
    await page.getByRole('button', { name: '选择模型', exact: true }).click();
    await page.getByRole('button', { name: /收藏 mock-unprobed-model/ }).click();
    await page.getByLabel('仅收藏', { exact: true }).check();
    await expect(page.getByTestId('model-card')).toHaveCount(1);
    await page.getByLabel('搜索模型').fill('no-such-model');
    await expect(page.getByTestId('model-card')).toHaveCount(0);
    await page.getByLabel('搜索模型').fill('');
    await page.getByLabel('回答语言').selectOption('en');
    await page.getByLabel('每日 Token 上限').fill('5000');
    await page.getByLabel('允许自动切换到 API，并接受供应商费用').check();
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('模型设置已保存。');
    await expect(page.getByTestId('daily-usage')).toContainText('/ 5000 Token');
    await page.getByLabel('设置范围').selectOption('session');
    await expect(page.getByLabel('回答语言')).toHaveValue('en');
    await page.getByLabel('回答语言').selectOption('zh-CN');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('模型设置已保存。');
    await page.getByLabel('设置范围').selectOption('profile');
    await expect(page.getByLabel('回答语言')).toHaveValue('en');
    await page.getByLabel('输出格式').selectOption('json');
    await expect(page.getByTestId('model-preview')).toContainText('严格 JSON 输出尚未验证');
    await page.getByLabel('输出格式').selectOption('markdown');
    await page.getByLabel('附件数量').fill('1');
    await expect(page.getByTestId('model-preview')).toContainText('附件会保留');
    await expect(page.getByLabel('附件数量')).toHaveValue('1');
    await expect(
      page.getByRole('button', { name: '调用模型检测（可能计费）', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('附件数量').fill('0');
    await page.getByLabel('设置范围').selectOption('current');
    await page.getByLabel('回答语气').selectOption('friendly');
    await page.getByRole('button', { name: '应用本次设置', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(
      '本次设置已应用到下面的检测任务；默认设置未写入。',
    );
    await expect(page.getByLabel('每日金额上限')).toBeDisabled();
    await expect(page.getByTestId('usage-items')).toContainText('暂无模型调用记录');
    await page.screenshot({ path: info.outputPath('models-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 760, height: 650 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.screenshot({ path: info.outputPath('models-compact.png'), fullPage: true });
    await app.close();
    app = undefined;
    app = await electron.launch({ args: [resolve('apps/desktop')], env });
    page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    await expect(page.getByRole('heading', { name: '模型与用量', exact: true })).toBeVisible();
    await expect(page.getByLabel('回答语言')).toHaveValue('en');
    await expect(page.getByLabel('每日 Token 上限')).toHaveValue('5000');
    await expect(page.getByLabel('回答语气')).toHaveValue('natural');
    await expect(page.getByLabel('输出格式')).toHaveValue('auto');
    await expect(page.getByLabel('允许自动切换到 API，并接受供应商费用')).toBeChecked();
    await page.getByRole('link', { name: '运行状态', exact: true }).click();
    await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
    await page.getByRole('button', { name: '清除账户记录', exact: true }).click();
    await expect(page.getByTestId('api-empty')).toBeVisible();
  } finally {
    await app?.close();
  }
});
test('P01-03 compiled utility Core switches subscription quota to API fixture and settles durable attempts', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P01-03-utility-'));
  const env: NodeJS.ProcessEnv = lockedEnv({
    TAPKIT_CORE_DATA_DIR: directory,
    TAPKIT_APP_ROOT: root,
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(
    createRequire(import.meta.url)('electron'),
    [resolve('tests/fixtures/P01-03.utility.cjs')],
    { cwd: root, env, windowsHide: true, timeout: 30000, encoding: 'utf8' },
  );
  expect(Boolean(result.error)).toBe(false);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain('"taskId":"P01-03","status":"passed"');
  expect(result.stdout).not.toMatch(/fixture-private-key|mock-refresh|\.mock|private-thinking/);
});
