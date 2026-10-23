# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.group-tooltips.spec.ts >> P02-01 refinements: mode hints stay below, all controls share rounded hints and recommendations have no arrow
- Location: tests\e2e\P02-01.group-tooltips.spec.ts:74:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('tooltip')
Expected: "设置"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" getByRole('tooltip') with timeout 15000ms
  - waiting for getByRole('tooltip')

```

```yaml
- complementary "侧栏":
  - strong: TapKit
  - button "通知"
  - button "搜索"
  - button "新建任务"
  - navigation "主导航":
    - link "聊天":
      - /url: /chats
    - link "工作":
      - /url: /work
    - link "项目":
      - /url: /projects
    - link "文件":
      - /url: /files
    - group: 调整导航入口
  - region "会话历史":
    - heading "最近" [level=2]
    - button "会话列表选项"
    - paragraph: 暂无会话
  - text: 任务执行尚未开放 待确认事项：0
  - link "个人资料与设置":
    - /url: /settings/personal
  - link "设置":
    - /url: /settings/general
  - separator "调整侧栏宽度"
- banner:
  - button "收起侧栏" [expanded]
  - text: TapKit
  - group: 连接状态
  - button "详情面板": 工作台
- main:
  - region "新建任务":
    - heading "你的想法，从这里开始" [level=1]
    - radiogroup "任务类型":
      - radio "聊天" [checked]: 聊天 讨论问题、整理思路，聊天记录保存在本机。
      - radio "临时聊天": 临时聊天 适合一次性讨论，离开后清除本次临时聊天记录。
      - radio "工作": 工作 围绕具体目标整理工作草稿；任务执行、计划和审批尚未开放。
    - region "推荐问题":
      - text: 为你推荐
      - button "隐藏推荐问题" [expanded]
      - button "帮我把这段文字整理成清晰的要点"
      - button "用一个例子解释我想了解的概念"
      - button "帮我比较两个方案的优缺点"
    - textbox "输入草稿":
      - /placeholder: 请先配置模型再使用...
    - button "添加附件或引用资料"
    - button "输入与工具信息"
    - button "设置模型"
    - button "发送" [disabled]
