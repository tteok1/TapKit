# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 960x640 at 200 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '收起侧栏', exact: true })
    - locator resolved to <button type="button" aria-label="收起侧栏" class="icon-button " aria-expanded="true">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <img alt="" class="product-icon" src="file:///D:/Tapkit-public/apps/desktop/out/renderer/assets/tapkit-current-icon-DnZ1YOfi.png"/> from <aside aria-label="侧栏" class="sidebar  sidebar-drawer">…</aside> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "侧栏" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - strong [ref=e8]: TapKit
        - generic [ref=e9]:
          - button "通知" [ref=e11] [cursor=pointer]
          - button "搜索" [ref=e15] [cursor=pointer]
      - button "新建任务" [ref=e19] [cursor=pointer]
      - navigation "主导航" [ref=e22]:
        - link "聊天" [ref=e23] [cursor=pointer]:
          - /url: /chats
        - link "工作" [ref=e26] [cursor=pointer]:
          - /url: /work
        - link "项目" [ref=e29] [cursor=pointer]:
          - /url: /projects
        - link "文件" [ref=e32] [cursor=pointer]:
          - /url: /files
        - group [ref=e35]:
          - generic "调整导航入口" [ref=e36] [cursor=pointer]
      - region "会话历史" [ref=e38]:
        - generic [ref=e39]:
          - heading "最近" [level=2] [ref=e40]
          - button "会话列表选项" [ref=e43] [cursor=pointer]
        - generic [ref=e45]:
          - button "界面精简会话 0 2026/10/22 18:41:34" [ref=e46] [cursor=pointer]:
            - text: 界面精简会话 0
            - generic [ref=e47]: 2026/10/22 18:41:34
          - generic [ref=e48]:
            - button "取消置顶界面精简会话 0" [pressed] [ref=e50] [cursor=pointer]
            - button "会话信息界面精简会话 0" [ref=e54] [cursor=pointer]
        - generic [ref=e56]:
          - button "界面精简会话 39 2026/10/22 18:41:33" [ref=e57] [cursor=pointer]:
            - text: 界面精简会话 39
            - generic [ref=e58]: 2026/10/22 18:41:33
          - generic [ref=e59]:
            - button "置顶界面精简会话 39" [ref=e61] [cursor=pointer]
            - button "会话信息界面精简会话 39" [ref=e65] [cursor=pointer]
        - generic [ref=e67]:
          - button "界面精简会话 38 2026/10/22 18:41:33" [ref=e68] [cursor=pointer]:
            - text: 界面精简会话 38
            - generic [ref=e69]: 2026/10/22 18:41:33
          - generic [ref=e70]:
            - button "置顶界面精简会话 38" [ref=e72] [cursor=pointer]
            - button "会话信息界面精简会话 38" [ref=e76] [cursor=pointer]
        - generic [ref=e78]:
          - button "界面精简会话 37 2026/10/22 18:41:33" [ref=e79] [cursor=pointer]:
            - text: 界面精简会话 37
            - generic [ref=e80]: 2026/10/22 18:41:33
          - generic [ref=e81]:
            - button "置顶界面精简会话 37" [ref=e83] [cursor=pointer]
            - button "会话信息界面精简会话 37" [ref=e87] [cursor=pointer]
        - generic [ref=e89]:
          - button "界面精简会话 36 2026/10/22 18:41:33" [ref=e90] [cursor=pointer]:
            - text: 界面精简会话 36
            - generic [ref=e91]: 2026/10/22 18:41:33
          - generic [ref=e92]:
            - button "置顶界面精简会话 36" [ref=e94] [cursor=pointer]
            - button "会话信息界面精简会话 36" [ref=e98] [cursor=pointer]
        - generic [ref=e100]:
          - button "界面精简会话 35 2026/10/22 18:41:33" [ref=e101] [cursor=pointer]:
            - text: 界面精简会话 35
            - generic [ref=e102]: 2026/10/22 18:41:33
          - generic [ref=e103]:
            - button "置顶界面精简会话 35" [ref=e105] [cursor=pointer]
            - button "会话信息界面精简会话 35" [ref=e109] [cursor=pointer]
        - generic [ref=e111]:
          - button "界面精简会话 34 2026/10/22 18:41:33" [ref=e112] [cursor=pointer]:
            - text: 界面精简会话 34
            - generic [ref=e113]: 2026/10/22 18:41:33
          - generic [ref=e114]:
            - button "置顶界面精简会话 34" [ref=e116] [cursor=pointer]
            - button "会话信息界面精简会话 34" [ref=e120] [cursor=pointer]
        - generic [ref=e122]:
          - button "界面精简会话 33 2026/10/22 18:41:33" [ref=e123] [cursor=pointer]:
            - text: 界面精简会话 33
            - generic [ref=e124]: 2026/10/22 18:41:33
          - generic [ref=e125]:
            - button "置顶界面精简会话 33" [ref=e127] [cursor=pointer]
            - button "会话信息界面精简会话 33" [ref=e131] [cursor=pointer]
        - generic [ref=e133]:
          - button "界面精简会话 32 2026/10/22 18:41:33" [ref=e134] [cursor=pointer]:
            - text: 界面精简会话 32
            - generic [ref=e135]: 2026/10/22 18:41:33
          - generic [ref=e136]:
            - button "置顶界面精简会话 32" [ref=e138] [cursor=pointer]
            - button "会话信息界面精简会话 32" [ref=e142] [cursor=pointer]
        - generic [ref=e144]:
          - button "界面精简会话 31 2026/10/22 18:41:32" [ref=e145] [cursor=pointer]:
            - text: 界面精简会话 31
            - generic [ref=e146]: 2026/10/22 18:41:32
          - generic [ref=e147]:
            - button "置顶界面精简会话 31" [ref=e149] [cursor=pointer]
            - button "会话信息界面精简会话 31" [ref=e153] [cursor=pointer]
        - generic [ref=e155]:
          - button "界面精简会话 30 2026/10/22 18:41:32" [ref=e156] [cursor=pointer]:
            - text: 界面精简会话 30
            - generic [ref=e157]: 2026/10/22 18:41:32
          - generic [ref=e158]:
            - button "置顶界面精简会话 30" [ref=e160] [cursor=pointer]
            - button "会话信息界面精简会话 30" [ref=e164] [cursor=pointer]
        - generic [ref=e166]:
          - button "界面精简会话 29 2026/10/22 18:41:32" [ref=e167] [cursor=pointer]:
            - text: 界面精简会话 29
            - generic [ref=e168]: 2026/10/22 18:41:32
          - generic [ref=e169]:
            - button "置顶界面精简会话 29" [ref=e171] [cursor=pointer]
            - button "会话信息界面精简会话 29" [ref=e175] [cursor=pointer]
        - generic [ref=e177]:
          - button "界面精简会话 28 2026/10/22 18:41:32" [ref=e178] [cursor=pointer]:
            - text: 界面精简会话 28
            - generic [ref=e179]: 2026/10/22 18:41:32
          - generic [ref=e180]:
            - button "置顶界面精简会话 28" [ref=e182] [cursor=pointer]
            - button "会话信息界面精简会话 28" [ref=e186] [cursor=pointer]
        - generic [ref=e188]:
          - button "界面精简会话 27 2026/10/22 18:41:32" [ref=e189] [cursor=pointer]:
            - text: 界面精简会话 27
            - generic [ref=e190]: 2026/10/22 18:41:32
          - generic [ref=e191]:
            - button "置顶界面精简会话 27" [ref=e193] [cursor=pointer]
            - button "会话信息界面精简会话 27" [ref=e197] [cursor=pointer]
        - generic [ref=e199]:
          - button "界面精简会话 26 2026/10/22 18:41:32" [ref=e200] [cursor=pointer]:
            - text: 界面精简会话 26
            - generic [ref=e201]: 2026/10/22 18:41:32
          - generic [ref=e202]:
            - button "置顶界面精简会话 26" [ref=e204] [cursor=pointer]
            - button "会话信息界面精简会话 26" [ref=e208] [cursor=pointer]
        - generic [ref=e210]:
          - button "界面精简会话 25 2026/10/22 18:41:32" [ref=e211] [cursor=pointer]:
            - text: 界面精简会话 25
            - generic [ref=e212]: 2026/10/22 18:41:32
          - generic [ref=e213]:
            - button "置顶界面精简会话 25" [ref=e215] [cursor=pointer]
            - button "会话信息界面精简会话 25" [ref=e219] [cursor=pointer]
        - generic [ref=e221]:
          - button "界面精简会话 24 2026/10/22 18:41:32" [ref=e222] [cursor=pointer]:
            - text: 界面精简会话 24
            - generic [ref=e223]: 2026/10/22 18:41:32
          - generic [ref=e224]:
            - button "置顶界面精简会话 24" [ref=e226] [cursor=pointer]
            - button "会话信息界面精简会话 24" [ref=e230] [cursor=pointer]
        - generic [ref=e232]:
          - button "界面精简会话 23 2026/10/22 18:41:32" [ref=e233] [cursor=pointer]:
            - text: 界面精简会话 23
            - generic [ref=e234]: 2026/10/22 18:41:32
          - generic [ref=e235]:
            - button "置顶界面精简会话 23" [ref=e237] [cursor=pointer]
            - button "会话信息界面精简会话 23" [ref=e241] [cursor=pointer]
        - generic [ref=e243]:
          - button "界面精简会话 22 2026/10/22 18:41:32" [ref=e244] [cursor=pointer]:
            - text: 界面精简会话 22
            - generic [ref=e245]: 2026/10/22 18:41:32
          - generic [ref=e246]:
            - button "置顶界面精简会话 22" [ref=e248] [cursor=pointer]
            - button "会话信息界面精简会话 22" [ref=e252] [cursor=pointer]
        - generic [ref=e254]:
          - button "界面精简会话 21 2026/10/22 18:41:32" [ref=e255] [cursor=pointer]:
            - text: 界面精简会话 21
            - generic [ref=e256]: 2026/10/22 18:41:32
          - generic [ref=e257]:
            - button "置顶界面精简会话 21" [ref=e259] [cursor=pointer]
            - button "会话信息界面精简会话 21" [ref=e263] [cursor=pointer]
        - generic [ref=e265]:
          - button "界面精简会话 20 2026/10/22 18:41:32" [ref=e266] [cursor=pointer]:
            - text: 界面精简会话 20
            - generic [ref=e267]: 2026/10/22 18:41:32
          - generic [ref=e268]:
            - button "置顶界面精简会话 20" [ref=e270] [cursor=pointer]
            - button "会话信息界面精简会话 20" [ref=e274] [cursor=pointer]
        - generic [ref=e276]:
          - button "界面精简会话 19 2026/10/22 18:41:32" [ref=e277] [cursor=pointer]:
            - text: 界面精简会话 19
            - generic [ref=e278]: 2026/10/22 18:41:32
          - generic [ref=e279]:
            - button "置顶界面精简会话 19" [ref=e281] [cursor=pointer]
            - button "会话信息界面精简会话 19" [ref=e285] [cursor=pointer]
        - generic [ref=e287]:
          - button "界面精简会话 18 2026/10/22 18:41:32" [ref=e288] [cursor=pointer]:
            - text: 界面精简会话 18
            - generic [ref=e289]: 2026/10/22 18:41:32
          - generic [ref=e290]:
            - button "置顶界面精简会话 18" [ref=e292] [cursor=pointer]
            - button "会话信息界面精简会话 18" [ref=e296] [cursor=pointer]
        - generic [ref=e298]:
          - button "界面精简会话 17 2026/10/22 18:41:32" [ref=e299] [cursor=pointer]:
            - text: 界面精简会话 17
            - generic [ref=e300]: 2026/10/22 18:41:32
          - generic [ref=e301]:
            - button "置顶界面精简会话 17" [ref=e303] [cursor=pointer]
            - button "会话信息界面精简会话 17" [ref=e307] [cursor=pointer]
        - generic [ref=e309]:
          - button "界面精简会话 16 2026/10/22 18:41:32" [ref=e310] [cursor=pointer]:
            - text: 界面精简会话 16
            - generic [ref=e311]: 2026/10/22 18:41:32
          - generic [ref=e312]:
            - button "置顶界面精简会话 16" [ref=e314] [cursor=pointer]
            - button "会话信息界面精简会话 16" [ref=e318] [cursor=pointer]
        - generic [ref=e320]:
          - button "界面精简会话 15 2026/10/22 18:41:32" [ref=e321] [cursor=pointer]:
            - text: 界面精简会话 15
            - generic [ref=e322]: 2026/10/22 18:41:32
          - generic [ref=e323]:
            - button "置顶界面精简会话 15" [ref=e325] [cursor=pointer]
            - button "会话信息界面精简会话 15" [ref=e329] [cursor=pointer]
        - generic [ref=e331]:
          - button "界面精简会话 14 2026/10/22 18:41:32" [ref=e332] [cursor=pointer]:
            - text: 界面精简会话 14
            - generic [ref=e333]: 2026/10/22 18:41:32
          - generic [ref=e334]:
            - button "置顶界面精简会话 14" [ref=e336] [cursor=pointer]
            - button "会话信息界面精简会话 14" [ref=e340] [cursor=pointer]
        - generic [ref=e342]:
          - button "界面精简会话 13 2026/10/22 18:41:32" [ref=e343] [cursor=pointer]:
            - text: 界面精简会话 13
            - generic [ref=e344]: 2026/10/22 18:41:32
          - generic [ref=e345]:
            - button "置顶界面精简会话 13" [ref=e347] [cursor=pointer]
            - button "会话信息界面精简会话 13" [ref=e351] [cursor=pointer]
        - generic [ref=e353]:
          - button "界面精简会话 12 2026/10/22 18:41:32" [ref=e354] [cursor=pointer]:
            - text: 界面精简会话 12
            - generic [ref=e355]: 2026/10/22 18:41:32
          - generic [ref=e356]:
            - button "置顶界面精简会话 12" [ref=e358] [cursor=pointer]
            - button "会话信息界面精简会话 12" [ref=e362] [cursor=pointer]
        - generic [ref=e364]:
          - button "界面精简会话 11 2026/10/22 18:41:32" [ref=e365] [cursor=pointer]:
            - text: 界面精简会话 11
            - generic [ref=e366]: 2026/10/22 18:41:32
          - generic [ref=e367]:
            - button "置顶界面精简会话 11" [ref=e369] [cursor=pointer]
            - button "会话信息界面精简会话 11" [ref=e373] [cursor=pointer]
        - generic [ref=e375]:
          - button "界面精简会话 10 2026/10/22 18:41:32" [ref=e376] [cursor=pointer]:
            - text: 界面精简会话 10
            - generic [ref=e377]: 2026/10/22 18:41:32
          - generic [ref=e378]:
            - button "置顶界面精简会话 10" [ref=e380] [cursor=pointer]
            - button "会话信息界面精简会话 10" [ref=e384] [cursor=pointer]
        - generic [ref=e386]:
          - button "界面精简会话 9 2026/10/22 18:41:32" [ref=e387] [cursor=pointer]:
            - text: 界面精简会话 9
            - generic [ref=e388]: 2026/10/22 18:41:32
          - generic [ref=e389]:
            - button "置顶界面精简会话 9" [ref=e391] [cursor=pointer]
            - button "会话信息界面精简会话 9" [ref=e395] [cursor=pointer]
        - generic [ref=e397]:
          - button "界面精简会话 8 2026/10/22 18:41:32" [ref=e398] [cursor=pointer]:
            - text: 界面精简会话 8
            - generic [ref=e399]: 2026/10/22 18:41:32
          - generic [ref=e400]:
            - button "置顶界面精简会话 8" [ref=e402] [cursor=pointer]
            - button "会话信息界面精简会话 8" [ref=e406] [cursor=pointer]
        - generic [ref=e408]:
          - button "界面精简会话 7 2026/10/22 18:41:32" [ref=e409] [cursor=pointer]:
            - text: 界面精简会话 7
            - generic [ref=e410]: 2026/10/22 18:41:32
          - generic [ref=e411]:
            - button "置顶界面精简会话 7" [ref=e413] [cursor=pointer]
            - button "会话信息界面精简会话 7" [ref=e417] [cursor=pointer]
        - generic [ref=e419]:
          - button "界面精简会话 6 2026/10/22 18:41:31" [ref=e420] [cursor=pointer]:
            - text: 界面精简会话 6
            - generic [ref=e421]: 2026/10/22 18:41:31
          - generic [ref=e422]:
            - button "置顶界面精简会话 6" [ref=e424] [cursor=pointer]
            - button "会话信息界面精简会话 6" [ref=e428] [cursor=pointer]
        - generic [ref=e430]:
          - button "界面精简会话 5 2026/10/22 18:41:31" [ref=e431] [cursor=pointer]:
            - text: 界面精简会话 5
            - generic [ref=e432]: 2026/10/22 18:41:31
          - generic [ref=e433]:
            - button "置顶界面精简会话 5" [ref=e435] [cursor=pointer]
            - button "会话信息界面精简会话 5" [ref=e439] [cursor=pointer]
        - generic [ref=e441]:
          - button "界面精简会话 4 2026/10/22 18:41:31" [ref=e442] [cursor=pointer]:
            - text: 界面精简会话 4
            - generic [ref=e443]: 2026/10/22 18:41:31
          - generic [ref=e444]:
            - button "置顶界面精简会话 4" [ref=e446] [cursor=pointer]
            - button "会话信息界面精简会话 4" [ref=e450] [cursor=pointer]
        - generic [ref=e452]:
          - button "界面精简会话 3 2026/10/22 18:41:31" [ref=e453] [cursor=pointer]:
            - text: 界面精简会话 3
            - generic [ref=e454]: 2026/10/22 18:41:31
          - generic [ref=e455]:
            - button "置顶界面精简会话 3" [ref=e457] [cursor=pointer]
            - button "会话信息界面精简会话 3" [ref=e461] [cursor=pointer]
        - generic [ref=e463]:
          - button "界面精简会话 2 2026/10/22 18:41:31" [ref=e464] [cursor=pointer]:
            - text: 界面精简会话 2
            - generic [ref=e465]: 2026/10/22 18:41:31
          - generic [ref=e466]:
            - button "置顶界面精简会话 2" [ref=e468] [cursor=pointer]
            - button "会话信息界面精简会话 2" [ref=e472] [cursor=pointer]
        - generic [ref=e474]:
          - button "界面精简会话 1 2026/10/22 18:41:31" [ref=e475] [cursor=pointer]:
            - text: 界面精简会话 1
            - generic [ref=e476]: 2026/10/22 18:41:31
          - generic [ref=e477]:
            - button "置顶界面精简会话 1" [ref=e479] [cursor=pointer]
            - button "会话信息界面精简会话 1" [ref=e483] [cursor=pointer]
      - generic [ref=e485]:
        - generic [ref=e486]: 任务执行尚未开放
        - generic [ref=e487]: 待确认事项：0
    - generic [ref=e488]:
      - link "个人资料与设置" [ref=e489] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e494] [cursor=pointer]:
        - /url: /settings/general
  - generic [ref=e497]:
    - banner [ref=e498]:
      - button "收起侧栏" [expanded] [ref=e500] [cursor=pointer]
      - generic [ref=e503]: 界面精简会话 0
      - group [ref=e504]:
        - generic "连接状态" [ref=e505] [cursor=pointer]
      - button "详情面板" [ref=e507] [cursor=pointer]
    - main [ref=e511]:
      - generic [ref=e513]:
        - generic [ref=e514]:
          - button "会话摘要" [ref=e516] [cursor=pointer]
          - button "记忆与历史范围" [ref=e518] [cursor=pointer]
          - generic [ref=e519]:
            - generic [ref=e520]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e521]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e522] [cursor=pointer]
            - button "导出 Markdown" [ref=e523] [cursor=pointer]
            - group [ref=e524]:
              - generic "当前资料、工具与个性化设置" [ref=e525] [cursor=pointer]
        - paragraph [ref=e527]: 发送一个问题开始对话。
        - generic [ref=e528]:
          - textbox "输入草稿" [ref=e529]:
            - /placeholder: 写下你的问题...
          - generic [ref=e530]:
            - button "添加附件或引用资料" [ref=e533] [cursor=pointer]
            - button "输入与工具信息" [ref=e538] [cursor=pointer]
            - button "本轮模型" [ref=e544] [cursor=pointer]:
              - generic [ref=e545]: fixture-model
            - button "发送" [disabled] [ref=e548]
