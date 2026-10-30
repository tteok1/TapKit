import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, chromium, type ElectronApplication } from './test';
import { build } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
test('P05-02 T07/T20 real sandbox PDF embeds Chinese and standalone HTML opens in clean Edge without TapKit', async () => {
  test.setTimeout(120000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-02 PDF native '));
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: 'tests/e2e/P05-02.pdf-harness.ts',
      outDir: join(dir, 'harness'),
      target: 'node24',
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'main.cjs' },
      },
    },
    ssr: { noExternal: ['@tapkit/contracts', 'zod', 'marked'] },
  });
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: join(dir, 'profile'),
      TAPKIT_SOURCE_ROOT: resolve('.'),
    }).filter((row): row is [string, string] => row[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: [join(dir, 'harness/main.cjs')],
      env,
      chromiumSandbox: true,
    });
    await application.firstWindow();
    const result = await application.evaluate(() =>
      (
        globalThis as unknown as {
          tapkitPdfFixture: {
            render(): Promise<{
              hits: number;
              preferences: unknown[];
              bytes: number;
              directory: string;
            }>;
          };
        }
      ).tapkitPdfFixture.render(),
    );
    expect(result.hits).toBe(0);
    expect(result.preferences).toEqual(
      Array.from({ length: 2 }, () => ({
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        javascript: false,
        preload: null,
      })),
    );
    expect(
      (await readFile(join(result.directory, 'chinese-pages.pdf'))).subarray(0, 5).toString(),
    ).toBe('%PDF-');
    await writeFile(join(result.directory, 'native-results.json'), JSON.stringify(result, null, 2));
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
      const context = await browser.newContext(),
        page = await context.newPage(),
        remote: string[] = [];
      await context.route(/^https?:\/\//, (route) => {
        remote.push(route.request().url());
        return route.abort();
      });
      await page.goto(pathToFileURL(join(result.directory, 'standalone.html')).href);
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.getByRole('heading', { name: '中文会话导出验收', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('最后一段中文结束。', { exact: true })).toHaveCount(1);
      expect(await page.evaluate(() => document.fonts.check('16px TapKitExport', '中文'))).toBe(
        true,
      );
      expect(
        await page.evaluate(() => typeof (window as unknown as { tapkit?: unknown }).tapkit),
      ).toBe('undefined');
      expect(remote).toEqual([]);
      await page.screenshot({ path: join(result.directory, 'standalone-edge.png') });
    } finally {
      await browser.close();
    }
  } finally {
    await application?.close();
  }
});
