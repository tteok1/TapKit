# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.translation.spec.ts >> P02-03 translation echo shows an explicit failed translation without marking completion
- Location: tests\e2e\P02-03.translation.spec.ts:11:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('toolbar', { name: '选区操作', exact: true }).getByRole('button', { name: '翻译', exact: true })
    - locator resolved to <button title="翻译">翻译</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is not visible
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    11 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link "TapKit 首页" [ref=e7] [cursor=pointer]:
          - /url: /
          - strong [ref=e8]: TapKit
        - button "收起侧栏" [ref=e9] [cursor=pointer]
      - generic [ref=e12]:
        - button "临时聊天" [ref=e13] [cursor=pointer]
        - button "新建聊天" [ref=e16] [cursor=pointer]
        - button "新建工作" [ref=e19] [cursor=pointer]
        - button "新建项目" [ref=e22] [cursor=pointer]
      - navigation "主导航" [ref=e25]:
        - button "搜索" [ref=e26] [cursor=pointer]:
          - generic [ref=e30]: Ctrl K
        - link "聊天" [ref=e31] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e34] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e37] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e40] [cursor=pointer]:
          - /url: /files
        - link "通知" [ref=e43] [cursor=pointer]:
          - /url: /notifications
        - group [ref=e46]:
          - generic "调整导航入口" [ref=e47] [cursor=pointer]
      - region "会话历史" [ref=e49]:
        - generic [ref=e50]:
          - button "最近" [pressed] [ref=e51] [cursor=pointer]
          - button "归档" [ref=e52] [cursor=pointer]
          - button "回收站" [ref=e53] [cursor=pointer]
          - button "全部" [ref=e54] [cursor=pointer]
        - button "新建分组" [ref=e55] [cursor=pointer]
        - button "默认列表" [pressed] [ref=e56] [cursor=pointer]
        - heading "最近" [level=2] [ref=e57]
        - generic [ref=e58]:
          - 'button "隔离测试回复： # P02批测1019 The amber 2026/10/21 23:36:02" [ref=e59] [cursor=pointer]':
            - text: "隔离测试回复： # P02批测1019 The amber"
            - generic [ref=e60]: 2026/10/21 23:36:02
          - 'button "置顶隔离测试回复： # P02批测1019 The amber" [ref=e61] [cursor=pointer]'
          - 'button "会话信息隔离测试回复： # P02批测1019 The amber" [ref=e64] [cursor=pointer]': ⋯
      - generic [ref=e65]:
        - generic [ref=e66]: 任务执行尚未开放
        - generic [ref=e67]: 待确认事项：0
    - generic [ref=e68]:
      - link "个人资料与设置" [ref=e69] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e74] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e77]
  - generic [ref=e78]:
    - banner [ref=e79]:
      - button "后退" [ref=e80] [cursor=pointer]
      - button "前进" [ref=e83] [cursor=pointer]
      - link "首页" [ref=e86] [cursor=pointer]:
        - /url: /
      - generic [ref=e87]: "隔离测试回复： # P02批测1019 The amber"
      - group [ref=e88]:
        - generic "连接状态" [ref=e89] [cursor=pointer]
      - button "详情面板" [ref=e91] [cursor=pointer]:
        - generic [ref=e94]: 工作台
    - main [ref=e96]:
      - generic [ref=e98]:
        - generic [ref=e99]:
          - button "会话摘要" [ref=e101] [cursor=pointer]
          - button "记忆与历史范围" [ref=e103] [cursor=pointer]
          - generic [ref=e104]:
            - generic [ref=e105]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e106]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e107] [cursor=pointer]
            - button "导出 Markdown" [ref=e108] [cursor=pointer]
            - group [ref=e109]:
              - generic "当前资料、工具与个性化设置" [ref=e110] [cursor=pointer]
        - generic [ref=e111]:
          - article [ref=e112]:
            - generic [ref=e113]:
              - strong [ref=e114]: 你
              - generic [ref=e115]: 23:36:02 · 已发送
            - paragraph [ref=e116]: "# P02批测1019 The amber lighthouse guides a small boat safely home."
            - generic [ref=e118]:
              - button "复制回复" [ref=e119] [cursor=pointer]
              - button "引用选区追问" [ref=e122] [cursor=pointer]
              - generic [ref=e125]:
                - button "编辑问题并创建分支" [ref=e126] [cursor=pointer]
                - button "收藏" [ref=e129] [cursor=pointer]
                - button "更多消息操作" [ref=e133] [cursor=pointer]
          - article [ref=e135]:
            - generic [ref=e136]:
              - strong [ref=e137]: TapKit
              - generic [ref=e138]: fixture-model · 23:36:02 · 已发送
            - group [ref=e139]:
              - generic [ref=e140]:
                - paragraph [ref=e141]: 隔离测试回复：
                - heading "P02批测1019" [level=1] [ref=e142]
                - paragraph [ref=e143]: The amber lighthouse guides a small boat safely home.
            - generic [ref=e144]:
              - button "使用的记忆与历史参考" [ref=e147] [cursor=pointer]
              - generic [ref=e150]:
                - button "复制回复" [ref=e151] [cursor=pointer]
                - button "引用选区追问" [ref=e154] [cursor=pointer]
                - generic [ref=e157]:
                  - button "重新生成回答" [ref=e158] [cursor=pointer]
                  - button "点赞" [ref=e161] [cursor=pointer]
                  - button "点踩" [ref=e164] [cursor=pointer]
                  - button "收藏" [ref=e167] [cursor=pointer]
                  - button "更多消息操作" [ref=e171] [cursor=pointer]
        - status [ref=e173]: 当前进展：已完成 · 模型回合 1 · 请求尝试 2 · 只读工具 0 · 0秒 · 用量实际 120 tokens
        - generic [ref=e174]:
          - textbox "输入草稿" [ref=e175]:
            - /placeholder: 写下你的问题…
          - generic [ref=e176]:
            - button "添加附件或引用资料" [ref=e178] [cursor=pointer]
            - button "输入与工具信息" [ref=e182] [cursor=pointer]
            - button "本轮模型" [ref=e187] [cursor=pointer]:
              - generic [ref=e188]: fixture-model
            - button "发送" [disabled] [ref=e191]
