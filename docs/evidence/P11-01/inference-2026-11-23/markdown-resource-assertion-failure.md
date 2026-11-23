# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-02.chat.spec.ts >> P02-02 T02 malicious Markdown stays inert; GFM, KaTeX, Shiki and static sandbox Mermaid render
- Location: tests\e2e\P02-02.chat.spec.ts:408:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - strong [ref=e8]: TapKit
        - generic [ref=e9]:
          - button "通知" [ref=e12] [cursor=pointer]
          - button "搜索" [ref=e16] [cursor=pointer]
      - button "新建任务" [ref=e20] [cursor=pointer]
      - navigation "主导航" [ref=e24]:
        - generic [ref=e25]: 长按并上下拖动调整顺序，也可按 Alt 加上下方向键。
        - link "聊天" [ref=e26] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e29] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e34] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e37] [cursor=pointer]:
          - /url: /files
        - link "文档画布" [ref=e41] [cursor=pointer]:
          - /url: /canvas
      - region "会话历史" [ref=e47]:
        - generic [ref=e48]:
          - heading "最近" [level=2] [ref=e49]
          - button "会话列表选项" [ref=e52] [cursor=pointer]
        - generic [ref=e54]:
          - button "隔离测试回复：P11-01 普通文本无需公式模块 2026年11月24日 00:57" [ref=e55] [cursor=pointer]:
            - text: 隔离测试回复：P11-01 普通文本无需公式模块
            - generic [ref=e56]: 2026年11月24日 00:57
          - generic [ref=e57]:
            - button "置顶隔离测试回复：P11-01 普通文本无需公式模块" [ref=e59] [cursor=pointer]
            - button "会话信息隔离测试回复：P11-01 普通文本无需公式模块" [ref=e63] [cursor=pointer]
      - generic [ref=e65]:
        - generic [ref=e66]: 本地工作任务可在工作中心查看与管理
        - generic [ref=e67]: 待确认事项：0
    - generic [ref=e68]:
      - link "个人资料与设置" [ref=e69] [cursor=pointer]:
        - /url: /settings/personal
      - link "帮助与反馈" [ref=e74] [cursor=pointer]:
        - /url: /help
      - link "设置" [ref=e77] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e81]
  - generic [ref=e82]:
    - banner [ref=e83]:
      - button "收起侧栏" [expanded] [ref=e86] [cursor=pointer]
      - generic [ref=e89]:
        - button "后退" [ref=e91] [cursor=pointer]
        - button "前进" [disabled] [ref=e95]
      - generic [ref=e98]: 隔离测试回复：P11-01 普通文本无需公式模块
      - group [ref=e99]:
        - generic "连接状态 · 本地已连接" [ref=e100] [cursor=pointer]: 本地已连接
      - button "详情面板" [ref=e103] [cursor=pointer]:
        - generic [ref=e106]: 工作台
    - main [ref=e108]:
      - generic [ref=e110]:
        - generic [ref=e111]:
          - button "会话摘要" [ref=e113] [cursor=pointer]
          - button "记忆与历史范围" [ref=e115] [cursor=pointer]
          - generic [ref=e116]:
            - generic [ref=e117]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e118] [cursor=pointer]:
                - option "主分支 1" [selected]
            - generic [ref=e119]:
              - button "AI 重命名" [ref=e120] [cursor=pointer]
              - button "导出分享副本" [ref=e121] [cursor=pointer]
              - button "导出本会话成果" [ref=e122] [cursor=pointer]
            - group [ref=e123]:
              - generic "当前资料、工具与个性化设置" [ref=e124] [cursor=pointer]
        - generic [ref=e125]:
          - article [ref=e126]:
            - generic [ref=e127]:
              - strong [ref=e128]: 你
              - generic [ref=e129]: 00:57 · 已发送
            - paragraph [ref=e130]: P11-01 普通文本无需公式模块
            - generic [ref=e132]:
              - button "复制回复" [ref=e133] [cursor=pointer]
              - button "引用选区追问" [ref=e138] [cursor=pointer]
              - generic [ref=e141]:
                - button "编辑问题并创建分支" [ref=e143] [cursor=pointer]
                - button "收藏" [ref=e148] [cursor=pointer]
                - button "更多消息操作" [ref=e153] [cursor=pointer]
          - article [ref=e155]:
            - generic [ref=e156]:
              - strong [ref=e157]: TapKit
              - generic [ref=e158]: fixture-model · 00:57 · 已发送
            - group [ref=e159]:
              - paragraph [ref=e161]: 隔离测试回复：P11-01 普通文本无需公式模块
            - generic [ref=e162]:
              - button "使用的记忆与历史参考" [ref=e166] [cursor=pointer]
              - generic [ref=e169]:
                - button "复制回复" [ref=e170] [cursor=pointer]
                - button "引用选区追问" [ref=e175] [cursor=pointer]
                - generic [ref=e178]:
                  - button "重新生成回答" [ref=e180] [cursor=pointer]
                  - button "点赞" [ref=e184] [cursor=pointer]
                  - button "点踩" [ref=e188] [cursor=pointer]
                  - button "收藏" [ref=e192] [cursor=pointer]
                  - button "更多消息操作" [ref=e197] [cursor=pointer]
          - article [ref=e199]:
            - generic [ref=e200]:
              - strong [ref=e201]: 你
              - generic [ref=e202]: 00:57 · 已发送
            - paragraph [ref=e203]: 恶意渲染
            - generic [ref=e205]:
              - button "复制回复" [ref=e206] [cursor=pointer]
              - button "引用选区追问" [ref=e211] [cursor=pointer]
              - generic [ref=e214]:
                - button "编辑问题并创建分支" [ref=e216] [cursor=pointer]
                - button "收藏" [ref=e221] [cursor=pointer]
                - button "更多消息操作" [ref=e226] [cursor=pointer]
          - article [ref=e228]:
            - generic [ref=e229]:
              - strong [ref=e230]: TapKit
              - generic [ref=e231]: fixture-model · 00:57 · 已发送
            - group [ref=e232]:
              - generic [ref=e233]:
                - heading "安全标题" [level=1] [ref=e234]
                - generic [ref=e235]:
                  - button "复制表格"
                  - table [ref=e237]:
                    - rowgroup [ref=e238]:
                      - row [ref=e239]:
                        - columnheader "列" [ref=e240]
                        - columnheader "值" [ref=e241]
                    - rowgroup [ref=e242]:
                      - row [ref=e243]:
                        - cell "中文" [ref=e244]
                        - cell "1" [ref=e245]
                - paragraph [ref=e246]:
                  - generic [ref=e247]:
                    - math [ref=e249]:
                      - generic [ref=e251]:
                        - generic [ref=e252]:
                          - generic [ref=e253]: x
                          - generic [ref=e254]: "2"
                        - generic [ref=e255]: +
                        - generic [ref=e256]: "1"
                    - generic [aria-hidden] [ref=e257]:
                      - generic [ref=e258]:
                        - generic [ref=e259]:
                          - text: x
                          - generic [ref=e260]: "2"
                        - text: +
                      - generic [ref=e265]: "1"
                - generic [ref=e266]:
                  - generic [ref=e267]:
                    - generic [ref=e268]: javascript
                    - button "复制代码" [ref=e269] [cursor=pointer]
                  - code [ref=e274]: const value = 1;
                - generic [ref=e275]:
                  - generic [ref=e276]:
                    - generic [ref=e277]: mermaid
                    - button "复制代码" [ref=e278] [cursor=pointer]
                  - code [ref=e283]: graph TD A[输入] --> B[输出]
                - paragraph [ref=e284]: 危险链接
            - generic [ref=e285]:
              - button "使用的记忆与历史参考" [ref=e289] [cursor=pointer]
              - generic [ref=e292]:
                - button "复制回复" [ref=e293] [cursor=pointer]
                - button "引用选区追问" [ref=e298] [cursor=pointer]
                - generic [ref=e301]:
                  - button "重新生成回答" [ref=e303] [cursor=pointer]
                  - button "点赞" [ref=e307] [cursor=pointer]
                  - button "点踩" [ref=e311] [cursor=pointer]
                  - button "收藏" [ref=e315] [cursor=pointer]
                  - button "更多消息操作" [ref=e320] [cursor=pointer]
        - status [ref=e322]: 当前进展：已完成 · 模型回合 1 · 请求尝试 1 · 只读工具 0 · 0秒 · 用量实际 60 tokens
        - generic [ref=e323]:
          - textbox "输入草稿" [ref=e324]:
            - /placeholder: 写下你的问题...
          - generic [ref=e325]:
            - button "联网与来源：自动" [ref=e327] [cursor=pointer]
            - button "添加附件或引用资料" [ref=e332] [cursor=pointer]
            - button "输入与工具信息" [ref=e337] [cursor=pointer]
            - button "本轮模型" [ref=e343] [cursor=pointer]:
              - generic [ref=e344]: fixture-model
            - button "发送" [disabled] [ref=e347]
