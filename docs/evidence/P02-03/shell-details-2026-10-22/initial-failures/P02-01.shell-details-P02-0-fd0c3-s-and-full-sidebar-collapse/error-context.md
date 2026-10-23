# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.shell-details.spec.ts >> P02-01 shell details home alignment, rounded controls, icon hints and full sidebar collapse
- Location: tests\e2e\P02-01.shell-details.spec.ts:81:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    8
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - button "展开侧栏" [active] [ref=e7] [cursor=pointer]
    - generic [ref=e10]: TapKit
    - group [ref=e11]:
      - generic "连接状态" [ref=e12] [cursor=pointer]
    - button "详情面板" [ref=e14] [cursor=pointer]:
      - generic [ref=e17]: 工作台
  - main [ref=e19]:
    - region "新建任务" [ref=e21]:
      - generic [ref=e22]:
        - generic [ref=e23]:
          - heading "你的想法，从这里开始" [level=1] [ref=e24]
          - radiogroup "任务类型" [ref=e25]:
            - radio "聊天" [checked] [ref=e27] [cursor=pointer]:
              - text: 聊天
              - generic [ref=e28]: 讨论问题、整理思路，聊天记录保存在本机。
            - radio "临时聊天" [ref=e30] [cursor=pointer]:
              - text: 临时聊天
              - generic [ref=e31]: 适合一次性讨论，离开后清除本次临时聊天记录。
            - radio "工作" [ref=e33] [cursor=pointer]:
              - text: 工作
              - generic [ref=e34]: 围绕具体目标整理工作草稿；任务执行、计划和审批尚未开放。
        - region "推荐问题" [ref=e35]:
          - generic [ref=e36]:
            - generic [ref=e37]: 为你推荐
            - button "隐藏推荐问题" [expanded] [ref=e38] [cursor=pointer]
          - generic [ref=e41]:
            - button "帮我把这段文字整理成清晰的要点" [ref=e42] [cursor=pointer]
            - button "用一个例子解释我想了解的概念" [ref=e46] [cursor=pointer]
            - button "帮我比较两个方案的优缺点" [ref=e50] [cursor=pointer]
      - generic [ref=e55]:
        - textbox "输入草稿" [ref=e56]:
          - /placeholder: 请先配置模型再使用...
        - generic [ref=e57]:
          - button "添加附件或引用资料" [ref=e60] [cursor=pointer]
          - button "输入与工具信息" [ref=e65] [cursor=pointer]
          - button "设置模型" [ref=e69] [cursor=pointer]
          - button "发送" [disabled] [ref=e72]
