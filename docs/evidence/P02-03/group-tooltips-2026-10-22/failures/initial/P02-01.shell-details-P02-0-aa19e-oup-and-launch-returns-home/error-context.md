# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.shell-details.spec.ts >> P02-01 shell details manual drag sorting persists per group and launch returns home
- Location: tests\e2e\P02-01.shell-details.spec.ts:175:1

# Error details

```
TimeoutError: locator.dragTo: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.sidebar').locator('[data-section-id="01a1637e-bf44-7ebd-9cab-1e53e4c703ad"]').locator('[data-session-id="undefined"]')

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
          - generic [ref=e40]:
            - button "折叠分组独立分组" [expanded] [ref=e41] [cursor=pointer]
            - button "独立分组 (2) · 未读 0 · 运行中 0" [expanded] [ref=e44] [cursor=pointer]
            - button "重命名独立分组" [ref=e46] [cursor=pointer]
          - generic [ref=e48]:
            - generic [ref=e49]:
              - button "排序会话乙 2026/10/22 20:03:33" [ref=e50] [cursor=pointer]:
                - text: 排序会话乙
                - generic [ref=e51]: 2026/10/22 20:03:33
              - generic [ref=e52]:
                - button "置顶排序会话乙" [ref=e54] [cursor=pointer]
                - button "会话信息排序会话乙" [ref=e58] [cursor=pointer]
            - generic [ref=e60]:
              - button "排序会话甲 2026/10/22 20:03:33" [ref=e61] [cursor=pointer]:
                - text: 排序会话甲
                - generic [ref=e62]: 2026/10/22 20:03:33
              - generic [ref=e63]:
                - button "置顶排序会话甲" [ref=e65] [cursor=pointer]
                - button "会话信息排序会话甲" [ref=e69] [cursor=pointer]
        - generic [ref=e71]:
          - generic [ref=e72]:
            - button "折叠分组另一分组" [expanded] [ref=e73] [cursor=pointer]
            - button "另一分组 (1) · 未读 0 · 运行中 0" [expanded] [ref=e76] [cursor=pointer]
            - button "重命名另一分组" [ref=e78] [cursor=pointer]
          - generic [ref=e81]:
            - button "另一组会话 2026/10/22 20:03:33" [ref=e82] [cursor=pointer]:
              - text: 另一组会话
              - generic [ref=e83]: 2026/10/22 20:03:33
            - generic [ref=e84]:
              - button "置顶另一组会话" [ref=e86] [cursor=pointer]
              - button "会话信息另一组会话" [ref=e90] [cursor=pointer]
        - generic [ref=e92]:
          - heading "最近" [level=2] [ref=e93]
          - button "会话列表选项" [ref=e96] [cursor=pointer]
      - generic [ref=e98]:
        - generic [ref=e99]: 任务执行尚未开放
        - generic [ref=e100]: 待确认事项：0
    - generic [ref=e101]:
      - link "个人资料与设置" [ref=e102] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e107] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e110]
  - generic [ref=e111]:
    - banner [ref=e112]:
      - button "收起侧栏" [expanded] [ref=e115] [cursor=pointer]
      - generic [ref=e118]: TapKit
      - group [ref=e119]:
        - generic "连接状态" [ref=e120] [cursor=pointer]
      - button "详情面板" [ref=e122] [cursor=pointer]:
        - generic [ref=e125]: 工作台
    - main [ref=e127]:
      - region "新建任务" [ref=e129]:
        - generic [ref=e130]:
          - generic [ref=e131]:
            - heading "你的想法，从这里开始" [level=1] [ref=e132]
            - radiogroup "任务类型" [ref=e133]:
              - radio "聊天" [checked] [ref=e135] [cursor=pointer]:
                - text: 聊天
                - generic [ref=e136]: 讨论问题、整理思路，聊天记录保存在本机。
              - radio "临时聊天" [ref=e138] [cursor=pointer]:
                - text: 临时聊天
                - generic [ref=e139]: 适合一次性讨论，离开后清除本次临时聊天记录。
              - radio "工作" [ref=e141] [cursor=pointer]:
                - text: 工作
                - generic [ref=e142]: 围绕具体目标整理工作草稿；任务执行、计划和审批尚未开放。
          - region "推荐问题" [ref=e143]:
            - generic [ref=e144]:
              - generic [ref=e145]: 为你推荐
              - button "隐藏推荐问题" [expanded] [ref=e146] [cursor=pointer]
            - generic [ref=e149]:
              - button "帮我把这段文字整理成清晰的要点" [ref=e150] [cursor=pointer]
              - button "用一个例子解释我想了解的概念" [ref=e152] [cursor=pointer]
              - button "帮我比较两个方案的优缺点" [ref=e154] [cursor=pointer]
        - generic [ref=e157]:
          - textbox "输入草稿" [ref=e158]:
            - /placeholder: 请先配置模型再使用...
          - generic [ref=e159]:
            - button "添加附件或引用资料" [ref=e162] [cursor=pointer]
            - button "输入与工具信息" [ref=e167] [cursor=pointer]
            - button "设置模型" [ref=e171] [cursor=pointer]
            - button "发送" [disabled] [ref=e174]
```

