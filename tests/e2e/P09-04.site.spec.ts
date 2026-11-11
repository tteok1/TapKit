import { test, expect, _electron as electron } from './test';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('P09-04 builds, interacts, preserves versions and rebuilds exported website source', async () => {
  test.setTimeout(300000);
  const root = await mkdtemp(resolve('.test-data/P09-04 desktop '));
  const env = { ...process.env, TAPKIT_DATA_DIR: join(root, 'profile') };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  delete (env as NodeJS.ProcessEnv).TAPKIT_CHAT_FIXTURE;
  const archive = join(root, 'site.zip');
  let requests = 0;
  const sentinel = createServer((_req, res) => {
    requests++;
    res.writeHead(204).end();
  });
  await new Promise<void>((done) => sentinel.listen(0, '127.0.0.1', done));
  const address = sentinel.address();
  if (!address || typeof address === 'string') throw Error('Missing test listener');
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => console.log('P09-04 renderer error', error.message));
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const work = page.getByRole('form', { name: '新建工作' });
    await work.getByRole('textbox', { name: '工作目标', exact: true }).fill('P09-04 山间图书室');
    await work.getByLabel('先查看计划', { exact: true }).check();
    await work.getByRole('button', { name: '创建工作', exact: true }).click();
    const detail = page.locator('.work-detail').filter({
      has: page.getByRole('heading', { name: 'P09-04 山间图书室', exact: true }),
    });
    const site = detail.locator('section.site-panel');
    await expect(detail).toHaveCount(1);
    await expect(site).toHaveCount(1);
    const openForm = site.getByRole('button', { name: '从文字创建' });
    await openForm.press('Enter');
    await expect(openForm).toHaveAttribute('aria-expanded', 'true');
    await site.getByLabel('页面名称（每行一个）', { exact: true }).fill('开放时间\n来访指南');
    await site.getByRole('button', { name: '生成网站源码' }).click();
    const build = site.getByRole('button', { name: '构建网站', exact: true });
    await build.click();
    const built = site.getByRole('status').filter({ hasText: '构建完成' });
    const problem = site.getByRole('alert');
    try {
      await expect(built.or(problem)).toBeVisible({ timeout: 45000 });
      expect(await problem.count(), await site.innerText()).toBe(0);
    } catch (failure) {
      const diagnostics = await page.evaluate(async () => {
        const options = () => {
          const id = crypto.randomUUID();
          return { requestId: id.slice(0, 14) + '7' + id.slice(15) };
        };
        const runs = await window.tapkit.workCommand(options(), 'runs.list', {
          query: 'P09-04 山间图书室',
        });
        if (!runs.ok || !('workItems' in runs.data)) return runs;
        const runId = runs.data.workItems[0]!.runId;
        const bootstrap = await window.tapkit.bootstrap(options());
        const terminal = await window.tapkit.terminalCommand(options(), 'terminal.status', {
          runId,
        });
        if (!terminal.ok || !('terminal' in terminal.data)) return terminal;
        const result = terminal.data.terminal;
        return {
          capabilities:
            bootstrap.ok && 'runtimeCapabilities' in bootstrap.data
              ? bootstrap.data.runtimeCapabilities
              : undefined,
          profiles: result.profiles.map((item) => item.message),
          processes: result.processes.map(({ argv, reason, state, exitCode }) => ({
            argv,
            reason,
            state,
            exitCode,
          })),
        };
      });
      console.log('P09-04 build state', JSON.stringify(diagnostics));
      throw failure;
    }
    const versions = site.getByLabel('构建版本', { exact: true });
    const v1 = await versions.inputValue();
    await site.getByRole('button', { name: '打开预览' }).click();

    const readPreview = () =>
      app.evaluate(async ({ webContents }) => {
        const view = webContents
          .getAllWebContents()
          .find((item) => item.getURL().startsWith('http://127.0.0.1:'));
        if (!view) return null;
        return view.executeJavaScript(`({
        heading: document.querySelector('h1')?.textContent,
        width: innerWidth, bridge: typeof window.tapkit, node: typeof window.require,
        note: document.querySelector('textarea')?.value
      })`);
      });
    await expect
      .poll(readPreview)
      .toMatchObject({ heading: '开放时间', bridge: 'undefined', node: 'undefined' });
    for (const [label, width] of [
      ['桌面 900px', 900],
      ['平板 768px', 768],
    ] as const) {
      await site.getByRole('button', { name: label }).click();
      await expect
        .poll(async () => Math.abs((await readPreview())?.width - width))
        .toBeLessThanOrEqual(2);
    }
    await site.getByRole('button', { name: '手机 390px' }).click();
    await expect.poll(readPreview).toMatchObject({ width: 390 });
    const enter = site.getByRole('button', { name: '进入预览（Esc 返回）' });
    await enter.press('Enter');
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .find((item) => item.getURL().startsWith('http://127.0.0.1:'))
            ?.isFocused(),
        ),
      )
      .toBe(true);
    await app.evaluate(({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!;
      view.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      view.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await expect(enter).toBeFocused();
    await app.evaluate(async ({ webContents }, port) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!;
      await view.executeJavaScript(`{
        const image = new Image(); image.src = 'http://127.0.0.1:${port}/fixture.png';
        document.body.append(image);
        const field = document.querySelector('textarea');
        field.value = '本地测试笔记'; field.dispatchEvent(new Event('input'));
        document.querySelector('a[href="./page-2.html"]').click();
      }`);
    }, address.port);
    await expect.poll(readPreview).toMatchObject({ heading: '来访指南', note: '本地测试笔记' });
    expect(requests).toBe(0);
    const native = await app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!;
      return (await view.capturePage()).toPNG().toString('base64');
    });
    await writeFile('docs/evidence/P09-04/preview-mobile.png', Buffer.from(native, 'base64'));
    await page.screenshot({ path: 'docs/evidence/P09-04/site-panel.png' });

    await site.getByRole('button', { name: '选取页面区域' }).click();
    await expect(site.getByRole('status').filter({ hasText: '点击页面区域' })).toBeVisible();
    await app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!;
      const { x, y } = await view.executeJavaScript(`(() => {
        const rect = document.querySelector('h1').getBoundingClientRect();
        return { x: rect.left + 10, y: rect.top + 10 };
      })()`);
      const zoom = view.getZoomFactor();
      const point = { x: Math.round(x * zoom), y: Math.round(y * zoom) };
      view.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      view.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    });
    await expect(site.getByRole('form', { name: '修改选中区域' })).toContainText('来访指南');
    await expect(site.getByLabel('修改要求')).toBeFocused();
    const patch = (path: string, oldText: string, newText: string) =>
      page.evaluate(
        async ({ path, oldText, newText }) => {
          const options = () => {
            const id = crypto.randomUUID();
            return { requestId: id.slice(0, 14) + '7' + id.slice(15) };
          };
          const runs = await window.tapkit.workCommand(options(), 'runs.list', {
            query: 'P09-04 山间图书室',
          });
          if (!runs.ok || !('workItems' in runs.data) || !runs.data.workItems[0])
            throw Error('run');
          const runId = runs.data.workItems[0].runId;
          const response = await window.tapkit.codeCommand(options(), 'code.read', { runId, path });
          if (!response.ok || !('code' in response.data) || !response.data.code.read)
            throw Error('read');
          const { hash, content } = response.data.code.read;
          if (!content.includes(oldText)) throw Error('fixture mismatch');
          const changed = await window.tapkit.codeCommand(options(), 'code.applyPatch', {
            runId,
            patch: { path, baseHash: hash, content: content.replace(oldText, newText) },
          });
          if (!changed.ok) throw Error(changed.error.code);
        },
        { path, oldText, newText },
      );
    await patch('page-2.html', '<h1>来访指南</h1>', '<h1>周末来访指南</h1>');
    await patch(
      'build.mjs',
      "import { copyFile, mkdir } from 'node:fs/promises';",
      "import { copyFile, mkdir } from 'node:fs/promises';\nprocess.exit(7);",
    );
    await build.click();
    await expect(site.getByRole('alert')).toContainText('构建失败（退出码 7）', { timeout: 90000 });
    await expect(versions).toHaveValue(v1);
    await expect.poll(readPreview).toMatchObject({ heading: '来访指南' });
    await patch('build.mjs', '\nprocess.exit(7);', '');
    await build.click();
    await expect(site.getByRole('status').filter({ hasText: '构建完成' })).toBeVisible({
      timeout: 90000,
    });
    await expect(versions).not.toHaveValue(v1);
    await expect.poll(readPreview).toMatchObject({ heading: '开放时间' });
    await app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!;
      await view.executeJavaScript('document.querySelector(\'a[href="./page-2.html"]\').click()');
    });
    await expect.poll(readPreview).toMatchObject({ heading: '周末来访指南' });

    await versions.selectOption(v1);
    await site.getByRole('button', { name: '恢复源码' }).click();
    await expect(
      site.getByRole('status').filter({ hasText: '已恢复所选版本的源码' }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, archive);
    await site.getByRole('button', { name: '下载源码' }).click();
    await expect(site.getByRole('status').filter({ hasText: '已保存源码 ZIP' })).toBeVisible();
    const rebuild = join(root, 'clean');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Expand-Archive -LiteralPath $env:TAPKIT_SITE_TEST_ZIP -DestinationPath $env:TAPKIT_SITE_TEST_EXTRACT',
      ],
      {
        env: { ...process.env, TAPKIT_SITE_TEST_ZIP: archive, TAPKIT_SITE_TEST_EXTRACT: rebuild },
      },
    );
    const names = await readdir(rebuild);
    expect(names).toContain('package-lock.json');
    expect(names).toContain('README.md');
    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('.tapkit-runtime');
    const bin = resolve('.runtime/node/node-v24.21.0-win-x64');
    const npm = join(bin, 'node_modules/npm/bin/npm-cli.js');
    const npmEnv = { ...process.env, Path: bin + ';' + process.env.Path };
    execFileSync(
      join(bin, 'node.exe'),
      [npm, 'ci', '--offline', '--no-audit', '--ignore-scripts'],
      { cwd: rebuild, env: npmEnv },
    );
    execFileSync(join(bin, 'node.exe'), [npm, 'run', 'build'], { cwd: rebuild, env: npmEnv });
    const restored = await readFile(join(rebuild, 'dist', 'page-2.html'), 'utf8');
    expect(restored).toContain('<h1>来访指南</h1>');

    const url = await app.evaluate(({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('http://127.0.0.1:'))!
        .getURL(),
    );
    await site.getByRole('button', { name: '复制到新工作' }).click();
    await expect(
      page.getByRole('heading', { name: 'P09-04 山间图书室（副本）', exact: true }),
    ).toBeVisible();
    await expect.poll(readPreview).toBeNull();
    await expect(fetch(url)).rejects.toThrow();
    await expect(
      page
        .getByRole('region', { name: '网站', exact: true })
        .getByRole('button', { name: '构建网站' }),
    ).toBeEnabled();
  } finally {
    sentinel.close();
    await app.close();
  }
});
