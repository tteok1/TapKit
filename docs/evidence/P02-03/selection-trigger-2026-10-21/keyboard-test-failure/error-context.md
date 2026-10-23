# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.selection-trigger.spec.ts >> P02-03 selection toolbar follows paragraph drag released in surrounding space
- Location: tests\e2e\P02-03.selection-trigger.spec.ts:11:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "The amber lighthouse guides a small boat safely home."
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
          - 'button "隔离测试回复： # P02批测1019 The amber 2026/10/21 22:44:57" [ref=e59] [cursor=pointer]':
            - text: "隔离测试回复： # P02批测1019 The amber"
            - generic [ref=e60]: 2026/10/21 22:44:57
          - 'button "置顶隔离测试回复： # P02批测1019 The amber" [ref=e61] [cursor=pointer]'
          - 'button "会话信息隔离测试回复： # P02批测1019 The amber" [ref=e64] [cursor=pointer]': ⋯
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
      - generic [ref=e87]: "隔离测试回复： # P02批测1019 The amber"
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
        - generic [ref=e111]:
          - article [ref=e112]:
            - generic [ref=e113]:
              - strong [ref=e114]: 你
              - generic [ref=e115]: 22:44:57 · 已发送
            - paragraph [ref=e116]: "# P02批测1019 The amber lighthouse guides a small boat safely home."
            - generic [ref=e118]:
              - button "复制回复" [ref=e119] [cursor=pointer]
              - button "引用选区追问" [ref=e122] [cursor=pointer]
              - generic [ref=e125]:
                - button "编辑问题并创建分支" [ref=e126] [cursor=pointer]
                - button "收藏" [ref=e129] [cursor=pointer]
                - button "更多消息操作" [ref=e133] [cursor=pointer]
          - article [ref=e135]:
            - generic [ref=e136]:
              - strong [ref=e137]: TapKit
              - generic [ref=e138]: fixture-model · 22:44:57 · 已发送
            - group [ref=e139]:
              - generic [ref=e140]:
                - paragraph [ref=e141]: 隔离测试回复：
                - heading "P02批测1019" [level=1] [ref=e142]
                - paragraph [ref=e143]: The amber lighthouse guides a small boat safely home.
            - generic [ref=e144]:
              - button "使用的记忆与历史参考" [ref=e147] [cursor=pointer]
              - generic [ref=e150]:
                - button "复制回复" [ref=e151] [cursor=pointer]
                - button "引用选区追问" [ref=e154] [cursor=pointer]
                - generic [ref=e157]:
                  - button "重新生成回答" [ref=e158] [cursor=pointer]
                  - button "点赞" [ref=e161] [cursor=pointer]
                  - button "点踩" [ref=e164] [cursor=pointer]
                  - button "收藏" [ref=e167] [cursor=pointer]
                  - button "更多消息操作" [ref=e171] [cursor=pointer]
        - status [ref=e173]: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
        - generic [ref=e174]:
          - textbox "输入草稿" [ref=e175]:
            - /placeholder: 写下你的问题…
          - generic [ref=e176]:
            - button "添加附件或引用资料" [ref=e178] [cursor=pointer]
            - button "输入与工具信息" [ref=e182] [cursor=pointer]
            - button "本轮模型" [ref=e187] [cursor=pointer]:
              - generic [ref=e188]: fixture-model
            - button "发送" [disabled] [ref=e191]
