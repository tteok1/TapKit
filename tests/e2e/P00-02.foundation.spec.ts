import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
let app: ElectronApplication, dataDir: string;
function id() {
  const h = Date.now().toString(16).padStart(12, '0'),
    r = randomUUID();
  return h.slice(0, 8) + '-' + h.slice(8) + '-7' + r.slice(15);
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dataDir = await mkdtemp(resolve('.test-data', 'P00-02 Electron 中文 '));
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
      (p): p is [string, string] => p[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  app.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));
  app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await expect((await app.firstWindow()).getByTestId('core-status')).toHaveText('本地核心已连接');
});
test.afterEach(async () => {
  if (app) await app.close();
});
test('P00-02 T01 T05 real two-window CAS and committed event subscription', async () => {
  const page = await app.firstWindow();
  const first = await page.evaluate((requestId) => window.tapkit.bootstrap({ requestId }), id());
  expect(first.ok).toBe(true);
  if (!first.ok || !('profile' in first.data)) throw new Error('bootstrap failed');
  const profileId = first.data.profile.id;
  await page.evaluate(async (requestId) => {
    (window as unknown as { received: number[] }).received = [];
    await window.tapkit.subscribeEvents(
      { requestId },
      { streamId: 'profile', afterSeq: 0 },
      (event) => (window as unknown as { received: number[] }).received.push(event.seq),
    );
  }, id());
  const newWindow = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items[0];
    if (!item) throw new Error('menu missing');
    item.click();
  });
  const second = await newWindow;
  await expect(second.getByTestId('core-status')).toHaveText('本地核心已连接');
  const requestId = id();
  const a = await page.evaluate(
    ({ requestId, profileId }) =>
      window.tapkit.setSettings(
        { requestId, expectedRevision: 1 },
        { scope: { type: 'profile', id: profileId }, patch: { memoryEnabled: false } },
      ),
    { requestId, profileId },
  );
  expect(a.ok).toBe(true);
  const repeat = await second.evaluate(
    ({ requestId, profileId }) =>
      window.tapkit.setSettings(
        { requestId, expectedRevision: 1 },
        { scope: { type: 'profile', id: profileId }, patch: { memoryEnabled: false } },
      ),
    { requestId, profileId },
  );
  expect(repeat).toEqual(a);
  const conflict = await second.evaluate(
    ({ requestId, profileId }) =>
      window.tapkit.setSettings(
        { requestId, expectedRevision: 1 },
        { scope: { type: 'profile', id: profileId }, patch: { historyEnabled: false } },
      ),
    { requestId: id(), profileId },
  );
  expect(conflict).toMatchObject({ ok: false, error: { code: 'CONFLICT', currentRevision: 2 } });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { received: number[] }).received))
    .toEqual([1]);
  expect(await page.evaluate(() => Object.keys(window.tapkit))).not.toContain('invoke');
  const ping1 = await page.evaluate(() => window.tapkit.ping({ nonce: 'one' }));
  const ping2 = await second.evaluate(() => window.tapkit.ping({ nonce: 'two' }));
  expect(ping1.corePid).toBe(ping2.corePid);
});
test('P00-02 T19 real Windows safeStorage round trip, ACL and plaintext exclusion', async () => {
  const page = await app.firstWindow(),
    key = 'P00-02-fixture-' + randomUUID(),
    requestId = id();
  const result = await page.evaluate(
    ({ requestId, key }) =>
      window.tapkit.saveApiKey({ requestId }, { providerId: 'deepseek', label: '本地测试', key }),
    { requestId, key },
  );
  expect(result.ok, result.ok ? '' : JSON.stringify(result.error)).toBe(true);
  expect(result).toMatchObject({ ok: true, data: { status: 'unconfigured' } });
  expect(
    await page.evaluate(
      ({ requestId, key }) =>
        window.tapkit.saveApiKey({ requestId }, { providerId: 'deepseek', label: '本地测试', key }),
      { requestId, key },
    ),
  ).toEqual(result);
  expect(
    await page.evaluate(
      ({ requestId, key }) =>
        window.tapkit.saveApiKey(
          { requestId },
          { providerId: 'deepseek', label: '本地测试', key: key + 'changed' },
        ),
      { requestId, key },
    ),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  const ciphertext = await readFile(join(dataDir, 'secrets', requestId));
  expect(ciphertext.includes(Buffer.from(key))).toBe(false);
  const roundtrip = await app.evaluate(
    ({ safeStorage }, { ciphertext, key }) => {
      return JSON.parse(safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))).key === key;
    },
    { ciphertext: ciphertext.toString('base64'), key },
  );
  expect(roundtrip).toBe(true);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const acl = await promisify(execFile)('icacls.exe', [join(dataDir, 'secrets')], {
    windowsHide: true,
  });
  expect(acl.stdout).not.toContain('(I)');
  for (const directory of ['db', 'logs'])
    for (const file of await readdir(join(dataDir, directory)))
      expect((await readFile(join(dataDir, directory, file))).includes(Buffer.from(key))).toBe(
        false,
      );
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => false;
  });
  const unavailable = await page.evaluate(
    ({ requestId, key }) =>
      window.tapkit.saveApiKey({ requestId }, { providerId: 'xai', label: '不可用', key }),
    { requestId: id(), key },
  );
  expect(unavailable).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' } });
  expect((await readdir(join(dataDir, 'secrets'))).length).toBe(1);
});
test('P00-02 T19 foreign WebContents cannot invoke app IPC', async () => {
  const reply = await app.evaluate(async ({ BrowserWindow }, requestId) => {
    const attacker = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    });
    try {
      await attacker.loadURL('about:blank');
      return await attacker.webContents.executeJavaScript(
        "require('electron').ipcRenderer.invoke('tapkit:request'," +
          JSON.stringify({ protocolVersion: 1, requestId, command: 'app.bootstrap', payload: {} }) +
          ')',
      );
    } finally {
      attacker.destroy();
    }
  }, id());
  expect(reply).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
});
test('P00-02 T05 Core kill rebuilds writer; acked settings survive and backup is not duplicated', async () => {
  const page = await app.firstWindow();
  const boot = await page.evaluate((requestId) => window.tapkit.bootstrap({ requestId }), id());
  if (!boot.ok || !('profile' in boot.data)) throw new Error('bootstrap');
  const writeId = id();
  await page.evaluate(
    ({ requestId, profileId }) =>
      window.tapkit.setSettings(
        { requestId, expectedRevision: 1 },
        { scope: { type: 'profile', id: profileId }, patch: { memoryEnabled: false } },
      ),
    { requestId: writeId, profileId: boot.data.profile.id },
  );
  const backupId = id();
  const before = await page.evaluate((requestId) => window.tapkit.backup({ requestId }), backupId);
  if (!before.ok || !('jobId' in before.data)) throw new Error('backup');
  const jobId = before.data.jobId;
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(join(dataDir, 'backups', jobId, 'manifest.json'), 'utf8'))
          .id;
      } catch {
        return null;
      }
    })
    .toBe(jobId);
  const old = await page.evaluate(() => window.tapkit.ping({ nonce: 'before-crash' }));
  process.kill(old.corePid);
  await expect
    .poll(async () => {
      try {
        return (await page.evaluate(() => window.tapkit.ping({ nonce: 'after-crash' }))).corePid;
      } catch {
        return old.corePid;
      }
    })
    .not.toBe(old.corePid);
  const after = await page.evaluate((requestId) => window.tapkit.bootstrap({ requestId }), id());
  expect(after).toMatchObject({
    ok: true,
    data: { settings: { revision: 2, values: { memoryEnabled: false } } },
  });
  expect(await page.evaluate((requestId) => window.tapkit.backup({ requestId }), backupId)).toEqual(
    before,
  );
});
test('P00-02 single instance activates owner and closing UI keeps Core alive until explicit quit', async () => {
  const page = await app.firstWindow(),
    ping = await page.evaluate(() => window.tapkit.ping({ nonce: 'lifecycle' }));
  const background = await page.evaluate((requestId) => window.tapkit.backup({ requestId }), id());
  if (!background.ok || !('jobId' in background.data)) throw new Error('backup not accepted');
  const jobId = background.data.jobId;
  await page.close();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(join(dataDir, 'backups', jobId, 'manifest.json'), 'utf8'))
          .id;
      } catch {
        return null;
      }
    })
    .toBe(jobId);
  expect(() => process.kill(ping.corePid, 0)).not.toThrow();
  const child = spawn(await app.evaluate(() => process.execPath), [resolve('apps/desktop')], {
    env: { ...process.env, TAPKIT_DATA_DIR: dataDir },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (data) => process.stdout.write(data));
  child.stderr?.on('data', (data) => process.stderr.write(data));
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  expect(exit).toBe(0);
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(1);
  const reopened = await app.firstWindow();
  await expect(reopened.getByTestId('core-status')).toHaveText('本地核心已连接');
  expect(
    (await reopened.evaluate(() => window.tapkit.ping({ nonce: 'reactivated' }))).corePid,
  ).toBe(ping.corePid);
  await reopened.close();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
  expect(() => process.kill(ping.corePid, 0)).not.toThrow();
  await app.close();
  await expect
    .poll(() => {
      try {
        process.kill(ping.corePid, 0);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
});

test('P00-02 higher schema shows a recovery prompt and preserves original database', async () => {
  await app.close();
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const Database =
    require('../../packages/storage/node_modules/better-sqlite3') as typeof import('better-sqlite3');
  const path = join(dataDir, 'db/app.sqlite');
  const db = new Database(path);
  // Derive a future version from the migrated database so new migrations cannot stale this case.
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  expect(currentVersion).toBeGreaterThan(0);
  db.pragma('user_version = ' + (currentVersion + 1));
  db.close();
  const before = await readFile(path);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
      (p): p is [string, string] => p[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toContainText('本地数据需要恢复');
  expect(
    await page.evaluate((requestId) => window.tapkit.bootstrap({ requestId }), id()),
  ).toMatchObject({ ok: false, error: { code: 'DATABASE_RECOVERY_REQUIRED' } });
  expect(await readFile(path)).toEqual(before);
  await page.screenshot({ path: 'docs/evidence/P00-02/recovery.png' });
});
