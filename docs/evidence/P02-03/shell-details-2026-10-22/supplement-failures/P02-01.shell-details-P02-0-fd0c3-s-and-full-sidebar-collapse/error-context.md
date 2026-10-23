# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.shell-details.spec.ts >> P02-01 shell details home alignment, rounded controls, icon hints and full sidebar collapse
- Location: tests\e2e\P02-01.shell-details.spec.ts:81:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '收起侧栏', exact: true })
    - locator resolved to <button type="button" aria-label="收起侧栏" class="icon-button " aria-expanded="true">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - strong [ref=e8]: TapKit
        - generic [ref=e9]:
          - button "通知" [ref=e11] [cursor=pointer]
          - button "搜索" [ref=e15] [cursor=pointer]
      - button "新建任务" [ref=e19] [cursor=pointer]
      - navigation "主导航" [ref=e22]:
        - link "聊天" [ref=e23] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e26] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e29] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e32] [cursor=pointer]:
          - /url: /files
        - group [ref=e35]:
          - generic "调整导航入口" [ref=e36] [cursor=pointer]
      - region "会话历史" [ref=e38]:
        - generic [ref=e39]:
          - heading "最近" [level=2] [ref=e40]
          - button "会话列表选项" [ref=e43] [cursor=pointer]
        - paragraph [ref=e45]: 暂无会话
      - generic [ref=e46]:
        - generic [ref=e47]: 任务执行尚未开放
        - generic [ref=e48]: 待确认事项：0
    - generic [ref=e49]:
      - link "个人资料与设置" [ref=e50] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e55] [cursor=pointer]:
        - /url: /settings/general
  - generic [ref=e58]:
    - banner [ref=e59]:
      - button "收起侧栏" [expanded] [active] [ref=e61] [cursor=pointer]
      - generic [ref=e64]: TapKit
      - group [ref=e65]:
        - generic "连接状态" [ref=e66] [cursor=pointer]
      - button "详情面板" [ref=e68] [cursor=pointer]
    - main [ref=e72]:
      - region "新建任务" [ref=e74]:
        - generic [ref=e75]:
          - generic [ref=e76]:
            - heading "你的想法，从这里开始" [level=1] [ref=e77]
            - radiogroup "任务类型" [ref=e78]:
              - radio "聊天" [checked] [ref=e80] [cursor=pointer]:
                - text: 聊天
                - generic [ref=e81]: 讨论问题、整理思路，聊天记录保存在本机。
              - radio "临时聊天" [ref=e83] [cursor=pointer]:
                - text: 临时聊天
                - generic [ref=e84]: 适合一次性讨论，离开后清除本次临时聊天记录。
              - radio "工作" [ref=e86] [cursor=pointer]:
                - text: 工作
                - generic [ref=e87]: 围绕具体目标整理工作草稿；任务执行、计划和审批尚未开放。
          - region "推荐问题" [ref=e88]:
            - generic [ref=e89]:
              - generic [ref=e90]: 为你推荐
              - button "隐藏推荐问题" [expanded] [ref=e91] [cursor=pointer]
            - generic [ref=e94]:
              - button "帮我把这段文字整理成清晰的要点" [ref=e95] [cursor=pointer]
              - button "用一个例子解释我想了解的概念" [ref=e99] [cursor=pointer]
              - button "帮我比较两个方案的优缺点" [ref=e103] [cursor=pointer]
        - generic [ref=e108]:
          - textbox "输入草稿" [ref=e109]:
            - /placeholder: 请先配置模型再使用...
          - generic [ref=e110]:
            - button "添加附件或引用资料" [ref=e113] [cursor=pointer]
            - button "输入与工具信息" [ref=e118] [cursor=pointer]
            - button "设置模型" [ref=e122] [cursor=pointer]
            - button "发送" [disabled] [ref=e125]
```

# Test source

```ts
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
  140 |         padding:
  141 |           parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).paddingLeft) *
  142 |           parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).zoom),
  143 |         scroll: b('.start-page-scroll'),
  144 |         radius: getComputedStyle(questions[0]!).borderRadius,
  145 |         overflow: document.documentElement.scrollWidth > innerWidth,
  146 |       };
  147 |     });
  148 |     expect(bounds.overflow).toBe(false);
  149 |     expect(Math.abs(bounds.workspace.x - bounds.shell.x - bounds.padding)).toBeLessThanOrEqual(2);
  150 |     expect(
  151 |       Math.abs(bounds.workspace.width - bounds.shell.width + bounds.padding * 2),
  152 |     ).toBeLessThanOrEqual(2);
  153 |     expect(Math.abs(bounds.questions.x - bounds.input.x)).toBeLessThanOrEqual(2);
  154 |     expect(Math.abs(bounds.toggle.right - bounds.input.right)).toBeLessThanOrEqual(2);
  155 |     expect(parseFloat(bounds.radius)).toBeGreaterThanOrEqual(100);
  156 |     if (zoom === 1) {
  157 |       expect(bounds.input.top - bounds.last.bottom).toBeGreaterThanOrEqual(8);
  158 |       expect(bounds.input.top - bounds.last.bottom).toBeLessThanOrEqual(24);
  159 |     }
  160 |     await page.screenshot({
  161 |       path: resolve(evidence, `home-final-${width}-${zoom}-${theme}.png`),
  162 |       animations: 'disabled',
  163 |     });
  164 |     await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  165 |     await expect(sidebar).toBeVisible();
