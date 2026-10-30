import { mkdtemp } from '../../scripts/test-temp.mjs';
import { WorkspaceViewSchema } from '../../packages/contracts/src';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('docs/evidence/P02-03/unified-start-2026-10-22');
let app: ElectronApplication;
let dir: string;
async function launch(fixture = false, profile?: string) {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  dir = profile ?? (await mkdtemp(resolve('.test-data/P02-01 unified start ')));
  if (fixture) await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      ...(fixture ? { TAPKIT_CHAT_FIXTURE: 'P02-02' } : {}),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  return page;
}
test.afterEach(async () => {
  await app?.close();
});
async function sessions(page: Page) {
  const result = await page.evaluate(async () => {
    const r = await window.tapkit.desktopCommand(
      { requestId: crypto.randomUUID().replace(/^(.{14})./, (_, prefix: string) => prefix + '7') },
      'desktop.workspace',
      {},
    );
    if (!r.ok || !('sessions' in r.data)) throw new Error('WORKSPACE_FAILED');
    return r.data;
  });
  return WorkspaceViewSchema.parse(result).sessions;
}
async function virtualAttachment(page: Page, name: string) {
  await page.getByLabel('输入草稿', { exact: true }).evaluate((el, name) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['Synthetic shared draft attachment.'], name, { type: 'text/plain' }),
    );
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, name);
  await expect(page.locator('.composer-attachment')).toContainText(name);
}
async function geometry(page: Page, name: string) {
  await expect(page.getByLabel('输入草稿', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: '任务类型', exact: true })).toBeVisible();
  const bounds = await page.evaluate(() => {
    const input = document.querySelector('.composer')!.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    const modes = document.querySelector('.start-modes')!.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      input: input.toJSON(),
      main: main.toJSON(),
      modes: modes.toJSON(),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(bounds.overflow).toBe(false);
  expect(bounds.input.x).toBeGreaterThanOrEqual(bounds.main.x);
  expect(bounds.input.right).toBeLessThanOrEqual(bounds.main.right + 1);
  expect(bounds.input.bottom).toBeLessThanOrEqual(bounds.main.bottom + 1);
  expect(bounds.input.bottom).toBeGreaterThan(bounds.main.bottom - 36);
  expect(bounds.input.top).toBeGreaterThan(bounds.main.top);
  await page.screenshot({ path: resolve(evidence, name + '.png'), animations: 'disabled' });
  return { name, ...bounds };
}
test('P02-01 unified start without accounts restores hidden suggestions and keeps the composer at the bottom', async () => {
  test.setTimeout(240_000);
  let page = await launch();
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('输入草稿', { exact: true })).toHaveAttribute(
    'placeholder',
    '请先配置模型再使用...',
  );
  await expect(page.getByRole('button', { name: '设置模型', exact: true })).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  await expect(sidebar.getByRole('button', { name: '新建任务', exact: true })).toBeVisible();
  for (const name of ['新建聊天', '临时聊天', '新建工作', '新建项目'])
    await expect(sidebar.getByRole('button', { name, exact: true })).toHaveCount(0);
  for (const text of ['本地空间 · 无需注册', '继续一段会话，或从新的目标开始。'])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await expect(page.locator('.start-links')).toHaveCount(0);
  await page.getByRole('button', { name: '隐藏推荐问题', exact: true }).click();
  await expect(page.getByRole('button', { name: '展示推荐问题', exact: true })).toBeVisible();
  await expect(page.locator('.start-questions')).toHaveCount(0);
  await page.getByRole('radio', { name: '工作', exact: true }).click();
  await page.getByRole('button', { name: '展示推荐问题', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '一起拆解一个工作目标与验收标准', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '隐藏推荐问题', exact: true }).click();
  const original = dir;
  await app.close();
  page = await launch(false, original);
  await expect(page.getByRole('button', { name: '展示推荐问题', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展示推荐问题', exact: true }).click();
  const samples = [];
  for (const [width, height, zoom, theme] of [
    [1440, 900, 1, 'light'],
    [960, 640, 1, 'light'],
    [1440, 900, 2, 'dark'],
    [960, 640, 2, 'dark'],
  ] as const) {
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.unmaximize();
        window.setContentSize(...size);
      },
      [width, height] as [number, number],
    );
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await page.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.keyboard.press('Control+n');
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    samples.push(await geometry(page, `home-${width}-${zoom}-${theme}`));
    await page.getByRole('radio', { name: '聊天', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: '临时聊天', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: '聊天', exact: true }).click();
  }
  await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  expect(await sessions(page)).toHaveLength(0);
  await page.getByRole('button', { name: '设置模型', exact: true }).click();
  await expect(page.getByRole('heading', { name: '模型连接', exact: true })).toBeVisible();
});
test('P02-01 unified start shares text and attachments, saves work drafts and clears temporary chats', async () => {
  test.setTimeout(180_000);
  const page = await launch(true);
  const input = page.getByLabel('输入草稿', { exact: true });
  await expect(input).toHaveAttribute('placeholder', '写下你的问题...');
  await input.fill('Shared draft retained in all three modes.');
  await virtualAttachment(page, 'shared-draft.txt');
  for (const name of ['工作', '临时聊天', '聊天', '工作']) {
    await page.getByRole('radio', { name, exact: true }).click();
    await expect(input).toHaveValue('Shared draft retained in all three modes.');
    await expect(page.locator('.composer-attachment')).toContainText('shared-draft.txt');
  }
  expect(await sessions(page)).toHaveLength(0);
  await page.getByRole('button', { name: '保存工作草稿', exact: true }).click();
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('Shared draft retained in all three modes.');
  const work = (await sessions(page)).find((s) => s.mode === 'work');
  expect(work).toBeTruthy();
  const stored = await page.evaluate(async (sessionId) => {
    const raw = crypto.randomUUID();
    const reply = await window.tapkit.chatCommand(
      { requestId: raw.slice(0, 14) + '7' + raw.slice(15) },
      'drafts.get',
      { sessionId, windowId: window.tapkit.windowSlot },
    );
    if (!reply.ok || !('text' in reply.data) || !('attachments' in reply.data))
      throw new Error('DRAFT_FAILED');
    return { text: reply.data.text, attachments: reply.data.attachments.length };
  }, work!.id);
  expect(stored).toEqual({ text: 'Shared draft retained in all three modes.', attachments: 1 });
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('radio', { name: '临时聊天', exact: true }).click();
  await input.fill('Temporary start content 20261022.');
  await virtualAttachment(page, 'temporary-draft.txt');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭并清除临时聊天', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  ).toBeVisible();
  expect(await sessions(page)).toHaveLength(1);
  const db = await readFile(resolve(dir, 'db/app.sqlite'));
  expect(db.includes(Buffer.from('Temporary start content 20261022.'))).toBe(false);
  expect(db.includes(Buffer.from('temporary-draft.txt'))).toBe(false);
  await page.getByRole('radio', { name: '聊天', exact: true }).click();
  await input.fill('Normal start content 20261022.');
  await page.getByRole('button', { name: '添加附件或引用资料', exact: true }).click();
  await page.getByRole('button', { name: '@ 引用资料', exact: true }).click();
  await page
    .getByRole('dialog', { name: '引用资料', exact: true })
    .getByRole('button', { name: /shared-draft.txt/ })
    .click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  await expect(page.locator('.chat-message.user')).toContainText('Normal start content 20261022.');
  expect((await sessions(page)).map((s) => s.mode).sort()).toEqual(['chat', 'work']);
  await page.screenshot({ path: resolve(evidence, 'normal-chat.png') });
});
