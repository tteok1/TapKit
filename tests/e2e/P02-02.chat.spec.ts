import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)),
    time = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[5 - i] = Number((time >> BigInt(i * 8)) & 255n);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
import type {
  ChatSnapshot,
  ChatDraftViewSchema,
  WorkspaceViewSchema,
  ChatCommand,
} from '../../packages/contracts/src';
type Draft = ReturnType<typeof ChatDraftViewSchema.parse>;
let app: ElectronApplication, dir: string;
async function launch() {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (row): row is [string, string] => row[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  const fixture = await page.evaluate(async (requestId) => {
    const r = await window.tapkit.modelCommand({ requestId }, 'models.catalog', {});
    return (
      r.ok &&
      'catalog' in r.data &&
      r.data.catalog.some((m) => m.modelId === 'fixture-model' && m.status === 'ready')
    );
  }, newId());
  expect(fixture, 'P02-02 requires the explicit test build with a marked isolated profile').toBe(
    true,
  );
  await page.keyboard.press('Control+n');
  await expect(page.locator('.chat-messages')).toBeVisible();
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  return page;
}
async function command(page: Page, cmd: ChatCommand, payload: unknown) {
  return page.evaluate(
    async ({ cmd, payload, requestId }) => {
      const reply = await window.tapkit.chatCommand({ requestId }, cmd, payload);
      if (!reply.ok) throw new Error(reply.error.code);
      return reply.data;
    },
    { cmd, payload, requestId: newId() },
  );
}
async function session(page: Page) {
  const workspace = (await page.evaluate(async (requestId) => {
    const r = await window.tapkit.desktopCommand({ requestId }, 'desktop.workspace', {});
    if (!r.ok) throw new Error(r.error.code);
    return r.data;
  }, newId())) as ReturnType<typeof WorkspaceViewSchema.parse>;
  return workspace.sessions[0]!.id;
}
async function snapshot(page: Page, sid: string) {
  return (await command(page, 'messages.list', { sessionId: sid })) as ChatSnapshot;
}
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P02-02 Electron '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await mkdir('docs/evidence/P02-02', { recursive: true });
});
test.afterEach(async () => {
  if (app) await app.close();
});
test('P01-03 background title failure is announced, survives reload and explicit rename clears the failure without replaying chat', async () => {
  const page = await launch(),
    sid = await session(page);
  await page.getByLabel('输入草稿').fill('标题故障验收：只回复OK');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('completed');
  await expect(page.getByRole('status').filter({ hasText: '自动标题生成失败' })).toContainText(
    '等待响应头超时',
  );
  await page.screenshot({ path: 'docs/evidence/P01-engineering-2026-10-14/title-failed.png' });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '自动标题生成失败' })).toContainText(
    '等待响应头超时',
  );
  const before = (await snapshot(page, sid)).messages.map((m) => ({ id: m.id, text: m.text }));
  await page.getByRole('button', { name: 'AI 重命名', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '自动标题生成失败' })).toHaveCount(0);
  await expect
    .poll(async () => {
      const r = await page.evaluate(
        async ({ id, requestId }) =>
          window.tapkit.historyCommand({ requestId }, 'sessions.get', { sessionId: id }),
        { id: sid, requestId: newId() },
      );
      return r.ok && 'session' in r.data && r.data.session.titleStatus;
    })
    .toBe('completed');
  expect((await snapshot(page, sid)).messages.map((m) => ({ id: m.id, text: m.text }))).toEqual(
    before,
  );
  await page.screenshot({ path: 'docs/evidence/P01-engineering-2026-10-14/title-recovered.png' });
});

test('P01-03 P02-02 network retry progress explains estimates and retains diagnostics after restart', async () => {
  const page = await launch(),
    sid = await session(page);
  await page.getByLabel('输入草稿').fill('网络重试诊断');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-progress')).toContainText('请求尝试 2');
  await expect(page.locator('.chat-progress')).toContainText('自动重试 1');
  await expect(page.locator('.chat-progress')).toContainText('最近一次请求失败：等待响应头超时');
  await expect(page.locator('.chat-message.assistant').first()).toContainText('等待响应头超时');
  await page.getByRole('button', { name: '停止回复', exact: true }).click();
  await expect(page.locator('.chat-progress')).toContainText('已停止');
  await expect(page.locator('.chat-progress')).toContainText('保守估算');
  await expect(page.locator('.chat-progress')).toContainText('每次重试分别入账');
  const before = await snapshot(page, sid);
  expect(before.run).toMatchObject({ status: 'cancelled', attempts: 2, retries: 1 });
  await mkdir('docs/evidence/P01-03/zhipu-budget-2026-10-13', { recursive: true });
  await page.screenshot({
    path: 'docs/evidence/P01-03/zhipu-budget-2026-10-13/network-progress-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 760, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'docs/evidence/P01-03/zhipu-budget-2026-10-13/network-progress-compact.png',
    fullPage: true,
  });
  await app.close();
  const restarted = await launch();
  const after = await snapshot(restarted, sid);
  expect(after.run).toEqual(before.run);
  expect(after.messages.find((m) => m.errorCode === 'NETWORK_ERROR')?.diagnosticCode).toBe(
    'response_headers_timeout',
  );
});

