import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { root, nodeExe, lockedEnv } from './lib.mjs';

// Exercise the actual launcher and dev script, not a separately constructed Vite server.
// Debugging endpoints exist only in this smoke process and bind to loopback/ephemeral ports.
await mkdir(join(root, '.test-data'), { recursive: true });
const dataDir = await mkdtemp(join(root, '.test-data/开发 冒烟-'));
let profileId;
for (const launcher of ['double-click-command', 'dev-script']) {
  const env = lockedEnv({
    TAPKIT_DATA_DIR: dataDir,
    REMOTE_DEBUGGING_PORT: '0',
    V8_INSPECTOR_PORT: '0',
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    launcher === 'double-click-command' ? 'cmd.exe' : nodeExe(),
    launcher === 'double-click-command'
      ? ['/d', '/c', 'Start-TapKit.cmd']
      : [join(root, 'scripts/dev.mjs')],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '',
    closed = false,
    exitCode;
  const finished = once(child, 'close').then(([code]) => {
    closed = true;
    exitCode = code;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
  let browser, inspector;
  try {
    await expect
      .poll(
        () => {
          if (closed) throw new Error('Development launcher exited early: ' + exitCode);
          return /DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/.test(output);
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    const rendererUrl = output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/)[1];
    const inspectorUrl = output.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/)?.[1];
    if (!inspectorUrl) throw new Error('Missing Host inspector');
    inspector = new WebSocket(inspectorUrl);
    await once(inspector, 'open');
    async function evaluate(expression) {
      const reply = once(inspector, 'message', { signal: AbortSignal.timeout(5000) });
      inspector.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      );
      const [event] = await reply;
      const result = JSON.parse(event.data);
      if (result.error || result.result?.exceptionDetails)
        throw new Error(
          'Host evaluation failed: ' +
            (result.result?.exceptionDetails?.exception?.description ?? result.error?.message),
        );
      return result.result.result.value;
    }
    browser = await chromium.connectOverCDP(rendererUrl);
    const context = browser.contexts()[0];
    await expect.poll(() => context.pages().length).toBe(1);
    const page = context.pages()[0];
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
    expect(new URL(page.url()).hostname).toBe('127.0.0.1');
    const reply = await page.evaluate(() => window.tapkit.ping({ nonce: 'actual-dev-smoke' }));
    const boot = await page.evaluate(() => {
      const time = Date.now().toString(16).padStart(12, '0');
      const requestId =
        time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15);
      return window.tapkit.bootstrap({ requestId });
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok || !('profile' in boot.data)) throw new Error('Missing profile');
    profileId ??= boot.data.profile.id;
    expect(boot.data.profile.id).toBe(profileId);
    const security = await evaluate(`({
      argv: process.argv,
      tabs: process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron').app.getAppMetrics().filter(item => item.type === 'Tab').map(item => ({ sandboxed: item.sandboxed, integrityLevel: item.integrityLevel }))
    })`);
    expect(
      security.argv.some((arg) => arg === '--no-sandbox' || arg === '--disable-gpu-sandbox'),
    ).toBe(false);
    expect(security.tabs.length).toBeGreaterThan(0);
    expect(security.tabs.every((tab) => tab.sandboxed === true)).toBe(true);
    if (launcher === 'double-click-command')
      await page.screenshot({ path: join(root, 'docs/evidence/P00-01/local-startup-desktop.png') });
    await evaluate(
      "process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron').app.quit(); 'quit-requested'",
    );
    inspector.close();
    await expect.poll(() => closed, { timeout: 15_000 }).toBe(true);
    await finished;
    expect(exitCode).toBe(0);
    expect(() => process.kill(reply.corePid, 0)).toThrow();
    console.log(
      'P00-01 ACTUAL_DEV_SMOKE_OK ' +
        JSON.stringify({ launcher, exitCode, security, persistedProfile: true }),
    );
  } finally {
    inspector?.close();
    await browser?.close();
    if (!closed) {
      // Failure cleanup is limited to the process tree created by this probe.
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      await finished;
    }
  }
}
