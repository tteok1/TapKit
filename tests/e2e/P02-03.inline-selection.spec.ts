import { mkdtemp } from '../../scripts/test-temp.mjs';
import { protectClipboard } from './clipboard-guard';
import { openSessionFixture } from './session-fixture';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let app: ElectronApplication;
let restoreClipboard: (() => Promise<void>) | undefined;
test.beforeAll(async () => {
  restoreClipboard = await protectClipboard();
});
test.afterAll(async () => {
  await restoreClipboard?.();
});
const evidence = resolve('docs/evidence/P02-03/inline-selection-2026-10-21');
async function select(page: Page, body: Locator, text: string) {
  // Focusing the composer can schedule a caret scroll on the next frame.
  // Release it before scrolling the source into view and measuring drag points.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await body
    .locator('p')
    .filter({ hasText: text })
    .evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const points = await body.evaluate((el, text) => {
    window.getSelection()?.removeAllRanges();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(text) ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 1);
      const first = range.getBoundingClientRect();
      range.setStart(node, start + text.length - 1);
      range.setEnd(node, start + text.length);
      const last = range.getBoundingClientRect();
      return {
        x1: first.left + 0.5,
        y1: first.top + first.height / 2,
        x2: last.right - 0.5,
        y2: last.top + last.height / 2,
      };
    }
    throw new Error('TEXT_NOT_FOUND');
  }, text);
  const hit = await body.evaluate(
    (el, p) => ({
      first: el.contains(document.elementFromPoint(p.x1, p.y1)),
      last: el.contains(document.elementFromPoint(p.x2, p.y2)),
      firstTag: document.elementFromPoint(p.x1, p.y1)?.outerHTML.slice(0, 150),
      lastTag: document.elementFromPoint(p.x2, p.y2)?.outerHTML.slice(0, 150),
    }),
    points,
  );
  expect(hit, JSON.stringify({ points, hit })).toMatchObject({ first: true, last: true });
  await page.mouse.move(points.x1, points.y1);
  await page.mouse.down();
  await page.mouse.move(points.x2, points.y2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
  return points;
}
async function hoverCopy(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const box = (await button.boundingBox())!;
  await page.mouse.move(1, 1);
  // Moving the actual pointer avoids locator.hover scheduling a second auto-scroll
  // after pointerover when 200% zoom leaves only part of the control visible.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}
test.afterEach(async () => {
  await app?.close();
});

test('P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges', async () => {
  test.setTimeout(240_000);
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/Inline selection '));
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
  await openSessionFixture(page);
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  const input = page.getByLabel('输入草稿', { exact: true });
  await expect(input).toBeEnabled();
  await input.fill(
    '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  );
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const body = page.locator('.chat-message.assistant .chat-markdown').first();
  await expect(body.locator('table')).toContainText('中');
  const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  await expect(toolbar).toBeHidden();
  for (const [width, height, zoom] of [
    [1440, 900, 1],
    [960, 640, 1],
    [1440, 900, 2],
    [960, 640, 2],
  ] as const) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
      [width, height] as [number, number],
    );
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await page.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page
      .getByLabel('主题', { exact: true })
      .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await page
      .locator('.sidebar')
      .locator('[data-session-id="' + sessionId + '"] .history-link')
      .click();
    await expect(body.locator('table')).toContainText('中');
    const code = body.locator('.chat-code').first();
    // Session restore may focus the composer and schedule a caret scroll.
    // Release it before testing a stationary hover in the message scroller.
    await input.evaluate((el) => el.blur());
    await page.mouse.move(1, 1);
    await code.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
    await expect(copyCode).toHaveText('');
    await expect(copyCode).toHaveAttribute('data-tooltip', '复制代码');
    await page.evaluate(() => {
      Reflect.set(window, 'hoverDiagnostic', []);
      for (const type of ['pointerover', 'pointerout', 'scroll'])
        document.addEventListener(
          type,
          (event) => {
            const rows = Reflect.get(window, 'hoverDiagnostic') as unknown[];
            rows.push({
              type,
              target: (event.target as Element)?.tagName,
              tooltip: (event.target as Element)
                ?.closest?.('[data-tooltip]')
                ?.getAttribute('data-tooltip'),
            });
            if (rows.length > 30) rows.shift();
          },
          { capture: true, passive: true },
        );
    });
    await hoverCopy(page, copyCode);
    try {
      await expect(page.getByRole('tooltip')).toHaveText('复制代码');
    } catch (error) {
      const diagnostics = await copyCode.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const scroller = el.closest('.chat-messages')!;
        return {
          innerWidth,
          innerHeight,
          rect: r.toJSON(),
          scroller: scroller.getBoundingClientRect().toJSON(),
          active: document.activeElement?.tagName,
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML,
          events: Reflect.get(window, 'hoverDiagnostic'),
          hint: document.querySelector('.rounded-tooltip')?.outerHTML,
        };
      });
      const target = resolve(
        'docs/evidence/P02-03/clipboard-attachments-2026-10-23',
        `hover-${width}-${height}-${zoom}.json`,
      );
      await writeFile(target, JSON.stringify(diagnostics, null, 2));
      await page.screenshot({ path: target.replace('.json', '.png'), animations: 'disabled' });
      throw error;
    }
    await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
    await expect(copyCode).not.toHaveAttribute('title');
    await copyCode.click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('const n = 1;');
    const table = body.locator('.chat-table');
    await table.scrollIntoViewIfNeeded();
    await input.focus();
    await page.mouse.move(1, 1);
    const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
    await expect(copyTable).toHaveCSS('opacity', '0');
    await table.hover();
    await expect(copyTable).toHaveCSS('opacity', '1');
    await expect(copyTable).toHaveText('');
    const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
    expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
    expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
    await hoverCopy(page, copyTable);
    await expect(page.getByRole('tooltip')).toHaveText('复制表格');
    await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
    await expect(copyTable).not.toHaveAttribute('title');
    await copyTable.click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('A\tB\n中\t2');
    await input.focus();
    await page.mouse.move(1, 1);
    await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
    const point = await select(page, body, 'Amber lighthouse.');
    await expect(toolbar).toBeVisible();
    for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
    const geometry = await toolbar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        tops: [...el.children].map((c) => c.getBoundingClientRect().top),
      };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0);
    expect(geometry.y).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width + 1);
    expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
    expect(Math.max(...geometry.tops) - Math.min(...geometry.tops)).toBeLessThan(1);
    expect(
      Math.min(Math.abs(geometry.y - point.y2), Math.abs(geometry.bottom - point.y2)),
    ).toBeLessThanOrEqual(18 * zoom);
    await page.screenshot({
      path: resolve(evidence, `selection-${width}-${zoom * 100}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(toolbar).toBeHidden();
  }
  await select(page, body, 'Amber lighthouse.');
  await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  const source = await page.evaluate(async (sessionId) => {
    const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
    const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
    if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
    return r.data.messages.at(-1)!.attachments;
  }, sessionId);
  expect(source).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'message',
        range: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
      }),
    ]),
  );
  await expect(toolbar).toBeHidden();
});