```

# Test source

```ts
  77  |       await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  78  |     const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
  79  |     await sidebar.getByTitle(title, { exact: true }).click();
  80  |     await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', ids[0]!);
  81  |     await expect(page.locator('.workspace-title')).toHaveText(title);
  82  |     await expect(page.locator('.session-welcome')).toHaveCount(0);
  83  |     await expect(
  84  |       page.locator('main').getByRole('heading', { name: title, exact: true }),
  85  |     ).toHaveCount(0);
  86  |     await expect(
  87  |       page.getByText('聊天记录保存在本机；回复期间可继续输入、排队或停止。', { exact: true }),
  88  |     ).toHaveCount(0);
  89  |     const composer = page.locator('.composer');
  90  |     await expect(composer.locator('label[for="draft-input"]')).toHaveCount(0);
  91  |     await expect(composer.getByText('输入草稿', { exact: true })).toHaveCount(0);
  92  |     await expect(composer.getByText('模式', { exact: true })).toHaveCount(0);
  93  |     await expect(composer.getByText('输入操作', { exact: true })).toHaveCount(0);
  94  |     await expect(composer.getByText('常用提示词', { exact: true })).toHaveCount(0);
  95  |     await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toBeEnabled();
  96  |     const add = composer.getByRole('button', { name: '添加附件或引用资料', exact: true });
  97  |     await add.click();
  98  |     const additions = composer.getByRole('region', { name: '添加附件或引用资料', exact: true });
  99  |     await expect(additions.getByRole('button', { name: '添加附件', exact: true })).toBeEnabled();
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
> 177 |     if (zoom === 2) await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
      |                                                                                   ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
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
  251 |     const footerHeight = (await footer.boundingBox())!.height;
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