```

# Test source

```ts
  1  | import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
  2  | import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  3  | import { resolve } from 'node:path';
  4  | let app: ElectronApplication;
  5  | const evidence = resolve('docs/evidence/P02-03/translation-target-2026-10-21');
  6  | const sentence = 'The amber lighthouse guides a small boat safely home.';
  7  | test.afterEach(async () => {
  8  |   await app?.close();
  9  | });
  10 | 
  11 | test('P02-03 translation echo shows an explicit failed translation without marking completion', async () => {
  12 |   test.setTimeout(180_000);
  13 |   await mkdir('.test-data', { recursive: true });
  14 |   await mkdir(evidence, { recursive: true });
  15 |   const dir = await mkdtemp(resolve('.test-data/P02-03 selection trigger '));
  16 |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  17 |   const env = Object.fromEntries(
  18 |     Object.entries({
  19 |       ...process.env,
  20 |       TAPKIT_DATA_DIR: dir,
  21 |       TAPKIT_CHAT_FIXTURE: 'P02-02',
  22 |       TAPKIT_TRANSLATION_ECHO_FIXTURE: '1',
  23 |     }).filter((r): r is [string, string] => r[1] !== undefined),
  24 |   );
  25 |   delete env.ELECTRON_RUN_AS_NODE;
  26 |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  27 |   const page = await app.firstWindow();
  28 |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  29 |   await app.evaluate(({ BrowserWindow }) =>
  30 |     BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
  31 |   );
  32 |   await page.keyboard.press('Control+n');
  33 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  34 |   const input = page.getByLabel('输入草稿', { exact: true });
  35 |   await input.fill('\n\n# P02批测1019\n\n' + sentence + '\n\n');
  36 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  37 |   const paragraph = page
  38 |     .locator('.chat-message.assistant .chat-markdown p')
  39 |     .filter({ hasText: sentence });
  40 |   await expect(paragraph).toBeVisible();
  41 |   await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  42 |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  43 |   await paragraph.evaluate((el) => {
  44 |     (document.activeElement as HTMLElement)?.blur();
  45 |     const range = document.createRange();
  46 |     range.selectNodeContents(el);
  47 |     window.getSelection()!.removeAllRanges();
  48 |     window.getSelection()!.addRange(range);
  49 |   });
  50 |   await expect(toolbar).toBeVisible();
> 51 |   await toolbar.getByRole('button', { name: '翻译', exact: true }).click();
     |                                                                  ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  52 |   await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  53 |   const answer = page.locator('.chat-message.assistant').last();
  54 |   await expect(answer.locator('.chat-markdown')).toHaveText(sentence);
  55 |   await expect(answer).toContainText('翻译未完成：模型原样返回了所选内容。请重试或换一个模型。');
  56 |   await expect(page.locator('.chat-progress[role="status"]')).toContainText('部分完成');
  57 |   for (const width of [1440, 960]) {
  58 |     await app.evaluate(
  59 |       ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
  60 |       width,
  61 |     );
  62 |     await answer.scrollIntoViewIfNeeded();
  63 |     await page.screenshot({ path: resolve(evidence, `translation-echo-${width}.png`) });
  64 |   }
  65 |   const summary = await page.evaluate(async () => {
  66 |     const sessionId = document.querySelector<HTMLElement>('.chat-surface')!.dataset.sessionId!;
  67 |     const requestId = crypto.randomUUID().replace(/^(.{14})./, (_, s: string) => s + '7');
  68 |     const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', { sessionId });
  69 |     if (!r.ok || !('messages' in r.data)) throw new Error('SNAPSHOT_FAILED');
  70 |     return {
  71 |       status: r.data.run?.status,
  72 |       errorCode: r.data.run?.errorCode,
  73 |       calls: r.data.run?.calls,
  74 |       answer: r.data.messages.at(-1)?.status,
  75 |     };
  76 |   });
  77 |   expect(summary).toMatchObject({
  78 |     status: 'partial',
  79 |     errorCode: 'TRANSLATION_UNCHANGED',
  80 |     calls: 1,
  81 |     answer: 'interrupted',
  82 |   });
  83 |   await writeFile(
  84 |     resolve(evidence, 'translation-echo-ui.json'),
  85 |     JSON.stringify(summary, null, 2) + '\n',
  86 |   );
  87 | });
  88 | 
```