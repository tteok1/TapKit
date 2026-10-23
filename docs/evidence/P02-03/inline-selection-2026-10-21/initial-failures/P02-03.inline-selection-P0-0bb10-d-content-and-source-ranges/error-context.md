# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.inline-selection.spec.ts >> P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges
- Location: tests\e2e\P02-03.inline-selection.spec.ts:49:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '发送', exact: true })
    - locator resolved to <button disabled aria-label="发送" title="连接模型后发送" class="send-button icon-button">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is not enabled
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link "TapKit 首页" [ref=e7] [cursor=pointer]:
          - /url: /
          - strong [ref=e8]: TapKit
        - button "收起侧栏" [ref=e9] [cursor=pointer]
      - generic [ref=e12]:
        - button "临时聊天" [ref=e13] [cursor=pointer]
        - button "新建聊天" [ref=e16] [cursor=pointer]
        - button "新建工作" [ref=e19] [cursor=pointer]
        - button "新建项目" [ref=e22] [cursor=pointer]
      - navigation "主导航" [ref=e25]:
        - button "搜索" [ref=e26] [cursor=pointer]:
          - generic [ref=e30]: Ctrl K
        - link "聊天" [ref=e31] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e34] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e37] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e40] [cursor=pointer]:
          - /url: /files
        - link "通知" [ref=e43] [cursor=pointer]:
          - /url: /notifications
        - group [ref=e46]:
          - generic "调整导航入口" [ref=e47] [cursor=pointer]
      - region "会话历史" [ref=e49]:
        - generic [ref=e50]:
          - button "最近" [pressed] [ref=e51] [cursor=pointer]
          - button "归档" [ref=e52] [cursor=pointer]
          - button "回收站" [ref=e53] [cursor=pointer]
          - button "全部" [ref=e54] [cursor=pointer]
        - button "新建分组" [ref=e55] [cursor=pointer]
        - button "默认列表" [pressed] [ref=e56] [cursor=pointer]
        - heading "最近" [level=2] [ref=e57]
        - generic [ref=e58]:
          - button "新聊天 2026/10/21 17:25:32" [ref=e59] [cursor=pointer]:
            - text: 新聊天
            - generic [ref=e60]: 2026/10/21 17:25:32
          - button "置顶新聊天" [ref=e61] [cursor=pointer]
          - button "会话信息新聊天" [ref=e64] [cursor=pointer]: ⋯
      - generic [ref=e65]:
        - generic [ref=e66]: 任务执行尚未开放
        - generic [ref=e67]: 待确认事项：0
    - generic [ref=e68]:
      - link "个人资料与设置" [ref=e69] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e74] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e77]
  - generic [ref=e78]:
    - banner [ref=e79]:
      - button "后退" [ref=e80] [cursor=pointer]
      - button "前进" [ref=e83] [cursor=pointer]
      - link "首页" [ref=e86] [cursor=pointer]:
        - /url: /
      - generic [ref=e87]: 新聊天
      - group [ref=e88]:
        - generic "连接状态" [ref=e89] [cursor=pointer]
      - button "详情面板" [ref=e91] [cursor=pointer]:
        - generic [ref=e94]: 工作台
    - main [ref=e96]:
      - generic [ref=e98]:
        - generic [ref=e99]:
          - button "会话摘要" [ref=e101] [cursor=pointer]
          - button "记忆与历史范围" [ref=e103] [cursor=pointer]
          - generic [ref=e104]:
            - generic [ref=e105]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e106]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e107] [cursor=pointer]
            - button "导出 Markdown" [ref=e108] [cursor=pointer]
            - group [ref=e109]:
              - generic "当前资料、工具与个性化设置" [ref=e110] [cursor=pointer]
        - paragraph [ref=e112]: 发送一个问题开始对话。
        - generic [ref=e113]:
          - textbox "输入草稿" [ref=e114]:
            - /placeholder: 写下你的问题…
          - generic [ref=e115]:
            - button "添加附件或引用资料" [ref=e117] [cursor=pointer]
            - button "输入与工具信息" [ref=e121] [cursor=pointer]
            - button "本轮模型" [ref=e126] [cursor=pointer]:
              - generic [ref=e127]: fixture-model
            - button "发送" [disabled] [ref=e130]
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
  42  |   await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
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
  65  |   const input = page.getByLabel('输入草稿', { exact: true });
  66  |   await expect(input).toBeEnabled();
  67  |   await input.fill(
  68  |     '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  69  |   );
> 70  |   await page.getByRole('button', { name: '发送', exact: true }).click();
      |                                                               ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  71  |   const body = page.locator('.chat-message.assistant .chat-markdown').first();
  72  |   await expect(body.locator('table')).toContainText('中');
  73  |   const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  74  |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  75  |   await expect(toolbar).toBeHidden();
  76  |   for (const [width, height, zoom] of [
  77  |     [1440, 900, 1],
  78  |     [960, 640, 1],
  79  |     [1440, 900, 2],
  80  |     [960, 640, 2],
  81  |   ] as const) {
  82  |     await app.evaluate(
  83  |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  84  |       [width, height] as [number, number],
  85  |     );
  86  |     await page.getByRole('link', { name: '设置', exact: true }).click();
  87  |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  88  |     await page
  89  |       .getByLabel('主题', { exact: true })
  90  |       .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
  91  |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  92  |     await page.getByRole('button', { name: '后退', exact: true }).click();
  93  |     await expect(body.locator('table')).toContainText('中');
  94  |     // Capture only this fixture's clipboard writes; do not replace the user's OS clipboard.
  95  |     await page.evaluate(() => {
  96  |       Object.defineProperty(navigator, 'clipboard', {
  97  |         configurable: true,
  98  |         value: {
  99  |           writeText: async (text: string) => {
  100 |             Reflect.set(window, 'copiedFixture', text);
  101 |           },
  102 |         },
  103 |       });
  104 |     });
  105 |     const code = body.locator('.chat-code').first();
  106 |     await code.scrollIntoViewIfNeeded();
  107 |     const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
  108 |     await expect(copyCode).toHaveText('');
  109 |     await expect(copyCode).toHaveAttribute('title', '复制代码');
  110 |     await copyCode.click();
  111 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('const n = 1;');
  112 |     const table = body.locator('.chat-table');
  113 |     await table.scrollIntoViewIfNeeded();
  114 |     await input.focus();
  115 |     await page.mouse.move(1, 1);
  116 |     const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
  117 |     await expect(copyTable).toHaveCSS('opacity', '0');
  118 |     await table.hover();
  119 |     await expect(copyTable).toHaveCSS('opacity', '1');
  120 |     await expect(copyTable).toHaveText('');
  121 |     const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
  122 |     expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
  123 |     expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
  124 |     await copyTable.click();
  125 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('A\tB\n中\t2');
  126 |     await input.focus();
  127 |     await page.mouse.move(1, 1);
  128 |     await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
  129 |     const point = await select(page, body, 'Amber lighthouse.');
  130 |     await expect(toolbar).toBeVisible();
  131 |     for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
  132 |       await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  133 |     const geometry = await toolbar.evaluate((el) => {
  134 |       const r = el.getBoundingClientRect();
  135 |       return {
  136 |         x: r.x,
  137 |         y: r.y,
  138 |         right: r.right,
  139 |         bottom: r.bottom,
  140 |         tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  141 |       };
  142 |     });
  143 |     expect(geometry.x).toBeGreaterThanOrEqual(0);
  144 |     expect(geometry.y).toBeGreaterThanOrEqual(0);
  145 |     expect(geometry.right).toBeLessThanOrEqual(width + 1);
  146 |     expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
  147 |     expect(Math.max(...geometry.tops) - Math.min(...geometry.tops)).toBeLessThan(1);
  148 |     expect(
  149 |       Math.min(Math.abs(geometry.y - point.y2), Math.abs(geometry.bottom - point.y2)),
  150 |     ).toBeLessThanOrEqual(18 * zoom);
  151 |     await page.screenshot({
  152 |       path: resolve(evidence, `selection-${width}-${zoom * 100}.png`),
  153 |       animations: 'disabled',
  154 |     });
  155 |     await page.keyboard.press('Escape');
  156 |     await expect(toolbar).toBeHidden();
  157 |   }
  158 |   await select(page, body, 'Amber lighthouse.');
  159 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  160 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  161 |   const source = await page.evaluate(async (sessionId) => {
  162 |     const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
  163 |     const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
  164 |     if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
  165 |     return r.data.messages.at(-1)!.attachments;
  166 |   }, sessionId);
  167 |   expect(source).toEqual(
  168 |     expect.arrayContaining([
  169 |       expect.objectContaining({
  170 |         kind: 'message',
```