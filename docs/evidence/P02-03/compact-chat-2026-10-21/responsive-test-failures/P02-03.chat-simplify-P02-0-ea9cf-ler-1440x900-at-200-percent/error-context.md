# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 1440x900 at 200 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('complementary', { name: '侧栏', exact: true }).getByRole('button', { name: '置顶界面精简会话 0', exact: true })
Expected: "置顶聊天"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" getByRole('complementary', { name: '侧栏', exact: true }).getByRole('button', { name: '置顶界面精简会话 0', exact: true }) with timeout 15000ms
  - waiting for getByRole('complementary', { name: '侧栏', exact: true }).getByRole('button', { name: '置顶界面精简会话 0', exact: true })

```

```yaml
- complementary "侧栏":
  - link "TapKit 首页":
    - /url: /
  - button "展开侧栏"
  - button "临时聊天"
  - button "新建聊天"
  - button "新建工作"
  - button "新建项目"
  - navigation "主导航":
    - button "搜索"
    - link "聊天":
      - /url: /chats
    - link "工作":
      - /url: /work
    - link "项目":
      - /url: /projects
    - link "文件":
      - /url: /files
    - link "通知":
      - /url: /notifications
  - region "会话历史":
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
    - button "聊"
  - link "个人资料与设置":
    - /url: /settings/personal
  - link "设置":
    - /url: /settings/general
- banner:
  - button "后退"
  - button "前进"
  - link "首页":
    - /url: /
  - text: 界面精简会话 0
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
  - paragraph: 发送一个问题开始对话。
  - textbox "输入草稿":
    - /placeholder: 写下你的问题…
  - button "添加附件或引用资料"
  - button "输入与工具信息"
  - button "本轮模型": fixture-model
  - button "发送" [disabled]
