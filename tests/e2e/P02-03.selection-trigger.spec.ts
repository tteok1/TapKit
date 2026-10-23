import { openSessionFixture } from './session-fixture';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
let app: ElectronApplication;
const evidence = resolve('docs/evidence/P02-03/selection-trigger-2026-10-21');
const sentence = 'The amber lighthouse guides a small boat safely home.';
test.afterEach(async () => {
  await app?.close();
});

test('P02-03 selection toolbar follows paragraph drag released in surrounding space', async () => {
  test.setTimeout(180_000);
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 selection trigger '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
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
  const shiftSelect = async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await paragraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const point = await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.setStart(el.firstChild!, 0);
      range.setEnd(el.firstChild!, 1);
      const rect = range.getBoundingClientRect();
      const text = el.firstChild!;
      range.setStart(text, text.textContent!.length - 1);
      range.setEnd(text, text.textContent!.length);
      const last = range.getBoundingClientRect();
      return {
        x: rect.left + 0.5,
        y: rect.top + rect.height / 2,
        endX: last.right - 0.5,
        endY: last.top + last.height / 2,
      };
    });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.endX, point.endY);
    await page.keyboard.up('Shift');
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
      .toBe(sentence);
    await expect(toolbar).toBeVisible();
  };
  const observations: unknown[] = [];
  for (const direction of ['forward', 'backward'] as const) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.getSelection()?.removeAllRanges();
    });
    await paragraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const points = await paragraph.evaluate((el) => {
      const text = el.firstChild!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const first = range.getBoundingClientRect();
      range.setStart(text, text.textContent!.length - 1);
      range.setEnd(text, text.textContent!.length);
      const last = range.getBoundingClientRect();
      const body = el.closest('.chat-markdown')!.getBoundingClientRect();
      return {
        start: { x: first.left + 0.5, y: first.top + first.height / 2 },
        end: { x: last.right - 0.5, y: last.top + last.height / 2 },
        left: body.left - 12,
        right: body.right + 12,
      };
    });
    const start = direction === 'forward' ? points.start : points.end;
    const end =
      direction === 'forward'
        ? { x: points.right, y: points.end.y }
        : { x: points.left, y: points.start.y };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
      .toBe(sentence);
    // Give deferred native selection/scroll events time to settle; the bubble must remain.
    await page.waitForTimeout(100);
    const visible = await toolbar.isVisible();
    const hit = await page.evaluate(
      ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement)?.className,
      end,
    );
    observations.push({ direction, visible, release: end, releaseElementClass: hit });
    await page.screenshot({ path: resolve(evidence, `margin-${direction}.png`) });
    await expect.soft(toolbar, JSON.stringify({ direction, hit })).toBeVisible({ timeout: 1500 });
    await page.keyboard.press('Escape');
  }
  await writeFile(
    resolve(evidence, 'observations.json'),
    JSON.stringify(observations, null, 2) + '\n',
  );
  const word = await paragraph.evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.firstChild!, 4);
    range.setEnd(el.firstChild!, 9);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.dblclick(word.x, word.y);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe('amber');
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar).toBeHidden();
  await shiftSelect();
  await input.click();
  await input.fill('只在输入框中选择');
  await page.keyboard.press('Control+a');
  await expect(toolbar).toBeHidden();
  await shiftSelect();
  await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  await expect(
    page
      .locator('.chat-message.assistant')
      .last()
      .getByRole('button', { name: '所选原文（1）', exact: true }),
  ).toBeVisible();
});
