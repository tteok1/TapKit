# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.inline-selection.spec.ts >> P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges
- Location: tests\e2e\P02-03.inline-selection.spec.ts:70:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.sidebar').locator('[data-session-id="01a16383-8d28-7baf-a317-391aa80d3aec"] .history-link')
    - locator resolved to <button class="history-link" data-tooltip="隔离测试回复： Amber lighthouse. ```j">聊</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - button "展开侧栏" [ref=e8] [cursor=pointer]
    - generic [ref=e11]: 设置
    - group [ref=e12]:
      - generic "连接状态" [ref=e13] [cursor=pointer]
    - button "详情面板" [ref=e15] [cursor=pointer]
  - main [ref=e19]:
    - generic [ref=e21]:
      - heading "通用" [level=1] [ref=e22]
      - paragraph [ref=e23]: 本地个人作用域 · 所有窗口共享；窗口布局独立保存
      - navigation "设置分类" [ref=e24]:
        - link "个人资料" [ref=e25] [cursor=pointer]:
          - /url: /settings/personal
        - link "通用" [ref=e26] [cursor=pointer]:
          - /url: /settings/general
        - link "个性化" [ref=e27] [cursor=pointer]:
          - /url: /settings/personalization
        - link "模型连接" [ref=e28] [cursor=pointer]:
          - /url: /settings/connections
        - link "模型与用量" [ref=e29] [cursor=pointer]:
          - /url: /settings/models
        - link "已归档的聊天" [ref=e30] [cursor=pointer]:
          - /url: /settings/archived
        - link "回收站" [ref=e33] [cursor=pointer]:
          - /url: /settings/trash
        - link "隐私政策" [ref=e36] [cursor=pointer]:
          - /url: /settings/privacy
        - link "用户协议" [ref=e37] [cursor=pointer]:
          - /url: /settings/agreement
      - generic [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]:
            - text: 主题
            - combobox "主题" [ref=e41]:
              - option "跟随系统"
              - option "浅色"
              - option "深色" [selected]
          - generic [ref=e42]:
            - text: 字体大小
            - combobox "字体大小" [ref=e43]:
              - option "小"
              - option "标准" [selected]
              - option "大"
          - generic [ref=e44]:
            - text: 缩放
            - combobox "缩放" [ref=e45]:
              - option "75%"
              - option "100%"
              - option "125%"
              - option "150%"
              - option "200%" [selected]
          - generic [ref=e46]:
            - text: 界面语言
            - combobox "界面语言" [disabled] [ref=e47]:
              - option "中文（其他语言规划中）" [selected]
          - generic [ref=e48]:
            - checkbox "回车发送（聊天发送开放后生效）" [checked] [ref=e49]
            - text: 回车发送（聊天发送开放后生效）
          - generic [ref=e50]:
            - checkbox "紧凑布局" [ref=e51]
            - text: 紧凑布局
          - generic [ref=e52]:
            - checkbox "显示首页示例" [checked] [ref=e53]
            - text: 显示首页示例
          - generic [ref=e54]:
            - checkbox "显示规划中入口" [ref=e55]
            - text: 显示规划中入口
          - generic [ref=e56]:
            - text: 默认目录
            - textbox "默认目录 选择目录 清空目录 只保存偏好，实际文件访问仍需授权。" [ref=e57]:
              - /placeholder: 尚未选择
            - button "选择目录" [ref=e58] [cursor=pointer]
            - button "清空目录" [ref=e59] [cursor=pointer]
            - generic [ref=e60]: 只保存偏好，实际文件访问仍需授权。
          - generic [ref=e61]:
            - text: 模型网络代理
            - combobox "模型网络代理" [ref=e62]:
              - option "自动（环境变量优先，随后系统代理）" [selected]
              - option "直连"
              - option "手动 HTTP / HTTPS 代理"
          - generic [ref=e63]: 自动模式使用环境变量或 Windows 系统代理；手动与直连模式覆盖自动设置。代理变更用于后续请求。
          - generic [ref=e64]: 模型域名需要解析到公网地址；代理的 Fake-IP 模式可能被连接安全检查拒绝。
          - generic [ref=e65]:
            - text: 代理地址
            - textbox "代理地址 不支持用户名、密码、查询参数；保存后用于后续请求。" [disabled] [ref=e66]:
              - /placeholder: http://127.0.0.1:7890
            - generic [ref=e67]: 不支持用户名、密码、查询参数；保存后用于后续请求。
        - generic [ref=e68]:
          - button "保存设置" [disabled] [ref=e69]
          - button "重新加载设置" [ref=e70] [cursor=pointer]
        - status [ref=e71]: 设置已保存
