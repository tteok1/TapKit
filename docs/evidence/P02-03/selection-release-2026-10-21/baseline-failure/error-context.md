# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.selection-release.spec.ts >> P02-03 selection release outside highlighted text keeps native selection actions
- Location: tests\e2e\P02-03.selection-release.spec.ts:11:1

# Error details

```
Error: start-left-margin

expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: '选区操作', exact: true })
Expected: visible
Timeout: 500ms
Error: element(s) not found

Call log:
  - start-left-margin getByRole('toolbar', { name: '选区操作', exact: true }) with timeout 500ms
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
    - button "隔离测试回复： 前文。 The amber lighthou 2026/10/21 23:09:48"
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
    - text: 23:09:48 · 已发送
    - paragraph: 前文。 The amber lighthouse guides a small boat safely home. 后文。
    - button "复制回复"
    - button "引用选区追问"
    - button "编辑问题并创建分支"
    - button "收藏"
    - button "更多消息操作"
  - article:
    - strong: TapKit
    - text: fixture-model · 23:09:48 · 已发送
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
Error: after-next-paragraph

expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: '选区操作', exact: true })
Expected: visible
Timeout: 500ms
Error: element(s) not found

Call log:
  - after-next-paragraph getByRole('toolbar', { name: '选区操作', exact: true }) with timeout 500ms
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
    - button "隔离测试回复： 前文。 The amber lighthou 2026/10/21 23:09:48"
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
    - text: 23:09:48 · 已发送
    - paragraph: 前文。 The amber lighthouse guides a small boat safely home. 后文。
    - button "复制回复"
    - button "引用选区追问"
    - button "编辑问题并创建分支"
    - button "收藏"
    - button "更多消息操作"
  - article:
    - strong: TapKit
    - text: fixture-model · 23:09:48 · 已发送
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

# Test source

```ts
  1  | import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
  2  | import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  3  | import { resolve } from 'node:path';
  4  | let app: ElectronApplication;
  5  | const evidence = resolve('docs/evidence/P02-03/selection-release-2026-10-21');
  6  | const sentence = 'The amber lighthouse guides a small boat safely home.';
  7  | test.afterEach(async () => {
  8  |   await app?.close();
  9  | });
  10 | 
  11 | test('P02-03 selection release outside highlighted text keeps native selection actions', async () => {
  12 |   test.setTimeout(180_000);
  13 |   await mkdir('.test-data', { recursive: true });
  14 |   await mkdir(evidence, { recursive: true });
  15 |   const dir = await mkdtemp(resolve('.test-data/P02-03 selection trigger '));
  16 |   await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  17 |   const env = Object.fromEntries(
  18 |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
  19 |       (r): r is [string, string] => r[1] !== undefined,
  20 |     ),
  21 |   );
  22 |   delete env.ELECTRON_RUN_AS_NODE;
  23 |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  24 |   const page = await app.firstWindow();
  25 |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  26 |   await app.evaluate(({ BrowserWindow }) =>
  27 |     BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
  28 |   );
  29 |   await page.keyboard.press('Control+n');
  30 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  31 |   const input = page.getByLabel('输入草稿', { exact: true });
  32 |   await input.fill('\n\n前文。\n\n' + sentence + '\n\n后文。\n\n');
  33 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  34 |   const paragraph = page
  35 |     .locator('.chat-message.assistant .chat-markdown p')
  36 |     .filter({ hasText: sentence });
  37 |   await expect(paragraph).toBeVisible();
  38 |   await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  39 |   const toolbar = page.getByRole('toolbar', { name: '选区操作', exact: true });
  40 |   const observations: unknown[] = [];
  41 |   await page.evaluate(() => {
  42 |     const events: unknown[] = [];
  43 |     Object.assign(window, { releaseEvents: events });
  44 |     for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'selectionchange', 'scroll']) {
  45 |       document.addEventListener(type, (e) => {
  46 |         const s = window.getSelection();
  47 |         const r = s?.rangeCount ? s.getRangeAt(0) : undefined;
  48 |         const describe = (n?: Node | null) => n?.nodeType === Node.TEXT_NODE ? n.parentElement?.tagName + '#text' : (n as Element)?.tagName;
  49 |         events.push({ type, target: (e.target as Element)?.className, text:s?.toString(), start:describe(r?.startContainer),end:describe(r?.endContainer), startOffset:r?.startOffset,endOffset:r?.endOffset });
  50 |       }, true);
  51 |     }
  52 |   });
  53 |   for (const scenario of ['after-text', 'before-text', 'below-line', 'above-line', 'start-left-margin', 'start-above-line', 'after-next-paragraph', 'before-previous-paragraph']) {
  54 |     await page.keyboard.press('Escape');
  55 |     await page.evaluate(() => {
  56 |       (document.activeElement as HTMLElement)?.blur();
  57 |       window.getSelection()?.removeAllRanges();
  58 |     });
  59 |     await paragraph.evaluate((el) => el.scrollIntoView({ block:'center' }));
  60 |     await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  61 |     const points=await paragraph.evaluate(el=>{
  62 |       const text=el.firstChild!; const r=document.createRange();
  63 |       r.setStart(text,0);r.setEnd(text,1);const first=r.getBoundingClientRect();
  64 |       r.setStart(text,text.textContent!.length-1);r.setEnd(text,text.textContent!.length);const last=r.getBoundingClientRect();
  65 |       const rect=el.getBoundingClientRect();
  66 |       return {first:{x:first.left+.5,y:first.top+first.height/2}, last:{x:last.right-.5,y:last.top+last.height/2},rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}};
  67 |     });
  68 |     const {first,last,rect}=points;
  69 |     let start=first,end={x:last.x+12,y:last.y};
  70 |     if(scenario==='before-text'){start=last;end={x:first.x-12,y:first.y}}
  71 |     if(scenario==='below-line')end={x:last.x+12,y:rect.bottom+6};
  72 |     if(scenario==='above-line'){start=last;end={x:first.x-12,y:rect.top-6}}
  73 |     if(scenario==='start-left-margin'){start={x:first.x-6,y:first.y}}
  74 |     if(scenario==='start-above-line'){start={x:first.x,y:rect.top-4}}
  75 |     if(scenario==='after-next-paragraph')end={x:last.x+12,y:rect.bottom+38};
  76 |     if(scenario==='before-previous-paragraph'){start=last;end={x:first.x-12,y:rect.top-38}}
  77 |     await page.evaluate(()=>((window as unknown as {releaseEvents:unknown[]}).releaseEvents.length=0));
  78 |     await page.mouse.move(start.x,start.y);await page.mouse.down();
  79 |     await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
  80 |     await page.waitForTimeout(150);
  81 |     const released = await page.evaluate(()=>({text:window.getSelection()?.toString(),events:(window as unknown as {releaseEvents:unknown[]}).releaseEvents}));
  82 |     const beforeMove=await toolbar.isVisible();
  83 |     await page.mouse.move(rect.right-20,rect.top-40,{steps:5});
  84 |     await page.waitForTimeout(150);
  85 |     const afterMove=await toolbar.isVisible();
  86 |     observations.push({scenario,start,end,...released,beforeMove,afterMove});
> 87 |     if (released.text?.trim()) await expect.soft(toolbar,scenario).toBeVisible({timeout:500});
     |                                                                    ^ Error: after-next-paragraph
  88 |   }
  89 |   await writeFile(resolve(evidence,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  90 | });
  91 | 
```