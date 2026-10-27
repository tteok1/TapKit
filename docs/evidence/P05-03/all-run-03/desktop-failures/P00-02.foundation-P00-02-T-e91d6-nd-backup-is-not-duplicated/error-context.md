# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P00-02.foundation.spec.ts >> P00-02 T05 Core kill rebuilds writer; acked settings survive and backup is not duplicated
- Location: tests\e2e\P00-02.foundation.spec.ts:165:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('core-status')
Expected: "本地核心已连接"
Received: "正在检查本地核心…"
Timeout:  15000ms

Call log:
  - Expect "toHaveText" getByTestId('core-status') with timeout 15000ms
  - waiting for getByTestId('core-status')
    30 × locator resolved to <span data-testid="core-status">正在检查本地核心…</span>
       - unexpected value "正在检查本地核心…"

```

```yaml
- complementary "侧栏":
  - strong: TapKit
  - button "通知"
  - button "搜索"
  - button "新建任务" [disabled]
  - navigation "主导航":
    - text: 长按并上下拖动调整顺序，也可按 Alt 加上下方向键。
    - link "聊天":
      - /url: /chats
    - link "工作":
      - /url: /work
    - link "项目":
      - /url: /projects
    - link "文件":
      - /url: /files
  - region "会话历史":
    - heading "最近" [level=2]
    - button "会话列表选项"
    - paragraph: 暂无会话
  - text: 任务执行尚未开放 待确认事项：—
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
    - text: 联网搜索
    - combobox "联网搜索":
      - option "自动" [selected]
      - option "开启"
      - option "关闭"
    - button "联网与来源"
    - textbox "输入草稿":
      - /placeholder: 写下你的问题...
    - button "添加附件或引用资料"
    - button "输入与工具信息"
    - button "本轮模型": 连接模型后发送
    - button "发送" [disabled]
```

# Test source

```ts
  1   | import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
  2   | import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
  3   | import { resolve, join } from 'node:path';
  4   | import { spawn } from 'node:child_process';
  5   | import { randomUUID } from 'node:crypto';
  6   | let app: ElectronApplication, dataDir: string;
  7   | function id() {
  8   |   const h = Date.now().toString(16).padStart(12, '0'),
  9   |     r = randomUUID();
  10  |   return h.slice(0, 8) + '-' + h.slice(8) + '-7' + r.slice(15);
  11  | }
  12  | test.beforeEach(async () => {
  13  |   await mkdir('.test-data', { recursive: true });
  14  |   dataDir = await mkdtemp(resolve('.test-data', 'P00-02 Electron 中文 '));
  15  |   const env = Object.fromEntries(
  16  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
  17  |       (p): p is [string, string] => p[1] !== undefined,
  18  |     ),
  19  |   );
  20  |   delete env.ELECTRON_RUN_AS_NODE;
  21  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  22  |   app.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));
  23  |   app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
