# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 960x640 at 200 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 66
Received: 57
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link "TapKit 首页" [ref=e7] [cursor=pointer]:
          - /url: /
        - button "展开侧栏" [ref=e8] [cursor=pointer]
      - generic [ref=e11]:
        - button "临时聊天" [ref=e12] [cursor=pointer]
        - button "新建聊天" [ref=e15] [cursor=pointer]
        - button "新建工作" [ref=e18] [cursor=pointer]
        - button "新建项目" [ref=e21] [cursor=pointer]
      - navigation "主导航" [ref=e24]:
        - button "搜索" [ref=e25] [cursor=pointer]
        - link "聊天" [ref=e28] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e31] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e34] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e37] [cursor=pointer]:
          - /url: /files
        - link "通知" [ref=e40] [cursor=pointer]:
          - /url: /notifications
      - region "会话历史" [ref=e44]:
        - button "聊" [ref=e46] [cursor=pointer]
        - button "聊" [ref=e48] [cursor=pointer]
        - button "聊" [ref=e50] [cursor=pointer]
        - button "聊" [ref=e52] [cursor=pointer]
        - button "聊" [ref=e54] [cursor=pointer]
        - button "聊" [ref=e56] [cursor=pointer]
        - button "聊" [ref=e58] [cursor=pointer]
        - button "聊" [ref=e60] [cursor=pointer]
        - button "聊" [ref=e62] [cursor=pointer]
        - button "聊" [ref=e64] [cursor=pointer]
        - button "聊" [ref=e66] [cursor=pointer]
        - button "聊" [ref=e68] [cursor=pointer]
        - button "聊" [ref=e70] [cursor=pointer]
        - button "聊" [ref=e72] [cursor=pointer]
        - button "聊" [ref=e74] [cursor=pointer]
        - button "聊" [ref=e76] [cursor=pointer]
        - button "聊" [ref=e78] [cursor=pointer]
        - button "聊" [ref=e80] [cursor=pointer]
        - button "聊" [ref=e82] [cursor=pointer]
        - button "聊" [ref=e84] [cursor=pointer]
        - button "聊" [ref=e86] [cursor=pointer]
        - button "聊" [ref=e88] [cursor=pointer]
        - button "聊" [ref=e90] [cursor=pointer]
        - button "聊" [ref=e92] [cursor=pointer]
        - button "聊" [ref=e94] [cursor=pointer]
        - button "聊" [ref=e96] [cursor=pointer]
        - button "聊" [ref=e98] [cursor=pointer]
        - button "聊" [ref=e100] [cursor=pointer]
        - button "聊" [ref=e102] [cursor=pointer]
        - button "聊" [ref=e104] [cursor=pointer]
        - button "聊" [ref=e106] [cursor=pointer]
        - button "聊" [ref=e108] [cursor=pointer]
        - button "聊" [ref=e110] [cursor=pointer]
        - button "聊" [ref=e112] [cursor=pointer]
        - button "聊" [ref=e114] [cursor=pointer]
        - button "聊" [ref=e116] [cursor=pointer]
        - button "聊" [ref=e118] [cursor=pointer]
        - button "聊" [ref=e120] [cursor=pointer]
        - button "聊" [ref=e122] [cursor=pointer]
        - button "聊" [ref=e124] [cursor=pointer]
    - generic [ref=e126]:
      - link "个人资料与设置" [ref=e127] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e132] [cursor=pointer]:
        - /url: /settings/general
  - generic [ref=e135]:
    - banner [ref=e136]:
      - button "后退" [ref=e137] [cursor=pointer]
      - button "前进" [ref=e140] [cursor=pointer]
      - link "首页" [ref=e143] [cursor=pointer]:
        - /url: /
      - generic [ref=e144]: 界面精简会话 0
      - group [ref=e145]:
        - generic "连接状态" [ref=e146] [cursor=pointer]
      - button "详情面板" [ref=e148] [cursor=pointer]
    - main [ref=e152]:
      - generic [ref=e154]:
        - generic [ref=e155]:
          - button "会话摘要" [ref=e157] [cursor=pointer]
          - button "记忆与历史范围" [ref=e159] [cursor=pointer]
          - generic [ref=e160]:
            - generic [ref=e161]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e162]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e163] [cursor=pointer]
            - button "导出 Markdown" [ref=e164] [cursor=pointer]
            - group [ref=e165]:
              - generic "当前资料、工具与个性化设置" [ref=e166] [cursor=pointer]
        - generic [ref=e167]:
          - article [ref=e168]:
            - generic [ref=e169]:
              - strong [ref=e170]: 你
              - generic [ref=e171]: · 16:40:17 · 已发送
            - paragraph [ref=e172]: 界面精简后的发送回归
            - generic [ref=e174]:
              - generic [ref=e175]:
                - button "编辑问题并创建分支" [ref=e176] [cursor=pointer]
                - button "收藏" [ref=e179] [cursor=pointer]
                - button "更多消息操作" [ref=e183] [cursor=pointer]
              - button "复制回复" [ref=e185] [cursor=pointer]
              - button "引用选区追问" [ref=e188] [cursor=pointer]
          - article [ref=e191]:
            - generic [ref=e192]:
              - strong [ref=e193]: TapKit
              - generic [ref=e194]: openai-compatible · fixture-model · 16:40:17 · 已发送
            - group [ref=e195]:
              - paragraph [ref=e197]: 隔离测试回复：界面精简后的发送回归
            - generic [ref=e198]:
              - button "使用的记忆与历史参考" [ref=e201] [cursor=pointer]
              - generic [ref=e204]:
                - generic [ref=e205]:
                  - button "重新生成回答" [ref=e206] [cursor=pointer]
                  - button "点赞" [pressed] [ref=e209] [cursor=pointer]
                  - button "点踩" [ref=e212] [cursor=pointer]
                  - button "取消收藏" [pressed] [ref=e215] [cursor=pointer]
                  - button "更多消息操作" [ref=e219] [cursor=pointer]
                - button "复制回复" [ref=e221] [cursor=pointer]
                - button "引用选区追问" [ref=e224] [cursor=pointer]
        - status [ref=e227]:
          - text: 当前进展：已完成 · 模型回合 1 · 请求尝试 1 · 只读工具 0 · 0秒 · 用量实际 60 tokens
          - generic [ref=e228]: 请求次数与用量包含标题等辅助请求；保守估算不代表供应商实际扣费。
        - generic [ref=e229]:
          - textbox "输入草稿" [ref=e230]:
            - /placeholder: 写下你的问题…
          - generic [ref=e231]:
            - button "添加附件或引用资料" [ref=e233] [cursor=pointer]
            - button "输入与工具信息" [ref=e237] [cursor=pointer]
            - button "本轮模型" [ref=e242] [cursor=pointer]:
              - generic [ref=e243]: fixture-model
            - button "发送" [disabled] [ref=e246]
