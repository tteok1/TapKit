import { mkdtemp } from '../../scripts/test-temp.mjs';
import { waitCoreReady } from './core-ready';
import { openSessionFixture } from './session-fixture';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ContextView, ChatCommand } from '../../packages/contracts/src';
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
  await waitCoreReady(page);
}
async function command(cmd: ChatCommand, payload: unknown) {
  return page.evaluate(
    async ({ cmd, payload, requestId }) => {
      const r = await window.tapkit.chatCommand({ requestId }, cmd, payload);
      if (!r.ok) throw new Error(r.error.code);
      return r.data;
    },
    { cmd, payload, requestId: id() },
  );
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P04-02 Electron synthetic '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await mkdir('docs/evidence/P04-02', { recursive: true });
  await launch();
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});
test('P04-02 T12 summary UI three compactions source view correction chosen continuation and restart', async () => {
  await openSessionFixture(page);
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page
    .getByLabel('输入草稿')
    .fill('编号TK-123；预算￥500；日期2026-10-31；不要创建PR，不得合入main。');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('隔离测试回复');
  const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  await page.getByRole('button', { name: '会话摘要', exact: true }).click();
  const region = page.getByRole('region', { name: '会话摘要' });
  for (let n = 0; n < 3; n++) {
    await region.getByRole('button', { name: '生成或更新摘要', exact: true }).click();
    await expect(region).toContainText('不得合入main');
    await expect(region.getByRole('button', { name: '生成或更新摘要', exact: true })).toBeEnabled();
  }
  await region.getByRole('button', { name: '查看原始消息' }).first().click();
  await expect(region.locator('pre')).toContainText('预算￥500');
  await region.getByLabel('摘要纠正').fill('最新目标：只检查A-999；不得发布。');
  await region.getByRole('button', { name: '保存纠正', exact: true }).click();
  await expect(region).toContainText('最新目标：只检查A-999');
  await expect(region.getByLabel('摘要纠正')).toHaveValue('');
  const summary = (await command('context.get', { sessionId: sid })) as ContextView;
  expect(summary.checkpoint?.corrected).toBe(true);
  await region.getByLabel('约束', { exact: true }).uncheck();
  await page.screenshot({ path: 'docs/evidence/P04-02/summary-corrected.png' });
  await region.getByRole('button', { name: '在新会话中接续所选背景', exact: true }).click();
  await expect(page.locator('.chat-surface')).not.toHaveAttribute('data-session-id', sid);
  const target = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  expect(target).toMatch(/^[0-9a-f-]{36}$/);
  await page.getByLabel('输入草稿').fill('继续');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('隔离测试回复');
  await app!.close();
  app = undefined;
  await launch();
  const [restored] = await Promise.all([
    app!.waitForEvent('window'),
    page.evaluate(async (sessionId) => {
      await window.tapkit.openEntity({ type: 'session', id: sessionId });
    }, sid),
  ]);
  page = restored;
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', sid);
  await page.getByRole('button', { name: '会话摘要', exact: true }).click();
  await expect(page.getByRole('region', { name: '会话摘要' })).toContainText('A-999');
});
