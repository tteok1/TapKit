# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.inline-selection.spec.ts >> P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges
- Location: tests\e2e\P02-03.inline-selection.spec.ts:49:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Amber lighthouse."
Received: ""

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link "TapKit 首页" [ref=e7] [cursor=pointer]:
          - /url: /
        - button "展开侧栏" [ref=e8] [cursor=pointer]
      - generic [ref=e11]:
        - button "临时聊天" [ref=e12] [cursor=pointer]
        - button "新建聊天" [ref=e15] [cursor=pointer]
        - button "新建工作" [ref=e18] [cursor=pointer]
        - button "新建项目" [ref=e21] [cursor=pointer]
      - navigation "主导航" [ref=e24]:
        - button "搜索" [ref=e25] [cursor=pointer]
        - link "聊天" [ref=e28] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e31] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e34] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e37] [cursor=pointer]:
          - /url: /files
        - link "通知" [ref=e40] [cursor=pointer]:
          - /url: /notifications
      - region "会话历史" [ref=e44]:
        - button "聊" [ref=e46] [cursor=pointer]
    - generic [ref=e48]:
      - link "个人资料与设置" [ref=e49] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e54] [cursor=pointer]:
        - /url: /settings/general
  - generic [ref=e57]:
    - banner [ref=e58]:
      - button "后退" [ref=e59] [cursor=pointer]
      - button "前进" [ref=e62] [cursor=pointer]
      - link "首页" [ref=e65] [cursor=pointer]:
        - /url: /
      - generic [ref=e66]: "隔离测试回复： Amber lighthouse. ```j"
      - group [ref=e67]:
        - generic "连接状态" [ref=e68] [cursor=pointer]
      - button "详情面板" [ref=e70] [cursor=pointer]
    - main [ref=e74]:
      - generic [ref=e76]:
        - generic [ref=e77]:
          - button "会话摘要" [ref=e79] [cursor=pointer]
          - button "记忆与历史范围" [ref=e81] [cursor=pointer]
          - generic [ref=e82]:
            - generic [ref=e83]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e84]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e85] [cursor=pointer]
            - button "导出 Markdown" [ref=e86] [cursor=pointer]
            - group [ref=e87]:
              - generic "当前资料、工具与个性化设置" [ref=e88] [cursor=pointer]
        - generic [ref=e89]:
          - article [ref=e90]:
            - generic [ref=e91]:
              - strong [ref=e92]: 你
              - generic [ref=e93]: · 17:39:49 · 已发送
            - paragraph [ref=e94]: "Amber lighthouse. ```js const n = 1; ``` | A | B | |---|---| |中|2|"
            - generic [ref=e96]:
              - button "复制回复" [ref=e97] [cursor=pointer]
              - button "引用选区追问" [ref=e100] [cursor=pointer]
              - generic [ref=e103]:
                - button "编辑问题并创建分支" [ref=e104] [cursor=pointer]
                - button "收藏" [ref=e107] [cursor=pointer]
                - button "更多消息操作" [ref=e111] [cursor=pointer]
          - article [ref=e113]:
            - generic [ref=e114]:
              - strong [ref=e115]: TapKit
              - generic [ref=e116]: openai-compatible · fixture-model · 17:39:49 · 已发送
            - group [ref=e117]:
              - generic [ref=e118]:
                - paragraph [ref=e119]: 隔离测试回复： Amber lighthouse.
                - generic [ref=e120]:
                  - generic [ref=e121]:
                    - generic [ref=e122]: js
                    - button "复制代码" [ref=e123] [cursor=pointer]
                  - code [ref=e128]:
                    - generic [ref=e129]: const n = 1;
                - generic [ref=e130]:
                  - button "复制表格"
                  - table [ref=e132]:
                    - rowgroup [ref=e133]:
                      - row [ref=e134]:
                        - columnheader "A" [ref=e135]
                        - columnheader "B" [ref=e136]
                    - rowgroup [ref=e137]:
                      - row [ref=e138]:
                        - cell "中" [ref=e139]
                        - cell "2" [ref=e140]
            - generic [ref=e141]:
              - button "使用的记忆与历史参考" [ref=e144] [cursor=pointer]
              - generic [ref=e147]:
                - button "复制回复" [ref=e148] [cursor=pointer]
                - button "引用选区追问" [ref=e151] [cursor=pointer]
                - generic [ref=e154]:
                  - button "重新生成回答" [ref=e155] [cursor=pointer]
                  - button "点赞" [ref=e158] [cursor=pointer]
                  - button "点踩" [ref=e161] [cursor=pointer]
                  - button "收藏" [ref=e164] [cursor=pointer]
                  - button "更多消息操作" [ref=e168] [cursor=pointer]
        - status [ref=e170]:
          - text: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
          - generic [ref=e171]: 请求次数与用量包含标题等辅助请求；保守估算不代表供应商实际扣费。
        - generic [ref=e172]:
          - textbox "输入草稿" [ref=e173]:
            - /placeholder: 写下你的问题…
          - generic [ref=e174]:
            - button "添加附件或引用资料" [ref=e176] [cursor=pointer]
            - button "输入与工具信息" [ref=e180] [cursor=pointer]
            - button "本轮模型" [ref=e185] [cursor=pointer]:
              - generic [ref=e186]: fixture-model
            - button "发送" [disabled] [ref=e189]
