# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-02.chat.spec.ts >> P02-02 T05 long paste, plain managed attachment, unsupported original, oversize draft and restart remain reviewable
- Location: tests\e2e\P02-02.chat.spec.ts:195:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '仅保存原件继续', exact: true })
    - locator resolved to <button>仅保存原件继续</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <aside aria-label="详情" class="detail-panel">…</aside> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <aside aria-label="详情" class="detail-panel">…</aside> intercepts pointer events
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <aside aria-label="详情" class="detail-panel">…</aside> intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - link "TapKit 首页" [ref=e6] [cursor=pointer]:
        - /url: /
        - generic [aria-hidden] [ref=e7]: T
        - strong [ref=e8]: TapKit
      - button "收起侧栏" [ref=e9] [cursor=pointer]: ‹
    - generic [ref=e10]:
      - button "临时聊天" [ref=e11] [cursor=pointer]
      - button "新建聊天" [ref=e12] [cursor=pointer]
      - button "新建工作" [ref=e13] [cursor=pointer]
      - button "新建项目" [ref=e14] [cursor=pointer]
    - navigation "主导航" [ref=e15]:
      - button "搜索" [ref=e16] [cursor=pointer]
      - link "聊天" [ref=e17] [cursor=pointer]:
        - /url: /chats
      - link "工作" [ref=e18] [cursor=pointer]:
        - /url: /work
      - link "项目" [ref=e19] [cursor=pointer]:
        - /url: /projects
      - link "文件" [ref=e20] [cursor=pointer]:
        - /url: /files
      - link "通知" [ref=e21] [cursor=pointer]:
        - /url: /notifications
      - group [ref=e22]:
        - generic "调整导航入口" [ref=e23]
    - region "会话历史" [ref=e25]:
      - generic [ref=e26]:
        - button "最近" [pressed] [ref=e27] [cursor=pointer]
        - button "归档" [ref=e28] [cursor=pointer]
        - button "回收站" [ref=e29] [cursor=pointer]
        - button "全部" [ref=e30] [cursor=pointer]
      - button "新建分组" [ref=e31] [cursor=pointer]
      - button "默认列表" [pressed] [ref=e32] [cursor=pointer]
      - generic [ref=e33]:
        - button "新聊天 2026/10/11 09:51:59" [ref=e34] [cursor=pointer]:
          - text: 新聊天
          - generic [ref=e35]: 2026/10/11 09:51:59
        - button "置顶新聊天" [ref=e36] [cursor=pointer]: ◇
        - button "会话信息新聊天" [ref=e37] [cursor=pointer]: ⋯
    - generic [ref=e38]:
      - generic [ref=e39]: 任务执行尚未开放
      - generic [ref=e40]: 待确认事项：0
    - link "个人资料与设置" [ref=e41] [cursor=pointer]:
      - /url: /settings/personal
      - generic [ref=e46]:
        - text: 本地用户
        - generic [ref=e47]: 个人资料与设置
    - link "设置" [ref=e48] [cursor=pointer]:
      - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e49]
  - generic [ref=e50]:
    - banner [ref=e51]:
      - button "后退" [ref=e52] [cursor=pointer]: ‹
      - button "前进" [ref=e53] [cursor=pointer]: ›
      - link "首页" [ref=e54] [cursor=pointer]:
        - /url: /
      - generic [ref=e55]: 本地核心已连接
      - generic [ref=e56]: 1 个模型账户已连接
      - button "详情面板" [expanded] [ref=e57] [cursor=pointer]: 详情
    - generic [ref=e58]:
      - main [ref=e59]:
        - generic [ref=e60]:
          - generic [ref=e61]:
            - paragraph [ref=e62]: 聊天
            - heading "新聊天" [level=1] [ref=e63]
            - paragraph [ref=e64]: 聊天记录保存在本机；回复期间可继续输入、排队或停止。
          - generic [ref=e65]:
            - button "会话摘要" [ref=e67] [cursor=pointer]
            - generic [ref=e68]:
              - generic [ref=e69]:
                - text: 消息分支 / 回答版本
                - combobox "消息分支 / 回答版本" [ref=e70]:
                  - option "主分支 1" [selected]
              - button "AI 重命名" [ref=e71] [cursor=pointer]
              - button "导出 Markdown" [ref=e72] [cursor=pointer]
              - group [ref=e73]:
                - generic "当前资料、工具与个性化设置" [ref=e74]
            - paragraph [ref=e76]: 发送一个问题开始对话。
            - generic [ref=e77]:
              - text: 输入草稿
              - textbox "输入草稿" [ref=e78]:
                - /placeholder: 写下你的问题…
              - generic [ref=e79]: 0 / 100,000 · 输入上限100,000字符；超限保留草稿
              - generic [ref=e80]: 本轮工具：读取所选文件、查找当前会话历史
              - generic [ref=e81]:
                - generic [ref=e82]:
                  - generic [ref=e83]: 粘贴内容.txt · 本地托管文本 · 已就绪
                  - button "预览" [ref=e84] [cursor=pointer]
                  - button "下载原件" [ref=e85] [cursor=pointer]
                  - button "移除" [ref=e86] [cursor=pointer]
                - generic [ref=e87]:
                  - generic [ref=e88]: fixture.docx · 本地托管文件 · 仅原件
                  - button "预览" [ref=e89] [cursor=pointer]
                  - button "下载原件" [ref=e90] [cursor=pointer]
                  - button "仅保存原件继续" [ref=e91] [cursor=pointer]
              - paragraph [ref=e92]: 未就绪的材料需要等待、重试或移除；不发送给模型。
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - text: 模式
                  - combobox "模式" [disabled] [ref=e95]:
                    - option "聊天" [selected]
                    - option "工作"
                - generic [ref=e96]:
                  - text: 模型
                  - combobox "本轮模型" [ref=e97]:
                    - option "按默认偏好" [selected]
                    - option "openai-compatible · fixture-model"
                - button "添加附件" [ref=e98] [cursor=pointer]
                - button "@ 引用资料" [ref=e99] [cursor=pointer]
                - button "展开输入" [ref=e100] [cursor=pointer]
                - button "清空草稿" [ref=e101] [cursor=pointer]
                - button "发送" [disabled] [ref=e102]
              - group [ref=e103]:
                - generic "常用提示词" [ref=e104]
      - complementary "详情" [ref=e105]:
        - separator "调整详情宽度" [ref=e106]
        - button "关闭详情" [ref=e107] [cursor=pointer]
        - heading "新聊天" [level=2] [ref=e108]
        - paragraph [ref=e109]: 当前资料保存在本机。尚未开放的功能不会执行。
        - generic [ref=e110]:
          - term [ref=e111]: 会话
          - definition [ref=e112]: "1"
          - term [ref=e113]: 项目
          - definition [ref=e114]: "0"
          - term [ref=e115]: 待确认
          - definition [ref=e116]: "0"
        - link "管理模型连接" [ref=e117] [cursor=pointer]:
          - /url: /settings/connections
