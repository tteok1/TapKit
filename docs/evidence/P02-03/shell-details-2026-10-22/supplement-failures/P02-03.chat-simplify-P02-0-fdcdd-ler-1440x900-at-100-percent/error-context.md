# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 1440x900 at 100 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('.chat-message.assistant').last().getByRole('button', { name: '复制回复', exact: true })
Expected: "复制回复"
Received: ""
Timeout:  15000ms

Call log:
  - Expect "toHaveAttribute" locator('.chat-message.assistant').last().getByRole('button', { name: '复制回复', exact: true }) with timeout 15000ms
  - waiting for locator('.chat-message.assistant').last().getByRole('button', { name: '复制回复', exact: true })
    33 × locator resolved to <button type="button" aria-label="复制回复" class="icon-button ">…</button>
       - unexpected value "null"

```

```yaml
- button "复制回复"
```

# Test source

```ts
  100 |     await expect(additions.getByRole('button', { name: '@ 引用资料', exact: true })).toBeEnabled();
  101 |     const popoverBounds = await additions.boundingBox();
  102 |     expect(popoverBounds!.x).toBeGreaterThanOrEqual(0);
  103 |     expect(popoverBounds!.y).toBeGreaterThanOrEqual(0);
  104 |     expect(popoverBounds!.x + popoverBounds!.width).toBeLessThanOrEqual(width + 1);
  105 |     expect(popoverBounds!.y + popoverBounds!.height).toBeLessThanOrEqual(height + 1);
  106 |     await page.keyboard.press('Escape');
  107 |     await expect(additions).toBeHidden();
  108 |     await composer.getByRole('button', { name: '本轮模型', exact: true }).click();
  109 |     await composer
  110 |       .getByRole('region', { name: '本轮模型', exact: true })
  111 |       .getByRole('button', { name: /fixture-model/ })
  112 |       .click();
  113 |     await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toContainText(
  114 |       'fixture-model',
  115 |     );
  116 |     if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
  117 |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  118 |     const pin = sidebar.getByRole('button', { name: '置顶' + title, exact: true });
  119 |     await pin.hover();
  120 |     await expect(page.getByRole('tooltip', { name: '置顶聊天', exact: true })).toBeVisible();
  121 |     await pin.click();
  122 |     await expect(
  123 |       sidebar.getByRole('button', { name: '取消置顶' + title, exact: true }),
  124 |     ).toHaveAttribute('aria-pressed', 'true');
  125 |     const footer = sidebar.locator('.sidebar-footer');
  126 |     await expect(footer).toHaveText('');
  127 |     const footerBefore = await footer.boundingBox();
  128 |     const scroller = sidebar.locator('.sidebar-scroll');
  129 | 
  130 |     await scroller.evaluate((el) => {
  131 |       el.scrollTop = 0;
  132 |     });
  133 |     const brandTop = await sidebar
  134 |       .locator('.sidebar-brand')
  135 |       .evaluate((el) => el.getBoundingClientRect().top);
  136 |     const bounds = (await sidebar.boundingBox())!;
  137 |     await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  138 |     await page.mouse.wheel(0, 500);
  139 |     await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  140 |     expect(
  141 |       await sidebar.locator('.sidebar-brand').evaluate((el) => el.getBoundingClientRect().top),
  142 |     ).toBeLessThan(brandTop);
  143 |     const metrics = await scroller.evaluate((el) => ({
  144 |       scrollTop: el.scrollTop,
  145 |       clientHeight: el.clientHeight,
  146 |       scrollHeight: el.scrollHeight,
  147 |       nestedScrollers: [...el.querySelectorAll('*')]
  148 |         .filter(
  149 |           (child) =>
  150 |             ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) &&
  151 |             child.scrollHeight > child.clientHeight + 1,
  152 |         )
  153 |         .map((child) => child.className),
  154 |       historyScrollTop: el.querySelector('.history')!.scrollTop,
  155 |       savedScroll: JSON.parse(localStorage.getItem('tapkit.layout.' + window.tapkit.windowSlot)!)
  156 |         .sidebarScroll,
  157 |     }));
  158 |     expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  159 |     expect(metrics.nestedScrollers).toEqual([]);
  160 |     expect(metrics.historyScrollTop).toBe(0);
  161 |     expect(metrics.savedScroll).toBeGreaterThan(0);
  162 |     expect(await footer.boundingBox()).toEqual(footerBefore);
  163 |     await expect(footer.getByRole('link', { name: '个人资料与设置', exact: true })).toBeInViewport({
  164 |       ratio: 0.99,
  165 |     });
  166 |     await expect(sidebar.getByRole('link', { name: '设置', exact: true })).toBeInViewport({
  167 |       ratio: 0.99,
  168 |     });
  169 |     await scroller.evaluate((el) => {
  170 |       el.scrollTop = 0;
  171 |     });
  172 |     await writeFile(
  173 |       resolve(evidence, `sidebar-${width}x${height}-${zoom * 100}.json`),
  174 |       JSON.stringify(metrics, null, 2) + '\n',
  175 |     );
  176 | 
  177 |     if (zoom === 2) await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  178 |     const input = page.getByRole('textbox', { name: '输入草稿', exact: true });
  179 |     const initial = await input.evaluate((el) => el.clientHeight);
  180 |     await input.fill(Array.from({ length: 6 }, () => '输入框随内容增高').join('\n'));
  181 |     expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(initial);
  182 |     await input.fill(Array.from({ length: 80 }, () => '达到高度上限后滚动').join('\n'));
  183 |     const capped = await input.evaluate((el) => ({
  184 |       height: el.clientHeight,
  185 |       max: parseFloat(getComputedStyle(el).maxHeight),
  186 |       scroll: el.scrollHeight,
  187 |     }));
  188 |     expect(capped.height).toBeLessThanOrEqual(capped.max + 1);
  189 |     expect(capped.scroll).toBeGreaterThan(capped.height);
  190 |     await input.fill('/retained');
  191 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  192 |     await expect(input).toHaveValue('保留的常用提示词内容');
  193 |     await input.fill('界面精简后的发送回归');
  194 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  195 |     await expect(page.locator('.chat-message.assistant')).toContainText(
  196 |       '隔离测试回复：界面精简后的发送回归',
  197 |     );
  198 |     await expect(page.locator('.chat-message.user')).toHaveCount(1);
  199 |     const answer = page.locator('.chat-message.assistant').last();
