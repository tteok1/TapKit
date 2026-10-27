# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P05-03.milestone.spec.ts >> P05-03 T01-T12/T19/T20/T22 uncut synthetic chat milestone from unconfigured to restart
- Location: tests\e2e\P05-03.milestone.spec.ts:12:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.chat-message.assistant')
Expected: 3
Received: 4
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" locator('.chat-message.assistant') with timeout 15000ms
  - waiting for locator('.chat-message.assistant')
    3 × locator resolved to 2 elements
      - unexpected value "2"
    30 × locator resolved to 4 elements
       - unexpected value "4"

```

# Test source

```ts
  1   | import {
  2   |   test,
  3   |   expect,
  4   |   _electron as electron,
  5   |   type ElectronApplication,
  6   |   type Page,
  7   | } from '@playwright/test';
  8   | import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
  9   | import { resolve, join } from 'node:path';
  10  | import { openSessionFixture, reopenSessionFixture } from './session-fixture';
  11  | import type { ChatSnapshot } from '../../packages/contracts/src';
  12  | test('P05-03 T01-T12/T19/T20/T22 uncut synthetic chat milestone from unconfigured to restart', async () => {
  13  |   test.setTimeout(360000);
  14  |   await mkdir('.test-data', { recursive: true });
  15  |   const dir = await mkdtemp(resolve('.test-data', 'P05-03 uncut 中文 '));
  16  |   const evidence = resolve('docs/evidence/P05-03/uncut');
  17  |   await mkdir(evidence, { recursive: true });
  18  |   let application: ElectronApplication | undefined;
  19  |   let page!: Page;
  20  |   const steps: { step: string; timestamp: string }[] = [];
  21  |   async function launch(fixtures: boolean) {
  22  |     const env = Object.fromEntries(
  23  |       Object.entries({
  24  |         ...process.env,
  25  |         TAPKIT_DATA_DIR: join(dir, 'profile'),
  26  |         TAPKIT_CHAT_FIXTURE: fixtures ? 'P02-02' : '',
  27  |         TAPKIT_WEB_FIXTURE: fixtures ? 'P05-01' : '',
  28  |       }).filter((row): row is [string, string] => row[1] !== undefined),
  29  |     );
  30  |     delete env.ELECTRON_RUN_AS_NODE;
  31  |     application = await electron.launch({
  32  |       args: [resolve('apps/desktop')],
  33  |       env,
  34  |       chromiumSandbox: true,
  35  |     });
  36  |     page = await application.firstWindow();
  37  |     await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  38  |   }
  39  |   async function shot(step: string) {
  40  |     steps.push({ step, timestamp: new Date().toISOString() });
  41  |     await page.screenshot({
  42  |       path: join(evidence, String(steps.length).padStart(2, '0') + '-' + step + '.png'),
  43  |     });
  44  |     await writeFile(
  45  |       join(evidence, 'steps.json'),
  46  |       JSON.stringify({ syntheticModel: true, syntheticPublicWeb: true, steps }, null, 2),
  47  |     );
  48  |   }
  49  |   async function snapshot(sessionId: string) {
  50  |     return page.evaluate(async (sessionId) => {
  51  |       const value = crypto.randomUUID(),
  52  |         requestId = value.slice(0, 14) + '7' + value.slice(15);
  53  |       const reply = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
  54  |       if (!reply.ok) throw Error(reply.error.code);
  55  |       return reply.data as ChatSnapshot;
  56  |     }, sessionId);
  57  |   }
  58  |   async function send(text: string, expected: string) {
  59  |     const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  60  |     const before = await page.locator('.chat-message.assistant').count();
  61  |     await page.getByLabel('输入草稿').fill(text);
  62  |     await page.getByRole('button', { name: '发送', exact: true }).click();
> 63  |     await expect(page.locator('.chat-message.assistant')).toHaveCount(before + 1);
      |                                                           ^ Error: expect(locator).toHaveCount(expected) failed
  64  |     await expect(page.locator('.chat-message.assistant').last()).toContainText(expected);
  65  |     await expect.poll(async () => (await snapshot(sid)).run?.status).toBe('completed');
  66  |   }
  67  |   try {
  68  |     await launch(false);
  69  |     expect(
  70  |       await page.evaluate(async () => {
  71  |         const value = crypto.randomUUID(),
  72  |           requestId = value.slice(0, 14) + '7' + value.slice(15);
  73  |         const r = await window.tapkit.modelCommand({ requestId }, 'models.catalog', {});
  74  |         return r.ok && 'catalog' in r.data
  75  |           ? r.data.catalog.filter((m) => m.status === 'ready').length
  76  |           : -1;
  77  |       }),
  78  |     ).toBe(0);
  79  |     await shot('unconfigured');
  80  |     await application!.close();
  81  |     application = undefined;
  82  |     await writeFile(join(dir, 'profile/P02-02.fixture'), 'P02-02 isolated fixture');
  83  |     await writeFile(join(dir, 'profile/P05.fixture'), 'P05 isolated web fixture');
  84  |     await launch(true);
  85  |     const first = await openSessionFixture(page);
  86  |     await shot('fixture-connected');
  87  |     await send('编号TK-123；预算￥500；日期2026-10-31；不要创建PR，不得合入main。', '隔离测试回复');
  88  |     await page
  89  |       .locator('.chat-message.user')
  90  |       .first()
  91  |       .getByRole('button', { name: '编辑问题并创建分支', exact: true })
  92  |       .click();
  93  |     const editor = page.getByRole('dialog', { name: '编辑问题并创建分支' });
  94  |     await editor
  95  |       .getByLabel('编辑问题并创建分支')
  96  |       .fill('改过的问题：编号TK-123；预算￥500；不得合入main。');
  97  |     await editor.getByRole('button', { name: '保存', exact: true }).click();
  98  |     await expect
  99  |       .poll(async () => (await snapshot(first)).messages.at(-1)?.text)
  100 |       .toContain('改过的问题');
  101 |     await shot('edited-branch');
  102 |     await openSessionFixture(page);
  103 |     await send('我喜欢简短中文回答', '隔离测试回复');
  104 |     await openSessionFixture(page);
  105 |     await send('我喜欢简短中文回答', '隔离测试回复');
  106 |     await expect(page.locator('.chat-message.user')).toContainText('已更新记忆', {
  107 |       timeout: 20000,
  108 |     });
  109 |     await shot('automatic-memory-notice');
  110 |     await page.getByRole('link', { name: '项目', exact: true }).first().click();
  111 |     await page
  112 |       .locator('.projects-page')
  113 |       .getByRole('button', { name: '新建项目', exact: true })
  114 |       .click();
  115 |     await page.getByRole('dialog').getByLabel('项目名称').fill('P05完整路径项目');
  116 |     await page.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
  117 |     await page.getByRole('link', { name: 'P05完整路径项目', exact: true }).last().click();
  118 |     await expect(page.locator('.projects-page')).toHaveAttribute(
  119 |       'data-project-id',
  120 |       /[0-9a-f-]{36}/,
  121 |     );
  122 |     const project = (await page.locator('.projects-page').getAttribute('data-project-id'))!;
  123 |     const source = join(dir, '退款资料.txt');
  124 |     await writeFile(source, '退款期限：7天。商品退货后的款项会退回原支付账户。');
  125 |     await application!.evaluate(({ dialog }, source) => {
  126 |       dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  127 |     }, source);
  128 |     await page.getByRole('link', { name: '文件', exact: true }).first().click();
  129 |     await page
  130 |       .getByRole('combobox', { name: /^文件范围与导入位置/ })
  131 |       .selectOption('project:' + project);
  132 |     await page.getByRole('button', { name: '导入文件', exact: true }).click();
  133 |     const importing = page.getByRole('dialog', { name: '待导入文件', exact: true });
  134 |     await importing.getByRole('button', { name: '开始导入', exact: true }).click();
  135 |     await expect(importing.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  136 |     await importing.getByRole('button', { name: '关闭', exact: true }).click();
  137 |     await expect(page.locator('.file-card').filter({ hasText: '退款资料.txt' })).toContainText(
  138 |       '内容已读取',
  139 |       { timeout: 45000 },
  140 |     );
  141 |     await shot('file-imported');
  142 |     await page.getByRole('link', { name: '项目', exact: true }).first().click();
  143 |     await page.getByRole('link', { name: 'P05完整路径项目', exact: true }).last().click();
  144 |     await page.getByRole('button', { name: '在项目中新建聊天', exact: true }).click();
  145 |     await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  146 |     const sid = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  147 |     await page.locator('.project-scope summary').click();
  148 |     const only = page.getByLabel('本次仅依据项目资料（禁用外部背景和历史工具）', { exact: true });
  149 |     await only.check();
  150 |     await page.getByRole('button', { name: '保存资料范围', exact: true }).click();
  151 |     await send('P05项目：退款期限是多少天？', '退款期限：7天');
  152 |     await expect(page.getByRole('link', { name: '来源 1', exact: true })).toBeVisible();
  153 |     await shot('project-only-rag');
  154 |     await page.getByRole('button', { name: '会话摘要', exact: true }).click();
  155 |     const summary = page.getByRole('region', { name: '会话摘要' });
  156 |     for (let n = 0; n < 3; n++) {
  157 |       await summary.getByRole('button', { name: '生成或更新摘要', exact: true }).click();
  158 |       await expect(
  159 |         summary.getByRole('button', { name: '生成或更新摘要', exact: true }),
  160 |       ).toBeEnabled();
  161 |     }
  162 |     await summary.getByLabel('摘要纠正').fill('新目标：核查公开价格；不得发布。');
  163 |     await summary.getByRole('button', { name: '保存纠正', exact: true }).click();
```