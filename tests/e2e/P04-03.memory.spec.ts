import { openSessionFixture } from './session-fixture';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MemoryCommand, MemoryView } from '../../packages/contracts/src';
const id = () => {
  const v = randomUUID();
  return v.slice(0, 14) + '7' + v.slice(15);
};
let app: ElectronApplication | undefined, page: Page, dir: string;
async function launch() {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
}
async function command(cmd: MemoryCommand, payload: unknown, revision?: number) {
  return page.evaluate(
    async ({ cmd, payload, revision, requestId }) => {
      const r = await window.tapkit.memoryCommand(
        { requestId, ...(revision === undefined ? {} : { expectedRevision: revision }) },
        cmd,
        payload,
      );
      if (!r.ok) throw new Error(r.error.code);
      return r.data;
    },
    { cmd, payload, revision, requestId: id() },
  );
}
async function create() {
  const previous = await page.locator('.chat-surface').getAttribute('data-session-id');
  await openSessionFixture(page);
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  if (previous)
    await expect(page.locator('.chat-surface')).not.toHaveAttribute('data-session-id', previous);
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  return (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
}
async function send(text: string) {
  const n = await page.locator('.chat-message.assistant').count();
  await page.getByLabel('输入草稿').fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(n + 1);
  await expect(page.locator('.chat-message.assistant').last()).toContainText('隔离测试回复');
  await expect
    .poll(async () =>
      page.evaluate(
        async ({ sid, requestId }) => {
          const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', {
            sessionId: sid,
          });
          return r.ok ? (r.data as { run?: { status: string } }).run?.status : '';
        },
        {
          sid: (await page.locator('.chat-surface').getAttribute('data-session-id'))!,
          requestId: id(),
        },
      ),
    )
    .toBe('completed');
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P04-03 Electron synthetic '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await mkdir('docs/evidence/P04-03', { recursive: true });
  await launch();
});
test('P04-03 T11 session deletion preview gives source counts and explicit retention without reviving removed sources', async () => {
  const sid = await create();
  await send('记住：名字是合成甲');
  await page.getByRole('link', { name: '聊天', exact: true }).click();
  const list = page.locator('.screen-scroll .history-manager'),
    row = list.locator('.history-row[data-session-id="' + sid + '"]');
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  await row.getByRole('menuitem', { name: '移入回收站' }).click();
  const dialog = list.getByRole('dialog', { name: '记忆删除影响' });
  await expect(dialog).toContainText('仅由所选会话支持：1');
  await dialog.getByLabel('保留只由这些会话支持的显式记忆').check();
  await dialog.screenshot({ path: 'docs/evidence/P04-03/session-deletion-impact.png' });
  await dialog.getByRole('button', { name: '删除会话并处理记忆' }).click();
  await expect(row).toHaveCount(0);
  const bootstrap = await page.evaluate(
    async (requestId) => window.tapkit.bootstrap({ requestId }),
    id(),
  );
  if (!bootstrap.ok) throw new Error('bootstrap');
  const profile = (bootstrap.data as { profile: { id: string } }).profile.id;
  const memories = (
    (await command('memory.list', { scope: { type: 'profile', id: profile } })) as {
      memories: MemoryView[];
    }
  ).memories;
  expect(memories).toHaveLength(1);
  expect(memories[0]!.sources).toHaveLength(0);
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});
test('P04-03 T11 explicit post-write notice source correction undo conflict search deletion and restart', async () => {
  const sid = await create();
  await send('记住：我喜欢简短中文回答');
  await expect(page.locator('.chat-message.user')).toContainText('已更新记忆');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  const manager = page.getByRole('region', { name: '记忆管理' });
  await expect(manager.locator('.memory-row')).toContainText('简短中文回答');
  await manager.getByRole('button', { name: '查看记忆来源' }).click();
  await expect(manager.getByRole('region', { name: '查看记忆来源' })).toContainText(
    '记住：我喜欢简短中文回答',
  );
  await manager.getByRole('button', { name: '编辑记忆', exact: true }).click();
  await manager.getByLabel('记忆内容').fill('详细英文回答');
  await manager.getByRole('button', { name: '保存纠正', exact: true }).click();
  await expect(manager.locator('.memory-row')).toContainText('详细英文回答');
  await manager.getByLabel('搜索记忆').fill('详细');
  await expect(manager.locator('.memory-row')).toHaveCount(1);
  await manager.screenshot({ path: 'docs/evidence/P04-03/memory-management.png' });
  await app!.close();
  app = undefined;
  await launch();
  const [restored] = await Promise.all([
    app!.waitForEvent('window'),
    page.evaluate(async (sid) => window.tapkit.openEntity({ type: 'session', id: sid }), sid),
  ]);
  page = restored;
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', sid);
  await page.locator('.chat-message.user').getByRole('button', { name: '撤销记忆更新' }).click();
  await expect(page.locator('.chat-message.user').getByRole('alert')).toContainText('已有新修改');
  await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  const reopened = page.getByRole('region', { name: '记忆管理' });
  await expect(reopened.locator('.memory-row')).toContainText('详细英文回答');
  await reopened.getByRole('button', { name: '删除记忆', exact: true }).click();
  await expect(reopened.locator('.memory-row')).toHaveCount(0);
  await app!.close();
  app = undefined;
  await launch();
  const r = await page.evaluate(async (requestId) => window.tapkit.bootstrap({ requestId }), id());
  if (!r.ok) throw new Error('bootstrap');
  const profile = (r.data as { profile: { id: string } }).profile.id;
  expect(
    (
      (await command('memory.list', { scope: { type: 'profile', id: profile } })) as {
        memories: MemoryView[];
      }
    ).memories,
  ).toHaveLength(0);
});
test('P04-03 T11 two ordinary preferences auto-save after completion without approval and can clear all', async () => {
  await create();
  await send('我喜欢简短中文回答');
  await expect(page.locator('.chat-message.user')).not.toContainText('已更新记忆');
  await create();
  await send('我喜欢简短中文回答');
  await expect(page.locator('.chat-message.user')).toContainText('已更新记忆', { timeout: 15000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  const manager = page.getByRole('region', { name: '记忆管理' });
  await expect(manager.locator('.memory-row')).toContainText('自动保存');
  await manager.screenshot({ path: 'docs/evidence/P04-03/automatic-memory.png' });
  await manager.getByRole('button', { name: '清除全部记忆', exact: true }).click();
  await manager
    .getByRole('dialog', { name: '确认清除' })
    .getByRole('button', { name: '确认清除' })
    .click();
  await expect(manager.locator('.memory-row')).toHaveCount(0);
});
test('P04-03 T10 answer used memories, session switches and temporary mode have truthful scope UI', async () => {
  await create();
  await send('记住：我喜欢简短中文回答');
  await send('请用中文回答');
  const answer = page.locator('.chat-message.assistant').last();
  await answer.getByRole('button', { name: '使用的记忆与历史参考', exact: true }).click();
  await expect(answer).toContainText('简短中文回答');
  await page.getByRole('button', { name: '记忆与历史范围', exact: true }).click();
  const policy = page.getByRole('region', { name: '记忆与历史范围' });
  await policy.getByLabel('使用与保存跨会话记忆').uncheck();
  await policy.getByLabel('参考历史会话').uncheck();
  await policy.getByRole('button', { name: '保存当前会话记忆设置' }).click();
  await expect(policy.getByRole('button', { name: '保存当前会话记忆设置' })).toBeEnabled();
  await expect(policy.getByLabel('使用与保存跨会话记忆')).not.toBeChecked();
  await expect(policy.getByLabel('参考历史会话')).not.toBeChecked();
  await expect
    .poll(async () => {
      const saved = (await command('memory.policy', {
        sessionId: await page.locator('.chat-surface').getAttribute('data-session-id'),
      })) as { memoryEnabled: boolean; historyEnabled: boolean };
      return [saved.memoryEnabled, saved.historyEnabled];
    })
    .toEqual([false, false]);
  await send('再次用中文回答');
  await page
    .locator('.chat-message.assistant')
    .last()
    .getByRole('button', { name: '使用的记忆与历史参考', exact: true })
    .click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('未采用可用');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('radio', { name: '临时聊天', exact: true }).click();
  await page.getByLabel('输入草稿').fill('隔离临时测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.memory-policy')).toContainText('临时聊天：不读取');
  await page.screenshot({ path: 'docs/evidence/P04-03/temporary-scope.png' });
});
