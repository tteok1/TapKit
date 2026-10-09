import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ChatSnapshot,
  ChatCommand,
  HistoryCommand,
  SessionDetails,
  SessionPage,
} from '../../packages/contracts/src';
import { randomUUID } from 'node:crypto';
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
let app: ElectronApplication, dir: string;
async function launch() {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  return page;
}
async function command(
  page: Page,
  cmd: ChatCommand | HistoryCommand,
  payload: unknown = {},
  revision?: number,
) {
  return page.evaluate(
    async ({ cmd, payload, requestId, revision }) => {
      const history =
        cmd.startsWith('sessions.') ||
        cmd.startsWith('sidebar.') ||
        cmd.startsWith('search.') ||
        ['messages.edit', 'messages.regenerate', 'messages.mark', 'messages.switchBranch'].includes(
          cmd,
        );
      const r = await (history
        ? window.tapkit.historyCommand(
            { requestId, ...(revision === undefined ? {} : { expectedRevision: revision }) },
            cmd as HistoryCommand,
            payload,
          )
        : window.tapkit.chatCommand({ requestId }, cmd as ChatCommand, payload));
      if (!r.ok) throw new Error(r.error.code);
      return r.data;
    },
    { cmd, payload, requestId: newId(), revision },
  );
}
const snap = async (p: Page, id: string) =>
  (await command(p, 'messages.list', { sessionId: id })) as ChatSnapshot;
const details = async (p: Page, id: string) =>
  (await command(p, 'sessions.get', { sessionId: id })) as SessionDetails;
