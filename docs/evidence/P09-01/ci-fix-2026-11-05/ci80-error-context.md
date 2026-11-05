# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P00-01.shell.spec.ts >> P00-01 sandbox bridge errors and clean child shutdown
- Location: tests\e2e\P00-01.shell.spec.ts:45:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 2

@@ -5,10 +5,12 @@
      "initialRoute",
      "openEntity",
      "saveConversation",
      "openArtifactExternal",
      "copyText",
+     "chooseCodeProject",
+     "codeCommand",
      "workCommand",
      "browserCommand",
      "historyCommand",
      "memoryCommand",
      "webCommand",
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
      - region "会话历史" [ref=e43]:
        - generic [ref=e44]:
          - heading "最近" [level=2] [ref=e45]
          - button "会话列表选项" [ref=e48] [cursor=pointer]
        - paragraph [ref=e50]: 暂无会话
      - generic [ref=e51]:
        - generic [ref=e52]: 本地工作任务可在工作中心查看与管理
        - generic [ref=e53]: 待确认事项：0
    - generic [ref=e54]:
      - link "个人资料与设置" [ref=e55] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e60] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e64]
  - generic [ref=e65]:
    - banner [ref=e66]:
      - button "收起侧栏" [expanded] [ref=e69] [cursor=pointer]
      - generic [ref=e72]: TapKit
      - group [ref=e73]:
        - generic "连接状态" [ref=e74] [cursor=pointer]
      - button "详情面板" [ref=e76] [cursor=pointer]:
        - generic [ref=e79]: 工作台
    - main [ref=e81]:
      - region "新建任务" [ref=e83]:
        - generic [ref=e84]:
          - generic [ref=e85]:
            - heading "你的想法，从这里开始" [level=1] [ref=e86]
            - radiogroup "任务类型" [ref=e87]:
              - radio "聊天" [checked] [ref=e89] [cursor=pointer]:
                - text: 聊天
                - generic [ref=e90]: 讨论问题、整理思路，聊天记录保存在本机。
              - radio "临时聊天" [ref=e92] [cursor=pointer]:
                - text: 临时聊天
                - generic [ref=e93]: 适合一次性讨论，离开后清除本次临时聊天记录。
              - radio "工作" [ref=e95] [cursor=pointer]:
                - text: 工作
                - generic [ref=e96]: 围绕目标制定计划，生成成果，并在需要时审阅具体操作。
          - region "推荐问题" [ref=e97]:
            - generic [ref=e98]:
              - generic [ref=e99]: 为你推荐
              - button "隐藏推荐问题" [expanded] [ref=e100] [cursor=pointer]
            - generic [ref=e103]:
              - button "帮我把这段文字整理成清晰的要点" [ref=e104] [cursor=pointer]
              - button "用一个例子解释我想了解的概念" [ref=e106] [cursor=pointer]
              - button "帮我比较两个方案的优缺点" [ref=e108] [cursor=pointer]
        - generic [ref=e111]:
          - textbox "输入草稿" [ref=e112]:
            - /placeholder: 请先配置模型再使用...
          - generic [ref=e113]:
            - button "联网与来源：自动" [ref=e115] [cursor=pointer]
            - button "添加附件或引用资料" [ref=e120] [cursor=pointer]
            - button "输入与工具信息" [ref=e125] [cursor=pointer]
            - button "设置模型" [ref=e129] [cursor=pointer]
            - button "发送" [disabled] [ref=e132]