```

# Test source

```ts
  32  |   return page;
  33  | }
  34  | async function command(
  35  |   page: Page,
  36  |   command: HistoryCommand | DesktopCommand,
  37  |   payload: object = {},
  38  |   desktop = false,
  39  | ) {
  40  |   return page.evaluate(
  41  |     async ({ command, payload, desktop, requestId }) => {
  42  |       const r = desktop
  43  |         ? await window.tapkit.desktopCommand({ requestId }, command as DesktopCommand, payload)
  44  |         : await window.tapkit.historyCommand({ requestId }, command as HistoryCommand, payload);
  45  |       if (!r.ok) throw new Error(r.error.code);
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
  70  | test.afterEach(async () => {
  71  |   await app?.close();
  72  | });
  73  | 
  74  | test('P02-01 refinements: mode hints stay below, all controls share rounded hints and recommendations have no arrow', async () => {
  75  |   test.setTimeout(240_000);
  76  |   const page = await launch();
  77  |   const errors: string[] = [];
  78  |   page.on('pageerror', (e) => errors.push(e.message));
  79  |   const samples = [];
  80  |   for (const [width, height, zoom, theme] of [
  81  |     [1440, 900, 1, 'light'],
  82  |     [960, 640, 1, 'dark'],
  83  |     [960, 640, 2, 'dark'],
  84  |   ] as const) {
  85  |     await setSize(width, height);
  86  |     await page.evaluate(
  87  |       ({ zoom, theme }) => {
  88  |         const shell = document.querySelector<HTMLElement>('.desktop-shell')!;
  89  |         shell.style.setProperty('--ui-zoom', String(zoom));
  90  |         shell.dataset.theme = theme;
  91  |       },
  92  |       { zoom, theme },
  93  |     );
  94  |     const radio = page.getByRole('radio', { name: '临时聊天', exact: true });
  95  |     await radio.scrollIntoViewIfNeeded();
  96  |     await radio.hover();
  97  |     const tooltip = page.getByRole('tooltip');
  98  |     await expect(tooltip).toBeVisible();
  99  |     await expect(tooltip).toContainText('一次性讨论');
  100 |     const geometry = await page.evaluate(() => {
  101 |       const mode = document.querySelector('.start-modes')!.getBoundingClientRect();
  102 |       const heading = document.querySelector('.start-heading h1')!.getBoundingClientRect();
  103 |       const tip = document.querySelector('[role="tooltip"]')!.getBoundingClientRect();
  104 |       return {
  105 |         gap: mode.top - heading.bottom,
  106 |         tip: { top: tip.top, left: tip.left, right: tip.right, bottom: tip.bottom },
  107 |         modeBottom: mode.bottom,
  108 |         viewport: [innerWidth, innerHeight],
  109 |       };
  110 |     });
  111 |     expect(geometry.gap).toBeGreaterThanOrEqual(height > 720 ? 35 : 19);
  112 |     expect(geometry.tip.top).toBeGreaterThanOrEqual(geometry.modeBottom);
  113 |     expect(geometry.tip.left).toBeGreaterThanOrEqual(0);
  114 |     expect(geometry.tip.right).toBeLessThanOrEqual(geometry.viewport[0]!);
  115 |     await expect(tooltip).toHaveCSS('border-radius', '10px');
  116 |     await expect(page.locator('.start-questions .ui-icon')).toHaveCount(0);
  117 |     await page.screenshot({ path: resolve(evidence, `mode-hint-${width}-${zoom}-${theme}.png`) });
  118 |     await page.keyboard.press('Escape');
  119 |     const send = page.getByRole('button', { name: '发送', exact: true });
  120 |     await expect(send).toBeDisabled();
  121 |     await send.hover();
  122 |     await expect(tooltip).toHaveText('连接模型后发送');
  123 |     await expect(tooltip).toBeVisible();
  124 |     await expect(tooltip).toHaveCSS('border-radius', '10px');
  125 |     await page.screenshot({ path: resolve(evidence, `send-hint-${width}-${zoom}-${theme}.png`) });
  126 |     await page.keyboard.press('Escape');
  127 |     await showSidebar(page);
  128 |     const settings = page
  129 |       .locator('.sidebar-footer')
  130 |       .getByRole('link', { name: '设置', exact: true });
  131 |     await settings.focus();
> 132 |     await expect(tooltip).toHaveText('设置');
      |                           ^ Error: expect(locator).toHaveText(expected) failed
  133 |     await expect(tooltip).toBeVisible();
  134 |     await expect(settings).toHaveAttribute('aria-describedby', /.+/);
  135 |     await page.keyboard.press('Escape');
  136 |     await expect(tooltip).toBeHidden();
  137 |     await expect(settings).not.toHaveAttribute('aria-describedby');
  138 |     // Every native hint authored by the renderer was migrated; iframe's title names its document.
  139 |     await expect(page.locator('[title]:not(iframe)')).toHaveCount(0);
  140 |     samples.push({ width, height, zoom, theme, ...geometry });
  141 |   }
  142 |   await writeFile(resolve(evidence, 'hint-geometry.json'), JSON.stringify(samples, null, 2));
  143 |   expect(errors).toEqual([]);
  144 | });
  145 | 
  146 | test('P02-01 refinements: group arrow controls its own paginated sessions and menu labels stay in one row', async () => {
  147 |   test.setTimeout(240_000);
  148 |   const page = await launch();
  149 |   await setSize(1440, 900);
  150 |   const name = '分组里包含很长很长的文字仍然保持在同一行';
  151 |   const groupId = ((await command(page, 'sidebar.create', { name })) as { entityId: string })
  152 |     .entityId;
  153 |   const ids = [];
  154 |   for (let i = 0; i < 53; i++) ids.push(await create(page, '分组分页会话 ' + i));
  155 |   const ungrouped = await create(page, '未分组会话');
  156 |   await command(page, 'sessions.move', { sessionIds: ids, sectionId: groupId });
  157 |   await showSidebar(page);
  158 |   const sidebar = page.locator('.sidebar');
  159 |   const group = sidebar.locator(`[data-section-id="${groupId}"]`);
  160 |   const header = group.locator('.history-group-header');
  161 |   const arrow = header.getByRole('button', { name: '折叠分组' + name, exact: true });
  162 |   await expect(arrow).toHaveAttribute('aria-expanded', 'true');
  163 |   await expect(group.locator('.history-row')).toHaveCount(50);
  164 |   await expect(sidebar.locator(`[data-session-id="${ungrouped}"]`)).toHaveCount(1);
  165 |   const aligned = await header.locator('button').evaluateAll((nodes) =>
  166 |     nodes.map((el) => {
  167 |       const r = el.getBoundingClientRect();
  168 |       return { x: r.x, y: r.y, center: r.y + r.height / 2 };
  169 |     }),
  170 |   );
  171 |   expect(
  172 |     Math.max(...aligned.map((r) => r.center)) - Math.min(...aligned.map((r) => r.center)),
  173 |   ).toBeLessThanOrEqual(1);
  174 |   await header.screenshot({ path: resolve(evidence, 'group-header.png') });
  175 |   await group.getByRole('button', { name: '加载更多', exact: true }).click();
  176 |   await expect(group.locator('.history-row')).toHaveCount(53);
  177 |   await expect(sidebar.locator('.history-row')).toHaveCount(54);
  178 |   await arrow.click();
  179 |   await expect(group.locator('.history-row')).toHaveCount(0);
  180 |   await expect(sidebar.locator('.history-row')).toHaveCount(1);
  181 |   await header.getByRole('button', { name: '展开分组' + name, exact: true }).click();
  182 |   await expect(group.locator('.history-row')).toHaveCount(50);
  183 |   await header.getByRole('button', { name: '折叠分组' + name, exact: true }).click();
  184 |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  185 |   const menu = page.getByRole('region', { name: '会话列表选项', exact: true });
  186 |   async function inline(buttonName: string) {
  187 |     const b = menu.getByRole('button', { name: buttonName, exact: true });
  188 |     const parts = await b.locator(':scope > svg,:scope > span').evaluateAll((nodes) =>
  189 |       nodes.map((el) => {
  190 |         const r = el.getBoundingClientRect();
  191 |         return { x: r.x, right: r.right, center: r.y + r.height / 2 };
  192 |       }),
  193 |     );
  194 |     expect(
  195 |       Math.max(...parts.map((r) => r.center)) - Math.min(...parts.map((r) => r.center)),
  196 |     ).toBeLessThanOrEqual(1);
  197 |     return parts;
  198 |   }
  199 |   await inline('新建分组');
  200 |   await inline('会话排列顺序');
  201 |   await menu.screenshot({ path: resolve(evidence, 'recent-menu.png') });
  202 |   await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  203 |   await inline('会话排列顺序');
  204 |   const selected = await inline('最近更新');
  205 |   expect(selected[1]!.x).toBeGreaterThan(selected[0]!.right);
  206 |   await menu.screenshot({ path: resolve(evidence, 'sort-menu.png') });
  207 |   await menu.getByRole('button', { name: '手动排序', exact: true }).click();
  208 |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  209 |   await menu.getByRole('button', { name: '会话排列顺序', exact: true }).click();
  210 |   await expect(menu.getByRole('button', { name: '手动排序', exact: true })).toHaveAttribute(
  211 |     'aria-pressed',
  212 |     'true',
  213 |   );
  214 |   const manual = await inline('手动排序');
  215 |   expect(manual[1]!.x).toBeGreaterThan(manual[0]!.right);
  216 |   await page.keyboard.press('Escape');
  217 |   const saved = profile;
  218 |   await app.close();
  219 |   const reopened = await launch(saved);
  220 |   await showSidebar(reopened);
  221 |   const restored = reopened.locator(`.sidebar [data-section-id="${groupId}"]`);
  222 |   await expect(restored.locator('.history-row')).toHaveCount(0);
  223 |   await expect(
  224 |     restored.getByRole('button', { name: '展开分组' + name, exact: true }),
  225 |   ).toHaveAttribute('aria-expanded', 'false');
  226 |   await restored.getByRole('button', { name: '展开分组' + name, exact: true }).click();
  227 |   await expect(restored.locator('.history-row')).toHaveCount(50);
  228 |   await expect(reopened.locator('.sidebar .history-row')).toHaveCount(51);
  229 |   await writeFile(
  230 |     resolve(evidence, 'group-geometry.json'),
  231 |     JSON.stringify(
  232 |       { aligned, grouped: 53, initialPage: 50, root: 1, collapsePersisted: true },
```