```

# Test source

```ts
  15  | });
  16  | 
  17  | for (const [width, height, zoom] of [
  18  |   [1440, 900, 1],
  19  |   [960, 640, 1],
  20  |   [1440, 900, 2],
  21  |   [960, 640, 2],
  22  | ] as const) {
  23  |   test(`P02-03 T22 compact chat, fixed footer and continuous scroller ${width}x${height} at ${zoom * 100} percent`, async () => {
  24  |     test.setTimeout(180_000);
  25  |     await mkdir('.test-data', { recursive: true });
  26  |     await mkdir(evidence, { recursive: true });
  27  |     const dir = await mkdtemp(resolve('.test-data/P02-03 simplified chat '));
  28  |     await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  29  |     const env = Object.fromEntries(
  30  |       Object.entries({
  31  |         ...process.env,
  32  |         TAPKIT_DATA_DIR: dir,
  33  |         TAPKIT_CHAT_FIXTURE: 'P02-02',
  34  |       }).filter((r): r is [string, string] => r[1] !== undefined),
  35  |     );
  36  |     delete env.ELECTRON_RUN_AS_NODE;
  37  |     app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  38  |     app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  39  |     const page = await app.firstWindow();
  40  |     await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', {
  41  |       timeout: 125_000,
  42  |     });
  43  |     await app.evaluate(
  44  |       ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
  45  |       [width, height] as [number, number],
  46  |     );
  47  |     await page.getByRole('link', { name: '设置', exact: true }).click();
  48  |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  49  |     if (width === 1440 && zoom === 2)
  50  |       await page.getByLabel('主题', { exact: true }).selectOption('dark');
  51  |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  52  |     const title = '界面精简会话 0';
  53  |     const ids = await page.evaluate(
  54  |       async ({ requests, snippetId }) => {
  55  |         const ids: string[] = [];
  56  |         for (let i = 0; i < 40; i++) {
  57  |           const r = await window.tapkit.desktopCommand(
  58  |             { requestId: requests[i]! },
  59  |             'sessions.create',
  60  |             { mode: 'chat', title: '界面精简会话 ' + i },
  61  |           );
  62  |           if (!r.ok || !('entityId' in r.data)) throw new Error('CREATE_FAILED');
  63  |           ids.push(r.data.entityId);
  64  |         }
  65  |         const saved = await window.tapkit.chatCommand(
  66  |           { requestId: requests[40]! },
  67  |           'chat.snippets.set',
  68  |           { snippets: [{ id: snippetId, name: 'retained', text: '保留的常用提示词内容' }] },
  69  |         );
  70  |         if (!saved.ok) throw new Error(saved.error.code);
  71  |         window.dispatchEvent(new Event('tapkit:history-changed'));
  72  |         return ids;
  73  |       },
  74  |       { requests: Array.from({ length: 41 }, newId), snippetId: newId() },
  75  |     );
  76  |     const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  77  |     await sidebar.getByTitle(title, { exact: true }).click();
  78  |     await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', ids[0]!);
  79  |     await expect(page.locator('.workspace-title')).toHaveText(title);
  80  |     await expect(page.locator('.session-welcome')).toHaveCount(0);
  81  |     await expect(
  82  |       page.locator('main').getByRole('heading', { name: title, exact: true }),
  83  |     ).toHaveCount(0);
  84  |     await expect(
  85  |       page.getByText('聊天记录保存在本机；回复期间可继续输入、排队或停止。', { exact: true }),
  86  |     ).toHaveCount(0);
  87  |     const composer = page.locator('.composer');
  88  |     await expect(composer.locator('label[for="draft-input"]')).toHaveCount(0);
  89  |     await expect(composer.getByText('输入草稿', { exact: true })).toHaveCount(0);
  90  |     await expect(composer.getByText('模式', { exact: true })).toHaveCount(0);
  91  |     await expect(composer.getByText('输入操作', { exact: true })).toHaveCount(0);
  92  |     await expect(composer.getByText('常用提示词', { exact: true })).toHaveCount(0);
  93  |     await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toBeEnabled();
  94  |     const add = composer.getByRole('button', { name: '添加附件或引用资料', exact: true });
  95  |     await add.click();
  96  |     const additions = composer.getByRole('region', { name: '添加附件或引用资料', exact: true });
  97  |     await expect(additions.getByRole('button', { name: '添加附件', exact: true })).toBeEnabled();
  98  |     await expect(additions.getByRole('button', { name: '@ 引用资料', exact: true })).toBeEnabled();
  99  |     const popoverBounds = await additions.boundingBox();
  100 |     expect(popoverBounds!.x).toBeGreaterThanOrEqual(0);
  101 |     expect(popoverBounds!.y).toBeGreaterThanOrEqual(0);
  102 |     expect(popoverBounds!.x + popoverBounds!.width).toBeLessThanOrEqual(width + 1);
  103 |     expect(popoverBounds!.y + popoverBounds!.height).toBeLessThanOrEqual(height + 1);
  104 |     await page.keyboard.press('Escape');
  105 |     await expect(additions).toBeHidden();
  106 |     await composer.getByRole('button', { name: '本轮模型', exact: true }).click();
  107 |     await composer
  108 |       .getByRole('region', { name: '本轮模型', exact: true })
  109 |       .getByRole('button', { name: /fixture-model/ })
  110 |       .click();
  111 |     await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toContainText(
  112 |       'fixture-model',
  113 |     );
  114 |     const pin = sidebar.getByRole('button', { name: '置顶' + title, exact: true });
> 115 |     await expect(pin).toHaveAttribute('title', '置顶聊天');
      |                       ^ Error: expect(locator).toHaveAttribute(expected) failed
  116 |     await pin.click();
  117 |     await expect(
  118 |       sidebar.getByRole('button', { name: '取消置顶' + title, exact: true }),
  119 |     ).toHaveAttribute('aria-pressed', 'true');
  120 |     const footer = sidebar.locator('.sidebar-footer');
  121 |     await expect(footer).toHaveText('');
  122 |     const footerBefore = await footer.boundingBox();
  123 |     const scroller = sidebar.locator('.sidebar-scroll');
  124 | 
  125 |     await scroller.evaluate((el) => {
  126 |       el.scrollTop = 0;
  127 |     });
  128 |     const brandTop = await sidebar
  129 |       .locator('.sidebar-brand')
  130 |       .evaluate((el) => el.getBoundingClientRect().top);
  131 |     const bounds = (await sidebar.boundingBox())!;
  132 |     await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  133 |     await page.mouse.wheel(0, 500);
  134 |     await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  135 |     expect(
  136 |       await sidebar.locator('.sidebar-brand').evaluate((el) => el.getBoundingClientRect().top),
  137 |     ).toBeLessThan(brandTop);
  138 |     const metrics = await scroller.evaluate((el) => ({
  139 |       scrollTop: el.scrollTop,
  140 |       clientHeight: el.clientHeight,
  141 |       scrollHeight: el.scrollHeight,
  142 |       nestedScrollers: [...el.querySelectorAll('*')]
  143 |         .filter(
  144 |           (child) =>
  145 |             ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) &&
  146 |             child.scrollHeight > child.clientHeight + 1,
  147 |         )
  148 |         .map((child) => child.className),
  149 |       historyScrollTop: el.querySelector('.history')!.scrollTop,
  150 |       savedScroll: JSON.parse(localStorage.getItem('tapkit.layout.' + window.tapkit.windowSlot)!)
  151 |         .sidebarScroll,
  152 |     }));
  153 |     expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  154 |     expect(metrics.nestedScrollers).toEqual([]);
  155 |     expect(metrics.historyScrollTop).toBe(0);
  156 |     expect(metrics.savedScroll).toBeGreaterThan(0);
  157 |     expect(await footer.boundingBox()).toEqual(footerBefore);
  158 |     await expect(footer.getByRole('link', { name: '个人资料与设置', exact: true })).toBeInViewport({
  159 |       ratio: 0.99,
  160 |     });
  161 |     await expect(sidebar.getByRole('link', { name: '设置', exact: true })).toBeInViewport({
  162 |       ratio: 0.99,
  163 |     });
  164 |     await scroller.evaluate((el) => {
  165 |       el.scrollTop = 0;
  166 |     });
  167 |     await writeFile(
  168 |       resolve(evidence, `sidebar-${width}x${height}-${zoom * 100}.json`),
  169 |       JSON.stringify(metrics, null, 2) + '\n',
  170 |     );
  171 | 
  172 |     const input = page.getByRole('textbox', { name: '输入草稿', exact: true });
  173 |     const initial = await input.evaluate((el) => el.clientHeight);
  174 |     await input.fill(Array.from({ length: 6 }, () => '输入框随内容增高').join('\n'));
  175 |     expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(initial);
  176 |     await input.fill(Array.from({ length: 80 }, () => '达到高度上限后滚动').join('\n'));
  177 |     const capped = await input.evaluate((el) => ({
  178 |       height: el.clientHeight,
  179 |       max: parseFloat(getComputedStyle(el).maxHeight),
  180 |       scroll: el.scrollHeight,
  181 |     }));
  182 |     expect(capped.height).toBeLessThanOrEqual(capped.max + 1);
  183 |     expect(capped.scroll).toBeGreaterThan(capped.height);
  184 |     await input.fill('/retained');
  185 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  186 |     await expect(input).toHaveValue('保留的常用提示词内容');
  187 |     await input.fill('界面精简后的发送回归');
  188 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  189 |     await expect(page.locator('.chat-message.assistant')).toContainText(
  190 |       '隔离测试回复：界面精简后的发送回归',
  191 |     );
  192 |     await expect(page.locator('.chat-message.user')).toHaveCount(1);
  193 |     const answer = page.locator('.chat-message.assistant').last();
  194 |     await expect(answer.getByRole('button', { name: '复制回复', exact: true })).toHaveAttribute(
  195 |       'title',
  196 |       '复制回复',
  197 |     );
  198 |     await answer.getByRole('button', { name: '收藏', exact: true }).click();
  199 |     await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
  200 |       'aria-pressed',
  201 |       'true',
  202 |     );
  203 |     await answer.getByRole('button', { name: '点赞', exact: true }).click();
  204 |     await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
  205 |       'aria-pressed',
  206 |       'true',
  207 |     );
  208 |     await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
  209 |     const more = answer.getByRole('region', { name: '更多消息操作', exact: true });
  210 |     await expect(more.getByRole('button', { name: '删除消息', exact: true })).toBeVisible();
  211 |     const moreBounds = await more.boundingBox();
  212 |     expect(moreBounds!.x).toBeGreaterThanOrEqual(0);
  213 |     expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  214 |     expect(moreBounds!.x + moreBounds!.width).toBeLessThanOrEqual(width + 1);
  215 |     expect(moreBounds!.y + moreBounds!.height).toBeLessThanOrEqual(height + 1);
```