# Test source

```ts
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
  134 |         viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
  135 |         input: b('.composer'),
  136 |         questions: b('.start-questions'),
  137 |         last: questions.at(-1)!.getBoundingClientRect().toJSON(),
  138 |         toggle: b('.suggestions-toggle'),
  139 |         workspace: b('.workspace'),
  140 |         shell: b('.desktop-shell'),
  141 |         padding:
  142 |           parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).paddingLeft) *
  143 |           parseFloat(getComputedStyle(document.querySelector('.desktop-shell')!).zoom),
  144 |         scroll: b('.start-page-scroll'),
  145 |         radius: getComputedStyle(questions[0]!).borderRadius,
  146 |         overflow: document.documentElement.scrollWidth > innerWidth,
  147 |       };
  148 |     });
  149 |     expect(bounds.overflow).toBe(false);
  150 |     expect(Math.abs(bounds.workspace.x - bounds.shell.x - bounds.padding)).toBeLessThanOrEqual(2);
  151 |     expect(
  152 |       Math.abs(bounds.workspace.width - bounds.shell.width + bounds.padding * 2),
  153 |     ).toBeLessThanOrEqual(2);
  154 |     expect(Math.abs(bounds.questions.x - bounds.input.x)).toBeLessThanOrEqual(2);
  155 |     expect(Math.abs(bounds.toggle.right - bounds.input.right)).toBeLessThanOrEqual(2);
  156 |     expect(parseFloat(bounds.radius)).toBeGreaterThanOrEqual(100);
  157 |     if (zoom === 1) {
  158 |       expect(bounds.input.top - bounds.last.bottom).toBeGreaterThanOrEqual(8);
  159 |       expect(bounds.input.top - bounds.last.bottom).toBeLessThanOrEqual(24);
  160 |     }
  161 |     await page.screenshot({
  162 |       path: resolve(evidence, `home-final-${width}-${zoom}-${theme}.png`),
  163 |       animations: 'disabled',
  164 |     });
  165 |     await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  166 |     await expect(sidebar).toBeVisible();
  167 |     await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  168 |     await expect(sidebar).toBeHidden();
  169 |     samples.push({ width, height, zoom, theme, ...bounds });
  170 |   }
  171 |   await writeFile(resolve(evidence, 'geometry.json'), JSON.stringify(samples, null, 2));
  172 |   expect(errors).toEqual([]);
  173 | });
  174 | 
  175 | test('P02-01 shell details manual drag sorting persists per group and launch returns home', async () => {
  176 |   test.setTimeout(240_000);
  177 |   let page = await launch();
  178 |   await setSize(1440, 900);
  179 |   const a = await create(page, '排序会话甲'),
  180 |     b = await create(page, '排序会话乙'),
  181 |     c = await create(page, '另一组会话');
  182 |   const group = (
  183 |     (await command(page, 'sidebar.create', { name: '独立分组' })) as { entityId: string }
  184 |   ).entityId;
  185 |   const other = (
  186 |     (await command(page, 'sidebar.create', { name: '另一分组' })) as { entityId: string }
  187 |   ).entityId;
  188 |   await command(page, 'sessions.move', { sessionIds: [a, b], sectionId: group });
  189 |   await command(page, 'sessions.move', { sessionIds: [c], sectionId: other });
  190 |   const sidebar = page.locator('.sidebar');
  191 |   await expect(sidebar.locator('.history-row')).toHaveCount(3);
  192 |   await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
  193 |   await page
  194 |     .getByRole('region', { name: '会话列表选项', exact: true })
  195 |     .getByRole('button', { name: '会话排列顺序', exact: true })
  196 |     .click();
  197 |   await expect(
  198 |     page
  199 |       .getByRole('region', { name: '会话列表选项', exact: true })
  200 |       .getByRole('button', { name: '最近更新', exact: true }),
  201 |   ).toHaveAttribute('aria-pressed', 'true');
  202 |   await page.keyboard.press('Escape');
  203 |   await sort(page, '手动排序');
  204 |   const groupRows = sidebar.locator(`[data-section-id="${group}"]`);
  205 |   await expect(groupRows.locator('.history-row')).toHaveCount(2);
  206 |   const before = await groupRows
  207 |     .locator('.history-row')
  208 |     .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id')!));
  209 |   await groupRows
  210 |     .locator(`[data-session-id="${before[1]}"]`)
> 211 |     .dragTo(groupRows.locator(`[data-session-id="${before[0]}"]`));
      |      ^ TimeoutError: locator.dragTo: Timeout 30000ms exceeded.
  212 |   await expect
  213 |     .poll(() =>
  214 |       groupRows
  215 |         .locator('.history-row')
  216 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  217 |     )
  218 |     .toEqual([...before].reverse());
  219 |   const after = [...before].reverse();
  220 |   await groupRows.locator(`[data-session-id="${after[1]}"] .history-link`).focus();
  221 |   await page.keyboard.press('Alt+ArrowUp');
  222 |   await expect
  223 |     .poll(() =>
  224 |       groupRows
  225 |         .locator('.history-row')
  226 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  227 |     )
  228 |     .toEqual(before);
  229 |   await page.keyboard.press('Alt+ArrowDown');
  230 |   await expect
  231 |     .poll(() =>
  232 |       groupRows
  233 |         .locator('.history-row')
  234 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  235 |     )
  236 |     .toEqual(after);
  237 |   expect(
  238 |     (
  239 |       (await command(page, 'sessions.list', { sectionId: other, sort: 'manual' })) as SessionPage
  240 |     ).sessions.map((s) => s.id),
  241 |   ).toEqual([c]);
  242 |   const row = sidebar.locator(`[data-session-id="${after[0]}"]`);
  243 |   await page.getByLabel('输入草稿', { exact: true }).focus();
  244 |   await page.mouse.move(1300, 100);
  245 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '0');
  246 |   await row.hover();
  247 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  248 |   await row.getByRole('button', { name: /^置顶/ }).focus();
  249 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '1');
  250 |   await row.getByRole('button', { name: /^置顶/ }).click();
  251 |   await row.getByRole('button', { name: /^取消置顶/ }).click();
  252 |   await row.locator('.history-link').click();
  253 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', after[0]!);
  254 |   await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  255 |   const saved = profile;
  256 |   await app.close();
  257 |   page = await launch(saved);
  258 |   await expect(
  259 |     page.getByRole('heading', { name: '你的想法，从这里开始', exact: true }),
  260 |   ).toBeVisible();
  261 |   await expect(page.getByRole('complementary', { name: '侧栏', exact: true })).toBeHidden();
  262 |   await showSidebar(page);
  263 |   await expect
  264 |     .poll(() =>
  265 |       page
  266 |         .locator(`[data-section-id="${group}"] .history-row`)
  267 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  268 |     )
  269 |     .toEqual(after);
  270 |   const settings = await page.evaluate(async (requestId) => {
  271 |     const r = await window.tapkit.bootstrap({ requestId });
  272 |     if (!r.ok || !('profile' in r.data)) throw new Error('BOOT');
  273 |     return r.data.settings.values.desktop.historySort;
  274 |   }, requestId());
  275 |   expect(settings).toBe('manual');
  276 |   await sort(page, '最近更新');
  277 |   // Explicit Open in new window continues to honor the entity route.
  278 |   const next = app.waitForEvent('window');
  279 |   await page.evaluate(async (id) => window.tapkit.openEntity({ type: 'session', id }), a);
  280 |   const second = await next;
  281 |   await expect(second.locator('.chat-surface')).toHaveAttribute('data-session-id', a, {
  282 |     timeout: 125_000,
  283 |   });
  284 |   await page.screenshot({ path: resolve(evidence, 'sidebar-manual.png') });
  285 | });
  286 | 
  287 | test('P02-01 shell details settings archive and trash pages search, restore and confirm permanent deletion', async () => {
  288 |   test.setTimeout(240_000);
  289 |   const page = await launch();
  290 |   await setSize(1440, 900);
  291 |   const a = await create(page, '归档筛选甲'),
  292 |     b = await create(page, '归档筛选乙', 'work'),
  293 |     c = await create(page, '回收站恢复');
  294 |   await command(page, 'sessions.archive', { sessionIds: [a, b], archived: true });
  295 |   await command(page, 'sessions.trash', { sessionIds: [c] });
  296 |   await page.getByRole('link', { name: '设置', exact: true }).click();
  297 |   const nav = page.getByRole('navigation', { name: '设置分类', exact: true });
  298 |   await nav.getByRole('link', { name: '已归档的聊天', exact: true }).click();
  299 |   await expect(page.getByRole('heading', { name: '已归档的聊天', exact: true })).toBeVisible();
  300 |   const list = page.locator('.history-settings');
  301 |   await expect(list.locator('.history-row')).toHaveCount(2);
  302 |   await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('甲');
  303 |   await expect(list.locator('.history-row')).toHaveCount(1);
  304 |   await list.getByRole('button', { name: '取消归档', exact: true }).click();
  305 |   await expect(list.locator('.history-row')).toHaveCount(0);
  306 |   await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('');
  307 |   await page.getByLabel('会话类型', { exact: true }).selectOption('work');
  308 |   await expect(list.locator('.history-row')).toHaveCount(1);
  309 |   await page.screenshot({ path: resolve(evidence, 'settings-archive-final.png') });
  310 |   await list.getByRole('button', { name: '移入回收站归档筛选乙', exact: true }).click();
  311 |   const impact = page.getByRole('dialog', { name: '记忆删除影响', exact: true });
```