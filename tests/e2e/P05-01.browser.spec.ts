import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { build } from 'vite';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
test('P05-01 T19 Chromium isolates Node, IPC, cookies, permissions, POST, private requests and popups', async () => {
  test.setTimeout(60000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-01 browser kernel '));
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: 'tests/e2e/P05-01.browser-harness.ts',
      outDir: resolve(dir, 'harness'),
      target: 'node24',
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'main.cjs' },
      },
    },
    ssr: { noExternal: ['@tapkit/network'] },
  });
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: resolve(dir, 'profile') }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: [resolve(dir, 'harness/main.cjs')],
      env,
      chromiumSandbox: true,
    });
    await application.firstWindow();
    const result = await application.evaluate(async () => {
      const fixture = (
        globalThis as unknown as {
          tapkitBrowserFixture: {
            read(): Promise<string>;
            rejectPrivate(): Promise<string>;
            state: unknown;
          };
        }
      ).tapkitBrowserFixture;
      return {
        html: await fixture.read(),
        privateResult: await fixture.rejectPrivate(),
        state: fixture.state,
      };
    });
    expect(result.html).toContain('"node":"undefined"');
    expect(result.html).toContain('"bridge":"undefined"');
    expect(result.html).toContain('"cookieBefore":""');
    expect(result.html).toContain('undefined');
    expect(result.html).toContain('blocked');
    expect(result.html).toContain('denied');
    expect(result.privateResult).toBe('PERMISSION_DENIED');
    expect(result.state).toMatchObject({
      privateHits: 0,
      postHits: 0,
      popupCount: 0,
      sessions: [{ persistent: false, proxy: expect.stringContaining('PROXY 127.0.0.1:') }],
    });
    await mkdir('docs/evidence/P05-01/browser', { recursive: true });
    await writeFile(
      'docs/evidence/P05-01/browser/isolation.json',
      JSON.stringify(
        {
          fixture: 'synthetic public protocol response; real Chromium session and policies',
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await application?.close();
  }
});