```

# Test source

```ts
  1   | import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
  2   | import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  3   | import { resolve } from 'node:path';
  4   | let app: ElectronApplication;
  5   | const evidence = resolve('docs/evidence/P02-03/selection-trigger-2026-10-21');
  6   | const sentence = 'The amber lighthouse guides a small boat safely home.';
  7   | test.afterEach(async () => {
  8   |   await app?.close();
  9   | });
  10  | 
  11  | test('P02-03 selection toolbar follows paragraph drag released in surrounding space', async () => {
  12  |   test.setTimeout(180_000);
  13  |   await mkdir('.test-data', { recursive: true });
  14  |   await mkdir(evidence, { recursive: true });
  15  |   const dir = await mkdtemp(resolve('.test-data/P02-03 selection trigger '));
  16  |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  17  |   const env = Object.fromEntries(
  18  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  19  |       (r): r is [string, string] => r[1] !== undefined,
  20  |     ),
  21  |   );
  22  |   delete env.ELECTRON_RUN_AS_NODE;
  23  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  24  |   const page = await app.firstWindow();
  25  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  26  |   await app.evaluate(({ BrowserWindow }) =>
  27  |     BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
  28  |   );
  29  |   await page.keyboard.press('Control+n');
  30  |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  31  |   const input = page.getByLabel('输入草稿', { exact: true });
  32  |   await input.fill('\n\n# P02批测1019\n\n' + sentence + '\n\n');
  33  |   await page.getByRole('button', { name: '发送', exact: true }).click();
  34  |   const paragraph = page
  35  |     .locator('.chat-message.assistant .chat-markdown p')
  36  |     .filter({ hasText: sentence });
  37  |   await expect(paragraph).toBeVisible();
  38  |   await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  39  |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  40  |   const keyboardSelect = async () => {
  41  |     await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  42  |     await paragraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  43  |     await page.evaluate(
  44  |       () =>
  45  |         new Promise<void>((done) =>
  46  |           requestAnimationFrame(() => requestAnimationFrame(() => done())),
  47  |         ),
  48  |     );
  49  |     const point = await paragraph.evaluate((el) => {
  50  |       const range = document.createRange();
  51  |       range.setStart(el.firstChild!, 0);
  52  |       range.setEnd(el.firstChild!, 1);
  53  |       const rect = range.getBoundingClientRect();
  54  |       return { x: rect.left + 0.5, y: rect.top + rect.height / 2 };
  55  |     });
  56  |     await page.mouse.click(point.x, point.y);
  57  |     await page.keyboard.press('Home');
  58  |     await page.keyboard.press('Shift+End');
  59  |     await expect
  60  |       .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
> 61  |       .toBe(sentence);
      |        ^ Error: expect(received).toBe(expected) // Object.is equality
  62  |     await expect(toolbar).toBeVisible();
  63  |   };
  64  |   const observations: unknown[] = [];
  65  |   for (const direction of ['forward', 'backward'] as const) {
  66  |     await page.evaluate(() => {
  67  |       (document.activeElement as HTMLElement)?.blur();
  68  |       window.getSelection()?.removeAllRanges();
  69  |     });
  70  |     await paragraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  71  |     await page.evaluate(
  72  |       () =>
  73  |         new Promise<void>((done) =>
  74  |           requestAnimationFrame(() => requestAnimationFrame(() => done())),
  75  |         ),
  76  |     );
  77  |     const points = await paragraph.evaluate((el) => {
  78  |       const text = el.firstChild!;
  79  |       const range = document.createRange();
  80  |       range.setStart(text, 0);
  81  |       range.setEnd(text, 1);
  82  |       const first = range.getBoundingClientRect();
  83  |       range.setStart(text, text.textContent!.length - 1);
  84  |       range.setEnd(text, text.textContent!.length);
  85  |       const last = range.getBoundingClientRect();
  86  |       const body = el.closest('.chat-markdown')!.getBoundingClientRect();
  87  |       return {
  88  |         start: { x: first.left + 0.5, y: first.top + first.height / 2 },
  89  |         end: { x: last.right - 0.5, y: last.top + last.height / 2 },
  90  |         left: body.left - 12,
  91  |         right: body.right + 12,
  92  |       };
  93  |     });
  94  |     const start = direction === 'forward' ? points.start : points.end;
  95  |     const end =
  96  |       direction === 'forward'
  97  |         ? { x: points.right, y: points.end.y }
  98  |         : { x: points.left, y: points.start.y };
  99  |     await page.mouse.move(start.x, start.y);
  100 |     await page.mouse.down();
  101 |     await page.mouse.move(end.x, end.y, { steps: 12 });
  102 |     await page.mouse.up();
  103 |     await expect
  104 |       .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
  105 |       .toBe(sentence);
  106 |     // Give deferred native selection/scroll events time to settle; the bubble must remain.
  107 |     await page.waitForTimeout(100);
  108 |     const visible = await toolbar.isVisible();
  109 |     const hit = await page.evaluate(
  110 |       ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement)?.className,
  111 |       end,
  112 |     );
  113 |     observations.push({ direction, visible, release: end, releaseElementClass: hit });
  114 |     await page.screenshot({ path: resolve(evidence, `margin-${direction}.png`) });
  115 |     await expect.soft(toolbar, JSON.stringify({ direction, hit })).toBeVisible({ timeout: 1500 });
  116 |     await page.keyboard.press('Escape');
  117 |   }
  118 |   await writeFile(
  119 |     resolve(evidence, 'observations.json'),
  120 |     JSON.stringify(observations, null, 2) + '\n',
  121 |   );
  122 |   const word = await paragraph.evaluate((el) => {
  123 |     const range = document.createRange();
  124 |     range.setStart(el.firstChild!, 4);
  125 |     range.setEnd(el.firstChild!, 9);
  126 |     const rect = range.getBoundingClientRect();
  127 |     return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  128 |   });
  129 |   await page.mouse.dblclick(word.x, word.y);
  130 |   await expect
  131 |     .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
  132 |     .toBe('amber');
  133 |   await expect(toolbar).toBeVisible();
  134 |   await page.keyboard.press('Escape');
  135 |   await expect(toolbar).toBeHidden();
  136 |   await keyboardSelect();
  137 |   await input.click();
  138 |   await input.fill('只在输入框中选择');
  139 |   await page.keyboard.press('Control+a');
  140 |   await expect(toolbar).toBeHidden();
  141 |   await keyboardSelect();
  142 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  143 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  144 |   await expect(
  145 |     page
  146 |       .locator('.chat-message.assistant')
  147 |       .last()
  148 |       .getByRole('button', { name: '所选原文（1）', exact: true }),
  149 |   ).toBeVisible();
  150 | });
  151 | 
```