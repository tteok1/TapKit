import { openSessionFixture } from './session-fixture';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
let app: ElectronApplication;
const evidence = resolve('docs/evidence/P02-03/selection-release-2026-10-21');
const sentence = 'The amber lighthouse guides a small boat safely home.';
test.afterEach(async () => {
  await app?.close();
});

test('P02-03 selection release outside highlighted text keeps native selection actions', async () => {
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
  await input.fill('\n\n前文。\n\n' + sentence + '\n\n后文。\n\n');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const paragraph = page
    .locator('.chat-message.assistant .chat-markdown p')
    .filter({ hasText: sentence });
  await expect(paragraph).toBeVisible();
  await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  const observations: unknown[] = [];
  await page.evaluate(() => {
    const events: unknown[] = [];
    Object.assign(window, { releaseEvents: events });
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'selectionchange', 'scroll']) {
      document.addEventListener(
        type,
        (e) => {
          const s = window.getSelection();
          const r = s?.rangeCount ? s.getRangeAt(0) : undefined;
          const describe = (n?: Node | null) =>
            n?.nodeType === Node.TEXT_NODE
              ? n.parentElement?.tagName + '#text'
              : (n as Element)?.tagName;
          events.push({
            type,
            target: (e.target as Element)?.className,
            text: s?.toString(),
            rangeText: r?.toString(),
            start: describe(r?.startContainer),
            end: describe(r?.endContainer),
            startOffset: r?.startOffset,
            endOffset: r?.endOffset,
          });
        },
        true,
      );
    }
  });
  for (const scenario of [
    'after-text',
    'before-text',
    'below-line',
    'above-line',
    'start-left-margin',
    'start-above-line',
    'after-next-paragraph',
    'before-previous-paragraph',
  ]) {
    await page.keyboard.press('Escape');
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
      const r = document.createRange();
      r.setStart(text, 0);
      r.setEnd(text, 1);
      const first = r.getBoundingClientRect();
      r.setStart(text, text.textContent!.length - 1);
      r.setEnd(text, text.textContent!.length);
      const last = r.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return {
        first: { x: first.left + 0.5, y: first.top + first.height / 2 },
        last: { x: last.right - 0.5, y: last.top + last.height / 2 },
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      };
    });
    const { first, last, rect } = points;
    let start = first,
      end = { x: last.x + 12, y: last.y };
    if (scenario === 'before-text') {
      start = last;
      end = { x: first.x - 12, y: first.y };
    }
    if (scenario === 'below-line') end = { x: last.x + 12, y: rect.bottom + 6 };
    if (scenario === 'above-line') {
      start = last;
      end = { x: first.x - 12, y: rect.top - 6 };
    }
    if (scenario === 'start-left-margin') {
      start = { x: first.x - 6, y: first.y };
    }
    if (scenario === 'start-above-line') {
      start = { x: first.x, y: rect.top - 4 };
    }
    if (scenario === 'after-next-paragraph') end = { x: last.x + 12, y: rect.bottom + 38 };
    if (scenario === 'before-previous-paragraph') {
      start = last;
      end = { x: first.x - 12, y: rect.top - 38 };
    }
    await page.evaluate(
      () => ((window as unknown as { releaseEvents: unknown[] }).releaseEvents.length = 0),
    );
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const released = await page.evaluate(() => ({
      text: window.getSelection()?.toString(),
      events: (window as unknown as { releaseEvents: unknown[] }).releaseEvents,
    }));
    const beforeMove = await toolbar.isVisible();
    expect.soft(beforeMove, scenario + ' visible without hover').toBe(true);
    await page.mouse.move(rect.right - 20, rect.top - 40, { steps: 5 });
    await page.waitForTimeout(150);
    const afterMove = await toolbar.isVisible();
    observations.push({ scenario, start, end, ...released, beforeMove, afterMove });
    expect.soft(released.text?.trim(), scenario + ' native selection').toBeTruthy();
    await expect.soft(toolbar, scenario).toBeVisible({ timeout: 1000 });
    if (scenario === 'start-left-margin')
      await page.screenshot({ path: resolve(evidence, 'margin-release-desktop.png') });
  }
  await writeFile(
    resolve(evidence, 'observations.json'),
    JSON.stringify(observations, null, 2) + '\n',
  );
  await page.keyboard.press('Escape');
  await expect(toolbar).toBeHidden();
  await input.click();
  await input.fill('输入框选区不触发正文操作');
  await page.keyboard.press('Control+a');
  await expect(toolbar).toBeHidden();
  // A drag crossing a message header/body must not silently transform a subset.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    const user = document.querySelector('.chat-message.user .chat-user-text')!;
    const assistant = document.querySelector('.chat-message.assistant .chat-markdown')!;
    const range = document.createRange();
    range.setStart(user.firstChild!, 0);
    range.setEnd(assistant, assistant.childNodes.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.waitForTimeout(100);
  await expect(toolbar).toBeHidden();
  // Clear the deliberately invalid range; dragging already selected text starts
  // native drag-and-drop instead of creating a new text selection.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  // End below the last paragraph so the native endpoint extends outside Markdown.
  const lastParagraph = page
    .locator('.chat-message.assistant .chat-markdown p')
    .filter({ hasText: '后文。' });
  await lastParagraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const lastPoints = await lastParagraph.evaluate((el) => {
    const r = document.createRange();
    r.setStart(el.firstChild!, 0);
    r.setEnd(el.firstChild!, 1);
    const first = r.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      x: first.left + 0.5,
      y: first.top + first.height / 2,
      endX: first.left + 100,
      endY: rect.bottom + 28,
    };
  });
  await page.mouse.move(lastPoints.x, lastPoints.y);
  await page.mouse.down();
  await page.mouse.move(lastPoints.endX, lastPoints.endY, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe('后文。');
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  await expect(
    page
      .locator('.chat-message.assistant')
      .last()
      .getByRole('button', { name: '所选原文（1）', exact: true }),
  ).toBeVisible();
});
