# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.selection-release.spec.ts >> P02-03 selection release outside highlighted text keeps native selection actions
- Location: tests\e2e\P02-03.selection-release.spec.ts:11:1

# Error details

```
Error: after-next-paragraph

expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: '选区操作', exact: true })
Expected: visible
Timeout: 1000ms
Error: element(s) not found

Call log:
  - after-next-paragraph getByRole('toolbar', { name: '选区操作', exact: true }) with timeout 1000ms
  - waiting for getByRole('toolbar', { name: '选区操作', exact: true })

```

```yaml
- complementary "侧栏":
  - link "TapKit 首页":
    - /url: /
    - strong: TapKit
  - button "收起侧栏"
  - button "临时聊天"
  - button "新建聊天"
  - button "新建工作"
  - button "新建项目"
  - navigation "主导航":
    - button "搜索": 搜索 Ctrl K
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
    - group: 调整导航入口
  - region "会话历史":
    - button "最近" [pressed]
    - button "归档"
    - button "回收站"
    - button "全部"
    - button "新建分组"
    - button "默认列表" [pressed]
    - heading "最近" [level=2]
    - button "隔离测试回复： 前文。 The amber lighthou 2026/10/21 23:12:46"
    - button "置顶隔离测试回复： 前文。 The amber lighthou"
    - button "会话信息隔离测试回复： 前文。 The amber lighthou": ⋯
  - text: 任务执行尚未开放 待确认事项：0
  - link "个人资料与设置":
    - /url: /settings/personal
  - link "设置":
    - /url: /settings/general
  - separator "调整侧栏宽度"
- banner:
  - button "后退"
  - button "前进"
  - link "首页":
    - /url: /
  - text: 隔离测试回复： 前文。 The amber lighthou
  - group: 连接状态
  - button "详情面板": 工作台
- main:
  - button "会话摘要"
  - button "记忆与历史范围"
  - text: 消息分支 / 回答版本
  - combobox "消息分支 / 回答版本":
    - option "主分支 1" [selected]
  - button "AI 重命名"
  - button "导出 Markdown"
  - group: 当前资料、工具与个性化设置
  - article:
    - strong: 你
    - text: 23:12:46 · 已发送
    - paragraph: 前文。 The amber lighthouse guides a small boat safely home. 后文。
    - button "复制回复"
    - button "引用选区追问"
    - button "编辑问题并创建分支"
    - button "收藏"
    - button "更多消息操作"
  - article:
    - strong: TapKit
    - text: fixture-model · 23:12:46 · 已发送
    - group:
      - paragraph: 隔离测试回复：
      - paragraph: 前文。
      - paragraph: The amber lighthouse guides a small boat safely home.
      - paragraph: 后文。
    - button "使用的记忆与历史参考"
    - button "复制回复"
    - button "引用选区追问"
    - button "重新生成回答"
    - button "点赞"
    - button "点踩"
    - button "收藏"
    - button "更多消息操作"
  - status: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
  - textbox "输入草稿":
    - /placeholder: 写下你的问题…
  - button "添加附件或引用资料"
  - button "输入与工具信息"
  - button "本轮模型": fixture-model
  - button "发送" [disabled]
```

