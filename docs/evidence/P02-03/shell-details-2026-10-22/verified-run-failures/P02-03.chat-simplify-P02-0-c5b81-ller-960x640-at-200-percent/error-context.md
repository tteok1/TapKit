# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 960x640 at 200 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
TimeoutError: locator.boundingBox: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('complementary', { name: '侧栏', exact: true }).locator('.sidebar-footer')

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - button "展开侧栏" [ref=e8] [cursor=pointer]
    - generic [ref=e11]: 隔离测试回复：界面精简后的发送回归
    - group [ref=e12]:
      - generic "连接状态" [ref=e13] [cursor=pointer]
    - button "详情面板" [ref=e15] [cursor=pointer]
  - main [ref=e19]:
    - generic [ref=e21]:
      - generic [ref=e22]:
        - button "会话摘要" [ref=e24] [cursor=pointer]
        - button "记忆与历史范围" [ref=e26] [cursor=pointer]
        - generic [ref=e27]:
          - generic [ref=e28]:
            - text: 消息分支 / 回答版本
            - combobox "消息分支 / 回答版本" [ref=e29]:
              - option "主分支 1" [selected]
          - button "AI 重命名" [ref=e30] [cursor=pointer]
          - button "导出 Markdown" [ref=e31] [cursor=pointer]
          - group [ref=e32]:
            - generic "当前资料、工具与个性化设置" [ref=e33] [cursor=pointer]
      - generic [ref=e34]:
        - article [ref=e35]:
          - generic [ref=e36]:
            - strong [ref=e37]: 你
            - generic [ref=e38]: 18:46:43 · 已发送
          - paragraph [ref=e39]: 界面精简后的发送回归
          - generic [ref=e41]:
            - button "复制回复" [ref=e43] [cursor=pointer]
            - button "引用选区追问" [ref=e47] [cursor=pointer]
            - generic [ref=e50]:
              - button "编辑问题并创建分支" [ref=e52] [cursor=pointer]
              - button "收藏" [ref=e56] [cursor=pointer]
              - button "更多消息操作" [ref=e61] [cursor=pointer]
        - article [ref=e63]:
          - generic [ref=e64]:
            - strong [ref=e65]: TapKit
            - generic [ref=e66]: fixture-model · 18:46:43 · 已发送
          - group [ref=e67]:
            - paragraph [ref=e69]: 隔离测试回复：界面精简后的发送回归
          - generic [ref=e70]:
            - button "使用的记忆与历史参考" [ref=e74] [cursor=pointer]
            - generic [ref=e77]:
              - button "复制回复" [ref=e79] [cursor=pointer]
              - button "引用选区追问" [ref=e83] [cursor=pointer]
              - generic [ref=e86]:
                - button "重新生成回答" [ref=e88] [cursor=pointer]
                - button "点赞" [pressed] [ref=e92] [cursor=pointer]
                - button "点踩" [ref=e96] [cursor=pointer]
                - button "取消收藏" [pressed] [ref=e100] [cursor=pointer]
                - button "更多消息操作" [ref=e105] [cursor=pointer]
      - status [ref=e107]: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
      - generic [ref=e108]:
        - textbox "输入草稿" [ref=e109]:
          - /placeholder: 写下你的问题...
        - generic [ref=e110]:
          - button "添加附件或引用资料" [ref=e113] [cursor=pointer]
          - button "输入与工具信息" [ref=e118] [cursor=pointer]
          - button "本轮模型" [ref=e124] [cursor=pointer]:
            - generic [ref=e125]: fixture-model
          - button "发送" [disabled] [ref=e128]
```

# Test source

```ts
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
  200 |     await answer.getByRole('button', { name: '复制回复', exact: true }).hover();
  201 |     await expect(page.getByRole('tooltip', { name: '复制回复', exact: true })).toBeVisible();
  202 |     await answer.getByRole('button', { name: '收藏', exact: true }).click();
  203 |     await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
  204 |       'aria-pressed',
  205 |       'true',
  206 |     );
  207 |     await answer.getByRole('button', { name: '点赞', exact: true }).click();
  208 |     await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
  209 |       'aria-pressed',
  210 |       'true',
  211 |     );
  212 |     await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
  213 |     const more = answer.getByRole('region', { name: '更多消息操作', exact: true });
  214 |     await expect(more.getByRole('button', { name: '删除消息', exact: true })).toBeVisible();
  215 |     const moreBounds = await more.boundingBox();
  216 |     expect(moreBounds!.x).toBeGreaterThanOrEqual(0);
  217 |     expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  218 |     expect(moreBounds!.x + moreBounds!.width).toBeLessThanOrEqual(width + 1);
  219 |     expect(moreBounds!.y + moreBounds!.height).toBeLessThanOrEqual(height + 1);
  220 |     await page.keyboard.press('Escape');
  221 |     const inputHeight = await input.evaluate((el) => el.clientHeight);
  222 |     expect(inputHeight).toBeLessThanOrEqual(initial);
  223 |     await composer.scrollIntoViewIfNeeded();
  224 |     const spacing = await page.locator('.chat-surface').evaluate((el) => {
  225 |       const controls = el.querySelector('.conversation-controls')!.getBoundingClientRect();
  226 |       const main = el.closest('main')!.getBoundingClientRect();
  227 |       const progress = el.querySelector('.chat-progress')!.getBoundingClientRect();
  228 |       const composer = el.querySelector('.composer')!.getBoundingClientRect();
  229 |       return {
  230 |         top:
  231 |           controls.top -
  232 |           main.top +
  233 |           el.closest('main')!.scrollTop * (main.width / el.closest('main')!.offsetWidth),
  234 |         gap: composer.top - progress.bottom,
  235 |       };
  236 |     });
  237 |     expect(spacing.top).toBeLessThanOrEqual(14 * zoom);
  238 |     expect(spacing.gap).toBeLessThanOrEqual(8 * zoom + 1);
  239 |     const row = await composer.locator('.composer-bar').evaluate((el) => ({
  240 |       width: el.clientWidth,
  241 |       scrollWidth: el.scrollWidth,
  242 |       tops: [...el.children].map((child) => child.getBoundingClientRect().top),
  243 |     }));
  244 |     expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
  245 |     const lowerGap = await composer.evaluate(
  246 |       (el) =>
  247 |         el.getBoundingClientRect().bottom -
  248 |         el.querySelector('.composer-bar')!.getBoundingClientRect().bottom,
  249 |     );
  250 |     expect(lowerGap).toBeLessThanOrEqual(8 * zoom);
> 251 |     const footerHeight = (await footer.boundingBox())!.height;
      |                                        ^ TimeoutError: locator.boundingBox: Timeout 30000ms exceeded.
  252 |     expect(footerHeight).toBeLessThanOrEqual((zoom === 2 ? 74 : 38) * zoom);
  253 | 
  254 |     expect(Math.max(...row.tops) - Math.min(...row.tops)).toBeLessThanOrEqual(5);
  255 |     await page.screenshot({
  256 |       path: resolve(evidence, `chat-${width}x${height}-${zoom * 100}.png`),
  257 |       animations: 'disabled',
  258 |     });
  259 |   });
  260 | }
  261 | 
```