import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron } from './test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('P09-01 desktop selects a real directory, reviews lines, records feedback, reverts/restores and retains the source', async () => {
  test.setTimeout(240000);
  const root = await mkdtemp(resolve('.test-data/P09-01 desktop ')),
    data = join(root, 'profile'),
    source = join(root, '中文代码');
  await mkdir(source);
  const original =
    'export const sum = (a, b) => a - b;\n' +
    Array.from(
      { length: 23 },
      (_, i) =>
        '// fixture line ' + (i + 2) + (i === 12 ? ' ' + 'long code sample '.repeat(25) : ''),
    ).join('\n') +
    '\n';
  const modified = original
    .replace('a - b', 'a + b')
    .replace('// fixture line 5', '// inserted comment\n// fixture line 5')
    .replace('// fixture line 9\n', '');
  await writeFile(join(source, 'sum.ts'), original);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: data }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  try {
    for (const stream of [app.process().stdout, app.process().stderr])
      stream?.on('data', (chunk) => {
        for (const line of String(chunk).split('\n'))
          if (line.includes('TAPKIT_CORE_')) console.log(line);
      });
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByRole('textbox', { name: '工作目标', exact: true }).fill('P09-01 本地代码修复');
    await form.getByLabel('先查看计划', { exact: true }).check();
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const panel = page.getByRole('region', { name: '代码项目', exact: true });
    await expect(panel).toBeVisible();
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    await panel.getByRole('button', { name: '选择本地代码目录', exact: true }).click();
    await panel.getByRole('button', { name: '创建独立修改副本', exact: true }).click();
    await panel.getByRole('button', { name: 'sum.ts', exact: true }).click();
    await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a - b');
    const runId = await page.evaluate(async () => {
      const id = crypto.randomUUID();
      const r = await window.tapkit.workCommand(
        { requestId: id.slice(0, 14) + '7' + id.slice(15) },
        'runs.list',
        { query: 'P09-01 本地代码修复' },
      );
      if (!r.ok || !('workItems' in r.data) || !r.data.workItems[0]) throw Error('run');
      return r.data.workItems[0].runId;
    });
    await page.evaluate(
      async ({ runId, content }) => {
        const id = crypto.randomUUID(),
          options = { requestId: id.slice(0, 14) + '7' + id.slice(15) };
        const r = await window.tapkit.codeCommand(options, 'code.read', { runId, path: 'sum.ts' });
        if (!r.ok || !('code' in r.data) || !r.data.code.read) throw Error('read');
        const patch = await window.tapkit.codeCommand(
          {
            ...options,
            requestId:
              options.requestId.slice(0, -1) + (options.requestId.endsWith('a') ? 'b' : 'a'),
          },
          'code.applyPatch',
          {
            runId,
            patch: {
              path: 'sum.ts',
              baseHash: r.data.code.read.hash,
              content,
            },
          },
        );
        if (!patch.ok) throw Error(patch.error.code);
      },
      { runId, content: modified },
    );
    await panel.getByRole('button', { name: '刷新代码与差异', exact: true }).click();
    await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a + b');
    await panel.getByRole('button', { name: '当前副本 1', exact: true }).click();
    await panel
      .getByRole('textbox', { name: '行反馈', exact: true })
      .fill('保留加法，并添加类型声明');
    await panel.getByRole('button', { name: '保存行反馈', exact: true }).click();
    await expect(panel.locator('.code-comment')).toContainText('保留加法');
    await panel.getByRole('button', { name: '接受此文件', exact: true }).click();
    await expect(panel).toContainText('已接受');
    await panel.getByRole('button', { name: '撤销此文件修改', exact: true }).click();
    await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a - b');
    await panel.getByRole('button', { name: '恢复上次内容', exact: true }).click();
    await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a + b');
    const oldLine = panel.getByRole('button', { name: '原版本 1', exact: true }),
      newLine = panel.getByRole('button', { name: '当前副本 1', exact: true });
    await oldLine.click();
    await expect(oldLine).toHaveAttribute('aria-pressed', 'true');
    await newLine.click();
    await expect(newLine).toHaveAttribute('aria-pressed', 'true');
    await expect(oldLine).toHaveAttribute('aria-pressed', 'false');
    const unchanged = panel.getByRole('button', { name: '当前副本 2', exact: true });
    await unchanged.click();
    await expect(unchanged).toHaveAttribute('aria-pressed', 'true');
    await expect(unchanged.locator('..')).toHaveAttribute('data-changed', 'false');
    const oldUnchanged = panel.getByRole('button', { name: '原版本 2', exact: true });
    await oldUnchanged.click();
    await expect(oldUnchanged).toHaveAttribute('aria-pressed', 'true');
    await expect(oldUnchanged.locator('..')).toHaveAttribute('data-changed', 'false');
    await newLine.click();
    await newLine.focus();
    await expect(newLine).toBeFocused();
    const metrics = await panel.evaluate((node) => {
      const button = node.querySelector('.code-line-number')!,
        line = button.parentElement!,
        container = node.querySelector('.code-lines') as HTMLElement;
      const original = container.scrollLeft;
      container.scrollLeft = 100;
      const horizontal = container.scrollLeft > 0;
      container.scrollLeft = original;
      return {
        lineHeight: line.getBoundingClientRect().height,
        maxRowHeight: Math.max(
          ...Array.from(node.querySelectorAll('.code-lines > div')).map(
            (row) => row.getBoundingClientRect().height,
          ),
        ),
        buttonHeight: button.getBoundingClientRect().height,
        horizontalScrollWorks: horizontal,
        verticalScroll: container.scrollHeight > container.clientHeight,
        focusOutline: getComputedStyle(document.activeElement!).outlineWidth,
        sourceLines: node.querySelectorAll('.code-line-number').length,
      };
    });
    expect(metrics.lineHeight).toBeLessThanOrEqual(25);
    expect(metrics.maxRowHeight).toBeLessThanOrEqual(25);
    expect(metrics.horizontalScrollWorks).toBe(true);
    expect(metrics.verticalScroll).toBe(true);
    expect(parseFloat(metrics.focusOutline)).toBeGreaterThanOrEqual(2);
    await mkdir('docs/evidence/P09-01/desktop', { recursive: true });
    await writeFile(
      'docs/evidence/P09-01/desktop/interaction-metrics.json',
      JSON.stringify(metrics, null, 2) + '\n',
    );
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await expect(panel.getByRole('button', { name: '刷新代码与差异', exact: true })).toBeEnabled();
    await panel.scrollIntoViewIfNeeded();
    await mkdir('docs/evidence/P09-01/desktop', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/P09-01/desktop/code-light.png',
      animations: 'disabled',
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(980, 900));
    await page.evaluate(() =>
      document.querySelector('.desktop-shell')!.setAttribute('data-theme', 'dark'),
    );
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    await panel.scrollIntoViewIfNeeded();
    expect(await panel.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await page.screenshot({
      path: 'docs/evidence/P09-01/desktop/code-dark.png',
      animations: 'disabled',
    });
    await panel.getByRole('button', { name: '按反馈创建修订任务', exact: true }).click();
    await expect(page.locator('.work-detail > h2')).toContainText('请根据代码行反馈');
    await page
      .getByRole('region', { name: '代码项目', exact: true })
      .getByRole('button', { name: /^sum.ts/ })
      .click();
    await expect(page.getByRole('region', { name: '代码项目', exact: true })).toContainText(
      '保留加法',
    );
    expect(await readFile(join(source, 'sum.ts'), 'utf8')).toContain('a - b');
  } finally {
    await app.close();
  }
});
