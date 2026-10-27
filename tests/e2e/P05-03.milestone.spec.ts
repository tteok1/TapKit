import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openSessionFixture, reopenSessionFixture } from './session-fixture';
import type { ChatSnapshot } from '../../packages/contracts/src';
test('P05-03 T01-T12/T19/T20/T22 uncut synthetic chat milestone from unconfigured to restart', async () => {
  test.setTimeout(360000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-03 uncut 中文 '));
  const evidence = resolve('docs/evidence/P05-03/uncut');
  await mkdir(evidence, { recursive: true });
  let application: ElectronApplication | undefined;
  let page!: Page;
  const steps: { step: string; timestamp: string }[] = [];
  async function launch(fixtures: boolean) {
    const env = Object.fromEntries(
      Object.entries({
        ...process.env,
        TAPKIT_DATA_DIR: join(dir, 'profile'),
        TAPKIT_CHAT_FIXTURE: fixtures ? 'P02-02' : '',
        TAPKIT_WEB_FIXTURE: fixtures ? 'P05-01' : '',
      }).filter((row): row is [string, string] => row[1] !== undefined),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({
      args: [resolve('apps/desktop')],
      env,
      chromiumSandbox: true,
    });
    page = await application.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  }
  async function shot(step: string) {
    steps.push({ step, timestamp: new Date().toISOString() });
    await page.screenshot({
      path: join(evidence, String(steps.length).padStart(2, '0') + '-' + step + '.png'),
    });
    await writeFile(
      join(evidence, 'steps.json'),
      JSON.stringify({ syntheticModel: true, syntheticPublicWeb: true, steps }, null, 2),
    );
  }
  async function snapshot(sessionId: string) {
    return page.evaluate(async (sessionId) => {
      const value = crypto.randomUUID(),
        requestId = value.slice(0, 14) + '7' + value.slice(15);
      const reply = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
      if (!reply.ok) throw Error(reply.error.code);
      return reply.data as ChatSnapshot;
    }, sessionId);
  }
  async function send(text: string, expected: string) {
    const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
    const before = await page.locator('.chat-message.user').count();
    await page.getByLabel('输入草稿').fill(text);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.chat-message.user')).toHaveCount(before + 1);
    await expect(page.locator('.chat-message.user').last()).toContainText(text);
    await expect(page.locator('.chat-message.assistant').last()).toContainText(expected);
    await expect.poll(async () => (await snapshot(sid)).run?.status).toBe('completed');
  }
  try {
    await launch(false);
    expect(
      await page.evaluate(async () => {
        const value = crypto.randomUUID(),
          requestId = value.slice(0, 14) + '7' + value.slice(15);
        const r = await window.tapkit.modelCommand({ requestId }, 'models.catalog', {});
        return r.ok && 'catalog' in r.data
          ? r.data.catalog.filter((m) => m.status === 'ready').length
          : -1;
      }),
    ).toBe(0);
    await shot('unconfigured');
    await application!.close();
    application = undefined;
    await writeFile(join(dir, 'profile/P02-02.fixture'), 'P02-02 isolated fixture');
    await writeFile(join(dir, 'profile/P05.fixture'), 'P05 isolated web fixture');
    await launch(true);
    const first = await openSessionFixture(page);
    await shot('fixture-connected');
    await send('编号TK-123；预算￥500；日期2026-10-31；不要创建PR，不得合入main。', '隔离测试回复');
    await page
      .locator('.chat-message.user')
      .first()
      .getByRole('button', { name: '编辑问题并创建分支', exact: true })
      .click();
    const editor = page.getByRole('dialog', { name: '编辑问题并创建分支' });
    await editor
      .getByLabel('编辑问题并创建分支')
      .fill('改过的问题：编号TK-123；预算￥500；不得合入main。');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(first)).messages.at(-1)?.text)
      .toContain('改过的问题');
    await shot('edited-branch');
    await openSessionFixture(page);
    await send('我喜欢简短中文回答', '隔离测试回复');
    await openSessionFixture(page);
    await send('我喜欢简短中文回答', '隔离测试回复');
    await expect(page.locator('.chat-message.user')).toContainText('已更新记忆', {
      timeout: 20000,
    });
    await shot('automatic-memory-notice');
    await page.getByRole('link', { name: '项目', exact: true }).first().click();
    await page
      .locator('.projects-page')
      .getByRole('button', { name: '新建项目', exact: true })
      .click();
    await page.getByRole('dialog').getByLabel('项目名称').fill('P05完整路径项目');
    await page.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
    await page.getByRole('link', { name: 'P05完整路径项目', exact: true }).last().click();
    await expect(page.locator('.projects-page')).toHaveAttribute(
      'data-project-id',
      /[0-9a-f-]{36}/,
    );
    const project = (await page.locator('.projects-page').getAttribute('data-project-id'))!;
    const source = join(dir, '退款资料.txt');
    await writeFile(source, '退款期限：7天。商品退货后的款项会退回原支付账户。');
    await application!.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    }, source);
    await page.getByRole('link', { name: '文件', exact: true }).first().click();
    await page
      .getByRole('combobox', { name: /^文件范围与导入位置/ })
      .selectOption('project:' + project);
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    const importing = page.getByRole('dialog', { name: '待导入文件', exact: true });
    await importing.getByRole('button', { name: '开始导入', exact: true }).click();
    await expect(importing.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
    await importing.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('.file-card').filter({ hasText: '退款资料.txt' })).toContainText(
      '内容已读取',
      { timeout: 45000 },
    );
    await shot('file-imported');
    await page.getByRole('link', { name: '项目', exact: true }).first().click();
    await page.getByRole('link', { name: 'P05完整路径项目', exact: true }).last().click();
    await page.getByRole('button', { name: '在项目中新建聊天', exact: true }).click();
    await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
    const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
    await page.locator('.project-scope summary').click();
    const only = page.getByLabel('本次仅依据项目资料（禁用外部背景和历史工具）', { exact: true });
    await only.check();
    await page.getByRole('button', { name: '保存资料范围', exact: true }).click();
    await send('P05项目：退款期限是多少天？', '退款期限：7天');
    await expect(page.getByRole('link', { name: '来源 1', exact: true })).toBeVisible();
    await shot('project-only-rag');
    await page.getByRole('button', { name: '会话摘要', exact: true }).click();
    const summary = page.getByRole('region', { name: '会话摘要' });
    for (let n = 0; n < 3; n++) {
      await summary.getByRole('button', { name: '生成或更新摘要', exact: true }).click();
      await expect(
        summary.getByRole('button', { name: '生成或更新摘要', exact: true }),
      ).toBeEnabled();
    }
    await summary.getByLabel('摘要纠正').fill('新目标：核查公开价格；不得发布。');
    await summary.getByRole('button', { name: '保存纠正', exact: true }).click();
    await expect(summary).toContainText('新目标：核查公开价格');
    await shot('three-compactions-correction');
    await page.getByRole('button', { name: '会话摘要', exact: true }).click();
    await only.uncheck();
    await page.getByRole('button', { name: '保存资料范围', exact: true }).click();
    const scopeBar = page.locator('.project-scope');
    await expect(scopeBar.getByRole('alert')).toBeVisible();
    await scopeBar.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(scopeBar.getByRole('alert')).toHaveCount(0);
    await expect(only).toBeChecked();
    await only.uncheck();
    await page.getByRole('button', { name: '保存资料范围', exact: true }).click();
    await page.getByRole('button', { name: /^联网与来源：/ }).click();
    await expect(page.getByLabel('联网搜索', { exact: true })).toBeEnabled();
    await page.getByLabel('联网搜索', { exact: true }).selectOption('on');
    await expect(page.getByLabel('联网搜索', { exact: true })).toHaveValue('on');
    await page.getByRole('button', { name: '关闭联网设置' }).click();
    await send('P05来源 查证 https://example.com/page1', '公开价格 42 元');
    await page.getByRole('link', { name: '来源 1', exact: true }).last().click();
    await expect(page.locator('.web-source-text')).toContainText('公开价格 42 元');
    await shot('public-source-original');
    await page.getByRole('button', { name: '关闭网页来源', exact: true }).click();
    await page.getByRole('button', { name: '导出分享副本', exact: true }).click();
    const exporting = page.getByRole('dialog', { name: '导出分享副本', exact: true });
    await exporting.getByLabel('导出格式', { exact: true }).selectOption('html');
    await exporting.getByRole('button', { name: '重新生成预览' }).click();
    await expect(exporting.getByLabel('接收者可见正文')).toContainText('公开价格 42 元');
    await shot('recipient-review');
    const output = join(dir, '里程碑副本.html');
    await application!.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await exporting.getByRole('button', { name: '选择位置并导出' }).click();
    await expect(exporting.getByRole('status')).toContainText('副本已保存', { timeout: 60000 });
    expect(await readFile(output, 'utf8')).toContain('公开价格 42 元');
    await shot('export-completed');
    await exporting.getByRole('button', { name: '关闭分享预览' }).click();
    await page.getByLabel('输入草稿').fill('重启后继续核查');
    await expect
      .poll(async () =>
        page.evaluate(async (sessionId) => {
          const value = crypto.randomUUID(),
            requestId = value.slice(0, 14) + '7' + value.slice(15);
          const r = await window.tapkit.chatCommand({ requestId }, 'drafts.get', {
            sessionId,
            windowId: window.tapkit.windowSlot,
          });
          return r.ok && 'text' in r.data ? r.data.text : '';
        }, sid),
      )
      .toBe('重启后继续核查');
    await application!.close();
    application = undefined;
    await launch(true);
    await reopenSessionFixture(page, sid);
    await expect(page.getByLabel('输入草稿')).toHaveValue('重启后继续核查');
    await expect(page.locator('.chat-message.assistant').last()).toContainText('公开价格 42 元');
    await page.getByRole('button', { name: /^联网与来源：/ }).click();
    await page.getByRole('button', { name: '网页来源', exact: true }).click();
    await expect(page.getByRole('complementary', { name: '网页来源', exact: true })).toContainText(
      '公开价格来源',
    );
    await shot('restarted-same-session');
  } finally {
    await application?.close();
  }
});
