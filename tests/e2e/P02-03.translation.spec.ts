import { mkdtemp } from '../../scripts/test-temp.mjs';
import { openSessionFixture } from './session-fixture';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
let app: ElectronApplication;
const evidence = resolve('docs/evidence/P02-03/translation-target-2026-10-21');
const sentence = 'The amber lighthouse guides a small boat safely home.';
test.afterEach(async () => {
  await app?.close();
});

test('P02-03 translation echo shows an explicit failed translation without marking completion', async () => {
  test.setTimeout(180_000);
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 selection trigger '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      TAPKIT_CHAT_FIXTURE: 'P02-02',
      TAPKIT_TRANSLATION_ECHO_FIXTURE: '1',
    }).filter((r): r is [string, string] => r[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
  );
  await openSessionFixture(page);
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  const input = page.getByLabel('输入草稿', { exact: true });
  await input.fill('\n\n# P02批测1019\n\n' + sentence + '\n\n');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const paragraph = page
    .locator('.chat-message.assistant .chat-markdown p')
    .filter({ hasText: sentence });
  await expect(paragraph).toBeVisible();
  await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  await expect(page.getByRole('banner')).toContainText('隔离测试回复');
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.getSelection()?.removeAllRanges();
  });
  await paragraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const point = await paragraph.evaluate((el) => {
    const text = el.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const first = range.getBoundingClientRect();
    range.setStart(text, text.textContent!.length - 1);
    range.setEnd(text, text.textContent!.length);
    const last = range.getBoundingClientRect();
    return {
      x: first.left + 0.5,
      y: first.top + first.height / 2,
      endX: last.right - 0.5,
      endY: last.top + last.height / 2,
    };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.endX, point.endY, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe(sentence);
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  const answer = page.locator('.chat-message.assistant').last();
  await expect(answer.locator('.chat-markdown')).toHaveText(sentence);
  await expect(answer).toContainText('翻译未完成：模型原样返回了所选内容。请重试或换一个模型。');
  await expect(page.locator('.chat-progress[role="status"]')).toContainText('部分完成');
  const geometry: unknown[] = [];
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setFullScreen(false);
    window.unmaximize();
  });
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized()),
    )
    .toBe(false);
  for (const width of [1440, 960]) {
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
      width,
    );
    // Windows can round the client area by one CSS pixel at fractional DPI.
    await expect
      .poll(() => page.evaluate((requested) => Math.abs(innerWidth - requested), width))
      .toBeLessThanOrEqual(1);
    await answer.scrollIntoViewIfNeeded();
    const bounds = await answer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        left: rect.left,
        right: rect.right,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(width + 1);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(width + 1);
    geometry.push({ requestedWidth: width, ...bounds });
    await page.screenshot({ path: resolve(evidence, `translation-echo-${width}.png`) });
  }
  await writeFile(
    resolve(evidence, 'translation-echo-geometry.json'),
    JSON.stringify(geometry, null, 2) + '\n',
  );
  const summary = await page.evaluate(async () => {
    const sessionId = document.querySelector<HTMLElement>('.chat-surface')!.dataset.sessionId!;
    const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
    const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
    if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
    return {
      status: r.data.run?.status,
      errorCode: r.data.run?.errorCode,
      calls: r.data.run?.calls,
      answer: r.data.messages.at(-1)?.status,
    };
  });
  expect(summary).toMatchObject({
    status: 'partial',
    errorCode: 'TRANSLATION_UNCHANGED',
    calls: 1,
    answer: 'interrupted',
  });
  await writeFile(
    resolve(evidence, 'translation-echo-ui.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
});