```

# Test source

```ts
  1   | import {
  2   |   test,
  3   |   expect,
  4   |   _electron as electron,
  5   |   type ElectronApplication,
  6   |   type Locator,
  7   |   type Page,
  8   | } from '@playwright/test';
  9   | import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  10  | import { resolve } from 'node:path';
  11  | 
  12  | let app: ElectronApplication;
  13  | const evidence = resolve('docs/evidence/P02-03/inline-selection-2026-10-21');
  14  | async function select(page: Page, body: Locator, text: string) {
  15  |   await body.locator('p').filter({ hasText: text }).scrollIntoViewIfNeeded();
  16  |   const points = await body.evaluate((el, text) => {
  17  |     window.getSelection()?.removeAllRanges();
  18  |     const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  19  |     for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  20  |       const start = node.textContent?.indexOf(text) ?? -1;
  21  |       if (start < 0) continue;
  22  |       const range = document.createRange();
  23  |       range.setStart(node, start);
  24  |       range.setEnd(node, start + 1);
  25  |       const first = range.getBoundingClientRect();
  26  |       range.setStart(node, start + text.length - 1);
  27  |       range.setEnd(node, start + text.length);
  28  |       const last = range.getBoundingClientRect();
  29  |       return {
  30  |         x1: first.left + 0.5,
  31  |         y1: first.top + first.height / 2,
  32  |         x2: last.right - 0.5,
  33  |         y2: last.top + last.height / 2,
  34  |       };
  35  |     }
  36  |     throw new Error('TEXT_NOT_FOUND');
  37  |   }, text);
  38  |   await page.mouse.move(points.x1, points.y1);
  39  |   await page.mouse.down();
  40  |   await page.mouse.move(points.x2, points.y2, { steps: 8 });
  41  |   await page.mouse.up();
> 42  |   await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
      |                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  43  |   return points;
  44  | }
  45  | test.afterEach(async () => {
  46  |   await app?.close();
  47  | });
  48  | 
  49  | test('P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges', async () => {
  50  |   test.setTimeout(240_000);
  51  |   await mkdir('.test-data', { recursive: true });
  52  |   await mkdir(evidence, { recursive: true });
  53  |   const dir = await mkdtemp(resolve('.test-data/Inline selection '));
  54  |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  55  |   const env = Object.fromEntries(
  56  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  57  |       (r): r is [string, string] => r[1] !== undefined,
  58  |     ),
  59  |   );
  60  |   delete env.ELECTRON_RUN_AS_NODE;
  61  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  62  |   const page = await app.firstWindow();
  63  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  64  |   await page.keyboard.press('Control+n');
  65  |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  66  |   const input = page.getByLabel('输入草稿', { exact: true });
  67  |   await expect(input).toBeEnabled();
  68  |   await input.fill(
  69  |     '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  70  |   );
  71  |   await page.getByRole('button', { name: '发送', exact: true }).click();
  72  |   const body = page.locator('.chat-message.assistant .chat-markdown').first();
  73  |   await expect(body.locator('table')).toContainText('中');
  74  |   const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  75  |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  76  |   await expect(toolbar).toBeHidden();
  77  |   for (const [width, height, zoom] of [
  78  |     [1440, 900, 1],
  79  |     [960, 640, 1],
  80  |     [1440, 900, 2],
  81  |     [960, 640, 2],
  82  |   ] as const) {
  83  |     await app.evaluate(
  84  |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  85  |       [width, height] as [number, number],
  86  |     );
  87  |     await page.getByRole('link', { name: '设置', exact: true }).click();
  88  |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  89  |     await page
  90  |       .getByLabel('主题', { exact: true })
  91  |       .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
  92  |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  93  |     await page.getByRole('button', { name: '后退', exact: true }).click();
  94  |     await expect(body.locator('table')).toContainText('中');
  95  |     // Capture only this fixture's clipboard writes; do not replace the user's OS clipboard.
  96  |     await page.evaluate(() => {
  97  |       Object.defineProperty(navigator, 'clipboard', {
  98  |         configurable: true,
  99  |         value: {
  100 |           writeText: async (text: string) => {
  101 |             Reflect.set(window, 'copiedFixture', text);
  102 |           },
  103 |         },
  104 |       });
  105 |     });
  106 |     const code = body.locator('.chat-code').first();
  107 |     await code.scrollIntoViewIfNeeded();
  108 |     const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
  109 |     await expect(copyCode).toHaveText('');
  110 |     await expect(copyCode).toHaveAttribute('title', '复制代码');
  111 |     await copyCode.click();
  112 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('const n = 1;');
  113 |     const table = body.locator('.chat-table');
  114 |     await table.scrollIntoViewIfNeeded();
  115 |     await input.focus();
  116 |     await page.mouse.move(1, 1);
  117 |     const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
  118 |     await expect(copyTable).toHaveCSS('opacity', '0');
  119 |     await table.hover();
  120 |     await expect(copyTable).toHaveCSS('opacity', '1');
  121 |     await expect(copyTable).toHaveText('');
  122 |     const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
  123 |     expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
  124 |     expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
  125 |     await copyTable.click();
  126 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('A\tB\n中\t2');
  127 |     await input.focus();
  128 |     await page.mouse.move(1, 1);
  129 |     await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
  130 |     const point = await select(page, body, 'Amber lighthouse.');
  131 |     await expect(toolbar).toBeVisible();
  132 |     for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
  133 |       await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  134 |     const geometry = await toolbar.evaluate((el) => {
  135 |       const r = el.getBoundingClientRect();
  136 |       return {
  137 |         x: r.x,
  138 |         y: r.y,
  139 |         right: r.right,
  140 |         bottom: r.bottom,
  141 |         tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  142 |       };
```