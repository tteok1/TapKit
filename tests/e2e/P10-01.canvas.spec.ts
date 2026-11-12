import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type Locator, type Page } from './test';
import { openSessionFixture } from './session-fixture';
import { solidPng } from '../fixtures/P07-01.images';

async function setup() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P10-01 Electron '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  const page = await app.firstWindow();
  return { app, page, dir };
}

async function newCanvas(page: Page) {
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  await page.getByRole('link', { name: '文档画布', exact: true }).press('Enter');
  await page.getByRole('button', { name: '新建画布', exact: true }).press('Enter');
  await expect(page.getByRole('textbox', { name: '文档正文' })).toBeVisible();
}

async function selectParagraph(body: Locator, text: string, placeCaretAtEnd = false) {
  const paragraph = body.locator('p').filter({ hasText: text });
  await expect(paragraph).toHaveText(text);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.evaluate(async (element, collapse) => {
    const doc = element.ownerDocument;
    const editor = element.closest<HTMLElement>('[contenteditable="true"]')!;
    editor.focus({ preventScroll: true });
    const selection = doc.getSelection()!;
    const range = doc.createRange();
    range.selectNodeContents(element);
    if (collapse) range.collapse(false);
    // Let the editor consume selectionchange before a toolbar keypress moves focus.
    const changed = new Promise<void>((resolve) => {
      doc.addEventListener('selectionchange', () => resolve(), { once: true });
    });
    selection.removeAllRanges();
    selection.addRange(range);
    await changed;
  }, placeCaretAtEnd);
  await expect
    .poll(() =>
      paragraph.evaluate((element) => {
        const selection = element.ownerDocument.getSelection();
        return {
          inParagraph: element.contains(selection?.anchorNode ?? null),
          text: selection?.toString(),
        };
      }),
    )
    .toEqual({ inParagraph: true, text: placeCaretAtEnd ? '' : text });
}