> 200 |     await expect(answer.getByRole('button', { name: '复制回复', exact: true })).toHaveAttribute(
      |                                                                             ^ Error: expect(locator).toHaveAttribute(expected) failed
  201 |       'title',
  202 |       '复制回复',
  203 |     );
  204 |     await answer.getByRole('button', { name: '收藏', exact: true }).click();
  205 |     await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
  206 |       'aria-pressed',
  207 |       'true',
  208 |     );
  209 |     await answer.getByRole('button', { name: '点赞', exact: true }).click();
  210 |     await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
  211 |       'aria-pressed',
  212 |       'true',
  213 |     );
  214 |     await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
  215 |     const more = answer.getByRole('region', { name: '更多消息操作', exact: true });
  216 |     await expect(more.getByRole('button', { name: '删除消息', exact: true })).toBeVisible();
  217 |     const moreBounds = await more.boundingBox();
  218 |     expect(moreBounds!.x).toBeGreaterThanOrEqual(0);
  219 |     expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  220 |     expect(moreBounds!.x + moreBounds!.width).toBeLessThanOrEqual(width + 1);
  221 |     expect(moreBounds!.y + moreBounds!.height).toBeLessThanOrEqual(height + 1);
  222 |     await page.keyboard.press('Escape');
  223 |     const inputHeight = await input.evaluate((el) => el.clientHeight);
  224 |     expect(inputHeight).toBeLessThanOrEqual(initial);
  225 |     await composer.scrollIntoViewIfNeeded();
  226 |     const spacing = await page.locator('.chat-surface').evaluate((el) => {
  227 |       const controls = el.querySelector('.conversation-controls')!.getBoundingClientRect();
  228 |       const main = el.closest('main')!.getBoundingClientRect();
  229 |       const progress = el.querySelector('.chat-progress')!.getBoundingClientRect();
  230 |       const composer = el.querySelector('.composer')!.getBoundingClientRect();
  231 |       return {
  232 |         top:
  233 |           controls.top -
  234 |           main.top +
  235 |           el.closest('main')!.scrollTop * (main.width / el.closest('main')!.offsetWidth),
  236 |         gap: composer.top - progress.bottom,
  237 |       };
  238 |     });
  239 |     expect(spacing.top).toBeLessThanOrEqual(14 * zoom);
  240 |     expect(spacing.gap).toBeLessThanOrEqual(8 * zoom + 1);
  241 |     const row = await composer.locator('.composer-bar').evaluate((el) => ({
  242 |       width: el.clientWidth,
  243 |       scrollWidth: el.scrollWidth,
  244 |       tops: [...el.children].map((child) => child.getBoundingClientRect().top),
  245 |     }));
  246 |     expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
  247 |     const lowerGap = await composer.evaluate(
  248 |       (el) =>
  249 |         el.getBoundingClientRect().bottom -
  250 |         el.querySelector('.composer-bar')!.getBoundingClientRect().bottom,
  251 |     );
  252 |     expect(lowerGap).toBeLessThanOrEqual(8 * zoom);
  253 |     const footerHeight = (await footer.boundingBox())!.height;
  254 |     expect(footerHeight).toBeLessThanOrEqual((zoom === 2 ? 74 : 38) * zoom);
  255 | 
  256 |     expect(Math.max(...row.tops) - Math.min(...row.tops)).toBeLessThanOrEqual(5);
  257 |     await page.screenshot({
  258 |       path: resolve(evidence, `chat-${width}x${height}-${zoom * 100}.png`),
  259 |       animations: 'disabled',
  260 |     });
  261 |   });
  262 | }
  263 | 
```