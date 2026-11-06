import { test, expect, _electron as electron } from './test';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('P09-02 desktop runs real Node and Python checks, keeps failures, handles ConPTY and pages output without freezing', async () => {
  test.setTimeout(300000);
  const root = await mkdtemp(resolve('.test-data/P09-02 desktop ')),
    source = join(root, '中文项目'),
    data = join(root, 'profile');
  await mkdir(source);
  const nodeOriginal = 'export const sum=(a,b)=>a-b;\n',
    pyOriginal = 'def sum(a,b):\n    return a-b\n';
  const files = {
    'package.json': JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }),
    'sum.mjs': nodeOriginal,
    'sum.test.mjs':
      "import {sum} from './sum.mjs';import assert from 'node:assert/strict';import test from 'node:test';test('sum',()=>assert.equal(sum(2,3),5));\n",
    'sum.py': pyOriginal,
    'test_sum.py':
      'import unittest\nfrom sum import sum\nclass TestSum(unittest.TestCase):\n    def test_sum(self): self.assertEqual(sum(2,3),5)\n',
  };
  for (const [name, text] of Object.entries(files)) await writeFile(join(source, name), text);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: data }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TAPKIT_CHAT_FIXTURE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1360, 960));
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    const capabilities = await page.evaluate(async () => {
      const id = crypto.randomUUID();
      const reply = await window.tapkit.bootstrap({
        requestId: id.slice(0, 14) + '7' + id.slice(15),
      });
      if (!reply.ok || !('runtimeCapabilities' in reply.data)) throw Error('bootstrap');
      return reply.data.runtimeCapabilities;
    });
    expect(capabilities?.nativeExecution, 'P09-02 requires a probe on this runner').toEqual({
      status: 'available',
    });
    expect(capabilities?.terminal, 'P09-02 requires verified ConPTY on this runner').toEqual({
      status: 'available',
    });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByRole('textbox', { name: '工作目标', exact: true }).fill('P09-02 真实代码检查');
    await form.getByLabel('先查看计划', { exact: true }).check();
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const code = page.getByRole('region', { name: '代码项目', exact: true });
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    await code.getByRole('button', { name: '选择本地代码目录', exact: true }).click();
    await code.getByRole('button', { name: '创建独立修改副本', exact: true }).click();
    const panel = page.getByRole('region', { name: '运行与终端', exact: true });
    await expect(panel).toBeVisible();
    for (const runtime of ['node', 'python'] as const) {
      await panel.getByRole('combobox', { name: '运行环境', exact: true }).selectOption(runtime);
      await panel.getByRole('button', { name: '准备运行环境', exact: true }).click();
      await expect(panel.getByRole('status').filter({ hasText: '环境已准备' })).toBeVisible({
        timeout: 60000,
      });
      const preset = panel.getByRole('button', {
        name: runtime === 'node' ? 'Node 测试' : 'Python 测试',
        exact: true,
      });
      await preset.click();
      await expect(panel.locator('.terminal-process-meta strong')).toHaveText(/失败.*退出码 1/, {
        timeout: 45000,
      });
      await mkdir('docs/evidence/P09-02/desktop', { recursive: true });
      await panel
        .locator('.terminal-process-meta')
        .evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: `docs/evidence/P09-02/desktop/failed-${runtime}.png` });
      await page.evaluate(
        async ({ runtime, content }) => {
          const requestId = () => {
            const id = crypto.randomUUID();
            return id.slice(0, 14) + '7' + id.slice(15);
          };
          const runs = await window.tapkit.workCommand({ requestId: requestId() }, 'runs.list', {
            query: 'P09-02 真实代码检查',
          });
          if (!runs.ok || !('workItems' in runs.data) || !runs.data.workItems[0])
            throw Error('run');
          const runId = runs.data.workItems[0].runId,
            path = runtime === 'node' ? 'sum.mjs' : 'sum.py';
          const read = await window.tapkit.codeCommand({ requestId: requestId() }, 'code.read', {
            runId,
            path,
          });
          if (!read.ok || !('code' in read.data) || !read.data.code.read) throw Error('read');
          const patch = await window.tapkit.codeCommand(
            { requestId: requestId() },
            'code.applyPatch',
            { runId, patch: { path, baseHash: read.data.code.read.hash, content } },
          );
          if (!patch.ok) throw Error(patch.error.code);
        },
        {
          runtime,
          content: (runtime === 'node' ? nodeOriginal : pyOriginal).replace('a-b', 'a+b'),
        },
      );
      await preset.click();
      await expect(panel.locator('.terminal-process-meta strong')).toHaveText(/已完成.*退出码 0/, {
        timeout: 45000,
      });
    }
    await panel.getByRole('button', { name: '打开交互终端', exact: true }).click();
    await expect(panel.locator('.terminal-process-meta strong')).toHaveText('运行中', {
      timeout: 30000,
    });
    const input = panel.getByRole('textbox', { name: '终端输入', exact: true });
    await input.focus();
    await input.pressSequentially('print("UI_RESULT:" + str(6*7))', { delay: 20 });
    await input.press('Enter');
    await expect(panel.locator('.xterm-accessibility')).toContainText('UI_RESULT:42', {
      timeout: 10000,
    });
    await panel.getByRole('button', { name: '停止运行', exact: true }).click();
    await expect(panel.locator('.terminal-process-meta strong')).toHaveText(/已取消/, {
      timeout: 15000,
    });
    await panel.getByRole('combobox', { name: '运行环境', exact: true }).selectOption('node');
    await panel
      .getByRole('textbox', { name: '命令', exact: true })
      .fill('node -e "console.log(\'大输出\'.repeat(30000))"');
    await panel.getByRole('button', { name: '运行命令', exact: true }).click();
    await expect(panel.locator('.terminal-process-meta strong')).toHaveText(/已完成.*退出码 0/, {
      timeout: 30000,
    });
    await expect(panel.getByRole('button', { name: '查看下一段日志', exact: true })).toBeEnabled({
      timeout: 10000,
    });
    const firstPage = await panel.locator('.xterm-accessibility').innerText();
    await panel.getByRole('button', { name: '查看下一段日志', exact: true }).click();
    await expect(panel.getByRole('button', { name: '从头查看日志', exact: true })).toBeEnabled();
    expect(firstPage.length).toBeGreaterThan(0);
    await panel
      .getByRole('textbox', { name: '命令', exact: true })
      .fill('node --test --test-isolation=none');
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.show();
      window.focus();
    });
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
    const visibility = await page.evaluate(() => document.visibilityState);
    expect(visibility).toBe('visible');
    const heartbeat = await page.evaluate(async () => {
      const start = performance.now();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - start;
    });
    expect(heartbeat).toBeLessThan(1000);
    await mkdir('docs/evidence/P09-02/desktop', { recursive: true });
    const metrics: unknown[] = [];
    for (const [theme, width] of [
      ['light', 1360],
      ['dark', 980],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]!.setSize(w, 960),
        width,
      );
      await page
        .locator('.desktop-shell')
        .evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(250);
      metrics.push(
        await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const inner = element.querySelector<HTMLElement>('.xterm')!,
            screen = element.querySelector<HTMLElement>('.xterm-screen')!,
            viewport = element.querySelector<HTMLElement>('.xterm-viewport')!;
          return {
            width: innerWidth,
            panelWidth: rect.width,
            overflow: element.scrollWidth - element.clientWidth,
            terminal: element.querySelector('.terminal-surface')!.getBoundingClientRect().toJSON(),
            commands: element.querySelectorAll('button').length,
            grid: {
              width: screen.getBoundingClientRect().width,
              height: screen.getBoundingClientRect().height,
              availableWidth: inner.clientWidth - (viewport.offsetWidth - viewport.clientWidth),
              availableHeight: inner.clientHeight,
              viewportBackground: getComputedStyle(viewport).backgroundColor,
              surfaceBackground: getComputedStyle(element.querySelector('.terminal-surface')!)
                .backgroundColor,
            },
          };
        }),
      );
      await page.screenshot({ path: `docs/evidence/P09-02/desktop/terminal-${theme}.png` });
      await panel.locator('.terminal-surface').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/evidence/P09-02/desktop/window-${theme}.png` });
    }
    await writeFile(
      'docs/evidence/P09-02/desktop/metrics.json',
      JSON.stringify({ heartbeatMs: heartbeat, visibility, focused: true, metrics }, null, 2),
    );
    expect(await readFile(join(source, 'sum.mjs'), 'utf8')).toBe(nodeOriginal);
    expect(await readFile(join(source, 'sum.py'), 'utf8')).toBe(pyOriginal);
    expect(metrics.every((m) => (m as { overflow: number }).overflow <= 1)).toBe(true);
    expect(
      metrics.every((m) => {
        const { grid } = m as {
          grid: { width: number; height: number; availableWidth: number; availableHeight: number };
        };
        return grid.width <= grid.availableWidth + 1 && grid.height <= grid.availableHeight + 1;
      }),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