test('P10-01 canvas edits, reviews, comments, exports and retains drafts at 200% zoom', async ({}, testInfo) => {
  test.setTimeout(180000);
  const { app, page, dir } = await setup();
  const output = join(dir, 'canvas-export.md');
  try {
    await newCanvas(page);
    const title = page.getByRole('textbox', { name: '文档标题' });
    const body = page.getByRole('textbox', { name: '文档正文' });
    const status = page.getByRole('status').filter({ hasText: /保存/ });
    await title.fill('验收画布');
    await body.press('Control+Home');
    await page.keyboard.insertText('首段保留');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('目标文字');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('最后保留');
    await expect(status).toHaveText(/^已保存 · v(?:[2-9]|\d{2,})$/);
    await selectParagraph(body, '目标文字');
    await page.getByRole('button', { name: 'AI 修改', exact: true }).press('Enter');
    const generate = page.getByRole('button', { name: '生成修改建议' });
    await expect(generate).toBeEnabled();
    await generate.press('Enter');
    const proposal = page.locator('.canvas-change');
    await expect(proposal.locator('dd')).toHaveText(['目标文字', '修订目标文字']);
    await expect(body).not.toContainText('修订');
    await page.getByRole('button', { name: '拒绝', exact: true }).press('Enter');
    await expect(body).not.toContainText('修订');
    await expect(proposal).toHaveCount(0);
    await selectParagraph(body, '目标文字');
    await expect(generate).toBeEnabled();
    await generate.press('Enter');
    await page.getByRole('button', { name: '接受', exact: true }).press('Enter');
    await expect(body.locator('p')).toHaveText(['首段保留', '修订目标文字', '最后保留']);
    await page.getByRole('button', { name: '撤销', exact: true }).press('Enter');
    await expect(body.locator('p')).toHaveText(['首段保留', '目标文字', '最后保留']);
    await page.getByRole('button', { name: '重做', exact: true }).press('Enter');
    await expect(body).toContainText('修订目标文字');

    await selectParagraph(body, '修订目标文字');
    await page.getByRole('button', { name: '批注', exact: true }).press('Enter');
    await page.getByLabel('选区批注').fill('核对数据');
    const addComment = page.getByRole('button', { name: '添加批注' });
    await expect(addComment).toBeEnabled();
    await addComment.press('Enter');
    await expect(page.getByRole('button', { name: '修订目标文字', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '回复', exact: true }).press('Enter');
    await page.getByLabel('批注回复').fill('已复核');
    await page.getByRole('button', { name: '保存回复' }).press('Enter');
    const resolveComment = page.getByRole('button', { name: '解决', exact: true });
    await expect(resolveComment).toBeEnabled();
    await resolveComment.press('Enter');
    await expect(page.getByText('本机用户 · 已解决')).toBeVisible();

    await page.getByRole('button', { name: '查找', exact: true }).press('Enter');
    await page.getByLabel('查找文字').fill('修订目标文字');
    await page.getByLabel('替换为').fill('更新目标');
    await page.getByRole('button', { name: '全部替换' }).press('Enter');
    await expect(body).toContainText('更新目标');
    await page.getByRole('button', { name: '批注', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: '原选区已失效' })).toBeDisabled();
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await page.getByRole('button', { name: '导出', exact: true }).press('Enter');
    await expect(page.getByText('文件已导出。', { exact: true })).toBeVisible();
    expect(await readFile(output, 'utf8')).toContain('更新目标');

    await title.fill('');
    await expect(status).toContainText('保存失败，已保留本机草稿');
    await page.getByRole('link', { name: '文档画布', exact: true }).last().press('Enter');
    await page.getByRole('link', { name: '验收画布' }).press('Enter');
    await expect(title).toHaveValue('');
    await expect(body).toContainText('更新目标');
    await title.fill('草稿恢复成功');
    await expect(status).toContainText('已保存');
    await page.screenshot({ path: testInfo.outputPath('canvas-desktop.png') });
    await page.evaluate(async () => {
      const id = () => {
        const raw = crypto.randomUUID();
        return raw.slice(0, 14) + '7' + raw.slice(15);
      };
      const bootstrap = await window.tapkit.bootstrap({ requestId: id() });
      if (!bootstrap.ok || !('profile' in bootstrap.data)) throw Error('bootstrap');
      const { profile, settings } = bootstrap.data;
      const saved = await window.tapkit.setSettings(
        { requestId: id(), expectedRevision: settings.revision },
        {
          scope: { type: 'profile', id: profile.id },
          patch: { desktop: { ...settings.values.desktop, zoom: 2 } },
        },
      );
      if (!saved.ok) throw Error(saved.error.code);
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(960, 900),
    );
    await expect(page.locator('.desktop-shell')).toHaveCSS('--ui-zoom', '2');
    await expect(page.getByRole('textbox', { name: '文档正文' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const exportButton = page.getByRole('button', { name: '导出', exact: true });
    await exportButton.focus();
    await expect(exportButton).toBeInViewport();
    await expect(exportButton).toBeFocused();
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(testInfo.outputPath('canvas-zoom-200.png'), Buffer.from(png, 'base64'));
  } finally {
    await app.close();
  }
});

test('P10-01 opens a chat reply and preserves two conflicting Electron windows', async () => {
  test.setTimeout(180000);
  const { app, page } = await setup();
  try {
    const replyText = '隔离测试回复：画布来源';
    // Seed the title collision regardless of when automatic titling finishes.
    await openSessionFixture(page, replyText);
    await expect(page.getByRole('banner').getByText(replyText, { exact: true })).toBeVisible();
    await page.getByLabel('输入草稿').fill('画布来源');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const reply = page.locator('article.chat-message.assistant').filter({
      has: page.getByText(replyText, { exact: true }),
    });
    await expect(reply.locator('header small')).toContainText('已发送');
    await reply.getByRole('button', { name: '更多消息操作', exact: true }).click();
    await reply.getByRole('button', { name: '在画布中编辑', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText('画布来源');
    const newWindow = app.waitForEvent('window');
    await page.getByRole('button', { name: '在新窗口打开' }).press('Enter');
    const second = await newWindow;
    await expect(second.getByRole('textbox', { name: '文档正文' })).toContainText('画布来源');
    await page.getByRole('textbox', { name: '文档标题' }).fill('原画布更新');
    await expect(page.getByText('已保存 · v2', { exact: true })).toBeVisible();
    await second.getByRole('textbox', { name: '文档标题' }).fill('窗口冲突副本');
    await expect(second.getByText('检测到并发保存，当前修改已保存为独立副本。')).toBeVisible();
    await second.getByRole('link', { name: '打开副本' }).click();
    await expect(second.getByRole('textbox', { name: '文档标题' })).toHaveValue('窗口冲突副本');
    await expect(page.getByRole('textbox', { name: '文档标题' })).toHaveValue('原画布更新');
  } finally {
    await app.close();
  }
});

test('P10-01 opens a fixed Markdown file and saves linked text, lists, table and static image', async ({}, testInfo) => {
  test.setTimeout(180000);
  const { app, page, dir } = await setup();
  try {
    const markdown = join(dir, '画布资料.md');
    const png = join(dir, '标记.png');
    const original = '## 资料小节\n\n编辑正文\n\n待补充';
    await writeFile(markdown, original);
    await writeFile(png, solidPng());
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
      },
      [markdown, png],
    );
    await page.getByRole('link', { name: '文件', exact: true }).click();
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '待导入文件' });
    await picker.getByRole('button', { name: '开始导入' }).click();
    await picker.getByRole('button', { name: '关闭', exact: true }).click();
    const file = page.locator('.file-library li').filter({ hasText: '画布资料.md' });
    await file.getByRole('button', { name: '排版预览', exact: true }).click();
    await page.getByRole('button', { name: '在画布中编辑', exact: true }).click();
    const body = page.getByRole('textbox', { name: '文档正文' });
    await expect(body.getByRole('heading', { name: '资料小节' })).toBeVisible();
    await page
      .getByRole('region', { name: '目录', exact: true })
      .getByRole('button', { name: '资料小节' })
      .press('Enter');
    await expect(body).toBeFocused();
    await selectParagraph(body, '编辑正文');
    await page.getByRole('button', { name: '链接', exact: true }).click();
    await page.getByLabel('链接地址').fill('https://example.test/');
    await page.getByRole('button', { name: '应用链接' }).press('Enter');
    await expect(body.getByRole('link', { name: '编辑正文' })).toHaveAttribute(
      'href',
      'https://example.test/',
    );
    await selectParagraph(body, '待补充', true);
    await page.getByRole('button', { name: '项目列表' }).press('Enter');
    await expect(body.locator('ul > li')).toHaveText(['待补充']);
    await selectParagraph(body, '待补充', true);
    await page.getByRole('button', { name: '插入表格' }).press('Enter');
    await expect(body.getByRole('table')).toBeVisible();
    await expect(body.locator('ul table')).toHaveCount(0);
    await expect(body.locator('ul > li')).toHaveText(['待补充']);
    await body.press('Control+End');
    await page.getByRole('button', { name: '图片', exact: true }).press('Enter');
    await page.getByLabel('资料库 PNG').selectOption({ label: '标记.png' });
    await page.getByLabel('替代文字').fill('静态标记');
    await page.getByRole('button', { name: '插入图片' }).press('Enter');
    await expect(body.getByRole('img', { name: '静态标记' })).toBeVisible();
    try {
      await expect(page.getByRole('status').filter({ hasText: /保存/ })).toContainText('已保存');
    } catch (error) {
      const content = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.startsWith('tapkit.canvas.draft.'));
        return key ? JSON.parse(localStorage.getItem(key)!).content : null;
      });
      await testInfo.attach('unsaved-canvas-content', {
        body: JSON.stringify(content, null, 2),
        contentType: 'application/json',
      });
      throw error;
    }
    const title = page.getByRole('textbox', { name: '文档标题' });
    await expect(title).toHaveValue('画布资料.md');
    await page.getByRole('link', { name: '文档画布', exact: true }).last().press('Enter');
    await page.getByRole('link', { name: '画布资料.md', exact: true }).press('Enter');
    await expect(body.getByRole('table')).toBeVisible();
    await expect(body.getByRole('img', { name: '静态标记' })).toBeVisible();
    expect(await readFile(markdown, 'utf8')).toBe(original);
  } finally {
    await app.close();
  }
});