```

# Test source

```ts
  21  |     .filter({ hasText: text })
  22  |     .evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  23  |   await page.evaluate(
  24  |     () =>
  25  |       new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  26  |   );
  27  |   const points = await body.evaluate((el, text) => {
  28  |     window.getSelection()?.removeAllRanges();
  29  |     const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  30  |     for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  31  |       const start = node.textContent?.indexOf(text) ?? -1;
  32  |       if (start < 0) continue;
  33  |       const range = document.createRange();
  34  |       range.setStart(node, start);
  35  |       range.setEnd(node, start + 1);
  36  |       const first = range.getBoundingClientRect();
  37  |       range.setStart(node, start + text.length - 1);
  38  |       range.setEnd(node, start + text.length);
  39  |       const last = range.getBoundingClientRect();
  40  |       return {
  41  |         x1: first.left + 0.5,
  42  |         y1: first.top + first.height / 2,
  43  |         x2: last.right - 0.5,
  44  |         y2: last.top + last.height / 2,
  45  |       };
  46  |     }
  47  |     throw new Error('TEXT_NOT_FOUND');
  48  |   }, text);
  49  |   const hit = await body.evaluate(
  50  |     (el, p) => ({
  51  |       first: el.contains(document.elementFromPoint(p.x1, p.y1)),
  52  |       last: el.contains(document.elementFromPoint(p.x2, p.y2)),
  53  |       firstTag: document.elementFromPoint(p.x1, p.y1)?.outerHTML.slice(0, 150),
  54  |       lastTag: document.elementFromPoint(p.x2, p.y2)?.outerHTML.slice(0, 150),
  55  |     }),
  56  |     points,
  57  |   );
  58  |   expect(hit, JSON.stringify({ points, hit })).toMatchObject({ first: true, last: true });
  59  |   await page.mouse.move(points.x1, points.y1);
  60  |   await page.mouse.down();
  61  |   await page.mouse.move(points.x2, points.y2, { steps: 8 });
  62  |   await page.mouse.up();
  63  |   await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
  64  |   return points;
  65  | }
  66  | test.afterEach(async () => {
  67  |   await app?.close();
  68  | });
  69  | 
  70  | test('P02-03 inline copy icons and contextual selection actions preserve copied content and source ranges', async () => {
  71  |   test.setTimeout(240_000);
  72  |   await mkdir('.test-data', { recursive: true });
  73  |   await mkdir(evidence, { recursive: true });
  74  |   const dir = await mkdtemp(resolve('.test-data/Inline selection '));
  75  |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  76  |   const env = Object.fromEntries(
  77  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  78  |       (r): r is [string, string] => r[1] !== undefined,
  79  |     ),
  80  |   );
  81  |   delete env.ELECTRON_RUN_AS_NODE;
  82  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  83  |   const page = await app.firstWindow();
  84  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  85  |   await openSessionFixture(page);
  86  |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  87  |   const input = page.getByLabel('输入草稿', { exact: true });
  88  |   await expect(input).toBeEnabled();
  89  |   await input.fill(
  90  |     '\nAmber lighthouse.\n\n```js\nconst n = 1;\n```\n\n| A | B |\n|---|---|\n|中|2|',
  91  |   );
  92  |   await page.getByRole('button', { name: '发送', exact: true }).click();
  93  |   const body = page.locator('.chat-message.assistant .chat-markdown').first();
  94  |   await expect(body.locator('table')).toContainText('中');
  95  |   const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  96  |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  97  |   await expect(toolbar).toBeHidden();
  98  |   for (const [width, height, zoom] of [
  99  |     [1440, 900, 1],
  100 |     [960, 640, 1],
  101 |     [1440, 900, 2],
  102 |     [960, 640, 2],
  103 |   ] as const) {
  104 |     await app.evaluate(
  105 |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  106 |       [width, height] as [number, number],
  107 |     );
  108 |     if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
  109 |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  110 |     await page.getByRole('link', { name: '设置', exact: true }).click();
  111 |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  112 |     await page
  113 |       .getByLabel('主题', { exact: true })
  114 |       .selectOption(width === 1440 && zoom === 2 ? 'dark' : 'light');
  115 |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  116 |     if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
  117 |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  118 |     await page
  119 |       .locator('.sidebar')
  120 |       .locator('[data-session-id="' + sessionId + '"] .history-link')
> 121 |       .click();
      |        ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  122 |     await expect(body.locator('table')).toContainText('中');
  123 |     // Capture only this fixture's clipboard writes; do not replace the user's OS clipboard.
  124 |     await page.evaluate(() => {
  125 |       Object.defineProperty(navigator, 'clipboard', {
  126 |         configurable: true,
  127 |         value: {
  128 |           writeText: async (text: string) => {
  129 |             Reflect.set(window, 'copiedFixture', text);
  130 |           },
  131 |         },
  132 |       });
  133 |     });
  134 |     const code = body.locator('.chat-code').first();
  135 |     await code.scrollIntoViewIfNeeded();
  136 |     const copyCode = code.getByRole('button', { name: '复制代码', exact: true });
  137 |     await expect(copyCode).toHaveText('');
  138 |     await expect(copyCode).toHaveAttribute('data-tooltip', '复制代码');
  139 |     await copyCode.hover();
  140 |     await expect(page.getByRole('tooltip')).toHaveText('复制代码');
  141 |     await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
  142 |     await expect(copyCode).not.toHaveAttribute('title');
  143 |     await copyCode.click();
  144 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('const n = 1;');
  145 |     const table = body.locator('.chat-table');
  146 |     await table.scrollIntoViewIfNeeded();
  147 |     await input.focus();
  148 |     await page.mouse.move(1, 1);
  149 |     const copyTable = table.getByRole('button', { name: '复制表格', exact: true });
  150 |     await expect(copyTable).toHaveCSS('opacity', '0');
  151 |     await table.hover();
  152 |     await expect(copyTable).toHaveCSS('opacity', '1');
  153 |     await expect(copyTable).toHaveText('');
  154 |     const [tableBox, copyBox] = await Promise.all([table.boundingBox(), copyTable.boundingBox()]);
  155 |     expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
  156 |     expect(copyBox!.y - tableBox!.y).toBeLessThanOrEqual(5 * zoom);
  157 |     await copyTable.hover();
  158 |     await expect(page.getByRole('tooltip')).toHaveText('复制表格');
  159 |     await expect(page.getByRole('tooltip')).toHaveCSS('border-radius', '10px');
  160 |     await expect(copyTable).not.toHaveAttribute('title');
  161 |     await copyTable.click();
  162 |     expect(await page.evaluate(() => Reflect.get(window, 'copiedFixture'))).toBe('A\tB\n中\t2');
  163 |     await input.focus();
  164 |     await page.mouse.move(1, 1);
  165 |     await expect(table.locator('.chat-copy')).toHaveCSS('opacity', '0');
  166 |     const point = await select(page, body, 'Amber lighthouse.');
  167 |     await expect(toolbar).toBeVisible();
  168 |     for (const name of ['翻译', '解释', '扩写', '缩写', '改写'])
  169 |       await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  170 |     const geometry = await toolbar.evaluate((el) => {
  171 |       const r = el.getBoundingClientRect();
  172 |       return {
  173 |         x: r.x,
  174 |         y: r.y,
  175 |         right: r.right,
  176 |         bottom: r.bottom,
  177 |         tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  178 |       };
  179 |     });
  180 |     expect(geometry.x).toBeGreaterThanOrEqual(0);
  181 |     expect(geometry.y).toBeGreaterThanOrEqual(0);
  182 |     expect(geometry.right).toBeLessThanOrEqual(width + 1);
  183 |     expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
  184 |     expect(Math.max(...geometry.tops) - Math.min(...geometry.tops)).toBeLessThan(1);
  185 |     expect(
  186 |       Math.min(Math.abs(geometry.y - point.y2), Math.abs(geometry.bottom - point.y2)),
  187 |     ).toBeLessThanOrEqual(18 * zoom);
  188 |     await page.screenshot({
  189 |       path: resolve(evidence, `selection-${width}-${zoom * 100}.png`),
  190 |       animations: 'disabled',
  191 |     });
  192 |     await page.keyboard.press('Escape');
  193 |     await expect(toolbar).toBeHidden();
  194 |   }
  195 |   await select(page, body, 'Amber lighthouse.');
  196 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  197 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  198 |   const source = await page.evaluate(async (sessionId) => {
  199 |     const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
  200 |     const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
  201 |     if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
  202 |     return r.data.messages.at(-1)!.attachments;
  203 |   }, sessionId);
  204 |   expect(source).toEqual(
  205 |     expect.arrayContaining([
  206 |       expect.objectContaining({
  207 |         kind: 'message',
  208 |         range: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
  209 |       }),
  210 |     ]),
  211 |   );
  212 |   await expect(toolbar).toBeHidden();
  213 | });
  214 | 
```