test('P02-02 T02 two turns use real Core/router/usage; repeated acceptance creates one message and restart retains it', async () => {
  const page = await launch(),
    sid = await session(page);
  await page.getByLabel('输入草稿').fill('第一轮中文问题');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText(
    '隔离测试回复：第一轮中文问题',
  );
  await expect(
    page.getByRole('heading', { name: '隔离测试回复：第一轮中文问题', exact: true }),
  ).toBeVisible();
  // ADR0024 charges the automatic title to the originating run/root. Wait for
  // its visible completion before checking both 60-token fixture settlements.
  await expect
    .poll(async () => (await snapshot(page, sid)).run?.usage)
    .toEqual({ state: 'actual', tokens: 120 });
  const first = await snapshot(page, sid);
  expect(first.run).toMatchObject({ status: 'completed', calls: 1, tools: 0 });
  expect(first.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  expect(first.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  const payload = {
    sessionId: sid,
    clientMessageId: newId(),
    text: '第二轮',
    attachments: [],
    mode: 'chat',
  };
  const accepted = await Promise.all([
    command(page, 'messages.send', payload),
    command(page, 'messages.send', payload),
  ]);
  expect(accepted[0]).toEqual(accepted[1]);
  await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('completed');
  const saved = await snapshot(page, sid);
  expect(saved.run).toMatchObject({
    status: 'completed',
    calls: 1,
    usage: { state: 'actual', tokens: 60 },
  });
  expect(saved.messages.filter((m) => m.role === 'user')).toHaveLength(2);
  expect(saved.messages.filter((m) => m.role === 'assistant')).toHaveLength(2);
  expect(saved.messages.at(-1)?.model?.modelId).toBe('fixture-model');
  await page.screenshot({ path: 'docs/evidence/P02-02/two-turns.png' });
  await app.close();
  const again = await launch();
  const restored = await snapshot(again, sid);
  expect(restored.messages.map((m) => m.text)).toEqual(saved.messages.map((m) => m.text));
  expect(restored.run?.usage).toEqual(saved.run?.usage);
});

test('P02-02 T05 IME and Shift+Enter keep draft; queue editing/cancellation, session switching and stopping preserve confirmed text', async () => {
  const page = await launch(),
    sid = await session(page),
    input = page.getByLabel('输入草稿');
  await input.fill('中文输入');
  await input.evaluate((node) =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect((await snapshot(page, sid)).messages).toHaveLength(0);
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('中文输入\n');
  await page.evaluate(
    async (ids) => {
      const b = await window.tapkit.bootstrap({ requestId: ids[0]! });
      if (!b.ok || !('profile' in b.data)) throw new Error('bootstrap failed');
      const r = await window.tapkit.setSettings(
        { requestId: ids[1]!, expectedRevision: b.data.settings.revision },
        {
          scope: { type: 'profile', id: b.data.profile.id },
          patch: { desktop: { ...b.data.settings.values.desktop, enterSends: false } },
        },
      );
      if (!r.ok) throw new Error(r.error.code);
    },
    [newId(), newId()],
  );
  await page.reload();
  await expect(page.locator('.chat-messages')).toBeVisible();
  await input.fill('慢速原问题');
  await input.press('Enter');
  await expect(input).toHaveValue('慢速原问题\n');
  expect((await snapshot(page, sid)).messages).toHaveLength(0);
  await input.press('Control+Enter');
  await expect(page.locator('.chat-stream')).toContainText('隔离测试回');
  await input.fill('排队问题');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.locator('.chat-queue').getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('排队消息内容').fill('编辑后的排队问题');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.chat-queue')).toContainText('编辑后的排队问题');
  await page.locator('.chat-queue').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.chat-queue')).not.toBeAttached();
  await page.keyboard.press('Control+n');
  expect((await snapshot(page, sid)).run?.status).toBe('running');
  const before = await snapshot(page, sid);
  await command(page, 'runs.cancel', { runId: before.run!.id });
  await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('cancelled');
  const stopped = await snapshot(page, sid);
  expect(stopped.messages.some((m) => m.status === 'interrupted' && m.text === '隔离测试回')).toBe(
    true,
  );
  await command(page, 'messages.send', {
    sessionId: sid,
    clientMessageId: newId(),
    text: '停止后继续',
    attachments: [],
    mode: 'chat',
  });
  await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('completed');
});

test('P02-02 T05 long paste, plain managed attachment, unsupported original, oversize draft and restart remain reviewable', async () => {
  let page = await launch(),
    sid = await session(page);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 850));
  await page.getByLabel('输入草稿').evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', '长'.repeat(20001));
    node.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole('button', { name: '转为文本附件', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '转为文本附件', exact: true }).click();
  await expect(page.locator('.chat-materials')).toContainText('粘贴内容.txt');
  await expect(page.getByLabel('输入草稿')).toHaveValue('');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  let preview = page.getByRole('region', { name: '文件预览', exact: true });
  const closePreview = async () => {
    await preview.getByRole('button', { name: '关闭预览', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '详情', exact: true });
    // Closing a preview tab retains the detail drawer. Close the specified
    // narrow-layout drawer through its real control before returning to chat.
    await expect(detail).toHaveCSS('position', 'absolute');
    await detail.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(detail).toHaveCount(0);
  };
  await expect(preview.getByRole('tab', { name: '粘贴内容.txt · v1', exact: true })).toBeVisible();
  await expect(preview.locator('.viewer-source pre')).toHaveText('长'.repeat(20001));
  await page.screenshot({
    path: 'docs/evidence/P02-02/fix-preview-2026-10-11/long-paste-preview.png',
  });
  await preview.locator('.viewer-source').screenshot({
    path: 'docs/evidence/P02-02/fix-preview-2026-10-11/long-paste-body.png',
  });
  await closePreview();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture.docx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('synthetic original'),
  });
  await expect(page.locator('.chat-materials')).toContainText('fixture.docx');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '仅保存原件继续', exact: true }).click();
  await expect(page.locator('.chat-materials')).not.toContainText('fixture.docx');
  const excessive = '中'.repeat(100001);
  await page.getByLabel('输入草稿').fill(excessive);
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await expect
    .poll(
      async () =>
        ((await command(page, 'drafts.get', { sessionId: sid, windowId: '0' })) as Draft).text
          .length,
    )
    .toBe(100001);
  await app.close();
  page = await launch();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 850));
  const restored = (await command(page, 'drafts.get', { sessionId: sid, windowId: '0' })) as Draft;
  expect(restored.text).toBe(excessive);
  await page
    .getByRole('complementary', { name: '侧栏' })
    .locator('.history-row[data-session-id="' + sid + '"] .history-link')
    .click();
  await expect(page.getByLabel('输入草稿')).toHaveValue(excessive);
  await expect(page.locator('.chat-materials')).toContainText('粘贴内容.txt');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  preview = page.getByRole('region', { name: '文件预览', exact: true });
  await expect(preview.locator('.viewer-source pre')).toHaveText('长'.repeat(20001));
  await closePreview();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 700));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/evidence/P02-02/narrow-composer.png' });
});

