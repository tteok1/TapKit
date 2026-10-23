import { protectClipboard } from './clipboard-guard';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openSessionFixture } from './session-fixture';

const evidence = resolve('docs/evidence/P02-03/clipboard-attachments-2026-10-23');
let app: ElectronApplication;
let restoreClipboard: (() => Promise<void>) | undefined;
test.beforeAll(async () => {
  restoreClipboard = await protectClipboard();
});
test.afterAll(async () => {
  await restoreClipboard?.();
});
async function launch() {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/Clipboard attachments '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const rawEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TAPKIT_DATA_DIR: dir,
    TAPKIT_CHAT_FIXTURE: 'P02-02',
  };
  delete rawEnv.ELECTRON_RUN_AS_NODE;
  const env = Object.fromEntries(
    Object.entries(rawEnv).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  await openSessionFixture(page);
  await expect(page.getByLabel('输入草稿', { exact: true })).toBeEnabled();
  await page.bringToFront();
  return page;
}
test.afterEach(async () => {
  await app?.close();
});
async function send(page: Page, text: string) {
  const count = await page.locator('.chat-message.assistant').count();
  await page.getByLabel('输入草稿', { exact: true }).fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const answer = page.locator('.chat-message.assistant').nth(count);
  await expect(answer.locator('.chat-markdown')).toBeVisible();
  return answer;
}
test('P02-02 native clipboard copies user, assistant, code, table and selected text exactly with rendered math', async () => {
  const page = await launch();
  const input = page.getByLabel('输入草稿', { exact: true });
  // The runner backs up all OS clipboard formats in a separate STA process.
  await app.evaluate(({ clipboard }) => clipboard.writeText('synthetic clipboard sentinel'));
  expect(
    await page.evaluate(async () => {
      try {
        await navigator.clipboard.writeText('denied browser route');
        return 'allowed';
      } catch {
        return 'denied';
      }
    }),
  ).toBe('denied');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    'synthetic clipboard sentinel',
  );
  const user = ' 前后空白\t中文🙂e\u0301\n'.repeat(5000) + '末尾\n ';
  const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  // Populate the large exact message through the same send DTO; this case tests
  // the copy button rather than Playwright's giant keyboard insertion action.
  await page.evaluate(
    async ({ sessionId, text }) => {
      const id = () => crypto.randomUUID().replace(/^(.{14})./, (_, p: string) => p + '7');
      const reply = await window.tapkit.chatCommand({ requestId: id() }, 'messages.send', {
        sessionId,
        clientMessageId: id(),
        text,
        attachments: [],
        mode: 'chat',
      });
      if (!reply.ok) throw Error(reply.error.code);
    },
    { sessionId, text: user },
  );
  await expect(page.locator('.chat-message.user').last().locator('.chat-user-text')).toBeVisible();
  const userMessage = page.locator('.chat-message.user').last();
  await userMessage.getByRole('button', { name: '复制回复', exact: true }).click();
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(user);
  await expect(userMessage.getByRole('button', { name: '已复制回复', exact: true })).toBeVisible();
  await openSessionFixture(page);
  const assistantText = '中文🙂e\u0301\t完整回复。';
  const answer = await send(page, assistantText);
  await answer.getByRole('button', { name: '复制回复', exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    '隔离测试回复：' + assistantText,
  );
  const code = '\n\tconst 中文 = "🙂";  \n\n  中文;\n';
  const codeAnswer = await send(page, '\n```js\n' + code + '\n```');
  await codeAnswer.getByRole('button', { name: '复制代码', exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(code);
  await input.focus();
  await input.press('Control+v');
  await expect(input).toHaveValue(code);
  const mathAnswer = await send(page, '\n|列一|列二|空列|\n|---|---|---|\n|中文🙂|$x^2$||');
  await expect(mathAnswer.locator('.katex')).toHaveCount(1);
  await expect(mathAnswer.locator('.katex-error')).toHaveCount(0);
  await expect(mathAnswer.locator('.katex .katex-html')).toBeVisible();
  await mathAnswer.locator('.chat-table').hover();
  await mathAnswer.getByRole('button', { name: '复制表格', exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    '列一\t列二\t空列\n中文🙂\tx^2\t',
  );
  await input.focus();
  await input.press('Control+v');
  await expect(input).toHaveValue('列一\t列二\t空列\n中文🙂\tx^2\t');
  const selectionAnswer = await send(page, 'The amber lighthouse guides a small boat safely home.');
  const paragraph = selectionAnswer.locator('.chat-markdown p').first();
  await paragraph.scrollIntoViewIfNeeded();
  await input.evaluate((el) => el.blur());
  await paragraph.evaluate((el) => {
    const node = el.firstChild!;
    const range = document.createRange();
    const start = node.textContent!.indexOf('The amber');
    range.setStart(node, start);
    range.setEnd(node, start + 'The amber lighthouse guides a small boat safely home.'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  await expect(toolbar).toBeVisible();
  const selected = await page.evaluate(() => getSelection()!.toString());
  expect(selected).toBe('The amber lighthouse guides a small boat safely home.');
  await toolbar.getByRole('button', { name: '复制选区', exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(selected);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+c');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(selected);
  const boundary = '中文🙂\n\t'.repeat(400_000).slice(0, 2_000_000);
  await page.evaluate((text) => window.tapkit.copyText(text), boundary);
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(boundary);
  expect(
    await page.evaluate(async () => {
      try {
        await window.tapkit.copyText('x'.repeat(2_000_001));
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(boundary);
  await writeFile(
    resolve(evidence, 'native-copy.json'),
    JSON.stringify(
      {
        browserPermissionDenied: true,
        fullUserLength: user.length,
        unicodeExact: true,
        codeWhitespaceExact: true,
        selectionAndKeyboardExact: true,
        tableTSVExact: true,
        mathVisible: true,
        maximumAccepted: boundary.length,
        oversizeRejected: true,
      },
      null,
      2,
    ),
  );
});
test('P02-02 rounded attachment cards show progress, cancel one late upload and fit focus and zoom layouts', async () => {
  const page = await launch();
  const input = page.getByLabel('输入草稿', { exact: true });
  const composer = page.locator('.composer');
  await composer.locator('input[type=file]').setInputFiles([
    { name: 'TapKit_test.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic card text') },
    {
      name: 'image.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    },
  ]);
  const cards = composer.locator('.composer-attachment');
  await expect(cards).toHaveCount(2);
  const textCard = cards.filter({ hasText: 'TapKit_test.txt' }),
    image = cards.filter({ hasText: 'image.png' });
  await expect(textCard).toContainText('已就绪');
  await expect(image).toContainText('仅原件');
  await expect(composer.locator('img')).toHaveCount(0);
  await expect(composer).not.toContainText('未就绪的材料需要');
  await expect(composer).not.toContainText('原件保存与内容读取');
  await expect(image.getByRole('button', { name: '移除附件 image.png', exact: true })).toHaveCSS(
    'opacity',
    '0',
  );
  await image.hover();
  await expect(image.getByRole('button', { name: '移除附件 image.png', exact: true })).toHaveCSS(
    'opacity',
    '1',
  );
  await image.getByRole('button', { name: '移除附件 image.png', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await textCard.hover();
  await textCard.getByRole('button', { name: '附件操作 TapKit_test.txt', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载原件', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(500, 200);
  const originalBorder = await composer.evaluate((el) => getComputedStyle(el).borderColor);
  await input.focus();
  await expect(composer).toHaveCSS('border-color', originalBorder);
  await expect(composer).not.toHaveCSS('box-shadow', 'none');
  await page.screenshot({
    path: resolve(evidence, 'cards-latest-light.png'),
    animations: 'disabled',
  });
  // Delay only a real Host reply, retaining all production sender/DTO/handle checks.
  await app.evaluate(({ ipcMain }) => {
    const handlers = (
      ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
    )._invokeHandlers;
    const original = handlers.get('tapkit:request')!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Reflect.set(globalThis, 'cardRelease', release);
    Reflect.set(globalThis, 'cardHeld', false);
    let used = false;
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', async (event, raw) => {
      const reply = await original(event, raw);
      if (!used && raw.command === 'files.import') {
        used = true;
        Reflect.set(globalThis, 'cardHeld', true);
        await gate;
      }
      return reply;
    });
  });
  const physical = resolve(evidence, 'cancel-this.txt');
  const keep = resolve(evidence, 'keep-this.txt');
  await writeFile(physical, 'cancel late result');
  await writeFile(keep, 'keep batch sibling');
  await composer.locator('input[type=file]').setInputFiles([physical, keep]);
  await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'cardHeld'))).toBe(true);
  const cancel = cards.filter({ hasText: 'cancel-this.txt' });
  await cancel.hover();
  await cancel.getByRole('button', { name: '移除附件 cancel-this.txt', exact: true }).click();
  await app.evaluate(() => Reflect.get(globalThis, 'cardRelease')());
  await expect(cards.filter({ hasText: 'cancel-this.txt' })).toHaveCount(0);
  await expect(cards.filter({ hasText: 'keep-this.txt' })).toContainText('已就绪');
  await expect(cards).toHaveCount(2);
  const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  await expect
    .poll(() =>
      page.evaluate(async (sessionId) => {
        const r = await window.tapkit.chatCommand(
          { requestId: crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7') },
          'drafts.get',
          { sessionId, windowId: window.tapkit.windowSlot },
        );
        if (!r.ok || !('attachments' in r.data)) throw Error('draft');
        return r.data.attachments.length;
      }, sid),
    )
    .toBe(2);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(960, 640),
  );
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByLabel('缩放', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page.locator('.sidebar [data-session-id="' + sid + '"] .history-link').click();
  await expect(page.locator('.sidebar-toggle-anchor button')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(cards).toHaveCount(2);
  await input.focus();
  const strip = composer.locator('.composer-attachments');
  await expect(strip).toHaveCSS('overflow-x', 'auto');
  await strip.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const geometry = await composer.evaluate((el) => ({
    composer: el.getBoundingClientRect().toJSON(),
    cards: [...el.querySelectorAll('.composer-attachment')].map((node) =>
      node.getBoundingClientRect().toJSON(),
    ),
    width: innerWidth,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  await page.screenshot({
    path: resolve(evidence, 'cards-latest-dark-200.png'),
    animations: 'disabled',
  });
  await writeFile(
    resolve(evidence, 'card-geometry-latest.json'),
    JSON.stringify(geometry, null, 2),
  );
  expect(geometry.overflow).toBe(false);
  for (const card of geometry.cards) {
    expect(card.width).toBeLessThanOrEqual(484);
  }
  expect(geometry.cards.at(-1)!.right).toBeLessThanOrEqual(geometry.composer.right);
  expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.height + 1);
  await page.screenshot({
    path: resolve(evidence, 'cards-latest-dark-200.png'),
    animations: 'disabled',
  });
  await writeFile(resolve(evidence, 'card-geometry.json'), JSON.stringify(geometry, null, 2));
});

test('P02-02 removing a parsing card during first send excludes it from the actual model input', async () => {
  const page = await launch();
  await page.keyboard.press('Control+n');
  const input = page.getByLabel('输入草稿', { exact: true });
  await input.fill('Keep the question after removing its material.');
  await input.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(
      new File(['synthetic material'], 'remove-while-reading.txt', { type: 'text/plain' }),
    );
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('.composer-attachment')).toContainText('待上传');
  await app.evaluate(({ ipcMain }) => {
    const handlers = (
      ipcMain as unknown as {
        _invokeHandlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
      }
    )._invokeHandlers;
    const original = handlers.get('tapkit:request')!;
    Reflect.set(globalThis, 'readingProjection', true);
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', async (event, raw) => {
      const reply = await original(event, raw);
      // Delay only the UI's ready projection to exercise the parsing interval.
      // Core really imports/authorizes the file; no database status is forged.
      if (
        raw.command === 'inputs.references' &&
        raw.payload.refs?.length &&
        Reflect.get(globalThis, 'readingProjection')
      ) {
        const r = reply as { ok: boolean; data: { materials: unknown[] } };
        if (r.ok)
          return {
            ...r,
            data: {
              ...r.data,
              materials: r.data.materials.map((m) => ({ ...(m as object), state: 'parsing' })),
            },
          };
      }
      return reply;
    });
  });
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const card = page.locator('.composer-attachment');
  await expect(card).toContainText('解析中');
  await card.hover();
  await card
    .getByRole('button', { name: '移除附件 remove-while-reading.txt', exact: true })
    .click();
  await app.evaluate(() => Reflect.set(globalThis, 'readingProjection', false));
  await expect(page.locator('.chat-message.assistant .chat-markdown')).toContainText(
    'Keep the question',
  );
  const attachments = await page.evaluate(async () => {
    const sessionId = document.querySelector<HTMLElement>('.chat-surface')!.dataset.sessionId!;
    const result = await window.tapkit.chatCommand(
      { requestId: crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7') },
      'messages.list',
      { sessionId },
    );
    if (!result.ok || !('messages' in result.data)) throw Error('messages');
    return result.data.messages.find((message) => message.role === 'user')!.attachments;
  });
  expect(attachments).toEqual([]);
  await expect(page.locator('.composer-attachment')).toHaveCount(0);
});