```
Error: expect(received).toBe(expected) // Object.is equality

- Expected  -  0
+ Received  + 20

+ 前文。
+
+ The amber lighthouse guides a small boat safely home.
+
+ 后文。
+
+
+
+
+
+
+
+ TapKit
+ fixture-model · 23:12:46 · 已发送
+ 隔离测试回复：
+
+ 前文。
+
+ The amber lighthouse guides a small boat safely home.
+
  后文。

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Test source

```ts
  102 |         last: { x: last.right - 0.5, y: last.top + last.height / 2 },
  103 |         rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
  104 |       };
  105 |     });
  106 |     const { first, last, rect } = points;
  107 |     let start = first,
  108 |       end = { x: last.x + 12, y: last.y };
  109 |     if (scenario === 'before-text') {
  110 |       start = last;
  111 |       end = { x: first.x - 12, y: first.y };
  112 |     }
  113 |     if (scenario === 'below-line') end = { x: last.x + 12, y: rect.bottom + 6 };
  114 |     if (scenario === 'above-line') {
  115 |       start = last;
  116 |       end = { x: first.x - 12, y: rect.top - 6 };
  117 |     }
  118 |     if (scenario === 'start-left-margin') {
  119 |       start = { x: first.x - 6, y: first.y };
  120 |     }
  121 |     if (scenario === 'start-above-line') {
  122 |       start = { x: first.x, y: rect.top - 4 };
  123 |     }
  124 |     if (scenario === 'after-next-paragraph') end = { x: last.x + 12, y: rect.bottom + 38 };
  125 |     if (scenario === 'before-previous-paragraph') {
  126 |       start = last;
  127 |       end = { x: first.x - 12, y: rect.top - 38 };
  128 |     }
  129 |     await page.evaluate(
  130 |       () => ((window as unknown as { releaseEvents: unknown[] }).releaseEvents.length = 0),
  131 |     );
  132 |     await page.mouse.move(start.x, start.y);
  133 |     await page.mouse.down();
  134 |     await page.mouse.move(end.x, end.y, { steps: 12 });
  135 |     await page.mouse.up();
  136 |     await page.waitForTimeout(150);
  137 |     const released = await page.evaluate(() => ({
  138 |       text: window.getSelection()?.toString(),
  139 |       events: (window as unknown as { releaseEvents: unknown[] }).releaseEvents,
  140 |     }));
  141 |     const beforeMove = await toolbar.isVisible();
  142 |     await page.mouse.move(rect.right - 20, rect.top - 40, { steps: 5 });
  143 |     await page.waitForTimeout(150);
  144 |     const afterMove = await toolbar.isVisible();
  145 |     observations.push({ scenario, start, end, ...released, beforeMove, afterMove });
  146 |     expect.soft(released.text?.trim(), scenario + ' native selection').toBeTruthy();
  147 |     await expect.soft(toolbar, scenario).toBeVisible({ timeout: 1000 });
  148 |     if (scenario === 'start-left-margin')
  149 |       await page.screenshot({ path: resolve(evidence, 'margin-release-desktop.png') });
  150 |   }
  151 |   await writeFile(
  152 |     resolve(evidence, 'observations.json'),
  153 |     JSON.stringify(observations, null, 2) + '\n',
  154 |   );
  155 |   await page.keyboard.press('Escape');
  156 |   await expect(toolbar).toBeHidden();
  157 |   await input.click();
  158 |   await input.fill('输入框选区不触发正文操作');
  159 |   await page.keyboard.press('Control+a');
  160 |   await expect(toolbar).toBeHidden();
  161 |   // A drag crossing a message header/body must not silently transform a subset.
  162 |   await page.evaluate(() => {
  163 |     (document.activeElement as HTMLElement)?.blur();
  164 |     const user = document.querySelector('.chat-message.user .chat-user-text')!;
  165 |     const assistant = document.querySelector('.chat-message.assistant .chat-markdown')!;
  166 |     const range = document.createRange();
  167 |     range.setStart(user.firstChild!, 0);
  168 |     range.setEnd(assistant, assistant.childNodes.length);
  169 |     window.getSelection()!.removeAllRanges();
  170 |     window.getSelection()!.addRange(range);
  171 |   });
  172 |   await page.waitForTimeout(100);
  173 |   await expect(toolbar).toBeHidden();
  174 |   // End below the last paragraph so the native endpoint extends outside Markdown.
  175 |   const lastParagraph = page
  176 |     .locator('.chat-message.assistant .chat-markdown p')
  177 |     .filter({ hasText: '后文。' });
  178 |   await lastParagraph.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  179 |   await page.evaluate(
  180 |     () =>
  181 |       new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  182 |   );
  183 |   const lastPoints = await lastParagraph.evaluate((el) => {
  184 |     const r = document.createRange();
  185 |     r.setStart(el.firstChild!, 0);
  186 |     r.setEnd(el.firstChild!, 1);
  187 |     const first = r.getBoundingClientRect();
  188 |     const rect = el.getBoundingClientRect();
  189 |     return {
  190 |       x: first.left + 0.5,
  191 |       y: first.top + first.height / 2,
  192 |       endX: first.left + 100,
  193 |       endY: rect.bottom + 28,
  194 |     };
  195 |   });
  196 |   await page.mouse.move(lastPoints.x, lastPoints.y);
  197 |   await page.mouse.down();
  198 |   await page.mouse.move(lastPoints.endX, lastPoints.endY, { steps: 12 });
  199 |   await page.mouse.up();
  200 |   await expect
  201 |     .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
> 202 |     .toBe('后文。');
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  203 |   await expect(toolbar).toBeVisible();
  204 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
  205 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  206 |   await expect(
  207 |     page
  208 |       .locator('.chat-message.assistant')
  209 |       .last()
  210 |       .getByRole('button', { name: '所选原文（1）', exact: true }),
  211 |   ).toBeVisible();
  212 | });
  213 | 
```