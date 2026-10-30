import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ChatSnapshot,
  SessionDetails,
  HistoryCommand,
  SettingsValues,
} from '../../packages/contracts/src';
import { openSessionFixture, reopenSessionFixture } from './session-fixture';

const evidence = resolve('docs/evidence/P02-03/t14-chat-bookmarks-2026-10-26');
let app: ElectronApplication | undefined;
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
async function launch(dir: string) {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  return page;
}
async function command(
  p: Page,
  command: HistoryCommand,
  payload: unknown,
  expectedRevision?: number,
) {
  return p.evaluate(
    async ({ command, payload, requestId, expectedRevision }) => {
      const reply = await window.tapkit.historyCommand(
        { requestId, ...(expectedRevision === undefined ? {} : { expectedRevision }) },
        command,
        payload,
      );
      if (!reply.ok) throw new Error(reply.error.code);
      return reply.data;
    },
    { command, payload, requestId: newId(), expectedRevision },
  );
}
const details = async (p: Page, sessionId: string) =>
  (await command(p, 'sessions.get', { sessionId })) as SessionDetails;
async function snapshot(p: Page, sessionId: string) {
  return p.evaluate(
    async ({ sessionId, requestId }) => {
      const reply = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
      if (!reply.ok) throw new Error(reply.error.code);
      return reply.data as ChatSnapshot;
    },
    { sessionId, requestId: newId() },
  );
}
async function prepare() {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 T14 '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const p = await launch(dir);
  const sessionId = await openSessionFixture(p);
  await p.getByLabel('输入草稿', { exact: true }).fill('P02T14合成收藏与反馈');
  await p.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(async () => (await snapshot(p, sessionId)).run?.status).toBe('completed');
  const message = (await snapshot(p, sessionId)).messages.at(-1)!;
  await expect(p.locator('#message-' + message.id)).toBeVisible();
  return { p, dir, sessionId, message };
}
async function collection(p: Page, captureName?: string) {
  if (await p.getByRole('button', { name: '展开侧栏', exact: true }).count())
    await p.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await expect(p.getByRole('link', { name: '收藏', exact: true })).toHaveCount(0);
  await p.getByRole('link', { name: '聊天', exact: true }).click();
  const filters = p.locator('.screen-scroll .history-filters');
  await expect(filters.getByRole('button')).toHaveText(['最近', '归档', '收藏', '回收站', '全部']);
  if (captureName)
    await p.screenshot({ path: resolve(evidence, captureName + '.png'), animations: 'disabled' });
  await filters.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(p.locator('.bookmarks-page')).toBeVisible();
  await expect(
    p.getByRole('link', { name: '聊天', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-current', 'page');
}
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test('P02-03 T14 feedback opens on downvote, ratings toggle, saved feedback persists and bookmarks locate the original branch', async () => {
  test.setTimeout(240_000);
  let { p, dir, sessionId, message } = await prepare();
  let answer = p.locator('#message-' + message.id);
  const down = () => answer.getByRole('button', { name: '点踩', exact: true });
  const up = () => answer.getByRole('button', { name: '点赞', exact: true });
  const feedback = () => p.getByRole('dialog', { name: '本地反馈 / 举报', exact: true });
  await down().click();
  await expect(feedback()).toBeVisible();
  await expect(feedback()).toContainText('反馈和举报标记仅保存在本机');
  await expect(feedback().getByLabel('反馈说明（仅保存在本机）')).toBeFocused();
  await feedback().getByLabel('反馈说明（仅保存在本机）').fill('P02FEEDBACK1019');
  await feedback().getByLabel('标记为举报', { exact: true }).check();
  await feedback().getByRole('button', { name: '保存', exact: true }).click();
  await expect(feedback()).toHaveCount(0);
  await expect(down()).toHaveAttribute('aria-pressed', 'true');
  await down().click();
  await expect(down()).toHaveAttribute('aria-pressed', 'false');
  await expect(feedback()).toHaveCount(0);
  await up().click();
  await expect(up()).toHaveAttribute('aria-pressed', 'true');
  await up().click();
  await expect(up()).toHaveAttribute('aria-pressed', 'false');
  await up().click();
  await down().click();
  await expect(feedback().getByLabel('反馈说明（仅保存在本机）')).toHaveValue('P02FEEDBACK1019');
  await expect(feedback().getByLabel('标记为举报', { exact: true })).toBeChecked();
  await p.keyboard.press('Escape');
  await expect(feedback()).toHaveCount(0);
  await expect(down()).toBeFocused();
  await expect(up()).toHaveAttribute('aria-pressed', 'false');
  await expect(down()).toHaveAttribute('aria-pressed', 'true');
  await answer.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  const originalBranch = (await details(p, sessionId)).session.branchId;
  await app!.close();
  app = undefined;
  p = await launch(dir);
  await reopenSessionFixture(p, sessionId);
  answer = p.locator('#message-' + message.id);
  await expect(down()).toHaveAttribute('aria-pressed', 'true');
  await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
  await answer.getByRole('button', { name: '本地反馈 / 举报', exact: true }).click();
  await expect(feedback().getByLabel('反馈说明（仅保存在本机）')).toHaveValue('P02FEEDBACK1019');
  await expect(feedback().getByLabel('标记为举报', { exact: true })).toBeChecked();
  await feedback().getByRole('button', { name: '取消', exact: true }).click();
  await answer.getByRole('button', { name: '重新生成回答', exact: true }).click();
  await expect.poll(async () => (await snapshot(p, sessionId)).run?.status).toBe('completed');
  await expect
    .poll(async () => (await details(p, sessionId)).session.branchId)
    .not.toBe(originalBranch);
  await collection(p);
  const entry = p.locator('.bookmark-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText(message.text);
  await entry.locator('.bookmark-open').click();
  await expect(answer).toBeVisible();
  await expect(answer).toHaveClass(/located-message/);
  expect((await details(p, sessionId)).session.branchId).toBe(originalBranch);
  expect((await snapshot(p, sessionId)).messages.at(-1)).toEqual(message);
  await collection(p);
  await entry.getByRole('button', { name: '取消收藏', exact: true }).click();
  await expect(entry).toHaveCount(0);
  await expect(p.locator('.bookmarks-page')).toContainText('还没有收藏的消息');
  const mark = (await details(p, sessionId)).marks.find((m) => m.messageId === message.id);
  expect(mark).toMatchObject({
    bookmark: false,
    rating: 'down',
    note: 'P02FEEDBACK1019',
    report: true,
  });
});

test('P02-03 T14 feedback and collection fit light and dark themes at normal and small 200 percent windows', async () => {
  test.setTimeout(240_000);
  const { p, sessionId, message } = await prepare();
  await p
    .locator('#message-' + message.id)
    .getByRole('button', { name: '收藏', exact: true })
    .click();
  for (const theme of ['light', 'dark'] as const)
    for (const [width, height, zoom] of [
      [1440, 900, 1],
      [960, 640, 2],
    ] as const) {
      await app!.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
        [width, height] as [number, number],
      );
      await p.evaluate(
        async ({ theme, zoom, requestId, saveId }) => {
          const boot = await window.tapkit.bootstrap({ requestId });
          if (!boot.ok) throw new Error('BOOTSTRAP');
          const data = boot.data as {
            settings: { revision: number; values: SettingsValues };
          };
          const reply = await window.tapkit.setSettings(
            { requestId: saveId, expectedRevision: data.settings.revision },
            {
              scope: { type: 'profile', id: (boot.data as { profile: { id: string } }).profile.id },
              patch: {
                desktop: { ...data.settings.values.desktop, theme, zoom, fontSize: 'large' },
              },
            },
          );
          if (!reply.ok) throw new Error(reply.error.code);
          window.dispatchEvent(new Event('tapkit:history-changed'));
        },
        { theme, zoom, requestId: newId(), saveId: newId() },
      );
      await expect(p.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
      await expect(p.locator('.desktop-shell')).toHaveAttribute('data-theme', theme);
      await p
        .locator('#message-' + message.id)
        .getByRole('button', { name: '更多消息操作', exact: true })
        .click();
      await p
        .locator('#message-' + message.id)
        .getByRole('button', { name: '本地反馈 / 举报', exact: true })
        .click();
      const dialog = p.getByRole('dialog', { name: '本地反馈 / 举报', exact: true });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await p.screenshot({ path: resolve(evidence, `feedback-${theme}-${width}-${zoom}.png`) });
      await p.keyboard.press('Escape');
      await collection(p, `chat-entry-${theme}-${width}-${zoom}`);
      await expect(p.locator('.bookmark-entry')).toHaveCount(1);
      await expect(p.locator('.bookmark-open')).toHaveCSS('border-top-width', '0px');
      await expect(p.locator('.bookmark-open')).toHaveCSS('border-radius', '8px');
      expect(
        await p.locator('.bookmarks-page').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await p.screenshot({ path: resolve(evidence, `bookmarks-${theme}-${width}-${zoom}.png`) });
      await p.locator('.bookmark-open').click();
      await expect(p.locator('#message-' + message.id)).toBeVisible();
    }
  expect(
    (await details(p, sessionId)).marks.find((m) => m.messageId === message.id)?.bookmark,
  ).toBe(true);
});
