import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
let app: ElectronApplication;
let dataDir: string;
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dataDir = await mkdtemp(resolve('.test-data', '中文 用户 空格-'));
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
      (pair): pair is [string, string] => pair[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  app.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));
  app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
});
test.afterEach(async () => {
  if (app) await app.close();
});
test('P00-01 ABI: Electron React Core SQLite FTS5 and Chinese data directory', async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '从这里开始' })).toBeVisible();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  const reply = await page.evaluate(() => window.tapkit.ping({ nonce: '中文 空格 ABI' }));
  expect(reply.nonce).toBe('中文 空格 ABI');
  expect(reply.process).toBe('core');
  expect(reply.electronVersion).toBe('44.3.0');
  expect(reply.sqliteVersion).toMatch(/^3\./);
  expect(reply.corePid).not.toBe(app.process().pid);
  const host = await app.evaluate(({ app }) => ({
    abi: process.versions.modules,
    dataDir: app.getPath('userData'),
  }));
  expect(reply.nodeAbi).toBe(host.abi);
  expect(host.dataDir).toBe(dataDir);
  console.log('P00-01 runtime probe', JSON.stringify(reply));
  await mkdir('docs/evidence/P00-02', { recursive: true });
  await page.screenshot({ path: 'docs/evidence/P00-02/regression-shell.png' });
});
test('P00-01 sandbox bridge errors and clean child shutdown', async () => {
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  expect(
    await page.evaluate(() => ({
      require: typeof (window as unknown as Record<string, unknown>).require,
      process: typeof (window as unknown as Record<string, unknown>).process,
      bridge: Object.keys(window.tapkit),
    })),
  ).toEqual({
    require: 'undefined',
    process: 'undefined',
    bridge: [
      'windowSlot',
      'newWindow',
      'initialRoute',
      'openEntity',
      'saveConversation',
      'openArtifactExternal',
      'copyText',
      'historyCommand',
      'fileCommand',
      'artifactCommand',
      'artifactUrl',
      'saveOriginal',
      'chooseAvatar',
      'chooseDirectory',
      'chooseFiles',
      'selectDroppedFiles',
      'selectChatFiles',
      'openPublicLink',
      'desktopCommand',
      'chatCommand',
      'modelCommand',
      'listProviders',
      'startLogin',
      'loginStatus',
      'answerLogin',
      'cancelLogin',
      'checkProvider',
      'disconnectProvider',
      'ping',
      'bootstrap',
      'getSettings',
      'setSettings',
      'saveApiKey',
      'replayEvents',
      'subscribeEvents',
      'backup',
      'cancelJob',
    ],
  });
  expect(
    await app.evaluate(() =>
      process.argv.some((arg) => arg === '--no-sandbox' || arg === '--disable-gpu-sandbox'),
    ),
  ).toBe(false);
  expect(
    await app.evaluate(({ app }) => {
      const tabs = app.getAppMetrics().filter((item) => item.type === 'Tab');
      return tabs.length > 0 && tabs.every((item) => item.sandboxed === true);
    }),
  ).toBe(true);
  expect(
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error('No window');
      return win.webContents.isDevToolsOpened();
    }),
  ).toBe(false);
  expect(
    await page.evaluate(async () => {
      try {
        await window.tapkit.ping({ nonce: '' });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const reply = await page.evaluate(() => window.tapkit.ping({ nonce: 'shutdown' }));
  await app.close();
  await expect
    .poll(() => {
      try {
        process.kill(reply.corePid, 0);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
});