```

# Test source

```ts
  46  |       window.dispatchEvent(new Event('tapkit:history-changed'));
  47  |       return r.data;
  48  |     },
  49  |     { command, payload, desktop, requestId: requestId() },
  50  |   );
  51  | }
  52  | async function create(page: Page, title: string, mode: 'chat' | 'work' = 'chat') {
  53  |   return ((await command(page, 'sessions.create', { title, mode }, true)) as { entityId: string })
  54  |     .entityId;
  55  | }
  56  | async function setSize(width: number, height: number) {
  57  |   await app.evaluate(
  58  |     ({ BrowserWindow }, dimensions) => {
  59  |       const w = BrowserWindow.getAllWindows()[0]!;
  60  |       w.unmaximize();
  61  |       w.setContentSize(...dimensions);
  62  |     },
  63  |     [width, height] as [number, number],
  64  |   );
  65  | }
  66  | async function showSidebar(page: Page) {
  67  |   const expand = page.getByRole('button', { name: '展开侧栏', exact: true });
  68  |   if (await expand.count()) await expand.click();
  69  | }
  70  | async function sort(page: Page, label: '最近更新' | '手动排序') {
  71  |   const sidebar = page.locator('.sidebar');
  72  |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  73  |   const menu = page.getByRole('region', { name: '会话列表选项', exact: true });
  74  |   await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  75  |   await menu.getByRole('button', { name: label, exact: true }).click();
  76  | }
  77  | test.afterEach(async () => {
  78  |   await app?.close();
  79  | });
  80  | 
  81  | test('P02-01 shell details home alignment, rounded controls, icon hints and full sidebar collapse', async () => {
  82  |   test.setTimeout(240_000);
  83  |   const page = await launch();
  84  |   const errors: string[] = [];
  85  |   page.on('pageerror', (e) => errors.push(e.message));
  86  |   await setSize(1440, 900);
  87  |   await expect(
  88  |     page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  89  |   ).toBeVisible();
  90  |   for (const label of ['首页', 'TapKit 首页'])
  91  |     await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  92  |   for (const label of ['后退', '前进'])
  93  |     await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  94  |   const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  95  |   await expect(sidebar.locator('nav').getByText('搜索', { exact: true })).toHaveCount(0);
  96  |   await expect(sidebar.locator('nav').getByText('通知', { exact: true })).toHaveCount(0);
  97  |   for (const label of ['最近', '归档', '回收站', '全部', '默认列表'])
  98  |     await expect(sidebar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  99  |   const bell = sidebar.getByRole('button', { name: '通知', exact: true }),
  100 |     search = sidebar.getByRole('button', { name: '搜索', exact: true });
  101 |   expect((await bell.boundingBox())!.x).toBeLessThan((await search.boundingBox())!.x);
  102 |   await search.hover();
  103 |   await expect(page.getByRole('tooltip', { name: '搜索（Ctrl+K）', exact: true })).toBeVisible();
  104 |   await search.click();
  105 |   await expect(page.getByRole('dialog', { name: '搜索', exact: true })).toBeVisible();
  106 |   await page.keyboard.press('Escape');
  107 |   await bell.click();
  108 |   await expect(page.locator('main')).toContainText('通知');
  109 |   await page.keyboard.press('Control+n');
  110 |   const samples = [];
  111 |   for (const [width, height, zoom, theme] of [
  112 |     [1440, 900, 1, 'light'],
  113 |     [960, 640, 1, 'light'],
  114 |     [1440, 900, 2, 'dark'],
  115 |     [960, 640, 2, 'dark'],
  116 |   ] as const) {
  117 |     await setSize(width, height);
  118 |     await showSidebar(page);
  119 |     await sidebar.getByRole('link', { name: '设置', exact: true }).click();
  120 |     await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
  121 |     await page.getByLabel('主题', { exact: true }).selectOption(theme);
  122 |     await page.getByRole('button', { name: '保存设置', exact: true }).click();
  123 |     await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
  124 |     // Narrow layouts expose the sidebar as a drawer; close it before checking the workspace.
  125 |     const close = page.getByRole('button', { name: '收起侧栏', exact: true });
  126 |     if (await close.count()) await close.click();
  127 |     await page.keyboard.press('Control+n');
  128 |     await expect(sidebar).toBeHidden();
  129 |     const bounds = await page.evaluate(() => {
  130 |       const b = (selector: string) =>
  131 |         document.querySelector(selector)!.getBoundingClientRect().toJSON();
  132 |       const questions = [...document.querySelectorAll('.start-questions button')];
  133 |       return {
  134 |         input: b('.composer'),
  135 |         questions: b('.start-questions'),
  136 |         last: questions.at(-1)!.getBoundingClientRect().toJSON(),
  137 |         toggle: b('.suggestions-toggle'),
  138 |         workspace: b('.workspace'),
  139 |         shell: b('.desktop-shell'),
  140 |         scroll: b('.start-page-scroll'),
  141 |         radius: getComputedStyle(questions[0]!).borderRadius,
  142 |         overflow: document.documentElement.scrollWidth > innerWidth,
  143 |       };
  144 |     });
  145 |     expect(bounds.overflow).toBe(false);
> 146 |     expect(Math.abs(bounds.workspace.x - bounds.shell.x)).toBeLessThanOrEqual(2);
      |                                                           ^ Error: expect(received).toBeLessThanOrEqual(expected)
  147 |     expect(Math.abs(bounds.workspace.width - bounds.shell.width)).toBeLessThanOrEqual(2);
  148 |     expect(Math.abs(bounds.questions.x - bounds.input.x)).toBeLessThanOrEqual(2);
  149 |     expect(Math.abs(bounds.toggle.right - bounds.input.right)).toBeLessThanOrEqual(2);
  150 |     expect(parseFloat(bounds.radius)).toBeGreaterThanOrEqual(100);
  151 |     if (zoom === 1) {
  152 |       expect(bounds.input.top - bounds.last.bottom).toBeGreaterThanOrEqual(8);
  153 |       expect(bounds.input.top - bounds.last.bottom).toBeLessThanOrEqual(24);
  154 |     }
  155 |     await page.screenshot({
  156 |       path: resolve(evidence, `home-${width}-${zoom}-${theme}.png`),
  157 |       animations: 'disabled',
  158 |     });
  159 |     await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  160 |     await expect(sidebar).toBeVisible();
  161 |     await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  162 |     await expect(sidebar).toBeHidden();
  163 |     samples.push({ width, height, zoom, theme, ...bounds });
  164 |   }
  165 |   await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  166 |   expect(errors).toEqual([]);
  167 | });
  168 | 
  169 | test('P02-01 shell details manual drag sorting persists per group and launch returns home', async () => {
  170 |   test.setTimeout(240_000);
  171 |   let page = await launch();
  172 |   await setSize(1440, 900);
  173 |   const a = await create(page, '排序会话甲'),
  174 |     b = await create(page, '排序会话乙'),
  175 |     c = await create(page, '另一组会话');
  176 |   const group = (
  177 |     (await command(page, 'sidebar.create', { name: '独立分组' })) as { entityId: string }
  178 |   ).entityId;
  179 |   const other = (
  180 |     (await command(page, 'sidebar.create', { name: '另一分组' })) as { entityId: string }
  181 |   ).entityId;
  182 |   await command(page, 'sessions.move', { sessionIds: [a, b], sectionId: group });
  183 |   await command(page, 'sessions.move', { sessionIds: [c], sectionId: other });
  184 |   const sidebar = page.locator('.sidebar');
  185 |   await expect(sidebar.locator('.history-row')).toHaveCount(3);
  186 |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  187 |   await page
  188 |     .getByRole('region', { name: '会话列表选项', exact: true })
  189 |     .getByRole('button', { name: '会话排列顺序', exact: true })
  190 |     .click();
  191 |   await expect(
  192 |     page
  193 |       .getByRole('region', { name: '会话列表选项', exact: true })
  194 |       .getByRole('button', { name: '最近更新', exact: true }),
  195 |   ).toHaveAttribute('aria-pressed', 'true');
  196 |   await page.keyboard.press('Escape');
  197 |   await sort(page, '手动排序');
  198 |   await sidebar.getByRole('button', { name: /^独立分组 [(]2[)]/ }).click();
  199 |   await expect(sidebar.locator('.history-row')).toHaveCount(2);
  200 |   const before = await sidebar
  201 |     .locator('.history-row')
  202 |     .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id')!));
  203 |   await sidebar
  204 |     .locator(`[data-session-id="${before[1]}"]`)
  205 |     .dragTo(sidebar.locator(`[data-session-id="${before[0]}"]`));
  206 |   await expect
  207 |     .poll(() =>
  208 |       sidebar
  209 |         .locator('.history-row')
  210 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  211 |     )
  212 |     .toEqual([...before].reverse());
  213 |   const after = [...before].reverse();
  214 |   expect(
  215 |     (
  216 |       (await command(page, 'sessions.list', { sectionId: other, sort: 'manual' })) as SessionPage
  217 |     ).sessions.map((s) => s.id),
  218 |   ).toEqual([c]);
  219 |   const row = sidebar.locator(`[data-session-id="${after[0]}"]`);
  220 |   await page.mouse.move(1300, 100);
  221 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '0');
  222 |   await row.hover();
  223 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  224 |   await row.getByRole('button', { name: /^置顶/ }).focus();
  225 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  226 |   await row.getByRole('button', { name: /^置顶/ }).click();
  227 |   await row.getByRole('button', { name: /^取消置顶/ }).click();
  228 |   await row.getByTitle(after[0] === a ? '排序会话甲' : '排序会话乙', { exact: true }).click();
  229 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', after[0]!);
  230 |   await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  231 |   const saved = profile;
  232 |   await app.close();
  233 |   page = await launch(saved);
  234 |   await expect(
  235 |     page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  236 |   ).toBeVisible();
  237 |   await expect(page.getByRole('complementary', { name: '侧栏', exact: true })).toBeHidden();
  238 |   await showSidebar(page);
  239 |   await page
  240 |     .locator('.sidebar')
  241 |     .getByRole('button', { name: /^独立分组 [(]2[)]/ })
  242 |     .click();
  243 |   await expect
  244 |     .poll(() =>
  245 |       page
  246 |         .locator('.sidebar .history-row')
```