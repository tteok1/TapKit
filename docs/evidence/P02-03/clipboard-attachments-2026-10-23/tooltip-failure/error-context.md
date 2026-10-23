# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.inline-selection.spec.ts >> P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges
- Location: tests\e2e\P02-03.inline-selection.spec.ts:78:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('tooltip')
Expected: "复制代码"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" getByRole('tooltip') with timeout 15000ms
  - waiting for getByRole('tooltip')

```

```yaml
- banner:
  - button "展开侧栏"
  - text: "隔离测试回复： Amber lighthouse. ```j"
  - group: 连接状态
  - button "详情面板"
- main:
  - button "会话摘要"
  - button "记忆与历史范围"
  - text: 消息分支 / 回答版本
  - combobox "消息分支 / 回答版本":
    - option "主分支 1" [selected]
  - button "AI 重命名"
  - button "导出 Markdown"
  - group: 当前资料、工具与个性化设置
  - article:
    - strong: 你
    - text: 17:03:17 · 已发送
    - paragraph: "Amber lighthouse. ```js const n = 1; ``` | A | B | |---|---| |中|2|"
    - button "复制回复"
    - button "引用选区追问"
    - button "编辑问题并创建分支"
    - button "收藏"
    - button "更多消息操作"
  - article:
    - strong: TapKit
    - text: fixture-model · 17:03:17 · 已发送
    - group:
      - paragraph: 隔离测试回复： Amber lighthouse.
      - text: js
      - button "复制代码"
      - code: const n = 1;
      - button "复制表格"
      - table:
        - rowgroup:
          - row "A B":
            - columnheader "A"
            - columnheader "B"
        - rowgroup:
          - row "中 2":
            - cell "中"
            - cell "2"
    - button "使用的记忆与历史参考"
    - button "复制回复"
    - button "引用选区追问"
    - button "重新生成回答"
    - button "点赞"
    - button "点踩"
    - button "收藏"
    - button "更多消息操作"
  - status: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
  - textbox "输入草稿":
    - /placeholder: 写下你的问题...
  - button "添加附件或引用资料"
  - button "输入与工具信息"
  - button "本轮模型": fixture-model
  - button "发送" [disabled]