> 24  |   await expect((await app.firstWindow()).getByTestId('core-status')).toHaveText('本地核心已连接');
      |                                                                      ^ Error: expect(locator).toHaveText(expected) failed
  25  | });
  26  | test.afterEach(async () => {
  27  |   if (app) await app.close();
  28  | });
  29  | test('P00-02 T01 T05 real two-window CAS and committed event subscription', async () => {
  30  |   const page = await app.firstWindow();
  31  |   const first = await page.evaluate((requestId) => window.tapkit.bootstrap({ requestId }), id());
  32  |   expect(first.ok).toBe(true);
  33  |   if (!first.ok || !('profile' in first.data)) throw new Error('bootstrap failed');
  34  |   const profileId = first.data.profile.id;
  35  |   await page.evaluate(async (requestId) => {
  36  |     (window as unknown as { received: number[] }).received = [];
  37  |     await window.tapkit.subscribeEvents(
  38  |       { requestId },
  39  |       { streamId: 'profile', afterSeq: 0 },
  40  |       (event) => (window as unknown as { received: number[] }).received.push(event.seq),
  41  |     );
  42  |   }, id());
  43  |   const newWindow = app.waitForEvent('window');
  44  |   await app.evaluate(({ Menu }) => {
  45  |     const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items[0];
  46  |     if (!item) throw new Error('menu missing');
  47  |     item.click();
  48  |   });
  49  |   const second = await newWindow;
  50  |   await expect(second.getByTestId('core-status')).toHaveText('本地核心已连接');
  51  |   const requestId = id();
  52  |   const a = await page.evaluate(
  53  |     ({ requestId, profileId }) =>
  54  |       window.tapkit.setSettings(
  55  |         { requestId, expectedRevision: 1 },
  56  |         { scope: { type: 'profile', id: profileId }, patch: { memoryEnabled: false } },
  57  |       ),
  58  |     { requestId, profileId },
  59  |   );
  60  |   expect(a.ok).toBe(true);
  61  |   const repeat = await second.evaluate(
  62  |     ({ requestId, profileId }) =>
  63  |       window.tapkit.setSettings(
  64  |         { requestId, expectedRevision: 1 },
  65  |         { scope: { type: 'profile', id: profileId }, patch: { memoryEnabled: false } },
  66  |       ),
  67  |     { requestId, profileId },
  68  |   );
  69  |   expect(repeat).toEqual(a);
  70  |   const conflict = await second.evaluate(
  71  |     ({ requestId, profileId }) =>
  72  |       window.tapkit.setSettings(
  73  |         { requestId, expectedRevision: 1 },
  74  |         { scope: { type: 'profile', id: profileId }, patch: { historyEnabled: false } },
  75  |       ),
  76  |     { requestId: id(), profileId },
  77  |   );
  78  |   expect(conflict).toMatchObject({ ok: false, error: { code: 'CONFLICT', currentRevision: 2 } });
  79  |   await expect
  80  |     .poll(() => page.evaluate(() => (window as unknown as { received: number[] }).received))
  81  |     .toEqual([1]);
  82  |   expect(await page.evaluate(() => Object.keys(window.tapkit))).not.toContain('invoke');
  83  |   const ping1 = await page.evaluate(() => window.tapkit.ping({ nonce: 'one' }));
  84  |   const ping2 = await second.evaluate(() => window.tapkit.ping({ nonce: 'two' }));
  85  |   expect(ping1.corePid).toBe(ping2.corePid);
  86  | });
  87  | test('P00-02 T19 real Windows safeStorage round trip, ACL and plaintext exclusion', async () => {
  88  |   const page = await app.firstWindow(),
  89  |     key = 'P00-02-fixture-' + randomUUID(),
  90  |     requestId = id();
  91  |   const result = await page.evaluate(
  92  |     ({ requestId, key }) =>
  93  |       window.tapkit.saveApiKey({ requestId }, { providerId: 'deepseek', label: '本地测试', key }),
  94  |     { requestId, key },
  95  |   );
  96  |   expect(result.ok, result.ok ? '' : JSON.stringify(result.error)).toBe(true);
  97  |   expect(result).toMatchObject({ ok: true, data: { status: 'unconfigured' } });
  98  |   expect(
  99  |     await page.evaluate(
  100 |       ({ requestId, key }) =>
  101 |         window.tapkit.saveApiKey({ requestId }, { providerId: 'deepseek', label: '本地测试', key }),
  102 |       { requestId, key },
  103 |     ),
  104 |   ).toEqual(result);
  105 |   expect(
  106 |     await page.evaluate(
  107 |       ({ requestId, key }) =>
  108 |         window.tapkit.saveApiKey(
  109 |           { requestId },
  110 |           { providerId: 'deepseek', label: '本地测试', key: key + 'changed' },
  111 |         ),
  112 |       { requestId, key },
  113 |     ),
  114 |   ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  115 |   const ciphertext = await readFile(join(dataDir, 'secrets', requestId));
  116 |   expect(ciphertext.includes(Buffer.from(key))).toBe(false);
  117 |   const roundtrip = await app.evaluate(
  118 |     ({ safeStorage }, { ciphertext, key }) => {
  119 |       return JSON.parse(safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))).key === key;
  120 |     },
  121 |     { ciphertext: ciphertext.toString('base64'), key },
  122 |   );
  123 |   expect(roundtrip).toBe(true);
  124 |   const { execFile } = await import('node:child_process');
```