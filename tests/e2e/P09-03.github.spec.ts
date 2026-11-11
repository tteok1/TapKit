import { test, expect, _electron as electron } from './test';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

test('P09-03 desktop rejects invalid credentials and commits only after reviewing a tested change', async () => {
  test.setTimeout(300000);
  const root = await mkdtemp(resolve('.test-data/P09-03 desktop '));
  const source = join(root, '中文仓库');
  await mkdir(source);
  const original = 'export const sum=(a,b)=>a-b;\n';
  const fixed = original.replace('a-b', 'a+b');
  await writeFile(join(source, 'sum.mjs'), original);
  await writeFile(join(source, 'package.json'), '{"type":"module"}\n');
  await writeFile(
    join(source, 'sum.test.mjs'),
    "import {sum} from './sum.mjs'; import assert from 'node:assert/strict'; import test from 'node:test'; test('sum',()=>assert.equal(sum(2,3),5));\n",
  );
  const git = (...args: string[]) =>
    execFileSync(resolve('.runtime/git/cmd/git.exe'), args, {
      cwd: source,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL' },
    });
  git('init', '--quiet', '--template=', '--initial-branch=main');
  git('add', '--all');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@localhost',
    'commit',
    '--quiet',
    '-m',
    'original',
  );
  const initialHead = git('rev-parse', 'HEAD');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: join(root, 'profile') }).filter(
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
    for (const stream of [app.process().stdout, app.process().stderr])
      stream?.on('data', (chunk) => {
        for (const line of String(chunk).split('\n'))
          if (/^TAPKIT_CORE_(READY|PONG|EXIT|DIAGNOSTIC)\b/.test(line)) console.log(line.trim());
      });
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByRole('textbox', { name: '工作目标', exact: true }).fill('P09-03 审阅本地提交');
    await form.getByLabel('先查看计划', { exact: true }).check();
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const code = page.getByRole('region', { name: '代码项目', exact: true });
    const github = code.getByRole('region', { name: 'GitHub', exact: true });
    await github.getByLabel('授权仓库', { exact: true }).fill('fixture/tapkit-r07');
    await github.getByLabel('细粒度访问令牌', { exact: true }).fill('invalid-fixture');
    await github.getByRole('button', { name: '验证并连接', exact: true }).click();
    await expect(github.getByRole('alert')).toHaveText('请检查仓库、细粒度令牌或分支名称的格式。');
    await expect(github.getByLabel('细粒度访问令牌', { exact: true })).toHaveValue('');
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    await code.getByRole('button', { name: '选择本地代码目录', exact: true }).click();
    await code.getByRole('button', { name: '创建独立修改副本', exact: true }).click();
    await page.evaluate(async (content) => {
      const options = () => {
        const id = crypto.randomUUID();
        return { requestId: id.slice(0, 14) + '7' + id.slice(15) };
      };
      const runs = await window.tapkit.workCommand(options(), 'runs.list', {
        query: 'P09-03 审阅本地提交',
      });
      if (!runs.ok || !('workItems' in runs.data) || !runs.data.workItems[0]) throw Error('run');
      const runId = runs.data.workItems[0].runId;
      const read = await window.tapkit.codeCommand(options(), 'code.read', {
        runId,
        path: 'sum.mjs',
      });
      if (!read.ok || !('code' in read.data) || !read.data.code.read) throw Error('read');
      const patch = await window.tapkit.codeCommand(options(), 'code.applyPatch', {
        runId,
        patch: { path: 'sum.mjs', baseHash: read.data.code.read.hash, content },
      });
      if (!patch.ok) throw Error(patch.error.code);
    }, fixed);
    await code.getByRole('button', { name: '刷新代码与差异', exact: true }).click();
    await code.getByRole('button', { name: /^sum\.mjs/ }).click();
    await code.getByRole('button', { name: '接受此文件', exact: true }).click();
    const terminal = code.getByRole('region', { name: '运行与终端', exact: true });
    await terminal.getByRole('button', { name: '准备运行环境', exact: true }).click();
    await expect(terminal.getByRole('status').filter({ hasText: '环境已准备' })).toBeVisible({
      timeout: 60000,
    });
    await terminal.getByRole('button', { name: 'Node 测试', exact: true }).click();
    await expect(terminal.locator('.terminal-process-meta strong')).toHaveText(/已完成.*退出码 0/, {
      timeout: 45000,
    });
    const commitForm = github.getByRole('form', { name: '审阅本地提交', exact: true });
    await expect(commitForm).toBeVisible();
    const message = commitForm.getByRole('textbox', { name: '提交说明', exact: true });
    await message.clear();
    await expect(message).toHaveValue('');
    await message.fill('修复求和');
    const preview = commitForm.getByRole('button', { name: '审阅本地提交', exact: true });
    await preview.press('Enter');
    const review = github.getByRole('region', { name: '审阅本地提交', exact: true });
    await expect(review.getByRole('heading')).toBeFocused();
    await expect(review).toContainText('当前分支 HEAD');
    await expect(review).toContainText('sum.mjs');
    await expect(review).toContainText('修复求和');
    const evidence = 'docs/evidence/P09-03/desktop';
    await mkdir(evidence, { recursive: true });
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
      await review.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await expect(review).toBeVisible();
      const bounds = await github.evaluate((el) => ({
        width: innerWidth,
        overflow: el.scrollWidth - el.clientWidth,
      }));
      expect(bounds.overflow).toBeLessThanOrEqual(1);
      const styles = await review.evaluate((element) => ({
        label: getComputedStyle(element.querySelector('dt')!).color,
        surface: getComputedStyle(element).backgroundColor,
        divider: getComputedStyle(element.querySelector('dl')!).borderTopColor,
      }));
      metrics.push({ theme, ...bounds, ...styles });
      await page.screenshot({ path: `${evidence}/commit-review-${theme}.png` });
    }
    await writeFile(`${evidence}/metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
    await github.getByRole('button', { name: '返回编辑', exact: true }).press('Enter');
    await expect(review).toHaveCount(0);
    await expect(preview).toBeFocused();
    await page.keyboard.press('Enter');
    await github.getByRole('button', { name: '确认本地提交', exact: true }).press('Enter');
    await expect(github.locator('.github-target')).toContainText(/本地提交.*修复求和/);
    await expect(github.locator('.github-target')).toBeFocused();
    await expect(github.getByRole('button', { name: '审阅推送', exact: true })).toHaveCount(0);
    expect(await readFile(join(source, 'sum.mjs'), 'utf8')).toBe(original);
    expect(git('rev-parse', 'HEAD')).toBe(initialHead);
  } finally {
    await app.close();
  }
});