test('P02-02 T02 history pagination keeps reading position; return to latest restores following', async () => {
  const page = await launch(),
    sid = await session(page);
  for (let n = 0; n < 55; n++)
    await command(page, 'messages.send', {
      sessionId: sid,
      clientMessageId: newId(),
      text: '滚动样本 ' + n,
      attachments: [],
      mode: 'chat',
    });
  await expect
    .poll(
      async () => {
        const state = await snapshot(page, sid);
        return state.run?.status === 'completed' && state.pending.length === 0;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: '加载更早消息', exact: true }).click();
  await expect(page.locator('.chat-messages .chat-message')).toHaveCount(110);
  await page.locator('.chat-messages').evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await command(page, 'messages.send', {
    sessionId: sid,
    clientMessageId: newId(),
    text: '新到回复',
    attachments: [],
    mode: 'chat',
  });
  await expect(
    page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }),
  ).toBeVisible();
  expect(await page.locator('.chat-messages').evaluate((node) => node.scrollTop)).toBeLessThan(10);
  await page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.chat-messages')
        .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
    )
    .toBeLessThanOrEqual(80);
  await expect(page.locator('.chat-message').last()).toContainText('新到回复');
});

test('P02-02 T02 malicious Markdown stays inert; GFM, KaTeX, Shiki and static sandbox Mermaid render', async () => {
  const page = await launch();
  const remote: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await page.getByLabel('输入草稿').fill('恶意渲染');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('heading', { name: '安全标题', exact: true })).toBeVisible();
  await expect(page.locator('.chat-table table')).toContainText('中文');
  await expect(page.locator('.katex')).toBeVisible();
  await expect(page.locator('.chat-code code span').first()).toBeVisible();
  await expect(page.getByTitle('静态图表')).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toBeVisible();
  await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输入');
  await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输出');
  console.log(
    'P02_SYNTHETIC_DIAGRAM_BOUNDS',
    await page
      .frameLocator('iframe[title="静态图表"]')
      .locator('svg')
      .evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      }),
  );
  expect(
    await page
      .frameLocator('iframe[title="静态图表"]')
      .locator('svg')
      .evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        return box.width <= innerWidth && box.height <= innerHeight;
      }),
  ).toBe(true);
  expect(
    await page.evaluate(() => ({
      badLinks: document.querySelectorAll('a[href^="javascript:"]').length,
      images: document.querySelectorAll('.chat-markdown img').length,
      pwned: Reflect.get(window, 'fixturePwned') ?? false,
    })),
  ).toEqual({ badLinks: 0, images: 0, pwned: false });
  expect(remote).toEqual([]);
  await page.getByTitle('静态图表').screenshot({ path: 'docs/evidence/P02-02/static-diagram.png' });
  await page.screenshot({ path: 'docs/evidence/P02-02/safe-markdown.png' });
});
