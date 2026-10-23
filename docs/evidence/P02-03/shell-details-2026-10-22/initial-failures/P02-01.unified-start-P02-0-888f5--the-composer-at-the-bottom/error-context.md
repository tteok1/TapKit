# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.unified-start.spec.ts >> P02-01 unified start without accounts restores hidden suggestions and keeps the composer at the bottom
- Location: tests\e2e\P02-01.unified-start.spec.ts:83:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: '设置', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - button "展开侧栏" [ref=e7] [cursor=pointer]
    - generic [ref=e10]: TapKit
    - group [ref=e11]:
      - generic "连接状态" [ref=e12] [cursor=pointer]
    - button "详情面板" [ref=e14] [cursor=pointer]
  - main [ref=e18]:
    - region "新建任务" [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - heading "你的想法，从这里开始" [level=1] [ref=e23]
          - radiogroup "任务类型" [ref=e24]:
            - radio "聊天" [checked] [active] [ref=e26] [cursor=pointer]:
              - text: 聊天
              - generic [ref=e27]: 讨论问题、整理思路，聊天记录保存在本机。
            - radio "临时聊天" [ref=e29] [cursor=pointer]:
              - text: 临时聊天
              - generic [ref=e30]: 适合一次性讨论，离开后清除本次临时聊天记录。
            - radio "工作" [ref=e32] [cursor=pointer]:
              - text: 工作
              - generic [ref=e33]: 围绕具体目标整理工作草稿；任务执行、计划和审批尚未开放。
        - region "推荐问题" [ref=e34]:
          - generic [ref=e35]:
            - generic [ref=e36]: 为你推荐
            - button "隐藏推荐问题" [expanded] [ref=e37] [cursor=pointer]
          - generic [ref=e40]:
            - button "帮我把这段文字整理成清晰的要点" [ref=e41] [cursor=pointer]
            - button "用一个例子解释我想了解的概念" [ref=e45] [cursor=pointer]
            - button "帮我比较两个方案的优缺点" [ref=e49] [cursor=pointer]
      - generic [ref=e54]:
        - textbox "输入草稿" [ref=e55]:
          - /placeholder: 请先配置模型再使用...
        - generic [ref=e56]:
          - button "添加附件或引用资料" [ref=e59] [cursor=pointer]
          - button "输入与工具信息" [ref=e64] [cursor=pointer]
          - button "设置模型" [ref=e68] [cursor=pointer]
          - button "发送" [disabled] [ref=e71]
```

# Test source

```ts
  28  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  29  |   const page = await app.firstWindow();
  30  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  31  |   return page;
  32  | }
  33  | test.afterEach(async () => {
  34  |   await app?.close();
  35  | });
  36  | async function sessions(page: Page) {
  37  |   const result = await page.evaluate(async () => {
  38  |     const r = await window.tapkit.desktopCommand(
  39  |       { requestId: crypto.randomUUID().replace(/^(.{14})./, (_, prefix: string) => prefix + '7') },
  40  |       'desktop.workspace',
  41  |       {},
  42  |     );
  43  |     if (!r.ok || !('sessions' in r.data)) throw new Error('WORKSPACE_FAILED');
  44  |     return r.data;
  45  |   });
  46  |   return WorkspaceViewSchema.parse(result).sessions;
  47  | }
  48  | async function virtualAttachment(page: Page, name: string) {
  49  |   await page.getByLabel('输入草稿', { exact: true }).evaluate((el, name) => {
  50  |     const transfer = new DataTransfer();
  51  |     transfer.items.add(
  52  |       new File(['Synthetic shared draft attachment.'], name, { type: 'text/plain' }),
  53  |     );
  54  |     el.dispatchEvent(
  55  |       new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
  56  |     );
  57  |   }, name);
  58  |   await expect(page.locator('.pending-attachment')).toContainText(name);
  59  | }
  60  | async function geometry(page: Page, name: string) {
  61  |   const bounds = await page.evaluate(() => {
  62  |     const input = document.querySelector('.composer')!.getBoundingClientRect();
  63  |     const main = document.querySelector('main')!.getBoundingClientRect();
  64  |     const modes = document.querySelector('.start-modes')!.getBoundingClientRect();
  65  |     return {
  66  |       width: innerWidth,
  67  |       height: innerHeight,
  68  |       input: input.toJSON(),
  69  |       main: main.toJSON(),
  70  |       modes: modes.toJSON(),
  71  |       overflow: document.documentElement.scrollWidth > innerWidth,
  72  |     };
  73  |   });
  74  |   expect(bounds.overflow).toBe(false);
  75  |   expect(bounds.input.x).toBeGreaterThanOrEqual(bounds.main.x);
  76  |   expect(bounds.input.right).toBeLessThanOrEqual(bounds.main.right + 1);
  77  |   expect(bounds.input.bottom).toBeLessThanOrEqual(bounds.main.bottom + 1);
  78  |   expect(bounds.input.bottom).toBeGreaterThan(bounds.main.bottom - 36);
  79  |   expect(bounds.input.top).toBeGreaterThan(bounds.main.top);
  80  |   await page.screenshot({ path: resolve(evidence, name + '.png'), animations: 'disabled' });
  81  |   return { name, ...bounds };
  82  | }
  83  | test('P02-01 unified start without accounts restores hidden suggestions and keeps the composer at the bottom', async () => {
  84  |   test.setTimeout(240_000);
  85  |   let page = await launch();
  86  |   await expect(page.getByRole('heading', { name: '你的想法，从这里开始', exact: true })).toBeVisible();
  87  |   await expect(page.getByLabel('输入草稿', { exact: true })).toHaveAttribute(
  88  |     'placeholder',
  89  |     '请先配置模型再使用...',
  90  |   );
  91  |   await expect(page.getByRole('button', { name: '设置模型', exact: true })).toBeVisible();
  92  |   const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  93  |   await expect(sidebar.getByRole('button', { name: '新建任务', exact: true })).toBeVisible();
  94  |   for (const name of ['新建聊天', '临时聊天', '新建工作', '新建项目'])
  95  |     await expect(sidebar.getByRole('button', { name, exact: true })).toHaveCount(0);
  96  |   for (const text of ['本地空间 · 无需注册', '继续一段会话，或从新的目标开始。'])
  97  |     await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  98  |   await expect(page.locator('.start-links')).toHaveCount(0);
  99  |   await page.getByRole('button', { name: '隐藏推荐问题', exact: true }).click();
  100 |   await expect(page.getByRole('button', { name: '展示推荐问题', exact: true })).toBeVisible();
  101 |   await expect(page.locator('.start-questions')).toHaveCount(0);
  102 |   await page.getByRole('radio', { name: '工作', exact: true }).click();
  103 |   await page.getByRole('button', { name: '展示推荐问题', exact: true }).click();
  104 |   await expect(
  105 |     page.getByRole('button', { name: '一起拆解一个工作目标与验收标准', exact: true }),
  106 |   ).toBeVisible();
  107 |   await page.getByRole('button', { name: '隐藏推荐问题', exact: true }).click();
  108 |   const original = dir;
  109 |   await app.close();
  110 |   page = await launch(false, original);
  111 |   await expect(page.getByRole('button', { name: '展示推荐问题', exact: true })).toBeVisible();
  112 |   await page.getByRole('button', { name: '展示推荐问题', exact: true }).click();
  113 |   const samples = [];
  114 |   for (const [width, height, zoom, theme] of [
  115 |     [1440, 900, 1, 'light'],
  116 |     [960, 640, 1, 'light'],
  117 |     [1440, 900, 2, 'dark'],
  118 |     [960, 640, 2, 'dark'],
  119 |   ] as const) {
  120 |     await app.evaluate(
  121 |       ({ BrowserWindow }, size) => {
  122 |         const window = BrowserWindow.getAllWindows()[0]!;
  123 |         window.unmaximize();
  124 |         window.setContentSize(...size);
  125 |       },
  126 |       [width, height] as [number, number],
  127 |     );
> 128 |     await page.getByRole('link', { name: '设置', exact: true }).click();
      |                                                               ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  129 |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  130 |     await page.getByLabel('主题', { exact: true }).selectOption(theme);
  131 |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  132 |     await page.keyboard.press('Control+n');
  133 |     await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
  134 |     samples.push(await geometry(page, `home-${width}-${zoom}-${theme}`));
  135 |     await page.getByRole('radio', { name: '聊天', exact: true }).focus();
  136 |     await page.keyboard.press('ArrowRight');
  137 |     await expect(page.getByRole('radio', { name: '临时聊天', exact: true })).toBeChecked();
  138 |     await page.getByRole('radio', { name: '聊天', exact: true }).click();
  139 |   }
  140 |   await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  141 |   expect(await sessions(page)).toHaveLength(0);
  142 |   await page.getByRole('button', { name: '设置模型', exact: true }).click();
  143 |   await expect(page.getByRole('heading', { name: '模型连接', exact: true })).toBeVisible();
  144 | });
  145 | test('P02-01 unified start shares text and attachments, saves work drafts and clears temporary chats', async () => {
  146 |   test.setTimeout(180_000);
  147 |   const page = await launch(true);
  148 |   const input = page.getByLabel('输入草稿', { exact: true });
  149 |   await expect(input).toHaveAttribute('placeholder', '写下你的问题...');
  150 |   await input.fill('Shared draft retained in all three modes.');
  151 |   await virtualAttachment(page, 'shared-draft.txt');
  152 |   for (const name of ['工作', '临时聊天', '聊天', '工作']) {
  153 |     await page.getByRole('radio', { name, exact: true }).click();
  154 |     await expect(input).toHaveValue('Shared draft retained in all three modes.');
  155 |     await expect(page.locator('.pending-attachment')).toContainText('shared-draft.txt');
  156 |   }
  157 |   expect(await sessions(page)).toHaveLength(0);
  158 |   await page.getByRole('button', { name: '保存工作草稿', exact: true }).click();
  159 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  160 |   await expect(input).toBeEnabled();
  161 |   await expect(input).toHaveValue('Shared draft retained in all three modes.');
  162 |   const work = (await sessions(page)).find((s) => s.mode === 'work');
  163 |   expect(work).toBeTruthy();
  164 |   const stored = await page.evaluate(async (sessionId) => {
  165 |     const raw = crypto.randomUUID();
  166 |     const reply = await window.tapkit.chatCommand(
  167 |       { requestId: raw.slice(0, 14) + '7' + raw.slice(15) },
  168 |       'drafts.get',
  169 |       { sessionId, windowId: window.tapkit.windowSlot },
  170 |     );
  171 |     if (!reply.ok || !('text' in reply.data) || !('attachments' in reply.data))
  172 |       throw new Error('DRAFT_FAILED');
  173 |     return { text: reply.data.text, attachments: reply.data.attachments.length };
  174 |   }, work!.id);
  175 |   expect(stored).toEqual({ text: 'Shared draft retained in all three modes.', attachments: 1 });
  176 |   await expect(page.locator('.chat-message')).toHaveCount(0);
  177 |   await page.getByRole('button', { name: '新建任务', exact: true }).click();
  178 |   await page.getByRole('radio', { name: '临时聊天', exact: true }).click();
  179 |   await input.fill('Temporary start content 20261022.');
  180 |   await virtualAttachment(page, 'temporary-draft.txt');
  181 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  182 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  183 |   await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  184 |   await page.getByRole('button', { name: '关闭并清除临时聊天', exact: true }).click();
  185 |   await expect(page.getByRole('heading', { name: '你的想法，从这里开始', exact: true })).toBeVisible();
  186 |   expect(await sessions(page)).toHaveLength(1);
  187 |   const db = await readFile(resolve(dir, 'db/app.sqlite'));
  188 |   expect(db.includes(Buffer.from('Temporary start content 20261022.'))).toBe(false);
  189 |   expect(db.includes(Buffer.from('temporary-draft.txt'))).toBe(false);
  190 |   await page.getByRole('radio', { name: '聊天', exact: true }).click();
  191 |   await input.fill('Normal start content 20261022.');
  192 |   await page.getByRole('button', { name: '添加附件或引用资料', exact: true }).click();
  193 |   await page.getByRole('button', { name: '@ 引用资料', exact: true }).click();
  194 |   await page
  195 |     .getByRole('dialog', { name: '引用资料', exact: true })
  196 |     .getByRole('button', { name: /shared-draft.txt/ })
  197 |     .click();
  198 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  199 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  200 |   await expect(page.locator('.chat-message.user')).toContainText('Normal start content 20261022.');
  201 |   expect((await sessions(page)).map((s) => s.mode).sort()).toEqual(['chat', 'work']);
  202 |   await page.screenshot({ path: resolve(evidence, 'normal-chat.png') });
  203 | });
  204 | 
```