> 166 |     await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
      |                                                                   ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  167 |     await expect(sidebar).toBeHidden();
  168 |     samples.push({ width, height, zoom, theme, ...bounds });
  169 |   }
  170 |   await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  171 |   expect(errors).toEqual([]);
  172 | });
  173 | 
  174 | test('P02-01 shell details manual drag sorting persists per group and launch returns home', async () => {
  175 |   test.setTimeout(240_000);
  176 |   let page = await launch();
  177 |   await setSize(1440, 900);
  178 |   const a = await create(page, '排序会话甲'),
  179 |     b = await create(page, '排序会话乙'),
  180 |     c = await create(page, '另一组会话');
  181 |   const group = (
  182 |     (await command(page, 'sidebar.create', { name: '独立分组' })) as { entityId: string }
  183 |   ).entityId;
  184 |   const other = (
  185 |     (await command(page, 'sidebar.create', { name: '另一分组' })) as { entityId: string }
  186 |   ).entityId;
  187 |   await command(page, 'sessions.move', { sessionIds: [a, b], sectionId: group });
  188 |   await command(page, 'sessions.move', { sessionIds: [c], sectionId: other });
  189 |   const sidebar = page.locator('.sidebar');
  190 |   await expect(sidebar.locator('.history-row')).toHaveCount(3);
  191 |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  192 |   await page
  193 |     .getByRole('region', { name: '会话列表选项', exact: true })
  194 |     .getByRole('button', { name: '会话排列顺序', exact: true })
  195 |     .click();
  196 |   await expect(
  197 |     page
  198 |       .getByRole('region', { name: '会话列表选项', exact: true })
  199 |       .getByRole('button', { name: '最近更新', exact: true }),
  200 |   ).toHaveAttribute('aria-pressed', 'true');
  201 |   await page.keyboard.press('Escape');
  202 |   await sort(page, '手动排序');
  203 |   await sidebar.getByRole('button', { name: /^独立分组 [(]2[)]/ }).click();
  204 |   await expect(sidebar.locator('.history-row')).toHaveCount(2);
  205 |   const before = await sidebar
  206 |     .locator('.history-row')
  207 |     .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id')!));
  208 |   await sidebar
  209 |     .locator(`[data-session-id="${before[1]}"]`)
  210 |     .dragTo(sidebar.locator(`[data-session-id="${before[0]}"]`));
  211 |   await expect
  212 |     .poll(() =>
  213 |       sidebar
  214 |         .locator('.history-row')
  215 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  216 |     )
  217 |     .toEqual([...before].reverse());
  218 |   const after = [...before].reverse();
  219 |   await sidebar.locator(`[data-session-id="${after[1]}"] .history-link`).focus();
  220 |   await page.keyboard.press('Alt+ArrowUp');
  221 |   await expect
  222 |     .poll(() =>
  223 |       sidebar
  224 |         .locator('.history-row')
  225 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  226 |     )
  227 |     .toEqual(before);
  228 |   await page.keyboard.press('Alt+ArrowDown');
  229 |   await expect
  230 |     .poll(() =>
  231 |       sidebar
  232 |         .locator('.history-row')
  233 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  234 |     )
  235 |     .toEqual(after);
  236 |   expect(
  237 |     (
  238 |       (await command(page, 'sessions.list', { sectionId: other, sort: 'manual' })) as SessionPage
  239 |     ).sessions.map((s) => s.id),
  240 |   ).toEqual([c]);
  241 |   const row = sidebar.locator(`[data-session-id="${after[0]}"]`);
  242 |   await page.getByLabel('输入草稿', { exact: true }).focus();
  243 |   await page.mouse.move(1300, 100);
  244 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '0');
  245 |   await row.hover();
  246 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  247 |   await row.getByRole('button', { name: /^置顶/ }).focus();
  248 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  249 |   await row.getByRole('button', { name: /^置顶/ }).click();
  250 |   await row.getByRole('button', { name: /^取消置顶/ }).click();
  251 |   await row.getByTitle(after[0] === a ? '排序会话甲' : '排序会话乙', { exact: true }).click();
  252 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', after[0]!);
  253 |   await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  254 |   const saved = profile;
  255 |   await app.close();
  256 |   page = await launch(saved);
  257 |   await expect(
  258 |     page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  259 |   ).toBeVisible();
  260 |   await expect(page.getByRole('complementary', { name: '侧栏', exact: true })).toBeHidden();
  261 |   await showSidebar(page);
  262 |   await page
  263 |     .locator('.sidebar')
  264 |     .getByRole('button', { name: /^独立分组 [(]2[)]/ })
  265 |     .click();
  266 |   await expect
```