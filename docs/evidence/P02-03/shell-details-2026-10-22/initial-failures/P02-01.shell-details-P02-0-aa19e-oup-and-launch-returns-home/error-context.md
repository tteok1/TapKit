# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-01.shell-details.spec.ts >> P02-01 shell details manual drag sorting persists per group and launch returns home
- Location: tests\e2e\P02-01.shell-details.spec.ts:169:1

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('.sidebar').locator('[data-session-id="01a16323-15a6-7ebf-81e2-c812dcb5fa07"]').locator('.session-row-actions')
Expected: "0"
Received: "1"
Timeout:  15000ms

Call log:
  - Expect "toHaveCSS" locator('.sidebar').locator('[data-session-id="01a16323-15a6-7ebf-81e2-c812dcb5fa07"]').locator('.session-row-actions') with timeout 15000ms
  - waiting for locator('.sidebar').locator('[data-session-id="01a16323-15a6-7ebf-81e2-c812dcb5fa07"]').locator('.session-row-actions')
    33 × locator resolved to <span class="session-row-actions">…</span>
       - unexpected value "1"

```

```yaml
- button "置顶排序会话甲"
- button "会话信息排序会话甲"
```

# Test source

```ts
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
  146 |     expect(Math.abs(bounds.workspace.x - bounds.shell.x)).toBeLessThanOrEqual(2);
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
> 221 |   await expect(row.locator('.session-row-actions')).toHaveCSS('opacity', '0');
      |                                                     ^ Error: expect(locator).toHaveCSS(expected) failed
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
  247 |         .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-session-id'))),
  248 |     )
  249 |     .toEqual(after);
  250 |   const settings = await page.evaluate(async (requestId) => {
  251 |     const r = await window.tapkit.bootstrap({ requestId });
  252 |     if (!r.ok || !('profile' in r.data)) throw new Error('BOOT');
  253 |     return r.data.settings.values.desktop.historySort;
  254 |   }, requestId());
  255 |   expect(settings).toBe('manual');
  256 |   await sort(page, '最近更新');
  257 |   // Explicit Open in new window continues to honor the entity route.
  258 |   const next = app.waitForEvent('window');
  259 |   await page.evaluate(async (id) => window.tapkit.openEntity({ type: 'session', id }), a);
  260 |   const second = await next;
  261 |   await expect(second.locator('.chat-surface')).toHaveAttribute('data-session-id', a, {
  262 |     timeout: 125_000,
  263 |   });
  264 |   await page.screenshot({ path: resolve(evidence, 'sidebar-manual.png') });
  265 | });
  266 | 
  267 | test('P02-01 shell details settings archive and trash pages search, restore and confirm permanent deletion', async () => {
  268 |   test.setTimeout(240_000);
  269 |   const page = await launch();
  270 |   await setSize(1440, 900);
  271 |   const a = await create(page, '归档筛选甲'),
  272 |     b = await create(page, '归档筛选乙', 'work'),
  273 |     c = await create(page, '回收站恢复');
  274 |   await command(page, 'sessions.archive', { sessionIds: [a, b], archived: true });
  275 |   await command(page, 'sessions.trash', { sessionIds: [c] });
  276 |   await page.getByRole('link', { name: '设置', exact: true }).click();
  277 |   const nav = page.getByRole('navigation', { name: '设置分类', exact: true });
  278 |   await nav.getByRole('link', { name: '已归档的聊天', exact: true }).click();
  279 |   await expect(page.getByRole('heading', { name: '已归档的聊天', exact: true })).toBeVisible();
  280 |   const list = page.locator('.history-settings');
  281 |   await expect(list.locator('.history-row')).toHaveCount(2);
  282 |   await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('甲');
  283 |   await expect(list.locator('.history-row')).toHaveCount(1);
  284 |   await list.getByRole('button', { name: '取消归档', exact: true }).click();
  285 |   await expect(list.locator('.history-row')).toHaveCount(0);
  286 |   await page.getByLabel('搜索已归档的聊天', { exact: true }).fill('');
  287 |   await page.getByLabel('会话类型', { exact: true }).selectOption('work');
  288 |   await expect(list.locator('.history-row')).toHaveCount(1);
  289 |   await page.screenshot({ path: resolve(evidence, 'settings-archive.png') });
  290 |   await list.getByRole('button', { name: '移入回收站归档筛选乙', exact: true }).click();
  291 |   const impact = page.getByRole('dialog', { name: '记忆删除影响', exact: true });
  292 |   await expect(impact).toBeVisible();
  293 |   await impact.getByRole('button', { name: '删除会话并处理记忆', exact: true }).click();
  294 |   await expect(list.locator('.history-row')).toHaveCount(0);
  295 |   await nav.getByRole('link', { name: '回收站', exact: true }).click();
  296 |   await expect(list.locator('.history-row')).toHaveCount(2);
  297 |   await list
  298 |     .locator(`[data-session-id="${c}"]`)
  299 |     .getByRole('button', { name: '恢复', exact: true })
  300 |     .click();
  301 |   await expect(list.locator(`[data-session-id="${c}"]`)).toHaveCount(0);
  302 |   await list.getByRole('button', { name: '永久删除归档筛选乙', exact: true }).click();
  303 |   const confirm = page.locator('dialog[open]');
  304 |   await expect(confirm).toContainText('永久');
  305 |   await confirm.getByRole('button', { name: '取消', exact: true }).click();
  306 |   await expect(list.locator('.history-row')).toHaveCount(1);
  307 |   await list.getByRole('button', { name: '永久删除归档筛选乙', exact: true }).click();
  308 |   await confirm.getByRole('button', { name: '永久删除', exact: true }).click();
  309 |   await expect(list.locator('.history-row')).toHaveCount(0);
  310 |   await expect(list).toContainText('回收站是空的');
  311 |   expect(
  312 |     ((await command(page, 'sessions.list', { state: 'active' })) as SessionPage).sessions
  313 |       .map((s) => s.id)
  314 |       .sort(),
  315 |   ).toEqual([a, c].sort());
  316 |   await page.screenshot({ path: resolve(evidence, 'settings-trash.png') });
  317 | });
  318 | 
```