```

# Test source

```ts
  127 | test('P02-02 T05 IME and Shift+Enter keep draft; queue editing/cancellation, session switching and stopping preserve confirmed text', async () => {
  128 |   const page = await launch(),
  129 |     sid = await session(page),
  130 |     input = page.getByLabel('输入草稿');
  131 |   await input.fill('中文输入');
  132 |   await input.evaluate((node) =>
  133 |     node.dispatchEvent(
  134 |       new KeyboardEvent('keydown', {
  135 |         key: 'Enter',
  136 |         code: 'Enter',
  137 |         isComposing: true,
  138 |         bubbles: true,
  139 |       }),
  140 |     ),
  141 |   );
  142 |   expect((await snapshot(page, sid)).messages).toHaveLength(0);
  143 |   await input.press('Shift+Enter');
  144 |   await expect(input).toHaveValue('中文输入\n');
  145 |   await page.evaluate(
  146 |     async (ids) => {
  147 |       const b = await window.tapkit.bootstrap({ requestId: ids[0]! });
  148 |       if (!b.ok || !('profile' in b.data)) throw new Error('bootstrap failed');
  149 |       const r = await window.tapkit.setSettings(
  150 |         { requestId: ids[1]!, expectedRevision: b.data.settings.revision },
  151 |         {
  152 |           scope: { type: 'profile', id: b.data.profile.id },
  153 |           patch: { desktop: { ...b.data.settings.values.desktop, enterSends: false } },
  154 |         },
  155 |       );
  156 |       if (!r.ok) throw new Error(r.error.code);
  157 |     },
  158 |     [newId(), newId()],
  159 |   );
  160 |   await page.reload();
  161 |   await expect(page.locator('.chat-messages')).toBeVisible();
  162 |   await input.fill('慢速原问题');
  163 |   await input.press('Enter');
  164 |   await expect(input).toHaveValue('慢速原问题\n');
  165 |   expect((await snapshot(page, sid)).messages).toHaveLength(0);
  166 |   await input.press('Control+Enter');
  167 |   await expect(page.locator('.chat-stream')).toContainText('隔离测试回');
  168 |   await input.fill('排队问题');
  169 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  170 |   await page.locator('.chat-queue').getByRole('button', { name: '编辑', exact: true }).click();
  171 |   await page.getByLabel('排队消息内容').fill('编辑后的排队问题');
  172 |   await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  173 |   await expect(page.locator('.chat-queue')).toContainText('编辑后的排队问题');
  174 |   await page.locator('.chat-queue').getByRole('button', { name: '取消', exact: true }).click();
  175 |   await expect(page.locator('.chat-queue')).not.toBeAttached();
  176 |   await page.keyboard.press('Control+n');
  177 |   expect((await snapshot(page, sid)).run?.status).toBe('running');
  178 |   const before = await snapshot(page, sid);
  179 |   await command(page, 'runs.cancel', { runId: before.run!.id });
  180 |   await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('cancelled');
  181 |   const stopped = await snapshot(page, sid);
  182 |   expect(stopped.messages.some((m) => m.status === 'interrupted' && m.text === '隔离测试回')).toBe(
  183 |     true,
  184 |   );
  185 |   await command(page, 'messages.send', {
  186 |     sessionId: sid,
  187 |     clientMessageId: newId(),
  188 |     text: '停止后继续',
  189 |     attachments: [],
  190 |     mode: 'chat',
  191 |   });
  192 |   await expect.poll(async () => (await snapshot(page, sid)).run?.status).toBe('completed');
  193 | });
  194 |
  195 | test('P02-02 T05 long paste, plain managed attachment, unsupported original, oversize draft and restart remain reviewable', async () => {
  196 |   let page = await launch(),
  197 |     sid = await session(page);
  198 |   await page.getByLabel('输入草稿').evaluate((node) => {
  199 |     const data = new DataTransfer();
  200 |     data.setData('text/plain', '长'.repeat(20001));
  201 |     node.dispatchEvent(
  202 |       new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  203 |     );
  204 |   });
  205 |   await expect(page.getByRole('button', { name: '转为文本附件', exact: true })).toBeVisible();
  206 |   await page.getByRole('button', { name: '转为文本附件', exact: true }).click();
  207 |   await expect(page.locator('.chat-materials')).toContainText('粘贴内容.txt');
  208 |   await expect(page.getByLabel('输入草稿')).toHaveValue('');
  209 |   await page.getByRole('button', { name: '预览', exact: true }).click();
  210 |   let preview = page.getByRole('region', { name: '文件预览', exact: true });
  211 |   await expect(preview.getByRole('tab', { name: '粘贴内容.txt · v1', exact: true })).toBeVisible();
  212 |   await expect(preview.locator('.viewer-source pre')).toHaveText('长'.repeat(20001));
  213 |   await page.screenshot({
  214 |     path: 'docs/evidence/P02-02/fix-preview-2026-10-11/long-paste-preview.png',
  215 |   });
  216 |   await preview.locator('.viewer-source').screenshot({
  217 |     path: 'docs/evidence/P02-02/fix-preview-2026-10-11/long-paste-body.png',
  218 |   });
  219 |   await preview.getByRole('button', { name: '关闭预览', exact: true }).click();
  220 |   await page.locator('input[type=file]').setInputFiles({
  221 |     name: 'fixture.docx',
  222 |     mimeType: 'application/octet-stream',
  223 |     buffer: Buffer.from('synthetic original'),
  224 |   });
  225 |   await expect(page.locator('.chat-materials')).toContainText('fixture.docx');
  226 |   await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
> 227 |   await page.getByRole('button', { name: '仅保存原件继续', exact: true }).click();
      |                                                                    ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  228 |   await expect(page.locator('.chat-materials')).not.toContainText('fixture.docx');
  229 |   const excessive = '中'.repeat(100001);
  230 |   await page.getByLabel('输入草稿').fill(excessive);
  231 |   await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  232 |   await expect
  233 |     .poll(
  234 |       async () =>
  235 |         ((await command(page, 'drafts.get', { sessionId: sid, windowId: '0' })) as Draft).text
  236 |           .length,
  237 |     )
  238 |     .toBe(100001);
  239 |   await app.close();
  240 |   page = await launch();
  241 |   const restored = (await command(page, 'drafts.get', { sessionId: sid, windowId: '0' })) as Draft;
  242 |   expect(restored.text).toBe(excessive);
  243 |   await page
  244 |     .getByRole('complementary', { name: '侧栏' })
  245 |     .locator('.history-row[data-session-id="' + sid + '"] .history-link')
  246 |     .click();
  247 |   await expect(page.getByLabel('输入草稿')).toHaveValue(excessive);
  248 |   await expect(page.locator('.chat-materials')).toContainText('粘贴内容.txt');
  249 |   await page.getByRole('button', { name: '预览', exact: true }).click();
  250 |   preview = page.getByRole('region', { name: '文件预览', exact: true });
  251 |   await expect(preview.locator('.viewer-source pre')).toHaveText('长'.repeat(20001));
  252 |   await preview.getByRole('button', { name: '关闭预览', exact: true }).click();
  253 |   await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 700));
  254 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
  255 |     true,
  256 |   );
  257 |   await page.screenshot({ path: 'docs/evidence/P02-02/narrow-composer.png' });
  258 | });
  259 |
  260 | test('P02-02 T02 history pagination keeps reading position; return to latest restores following', async () => {
  261 |   const page = await launch(),
  262 |     sid = await session(page);
  263 |   for (let n = 0; n < 55; n++)
  264 |     await command(page, 'messages.send', {
  265 |       sessionId: sid,
  266 |       clientMessageId: newId(),
  267 |       text: '滚动样本 ' + n,
  268 |       attachments: [],
  269 |       mode: 'chat',
  270 |     });
  271 |   await expect
  272 |     .poll(
  273 |       async () => {
  274 |         const state = await snapshot(page, sid);
  275 |         return state.run?.status === 'completed' && state.pending.length === 0;
  276 |       },
  277 |       { timeout: 20000 },
  278 |     )
  279 |     .toBe(true);
  280 |   await page.getByRole('button', { name: '加载更早消息', exact: true }).click();
  281 |   await expect(page.locator('.chat-messages .chat-message')).toHaveCount(110);
  282 |   await page.locator('.chat-messages').evaluate((node) => {
  283 |     node.scrollTop = 0;
  284 |     node.dispatchEvent(new Event('scroll', { bubbles: true }));
  285 |   });
  286 |   await command(page, 'messages.send', {
  287 |     sessionId: sid,
  288 |     clientMessageId: newId(),
  289 |     text: '新到回复',
  290 |     attachments: [],
  291 |     mode: 'chat',
  292 |   });
  293 |   await expect(
  294 |     page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }),
  295 |   ).toBeVisible();
  296 |   expect(await page.locator('.chat-messages').evaluate((node) => node.scrollTop)).toBeLessThan(10);
  297 |   await page.getByRole('button', { name: '有新回复 · 回到最新消息', exact: true }).click();
  298 |   await expect
  299 |     .poll(() =>
  300 |       page
  301 |         .locator('.chat-messages')
  302 |         .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
  303 |     )
  304 |     .toBeLessThanOrEqual(80);
  305 |   await expect(page.locator('.chat-message').last()).toContainText('新到回复');
  306 | });
  307 |
  308 | test('P02-02 T02 malicious Markdown stays inert; GFM, KaTeX, Shiki and static sandbox Mermaid render', async () => {
  309 |   const page = await launch();
  310 |   const remote: string[] = [];
  311 |   page.on('request', (r) => {
  312 |     if (/^https?:/.test(r.url())) remote.push(r.url());
  313 |   });
  314 |   await page.getByLabel('输入草稿').fill('恶意渲染');
  315 |   await page.getByRole('button', { name: '发送', exact: true }).click();
  316 |   await expect(page.getByRole('heading', { name: '安全标题', exact: true })).toBeVisible();
  317 |   await expect(page.locator('.chat-table table')).toContainText('中文');
  318 |   await expect(page.locator('.katex')).toBeVisible();
  319 |   await expect(page.locator('.chat-code code span').first()).toBeVisible();
  320 |   await expect(page.getByTitle('静态图表')).toHaveAttribute('sandbox', '');
  321 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toBeVisible();
  322 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输入');
  323 |   await expect(page.frameLocator('iframe[title="静态图表"]').locator('svg')).toContainText('输出');
  324 |   console.log(
  325 |     'P02_SYNTHETIC_DIAGRAM_BOUNDS',
  326 |     await page
  327 |       .frameLocator('iframe[title="静态图表"]')
```