```

# Test source

```ts
  1   | import { mkdtemp } from '../../scripts/test-temp.mjs';
  2   | import { test, expect, _electron as electron, type ElectronApplication } from './test';
  3   | import { mkdir } from 'node:fs/promises';
  4   | import { resolve } from 'node:path';
  5   | let app: ElectronApplication;
  6   | let dataDir: string;
  7   | // A verified native runtime can spend up to 120 seconds rechecking its fingerprints.
  8   | test.describe.configure({ timeout: 180_000 });
  9   | test.beforeEach(async () => {
  10  |   await mkdir('.test-data', { recursive: true });
  11  |   dataDir = await mkdtemp(resolve('.test-data', '中文 用户 空格-'));
  12  |   const env: Record<string, string> = Object.fromEntries(
  13  |     Object.entries({ ...process.env, TAPKIT_DATA_DIR: dataDir }).filter(
  14  |       (pair): pair is [string, string] => pair[1] !== undefined,
  15  |     ),
  16  |   );
  17  |   delete env.ELECTRON_RUN_AS_NODE;
  18  |   app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  19  |   app.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));
  20  |   app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  21  | });
  22  | test.afterEach(async () => {
  23  |   if (app) await app.close();
  24  | });
  25  | test('P00-01 ABI: Electron React Core SQLite FTS5 and Chinese data directory', async () => {
  26  |   const page = await app.firstWindow();
  27  |   await expect(page.getByRole('heading', { name: '你的想法，从这里开始' })).toBeVisible();
  28  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  29  |   const reply = await page.evaluate(() => window.tapkit.ping({ nonce: '中文 空格 ABI' }));
  30  |   expect(reply.nonce).toBe('中文 空格 ABI');
  31  |   expect(reply.process).toBe('core');
  32  |   expect(reply.electronVersion).toBe('44.3.0');
  33  |   expect(reply.sqliteVersion).toMatch(/^3\./);
  34  |   expect(reply.corePid).not.toBe(app.process().pid);
  35  |   const host = await app.evaluate(({ app }) => ({
  36  |     abi: process.versions.modules,
  37  |     dataDir: app.getPath('userData'),
  38  |   }));
  39  |   expect(reply.nodeAbi).toBe(host.abi);
  40  |   expect(host.dataDir).toBe(dataDir);
  41  |   console.log('P00-01 runtime probe', JSON.stringify(reply));
  42  |   await mkdir('docs/evidence/P00-02', { recursive: true });
  43  |   await page.screenshot({ path: 'docs/evidence/P00-02/regression-shell.png' });
  44  | });
  45  | test('P00-01 sandbox bridge errors and clean child shutdown', async () => {
  46  |   const page = await app.firstWindow();
  47  |   await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  48  |   expect(
  49  |     await page.evaluate(() => ({
  50  |       require: typeof (window as unknown as Record<string, unknown>).require,
  51  |       process: typeof (window as unknown as Record<string, unknown>).process,
  52  |       bridge: Object.keys(window.tapkit),
  53  |     })),
> 54  |   ).toEqual({
      |     ^ Error: expect(received).toEqual(expected) // deep equality
  55  |     require: 'undefined',
  56  |     process: 'undefined',
  57  |     bridge: [
  58  |       'windowSlot',
  59  |       'newWindow',
  60  |       'initialRoute',
  61  |       'openEntity',
  62  |       'saveConversation',
  63  |       'openArtifactExternal',
  64  |       'copyText',
  65  |       'workCommand',
  66  |       'browserCommand',
  67  |       'historyCommand',
  68  |       'memoryCommand',
  69  |       'webCommand',
  70  |       'exportCommand',
  71  |       'saveExport',
  72  |       'openExportFolder',
  73  |       'saveSearchKey',
  74  |       'projectCommand',
  75  |       'exportProject',
  76  |       'fileCommand',
  77  |       'artifactCommand',
  78  |       'artifactUrl',
  79  |       'saveOriginal',
  80  |       'chooseAvatar',
  81  |       'chooseDirectory',
  82  |       'chooseFiles',
  83  |       'selectDroppedFiles',
  84  |       'selectChatFiles',
  85  |       'openPublicLink',
  86  |       'desktopCommand',
  87  |       'chatCommand',
  88  |       'modelCommand',
  89  |       'listProviders',
  90  |       'startLogin',
  91  |       'loginStatus',
  92  |       'answerLogin',
  93  |       'cancelLogin',
  94  |       'checkProvider',
  95  |       'disconnectProvider',
  96  |       'ping',
  97  |       'bootstrap',
  98  |       'getSettings',
  99  |       'setSettings',
  100 |       'saveApiKey',
  101 |       'replayEvents',
  102 |       'subscribeEvents',
  103 |       'backup',
  104 |       'cancelJob',
  105 |     ],
  106 |   });
  107 |   expect(
  108 |     await app.evaluate(() =>
  109 |       process.argv.some((arg) => arg === '--no-sandbox' || arg === '--disable-gpu-sandbox'),
  110 |     ),
  111 |   ).toBe(false);
  112 |   const browserReply = await page.evaluate(() =>
  113 |     window.tapkit.browserCommand(
  114 |       { requestId: '0199b35d-9700-7000-8000-000000000001' },
  115 |       'browser.open',
  116 |       {
  117 |         runId: '0199b35d-9700-7000-8000-000000000002',
  118 |         url: 'https://example.com/',
  119 |         script: 'globalThis.unauthorizedBrowserCode = true',
  120 |       },
  121 |     ),
  122 |   );
  123 |   expect(browserReply).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  124 |   expect(
  125 |     await app.evaluate(({ app }) => {
  126 |       const tabs = app.getAppMetrics().filter((item) => item.type === 'Tab');
  127 |       return tabs.length > 0 && tabs.every((item) => item.sandboxed === true);
  128 |     }),
  129 |   ).toBe(true);
  130 |   expect(
  131 |     await app.evaluate(({ BrowserWindow }) => {
  132 |       const win = BrowserWindow.getAllWindows()[0];
  133 |       if (!win) throw new Error('No window');
  134 |       return win.webContents.isDevToolsOpened();
  135 |     }),
  136 |   ).toBe(false);
  137 |   expect(
  138 |     await page.evaluate(async () => {
  139 |       try {
  140 |         await window.tapkit.ping({ nonce: '' });
  141 |         return false;
  142 |       } catch {
  143 |         return true;
  144 |       }
  145 |     }),
  146 |   ).toBe(true);
  147 |   const reply = await page.evaluate(() => window.tapkit.ping({ nonce: 'shutdown' }));
  148 |   await app.close();
  149 |   await expect
  150 |     .poll(() => {
  151 |       try {
  152 |         process.kill(reply.corePid, 0);
  153 |         return true;
  154 |       } catch {
```