```

# Test source

```ts
  335 |   await app.close();
  336 |   page = await launch();
  337 |   await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 850));
  338 |   const restored = (await command(page, 'drafts.get', { sessionId: sid, windowId: '0' })) as Draft;
  339 |   expect(restored.text).toBe(excessive);
  340 |   await page
  341 |     .getByRole('complementary', { name: '侧栏' })
  342 |     .locator('.history-row[data-session-id="' + sid + '"] .history-link')
  343 |     .click();
  344 |   await expect(page.getByLabel('输入草稿')).toHaveValue(excessive);
  345 |   await expect(page.locator('.chat-materials')).toContainText('粘贴内容.txt');
  346 |   await page
  347 |     .locator('.composer-attachment')
  348 |     .getByRole('button', { name: '粘贴内容.txt', exact: true })
  349 |     .click();
  350 |   preview = page.getByRole('region', { name: '文件预览', exact: true });
  351 |   await expect(preview.locator('.viewer-source pre')).toHaveText('长'.repeat(20001));
  352 |   await closePreview();
  353 |   await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 700));
  354 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
  355 |     true,
  356 |   );
  357 |   await page.screenshot({ path: 'docs/evidence/P02-02/narrow-composer.png' });
  358 | });
  359 |
  360 | test('P02-02 T02 history pagination keeps reading position; return to latest restores following', async () => {
  361 |   const page = await launch(),
  362 |     sid = await session(page);
  363 |   for (let n = 0; n < 55; n++)
  364 |     await command(page, 'messages.send', {
  365 |       sessionId: sid,
  366 |       clientMessageId: newId(),
  367 |       text: '滚动样本 ' + n,
  368 |       attachments: [],
  369 |       mode: 'chat',
  370 |     });
  371 |   await expect
  372 |     .poll(
  373 |       async () => {
  374 |         const state = await snapshot(page, sid);
  375 |         return state.run?.status === 'completed' && state.pending.length === 0;
  376 |       },
  377 |       { timeout: 20000 },
  378 |     )
  379 |     .toBe(true);
  380 |   await page.getByRole('button', { name: '加载更早消息', exact: true }).click();
  381 |   await expect(page.locator('.chat-messages .chat-message')).toHaveCount(110);
  382 |   await page.locator('.chat-messages').evaluate((node) => {
  383 |     node.scrollTop = 0;
  384 |     node.dispatchEvent(new Event('scroll', { bubbles: true }));
  385 |   });
  386 |   await command(page, 'messages.send', {
  387 |     sessionId: sid,
  388 |     clientMessageId: newId(),
  389 |     text: '新到回复',
  390 |     attachments: [],
  391 |     mode: 'chat',
  392 |   });
  393 |   await expect(
  394 |     page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }),
  395 |   ).toBeVisible();
  396 |   expect(await page.locator('.chat-messages').evaluate((node) => node.scrollTop)).toBeLessThan(10);
  397 |   await page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }).click();
  398 |   await expect
  399 |     .poll(() =>
  400 |       page
  401 |         .locator('.chat-messages')
  402 |         .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
  403 |     )
  404 |     .toBeLessThanOrEqual(80);
  405 |   await expect(page.locator('.chat-message').last()).toContainText('新到回复');
  406 | });
  407 |
  408 | test('P02-02 T02 malicious Markdown stays inert; GFM, KaTeX, Shiki and static sandbox Mermaid render', async () => {
  409 |   const page = await launch();
  410 |   const remote: string[] = [];
  411 |   page.on('request', (r) => {
  412 |     if (/^https?:/.test(r.url())) remote.push(r.url());
  413 |   });
  414 |   await page.getByLabel('输入草稿').fill('P11-01 普通文本无需公式模块');
  415 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  416 |   await expect(page.locator('.chat-message.assistant .chat-markdown').first()).toBeVisible();
  417 |   expect(
  418 |     await page.evaluate(() =>
  419 |       performance
  420 |         .getEntriesByType('resource')
  421 |         .some((entry) => /chat-math-[^/]+\.js(?:$|\?)/.test(entry.name)),
  422 |     ),
  423 |   ).toBe(false);
  424 |   await page.getByLabel('输入草稿').fill('恶意渲染');
  425 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  426 |   await expect(page.getByRole('heading', { name: '安全标题', exact: true })).toBeVisible();
  427 |   await expect(page.locator('.chat-table table')).toContainText('中文');
  428 |   await expect(page.locator('.katex')).toBeVisible();
  429 |   expect(
  430 |     await page.evaluate(() =>
  431 |       performance
  432 |         .getEntriesByType('resource')
  433 |         .some((entry) => /chat-math-[^/]+\.js(?:$|\?)/.test(entry.name)),
  434 |     ),
> 435 |   ).toBe(true);
      |     ^ Error: expect(received).toBe(expected) // Object.is equality
  436 |   await expect(page.locator('.chat-code code span').first()).toBeVisible();
  437 |   await expect(page.getByTitle('静态图表')).toHaveAttribute('sandbox', '');
  438 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toBeVisible();
  439 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输入');
  440 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输出');
  441 |   console.log(
  442 |     'P02_SYNTHETIC_DIAGRAM_BOUNDS',
  443 |     await page
  444 |       .frameLocator('iframe[title="静态图表"]')
  445 |       .locator('svg')
  446 |       .evaluate((svg) => {
  447 |         const box = svg.getBoundingClientRect();
  448 |         return {
  449 |           width: box.width,
  450 |           height: box.height,
  451 |           viewportWidth: innerWidth,
  452 |           viewportHeight: innerHeight,
  453 |         };
  454 |       }),
  455 |   );
  456 |   expect(
  457 |     await page
  458 |       .frameLocator('iframe[title="静态图表"]')
  459 |       .locator('svg')
  460 |       .evaluate((svg) => {
  461 |         const box = svg.getBoundingClientRect();
  462 |         return box.width <= innerWidth && box.height <= innerHeight;
  463 |       }),
  464 |   ).toBe(true);
  465 |   expect(
  466 |     await page.evaluate(() => ({
  467 |       badLinks: document.querySelectorAll('a[href^="javascript:"]').length,
  468 |       images: document.querySelectorAll('.chat-markdown img').length,
  469 |       pwned: Reflect.get(window, 'fixturePwned') ?? false,
  470 |     })),
  471 |   ).toEqual({ badLinks: 0, images: 0, pwned: false });
  472 |   expect(remote).toEqual([]);
  473 |   await page.getByTitle('静态图表').screenshot({ path: 'docs/evidence/P02-02/static-diagram.png' });
  474 |   await page.screenshot({ path: 'docs/evidence/P02-02/safe-markdown.png' });
  475 | });
  476 |
```