```

# Test source

```ts
  38  |     for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  39  |       const start = node.textContent?.indexOf(text) ?? -1;
  40  |       if (start < 0) continue;
  41  |       const range = document.createRange();
  42  |       range.setStart(node, start);
  43  |       range.setEnd(node, start + 1);
  44  |       const first = range.getBoundingClientRect();
  45  |       range.setStart(node, start + text.length - 1);
  46  |       range.setEnd(node, start + text.length);
  47  |       const last = range.getBoundingClientRect();
  48  |       return {
  49  |         x1: first.left + 0.5,
  50  |         y1: first.top + first.height / 2,
  51  |         x2: last.right - 0.5,
  52  |         y2: last.top + last.height / 2,
  53  |       };
  54  |     }
  55  |     throw new Error('TEXT_NOT_FOUND');
  56  |   }, text);
  57  |   const hit = await body.evaluate(
  58  |     (el, p) => ({
  59  |       first: el.contains(document.elementFromPoint(p.x1, p.y1)),
  60  |       last: el.contains(document.elementFromPoint(p.x2, p.y2)),
  61  |       firstTag: document.elementFromPoint(p.x1, p.y1)?.outerHTML.slice(0, 150),
  62  |       lastTag: document.elementFromPoint(p.x2, p.y2)?.outerHTML.slice(0, 150),
  63  |     }),
  64  |     points,
  65  |   );
  66  |   expect(hit, JSON.stringify({ points, hit })).toMatchObject({ first: true, last: true });
  67  |   await page.mouse.move(points.x1, points.y1);
  68  |   await page.mouse.down();
  69  |   await page.mouse.move(points.x2, points.y2, { steps: 8 });
  70  |   await page.mouse.up();
  71  |   await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
  72  |   return points;
  73  | }
  74  | test.afterEach(async () => {
  75  |   await app?.close();
  76  | });
  77  | 
  78  | test('P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges', async () => {
  79  |   test.setTimeout(240_000);
  80  |   await mkdir('.test-data', { recursive: true });
  81  |   await mkdir(evidence, { recursive: true });
  82  |   const dir = await mkdtemp(resolve('.test-data/Inline selection '));
  83  |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  84  |   const env = Object.fromEntries(
  85  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  86  |       (r): r is [string, string] => r[1] !== undefined,
  87  |     ),
  88  |   );
  89  |   delete env.ELECTRON_RUN_AS_NODE;
  90  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  91  |   const page = await app.firstWindow();
  92  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  93  |   await openSessionFixture(page);
  94  |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  95  |   const input = page.getByLabel('输入草稿', { exact: true });
  96  |   await expect(input).toBeEnabled();
  97  |   await input.fill(
  98  |     '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  99  |   );
  100 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  101 |   const body = page.locator('.chat-message.assistant .chat-markdown').first();
  102 |   await expect(body.locator('table')).toContainText('中');
  103 |   const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  104 |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  105 |   await expect(toolbar).toBeHidden();
  106 |   for (const [width, height, zoom] of [
  107 |     [1440, 900, 1],
  108 |     [960, 640, 1],
  109 |     [1440, 900, 2],
  110 |     [960, 640, 2],
  111 |   ] as const) {
  112 |     await app.evaluate(
  113 |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  114 |       [width, height] as [number, number],
  115 |     );
  116 |     if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
  117 |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  118 |     await page.getByRole('link', { name: '设置', exact: true }).click();
  119 |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  120 |     await page
  121 |       .getByLabel('主题', { exact: true })
  122 |       .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
  123 |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  124 |     await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
  125 |     if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
  126 |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  127 |     await page
  128 |       .locator('.sidebar')
  129 |       .locator('[data-session-id="' + sessionId + '"] .history-link')
  130 |       .click();
  131 |     await expect(body.locator('table')).toContainText('中');
  132 |     const code = body.locator('.chat-code').first();
  133 |     await code.scrollIntoViewIfNeeded();
  134 |     const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
  135 |     await expect(copyCode).toHaveText('');
  136 |     await expect(copyCode).toHaveAttribute('data-tooltip', '复制代码');
  137 |     await copyCode.hover();
> 138 |     await expect(page.getByRole('tooltip')).toHaveText('复制代码');
      |                                             ^ Error: expect(locator).toHaveText(expected) failed
  139 |     await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
  140 |     await expect(copyCode).not.toHaveAttribute('title');
  141 |     await copyCode.click();
  142 |     expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('const n = 1;');
  143 |     const table = body.locator('.chat-table');
  144 |     await table.scrollIntoViewIfNeeded();
  145 |     await input.focus();
  146 |     await page.mouse.move(1, 1);
  147 |     const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
  148 |     await expect(copyTable).toHaveCSS('opacity', '0');
  149 |     await table.hover();
  150 |     await expect(copyTable).toHaveCSS('opacity', '1');
  151 |     await expect(copyTable).toHaveText('');
  152 |     const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
  153 |     expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
  154 |     expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
  155 |     await copyTable.hover();
  156 |     await expect(page.getByRole('tooltip')).toHaveText('复制表格');
  157 |     await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
  158 |     await expect(copyTable).not.toHaveAttribute('title');
  159 |     await copyTable.click();
  160 |     expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('A\tB\n中\t2');
  161 |     await input.focus();
  162 |     await page.mouse.move(1, 1);
  163 |     await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
  164 |     const point = await select(page, body, 'Amber lighthouse.');
  165 |     await expect(toolbar).toBeVisible();
  166 |     for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
  167 |       await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  168 |     const geometry = await toolbar.evaluate((el) => {
  169 |       const r = el.getBoundingClientRect();
  170 |       return {
  171 |         x: r.x,
  172 |         y: r.y,
  173 |         right: r.right,
  174 |         bottom: r.bottom,
  175 |         tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  176 |       };
  177 |     });
  178 |     expect(geometry.x).toBeGreaterThanOrEqual(0);
  179 |     expect(geometry.y).toBeGreaterThanOrEqual(0);
  180 |     expect(geometry.right).toBeLessThanOrEqual(width + 1);
  181 |     expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
  182 |     expect(Math.max(...geometry.tops) - Math.min(...geometry.tops)).toBeLessThan(1);
  183 |     expect(
  184 |       Math.min(Math.abs(geometry.y - point.y2), Math.abs(geometry.bottom - point.y2)),
  185 |     ).toBeLessThanOrEqual(18 * zoom);
  186 |     await page.screenshot({
  187 |       path: resolve(evidence, `selection-${width}-${zoom * 100}.png`),
  188 |       animations: 'disabled',
  189 |     });
  190 |     await page.keyboard.press('Escape');
  191 |     await expect(toolbar).toBeHidden();
  192 |   }
  193 |   await select(page, body, 'Amber lighthouse.');
  194 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  195 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  196 |   const source = await page.evaluate(async (sessionId) => {
  197 |     const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
  198 |     const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
  199 |     if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
  200 |     return r.data.messages.at(-1)!.attachments;
  201 |   }, sessionId);
  202 |   expect(source).toEqual(
  203 |     expect.arrayContaining([
  204 |       expect.objectContaining({
  205 |         kind: 'message',
  206 |         range: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
  207 |       }),
  208 |     ]),
  209 |   );
  210 |   await expect(toolbar).toBeHidden();
  211 | });
  212 | 
```