```

# Test source

```ts
  110 |       'fixture-model',
  111 |     );
  112 |     const footer = sidebar.locator('.sidebar-footer');
  113 |     await expect(footer).toHaveText('');
  114 |     const footerBefore = await footer.boundingBox();
  115 |     const scroller = sidebar.locator('.sidebar-scroll');
  116 | 
  117 |     await scroller.evaluate((el) => {
  118 |       el.scrollTop = 0;
  119 |     });
  120 |     const brandTop = await sidebar
  121 |       .locator('.sidebar-brand')
  122 |       .evaluate((el) => el.getBoundingClientRect().top);
  123 |     const bounds = (await sidebar.boundingBox())!;
  124 |     await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  125 |     await page.mouse.wheel(0, 500);
  126 |     await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  127 |     expect(
  128 |       await sidebar.locator('.sidebar-brand').evaluate((el) => el.getBoundingClientRect().top),
  129 |     ).toBeLessThan(brandTop);
  130 |     const metrics = await scroller.evaluate((el) => ({
  131 |       scrollTop: el.scrollTop,
  132 |       clientHeight: el.clientHeight,
  133 |       scrollHeight: el.scrollHeight,
  134 |       nestedScrollers: [...el.querySelectorAll('*')]
  135 |         .filter(
  136 |           (child) =>
  137 |             ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) &&
  138 |             child.scrollHeight > child.clientHeight + 1,
  139 |         )
  140 |         .map((child) => child.className),
  141 |       historyScrollTop: el.querySelector('.history')!.scrollTop,
  142 |       savedScroll: JSON.parse(localStorage.getItem('tapkit.layout.' + window.tapkit.windowSlot)!)
  143 |         .sidebarScroll,
  144 |     }));
  145 |     expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  146 |     expect(metrics.nestedScrollers).toEqual([]);
  147 |     expect(metrics.historyScrollTop).toBe(0);
  148 |     expect(metrics.savedScroll).toBeGreaterThan(0);
  149 |     expect(await footer.boundingBox()).toEqual(footerBefore);
  150 |     await expect(footer.getByRole('link', { name: '个人资料与设置', exact: true })).toBeInViewport({
  151 |       ratio: 0.99,
  152 |     });
  153 |     await expect(sidebar.getByRole('link', { name: '设置', exact: true })).toBeInViewport({
  154 |       ratio: 0.99,
  155 |     });
  156 |     await scroller.evaluate((el) => {
  157 |       el.scrollTop = 0;
  158 |     });
  159 |     await writeFile(
  160 |       resolve(evidence, `sidebar-${width}x${height}-${zoom * 100}.json`),
  161 |       JSON.stringify(metrics, null, 2) + '\n',
  162 |     );
  163 | 
  164 |     const input = page.getByRole('textbox', { name: '输入草稿', exact: true });
  165 |     const initial = await input.evaluate((el) => el.clientHeight);
  166 |     await input.fill(Array.from({ length: 6 }, () => '输入框随内容增高').join('\n'));
  167 |     expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(initial);
  168 |     await input.fill(Array.from({ length: 80 }, () => '达到高度上限后滚动').join('\n'));
  169 |     const capped = await input.evaluate((el) => ({
  170 |       height: el.clientHeight,
  171 |       max: parseFloat(getComputedStyle(el).maxHeight),
  172 |       scroll: el.scrollHeight,
  173 |     }));
  174 |     expect(capped.height).toBeLessThanOrEqual(capped.max + 1);
  175 |     expect(capped.scroll).toBeGreaterThan(capped.height);
  176 |     await input.fill('/retained');
  177 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  178 |     await expect(input).toHaveValue('保留的常用提示词内容');
  179 |     await input.fill('界面精简后的发送回归');
  180 |     await composer.getByRole('button', { name: '发送', exact: true }).click();
  181 |     await expect(page.locator('.chat-message.assistant')).toContainText(
  182 |       '隔离测试回复：界面精简后的发送回归',
  183 |     );
  184 |     await expect(page.locator('.chat-message.user')).toHaveCount(1);
  185 |     const answer = page.locator('.chat-message.assistant').last();
  186 |     await expect(answer.getByRole('button', { name: '复制回复', exact: true })).toHaveAttribute(
  187 |       'title',
  188 |       '复制回复',
  189 |     );
  190 |     await answer.getByRole('button', { name: '收藏', exact: true }).click();
  191 |     await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
  192 |       'aria-pressed',
  193 |       'true',
  194 |     );
  195 |     await answer.getByRole('button', { name: '点赞', exact: true }).click();
  196 |     await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
  197 |       'aria-pressed',
  198 |       'true',
  199 |     );
  200 |     await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
  201 |     const more = answer.getByRole('region', { name: '更多消息操作', exact: true });
  202 |     await expect(more.getByRole('button', { name: '删除消息', exact: true })).toBeVisible();
  203 |     const moreBounds = await more.boundingBox();
  204 |     expect(moreBounds!.x).toBeGreaterThanOrEqual(0);
  205 |     expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  206 |     expect(moreBounds!.x + moreBounds!.width).toBeLessThanOrEqual(width + 1);
  207 |     expect(moreBounds!.y + moreBounds!.height).toBeLessThanOrEqual(height + 1);
  208 |     await page.keyboard.press('Escape');
  209 |     const inputHeight = await input.evaluate((el) => el.clientHeight);
> 210 |     expect(inputHeight).toBe(initial);
      |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  211 |     await composer.scrollIntoViewIfNeeded();
  212 |     const row = await composer.locator('.composer-bar').evaluate((el) => ({
  213 |       width: el.clientWidth,
  214 |       scrollWidth: el.scrollWidth,
  215 |       tops: [...el.children].map((child) => child.getBoundingClientRect().top),
  216 |     }));
  217 |     expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
  218 |     expect(Math.max(...row.tops) - Math.min(...row.tops)).toBeLessThanOrEqual(5);
  219 |     await page.screenshot({
  220 |       path: resolve(evidence, `chat-${width}x${height}-${zoom * 100}.png`),
  221 |       animations: 'disabled',
  222 |     });
  223 |   });
  224 | }
  225 | 
```