async function newSession(page: Page) {
  await page.keyboard.press('Control+n');
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  return (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
}
async function send(page: Page, id: string, text: string) {
  await command(page, 'messages.send', {
    sessionId: id,
    text,
    attachments: [],
    clientMessageId: newId(),
    mode: 'chat',
  });
  await expect
    .poll(async () => (await snap(page, id)).run?.status, { intervals: [30, 50, 100] })
    .toBe('completed');
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data/P02-03 Electron '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await mkdir('docs/evidence/P02-03', { recursive: true });
});
test.afterEach(async () => {
  if (app) await app.close();
});
test('P02-03 T06 two turns, early edit, answer candidates, feedback and restart draft', async () => {
  let p = await launch();
  const id = await newSession(p);
  await send(p, id, '第一轮原问题');
  await send(p, id, '第二轮原问题');
  const original = await snap(p, id);
  await expect(p.locator('.chat-message.user')).toHaveCount(2);
  await p
    .locator('.chat-message.user')
    .first()
    .getByRole('button', { name: '编辑问题并创建分支', exact: true })
    .click();
  const editor = p.getByRole('dialog', { name: '编辑问题并创建分支' });
  await editor.getByLabel('编辑问题并创建分支').fill('改过的第一轮问题');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await snap(p, id)).messages.at(-1)?.text)
    .toBe('隔离测试回复：改过的第一轮问题');
  await expect(p.locator('.chat-message.user')).toHaveCount(1);
  await p
    .locator('.chat-message.assistant')
    .last()
    .getByRole('button', { name: '重新生成回答', exact: true })
    .click();
  await expect.poll(async () => (await details(p, id)).branches.length).toBe(3);
  await expect.poll(async () => (await snap(p, id)).run?.status).toBe('completed');
  await p.getByLabel('消息分支 / 回答版本').selectOption(original.branchId);
  await expect(p.locator('.chat-message.user')).toHaveCount(2);
  const answer = p.locator('.chat-message.assistant').first();
  await answer.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  await answer.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await p.getByLabel('输入草稿').fill('重启后保留的草稿');
  await expect
    .poll(
      async () =>
        await p.evaluate(
          async ({ id, requestId }) => {
            const r = await window.tapkit.chatCommand({ requestId }, 'drafts.get', {
              sessionId: id,
              windowId: window.tapkit.windowSlot,
            });
            return r.ok && 'text' in r.data ? r.data.text : '';
          },
          { id, requestId: newId() },
        ),
    )
    .toBe('重启后保留的草稿');
  await p.screenshot({ path: 'docs/evidence/P02-03/branches-and-feedback.png' });
  await app.close();
  p = await launch();
  await expect(p.getByLabel('输入草稿')).toHaveValue('重启后保留的草稿');
  expect((await snap(p, id)).branchId).toBe(original.branchId);
});
test('P02-03 T10 archived full-text hit loads the exact early message across pages', async () => {
  const p = await launch(),
    id = await newSession(p);
  await send(p, id, '归档早期定位标记');
  const target = (await snap(p, id)).messages[0]!.id;
  for (let i = 0; i < 51; i++) await send(p, id, '后续普通问题' + i);
  await command(p, 'sessions.archive', { sessionIds: [id] });
  await p.keyboard.press('Control+n');
  await p.keyboard.press('Control+k');
  await p.getByLabel('搜索标题与正文').fill('归档早期定位标记');
  await p.getByLabel('结果类型').selectOption('message');
  await p.getByRole('button', { name: '查找', exact: true }).click();
  await expect(p.locator('.search-hit')).not.toHaveCount(0);
  const hit = p.locator('.search-hit[data-message-id="' + target + '"]');
  await hit.click();
  await expect(p.locator('#message-' + target)).toBeVisible();
  await expect(p.locator('#message-' + target)).toHaveClass(/located-message/);
  await p.screenshot({ path: 'docs/evidence/P02-03/archived-search-location.png' });
  await p
    .locator('#message-' + target)
    .getByRole('button', { name: '删除消息', exact: true })
    .click();
  const deletion = p.getByRole('dialog', { name: '删除消息' });
  await deletion.getByRole('button', { name: '删除原文，保留后续及说明节点', exact: true }).click();
  await expect(p.locator('#message-' + target)).toContainText('此节点已删除');
  await expect(p.locator('#message-' + target)).not.toContainText('归档早期定位标记');
});
test('P02-03 T20 grouping, bounded list pages, batch trash and restore preserve sessions', async () => {
  const p = await launch();
  const ids = await p.evaluate(
    async (requestIds) => {
      const ids: string[] = [];
      for (let i = 0; i < 135; i++) {
        const r = await window.tapkit.desktopCommand(
          { requestId: requestIds[i]! },
          'sessions.create',
          { mode: 'chat', title: '分页会话 ' + i },
        );
        if (!r.ok || !('entityId' in r.data)) throw new Error('CREATE_FAILED');
        ids.push(r.data.entityId);
      }
      return ids;
    },
    Array.from({ length: 135 }, () => newId()),
  );
  await p.getByRole('link', { name: '聊天', exact: true }).click();
  const list = p.locator('.screen-scroll .history-manager');
  await expect(list.locator('.history-row')).toHaveCount(50);
  await list.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(100);
  await list.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(list.locator('.history-row')).toHaveCount(100);
  await list.getByRole('button', { name: '新建分组', exact: true }).click();
  const dialog = list.getByRole('dialog');
  await dialog.getByLabel('分组名称').fill('验收分组');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const group = await p.evaluate(async (requestId) => {
    const r = await window.tapkit.historyCommand({ requestId }, 'sidebar.list', {});
    if (!r.ok || !('sections' in r.data)) throw new Error('FAILED');
    return r.data.sections.find((s) => s.name === '验收分组')!.id;
  }, newId());
  await command(p, 'sessions.move', { sessionIds: ids.slice(0, 2), sectionId: group });
  await command(p, 'sidebar.remove', { sectionId: group }, 1);
  await command(p, 'sessions.trash', { sessionIds: ids.slice(0, 2) });
  expect(
    ((await command(p, 'sessions.list', { state: 'trash' })) as SessionPage).sessions,
  ).toHaveLength(2);
  await command(p, 'sessions.restore', { sessionIds: ids.slice(0, 2) });
  expect(
    ((await command(p, 'sessions.list', { state: 'active', limit: 100 })) as SessionPage).sessions,
  ).toHaveLength(100);
});
test('P02-03 T10 temporary chat clears on leave and restart, without persistent body or draft', async () => {
  let p = await launch();
  await p.getByRole('button', { name: '临时聊天', exact: true }).click();
  await expect(
    p.locator('.session-tools').getByText(/正文、草稿、附件和协议状态只在内存中/),
  ).toBeVisible();
  const id = (await p.locator('.chat-surface').getAttribute('data-session-id'))!;
  await send(p, id, '临时唯一正文标记');
  await p.getByLabel('输入草稿').fill('临时唯一草稿标记');
  await p.keyboard.press('Control+k');
  await expect(p.locator('.search-view')).not.toBeAttached();
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: '关闭并清除临时聊天', exact: true }).click();
  await expect
    .poll(async () =>
      ((await command(p, 'sessions.list', { state: 'all' })) as SessionPage).sessions.some(
        (s) => s.id === id,
      ),
    )
    .toBe(false);
  await app.close();
  const db = await readFile(resolve(dir, 'db/app.sqlite'));
  expect(db.includes(Buffer.from('临时唯一正文标记'))).toBe(false);
  expect(db.includes(Buffer.from('临时唯一草稿标记'))).toBe(false);
  p = await launch();
  await expect(
    p.locator('.session-tools').getByText(/正文、草稿、附件和协议状态只在内存中/),
  ).not.toBeVisible();
  await expect(p.locator('.history .history-row')).toHaveCount(0);
});
