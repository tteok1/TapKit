# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.inline-selection.spec.ts >> P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges
- Location: tests\e2e\P02-03.inline-selection.spec.ts:62:1

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
              - generic [ref=e93]: · 17:43:34 · 已发送
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
              - generic [ref=e116]: openai-compatible · fixture-model · 17:43:34 · 已发送
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
  15  |   await body
  16  |     .locator('p')
  17  |     .filter({ hasText: text })
  18  |     .evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  19  |   const points = await body.evaluate((el, text) => {
  20  |     window.getSelection()?.removeAllRanges();
  21  |     const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  22  |     for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  23  |       const start = node.textContent?.indexOf(text) ?? -1;
  24  |       if (start < 0) continue;
  25  |       const range = document.createRange();
  26  |       range.setStart(node, start);
  27  |       range.setEnd(node, start + 1);
  28  |       const first = range.getBoundingClientRect();
  29  |       range.setStart(node, start + text.length - 1);
  30  |       range.setEnd(node, start + text.length);
  31  |       const last = range.getBoundingClientRect();
  32  |       return {
  33  |         x1: first.left + 0.5,
  34  |         y1: first.top + first.height / 2,
  35  |         x2: last.right - 0.5,
  36  |         y2: last.top + last.height / 2,
  37  |       };
  38  |     }
  39  |     throw new Error('TEXT_NOT_FOUND');
  40  |   }, text);
  41  |   const hit = await body.evaluate(
  42  |     (el, p) => ({
  43  |       first: el.contains(document.elementFromPoint(p.x1, p.y1)),
  44  |       last: el.contains(document.elementFromPoint(p.x2, p.y2)),
  45  |       firstTag: document.elementFromPoint(p.x1, p.y1)?.outerHTML.slice(0, 150),
  46  |       lastTag: document.elementFromPoint(p.x2, p.y2)?.outerHTML.slice(0, 150),
  47  |     }),
  48  |     points,
  49  |   );
  50  |   expect(hit, JSON.stringify({ points, hit })).toMatchObject({ first: true, last: true });
  51  |   await page.mouse.move(points.x1, points.y1);
  52  |   await page.mouse.down();
  53  |   await page.mouse.move(points.x2, points.y2, { steps: 8 });
  54  |   await page.mouse.up();
> 55  |   await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
      |                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  56  |   return points;
  57  | }
  58  | test.afterEach(async () => {
  59  |   await app?.close();
  60  | });
  61  | 
  62  | test('P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges', async () => {
  63  |   test.setTimeout(240_000);
  64  |   await mkdir('.test-data', { recursive: true });
  65  |   await mkdir(evidence, { recursive: true });
  66  |   const dir = await mkdtemp(resolve('.test-data/Inline selection '));
  67  |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  68  |   const env = Object.fromEntries(
  69  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  70  |       (r): r is [string, string] => r[1] !== undefined,
  71  |     ),
  72  |   );
  73  |   delete env.ELECTRON_RUN_AS_NODE;
  74  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  75  |   const page = await app.firstWindow();
  76  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  77  |   await page.keyboard.press('Control+n');
  78  |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  79  |   const input = page.getByLabel('输入草稿', { exact: true });
  80  |   await expect(input).toBeEnabled();
  81  |   await input.fill(
  82  |     '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  83  |   );
  84  |   await page.getByRole('button', { name: '发送', exact: true }).click();
  85  |   const body = page.locator('.chat-message.assistant .chat-markdown').first();
  86  |   await expect(body.locator('table')).toContainText('中');
  87  |   const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  88  |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  89  |   await expect(toolbar).toBeHidden();
  90  |   for (const [width, height, zoom] of [
  91  |     [1440, 900, 1],
  92  |     [960, 640, 1],
  93  |     [1440, 900, 2],
  94  |     [960, 640, 2],
  95  |   ] as const) {
  96  |     await app.evaluate(
  97  |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  98  |       [width, height] as [number, number],
  99  |     );
  100 |     await page.getByRole('link', { name: '设置', exact: true }).click();
  101 |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  102 |     await page
  103 |       .getByLabel('主题', { exact: true })
  104 |       .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
  105 |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  106 |     await page.getByRole('button', { name: '后退', exact: true }).click();
  107 |     await expect(body.locator('table')).toContainText('中');
  108 |     // Capture only this fixture's clipboard writes; do not replace the user's OS clipboard.
  109 |     await page.evaluate(() => {
  110 |       Object.defineProperty(navigator, 'clipboard', {
  111 |         configurable: true,
  112 |         value: {
  113 |           writeText: async (text: string) => {
  114 |             Reflect.set(window, 'copiedFixture', text);
  115 |           },
  116 |         },
  117 |       });
  118 |     });
  119 |     const code = body.locator('.chat-code').first();
  120 |     await code.scrollIntoViewIfNeeded();
  121 |     const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
  122 |     await expect(copyCode).toHaveText('');
  123 |     await expect(copyCode).toHaveAttribute('title', '复制代码');
  124 |     await copyCode.click();
  125 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('const n = 1;');
  126 |     const table = body.locator('.chat-table');
  127 |     await table.scrollIntoViewIfNeeded();
  128 |     await input.focus();
  129 |     await page.mouse.move(1, 1);
  130 |     const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
  131 |     await expect(copyTable).toHaveCSS('opacity', '0');
  132 |     await table.hover();
  133 |     await expect(copyTable).toHaveCSS('opacity', '1');
  134 |     await expect(copyTable).toHaveText('');
  135 |     const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
  136 |     expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
  137 |     expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
  138 |     await copyTable.click();
  139 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('A\tB\n中\t2');
  140 |     await input.focus();
  141 |     await page.mouse.move(1, 1);
  142 |     await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
  143 |     const point = await select(page, body, 'Amber lighthouse.');
  144 |     await expect(toolbar).toBeVisible();
  145 |     for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
  146 |       await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  147 |     const geometry = await toolbar.evaluate((el) => {
  148 |       const r = el.getBoundingClientRect();
  149 |       return {
  150 |         x: r.x,
  151 |         y: r.y,
  152 |         right: r.right,
  153 |         bottom: r.bottom,
  154 |         tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  155 |       };
```