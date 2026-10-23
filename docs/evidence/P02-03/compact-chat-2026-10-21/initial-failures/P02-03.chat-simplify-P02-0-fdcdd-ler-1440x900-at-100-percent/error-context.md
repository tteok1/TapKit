# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P02-03.chat-simplify.spec.ts >> P02-03 T22 compact chat, fixed footer and continuous scroller 1440x900 at 100 percent
- Location: tests\e2e\P02-03.chat-simplify.spec.ts:23:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 66
Received: 58
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
          - button "界面精简会话 0 2026/10/21 16:39:27" [ref=e59] [cursor=pointer]:
            - text: 界面精简会话 0
            - generic [ref=e60]: 2026/10/21 16:39:27
          - button "置顶界面精简会话 0" [ref=e61] [cursor=pointer]
          - button "会话信息界面精简会话 0" [ref=e64] [cursor=pointer]: ⋯
        - generic [ref=e65]:
          - button "界面精简会话 39 2026/10/21 16:39:26" [ref=e66] [cursor=pointer]:
            - text: 界面精简会话 39
            - generic [ref=e67]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 39" [ref=e68] [cursor=pointer]
          - button "会话信息界面精简会话 39" [ref=e71] [cursor=pointer]: ⋯
        - generic [ref=e72]:
          - button "界面精简会话 38 2026/10/21 16:39:26" [ref=e73] [cursor=pointer]:
            - text: 界面精简会话 38
            - generic [ref=e74]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 38" [ref=e75] [cursor=pointer]
          - button "会话信息界面精简会话 38" [ref=e78] [cursor=pointer]: ⋯
        - generic [ref=e79]:
          - button "界面精简会话 37 2026/10/21 16:39:26" [ref=e80] [cursor=pointer]:
            - text: 界面精简会话 37
            - generic [ref=e81]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 37" [ref=e82] [cursor=pointer]
          - button "会话信息界面精简会话 37" [ref=e85] [cursor=pointer]: ⋯
        - generic [ref=e86]:
          - button "界面精简会话 36 2026/10/21 16:39:26" [ref=e87] [cursor=pointer]:
            - text: 界面精简会话 36
            - generic [ref=e88]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 36" [ref=e89] [cursor=pointer]
          - button "会话信息界面精简会话 36" [ref=e92] [cursor=pointer]: ⋯
        - generic [ref=e93]:
          - button "界面精简会话 35 2026/10/21 16:39:26" [ref=e94] [cursor=pointer]:
            - text: 界面精简会话 35
            - generic [ref=e95]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 35" [ref=e96] [cursor=pointer]
          - button "会话信息界面精简会话 35" [ref=e99] [cursor=pointer]: ⋯
        - generic [ref=e100]:
          - button "界面精简会话 34 2026/10/21 16:39:26" [ref=e101] [cursor=pointer]:
            - text: 界面精简会话 34
            - generic [ref=e102]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 34" [ref=e103] [cursor=pointer]
          - button "会话信息界面精简会话 34" [ref=e106] [cursor=pointer]: ⋯
        - generic [ref=e107]:
          - button "界面精简会话 33 2026/10/21 16:39:26" [ref=e108] [cursor=pointer]:
            - text: 界面精简会话 33
            - generic [ref=e109]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 33" [ref=e110] [cursor=pointer]
          - button "会话信息界面精简会话 33" [ref=e113] [cursor=pointer]: ⋯
        - generic [ref=e114]:
          - button "界面精简会话 32 2026/10/21 16:39:26" [ref=e115] [cursor=pointer]:
            - text: 界面精简会话 32
            - generic [ref=e116]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 32" [ref=e117] [cursor=pointer]
          - button "会话信息界面精简会话 32" [ref=e120] [cursor=pointer]: ⋯
        - generic [ref=e121]:
          - button "界面精简会话 31 2026/10/21 16:39:26" [ref=e122] [cursor=pointer]:
            - text: 界面精简会话 31
            - generic [ref=e123]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 31" [ref=e124] [cursor=pointer]
          - button "会话信息界面精简会话 31" [ref=e127] [cursor=pointer]: ⋯
        - generic [ref=e128]:
          - button "界面精简会话 30 2026/10/21 16:39:26" [ref=e129] [cursor=pointer]:
            - text: 界面精简会话 30
            - generic [ref=e130]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 30" [ref=e131] [cursor=pointer]
          - button "会话信息界面精简会话 30" [ref=e134] [cursor=pointer]: ⋯
        - generic [ref=e135]:
          - button "界面精简会话 29 2026/10/21 16:39:26" [ref=e136] [cursor=pointer]:
            - text: 界面精简会话 29
            - generic [ref=e137]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 29" [ref=e138] [cursor=pointer]
          - button "会话信息界面精简会话 29" [ref=e141] [cursor=pointer]: ⋯
        - generic [ref=e142]:
          - button "界面精简会话 28 2026/10/21 16:39:26" [ref=e143] [cursor=pointer]:
            - text: 界面精简会话 28
            - generic [ref=e144]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 28" [ref=e145] [cursor=pointer]
          - button "会话信息界面精简会话 28" [ref=e148] [cursor=pointer]: ⋯
        - generic [ref=e149]:
          - button "界面精简会话 27 2026/10/21 16:39:26" [ref=e150] [cursor=pointer]:
            - text: 界面精简会话 27
            - generic [ref=e151]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 27" [ref=e152] [cursor=pointer]
          - button "会话信息界面精简会话 27" [ref=e155] [cursor=pointer]: ⋯
        - generic [ref=e156]:
          - button "界面精简会话 26 2026/10/21 16:39:26" [ref=e157] [cursor=pointer]:
            - text: 界面精简会话 26
            - generic [ref=e158]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 26" [ref=e159] [cursor=pointer]
          - button "会话信息界面精简会话 26" [ref=e162] [cursor=pointer]: ⋯
        - generic [ref=e163]:
          - button "界面精简会话 25 2026/10/21 16:39:26" [ref=e164] [cursor=pointer]:
            - text: 界面精简会话 25
            - generic [ref=e165]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 25" [ref=e166] [cursor=pointer]
          - button "会话信息界面精简会话 25" [ref=e169] [cursor=pointer]: ⋯
        - generic [ref=e170]:
          - button "界面精简会话 24 2026/10/21 16:39:26" [ref=e171] [cursor=pointer]:
            - text: 界面精简会话 24
            - generic [ref=e172]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 24" [ref=e173] [cursor=pointer]
          - button "会话信息界面精简会话 24" [ref=e176] [cursor=pointer]: ⋯
        - generic [ref=e177]:
          - button "界面精简会话 23 2026/10/21 16:39:26" [ref=e178] [cursor=pointer]:
            - text: 界面精简会话 23
            - generic [ref=e179]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 23" [ref=e180] [cursor=pointer]
          - button "会话信息界面精简会话 23" [ref=e183] [cursor=pointer]: ⋯
        - generic [ref=e184]:
          - button "界面精简会话 22 2026/10/21 16:39:26" [ref=e185] [cursor=pointer]:
            - text: 界面精简会话 22
            - generic [ref=e186]: 2026/10/21 16:39:26
          - button "置顶界面精简会话 22" [ref=e187] [cursor=pointer]
          - button "会话信息界面精简会话 22" [ref=e190] [cursor=pointer]: ⋯
        - generic [ref=e191]:
          - button "界面精简会话 21 2026/10/21 16:39:25" [ref=e192] [cursor=pointer]:
            - text: 界面精简会话 21
            - generic [ref=e193]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 21" [ref=e194] [cursor=pointer]
          - button "会话信息界面精简会话 21" [ref=e197] [cursor=pointer]: ⋯
        - generic [ref=e198]:
          - button "界面精简会话 20 2026/10/21 16:39:25" [ref=e199] [cursor=pointer]:
            - text: 界面精简会话 20
            - generic [ref=e200]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 20" [ref=e201] [cursor=pointer]
          - button "会话信息界面精简会话 20" [ref=e204] [cursor=pointer]: ⋯
        - generic [ref=e205]:
          - button "界面精简会话 19 2026/10/21 16:39:25" [ref=e206] [cursor=pointer]:
            - text: 界面精简会话 19
            - generic [ref=e207]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 19" [ref=e208] [cursor=pointer]
          - button "会话信息界面精简会话 19" [ref=e211] [cursor=pointer]: ⋯
        - generic [ref=e212]:
          - button "界面精简会话 18 2026/10/21 16:39:25" [ref=e213] [cursor=pointer]:
            - text: 界面精简会话 18
            - generic [ref=e214]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 18" [ref=e215] [cursor=pointer]
          - button "会话信息界面精简会话 18" [ref=e218] [cursor=pointer]: ⋯
        - generic [ref=e219]:
          - button "界面精简会话 17 2026/10/21 16:39:25" [ref=e220] [cursor=pointer]:
            - text: 界面精简会话 17
            - generic [ref=e221]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 17" [ref=e222] [cursor=pointer]
          - button "会话信息界面精简会话 17" [ref=e225] [cursor=pointer]: ⋯
        - generic [ref=e226]:
          - button "界面精简会话 16 2026/10/21 16:39:25" [ref=e227] [cursor=pointer]:
            - text: 界面精简会话 16
            - generic [ref=e228]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 16" [ref=e229] [cursor=pointer]
          - button "会话信息界面精简会话 16" [ref=e232] [cursor=pointer]: ⋯
        - generic [ref=e233]:
          - button "界面精简会话 15 2026/10/21 16:39:25" [ref=e234] [cursor=pointer]:
            - text: 界面精简会话 15
            - generic [ref=e235]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 15" [ref=e236] [cursor=pointer]
          - button "会话信息界面精简会话 15" [ref=e239] [cursor=pointer]: ⋯
        - generic [ref=e240]:
          - button "界面精简会话 14 2026/10/21 16:39:25" [ref=e241] [cursor=pointer]:
            - text: 界面精简会话 14
            - generic [ref=e242]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 14" [ref=e243] [cursor=pointer]
          - button "会话信息界面精简会话 14" [ref=e246] [cursor=pointer]: ⋯
        - generic [ref=e247]:
          - button "界面精简会话 13 2026/10/21 16:39:25" [ref=e248] [cursor=pointer]:
            - text: 界面精简会话 13
            - generic [ref=e249]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 13" [ref=e250] [cursor=pointer]
          - button "会话信息界面精简会话 13" [ref=e253] [cursor=pointer]: ⋯
        - generic [ref=e254]:
          - button "界面精简会话 12 2026/10/21 16:39:25" [ref=e255] [cursor=pointer]:
            - text: 界面精简会话 12
            - generic [ref=e256]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 12" [ref=e257] [cursor=pointer]
          - button "会话信息界面精简会话 12" [ref=e260] [cursor=pointer]: ⋯
        - generic [ref=e261]:
          - button "界面精简会话 11 2026/10/21 16:39:25" [ref=e262] [cursor=pointer]:
            - text: 界面精简会话 11
            - generic [ref=e263]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 11" [ref=e264] [cursor=pointer]
          - button "会话信息界面精简会话 11" [ref=e267] [cursor=pointer]: ⋯
        - generic [ref=e268]:
          - button "界面精简会话 10 2026/10/21 16:39:25" [ref=e269] [cursor=pointer]:
            - text: 界面精简会话 10
            - generic [ref=e270]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 10" [ref=e271] [cursor=pointer]
          - button "会话信息界面精简会话 10" [ref=e274] [cursor=pointer]: ⋯
        - generic [ref=e275]:
          - button "界面精简会话 9 2026/10/21 16:39:25" [ref=e276] [cursor=pointer]:
            - text: 界面精简会话 9
            - generic [ref=e277]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 9" [ref=e278] [cursor=pointer]
          - button "会话信息界面精简会话 9" [ref=e281] [cursor=pointer]: ⋯
        - generic [ref=e282]:
          - button "界面精简会话 8 2026/10/21 16:39:25" [ref=e283] [cursor=pointer]:
            - text: 界面精简会话 8
            - generic [ref=e284]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 8" [ref=e285] [cursor=pointer]
          - button "会话信息界面精简会话 8" [ref=e288] [cursor=pointer]: ⋯
        - generic [ref=e289]:
          - button "界面精简会话 7 2026/10/21 16:39:25" [ref=e290] [cursor=pointer]:
            - text: 界面精简会话 7
            - generic [ref=e291]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 7" [ref=e292] [cursor=pointer]
          - button "会话信息界面精简会话 7" [ref=e295] [cursor=pointer]: ⋯
        - generic [ref=e296]:
          - button "界面精简会话 6 2026/10/21 16:39:25" [ref=e297] [cursor=pointer]:
            - text: 界面精简会话 6
            - generic [ref=e298]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 6" [ref=e299] [cursor=pointer]
          - button "会话信息界面精简会话 6" [ref=e302] [cursor=pointer]: ⋯
        - generic [ref=e303]:
          - button "界面精简会话 5 2026/10/21 16:39:25" [ref=e304] [cursor=pointer]:
            - text: 界面精简会话 5
            - generic [ref=e305]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 5" [ref=e306] [cursor=pointer]
          - button "会话信息界面精简会话 5" [ref=e309] [cursor=pointer]: ⋯
        - generic [ref=e310]:
          - button "界面精简会话 4 2026/10/21 16:39:25" [ref=e311] [cursor=pointer]:
            - text: 界面精简会话 4
            - generic [ref=e312]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 4" [ref=e313] [cursor=pointer]
          - button "会话信息界面精简会话 4" [ref=e316] [cursor=pointer]: ⋯
        - generic [ref=e317]:
          - button "界面精简会话 3 2026/10/21 16:39:25" [ref=e318] [cursor=pointer]:
            - text: 界面精简会话 3
            - generic [ref=e319]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 3" [ref=e320] [cursor=pointer]
          - button "会话信息界面精简会话 3" [ref=e323] [cursor=pointer]: ⋯
        - generic [ref=e324]:
          - button "界面精简会话 2 2026/10/21 16:39:25" [ref=e325] [cursor=pointer]:
            - text: 界面精简会话 2
            - generic [ref=e326]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 2" [ref=e327] [cursor=pointer]
          - button "会话信息界面精简会话 2" [ref=e330] [cursor=pointer]: ⋯
        - generic [ref=e331]:
          - button "界面精简会话 1 2026/10/21 16:39:25" [ref=e332] [cursor=pointer]:
            - text: 界面精简会话 1
            - generic [ref=e333]: 2026/10/21 16:39:25
          - button "置顶界面精简会话 1" [ref=e334] [cursor=pointer]
          - button "会话信息界面精简会话 1" [ref=e337] [cursor=pointer]: ⋯
      - generic [ref=e338]:
        - generic [ref=e339]: 任务执行尚未开放
        - generic [ref=e340]: 待确认事项：0
    - generic [ref=e341]:
      - link "个人资料与设置" [ref=e342] [cursor=pointer]:
        - /url: /settings/personal
      - link "设置" [ref=e347] [cursor=pointer]:
        - /url: /settings/general
    - separator "调整侧栏宽度" [ref=e350]
  - generic [ref=e351]:
    - banner [ref=e352]:
      - button "后退" [ref=e353] [cursor=pointer]
      - button "前进" [ref=e356] [cursor=pointer]
      - link "首页" [ref=e359] [cursor=pointer]:
        - /url: /
      - generic [ref=e360]: 界面精简会话 0
      - group [ref=e361]:
        - generic "连接状态" [ref=e362] [cursor=pointer]
      - button "详情面板" [ref=e364] [cursor=pointer]:
        - generic [ref=e367]: 工作台
    - main [ref=e369]:
      - generic [ref=e371]:
        - generic [ref=e372]:
          - button "会话摘要" [ref=e374] [cursor=pointer]
          - button "记忆与历史范围" [ref=e376] [cursor=pointer]
          - generic [ref=e377]:
            - generic [ref=e378]:
              - text: 消息分支 / 回答版本
              - combobox "消息分支 / 回答版本" [ref=e379]:
                - option "主分支 1" [selected]
            - button "AI 重命名" [ref=e380] [cursor=pointer]
            - button "导出 Markdown" [ref=e381] [cursor=pointer]
            - group [ref=e382]:
              - generic "当前资料、工具与个性化设置" [ref=e383] [cursor=pointer]
        - generic [ref=e384]:
          - article [ref=e385]:
            - generic [ref=e386]:
              - strong [ref=e387]: 你
              - generic [ref=e388]: · 16:39:27 · 已发送
            - paragraph [ref=e389]: 界面精简后的发送回归
            - generic [ref=e391]:
              - generic [ref=e392]:
                - button "编辑问题并创建分支" [ref=e393] [cursor=pointer]
                - button "收藏" [ref=e396] [cursor=pointer]
                - button "更多消息操作" [ref=e400] [cursor=pointer]
              - button "复制回复" [ref=e402] [cursor=pointer]
              - button "引用选区追问" [ref=e405] [cursor=pointer]
          - article [ref=e408]:
            - generic [ref=e409]:
              - strong [ref=e410]: TapKit
              - generic [ref=e411]: openai-compatible · fixture-model · 16:39:27 · 已发送
            - group [ref=e412]:
              - paragraph [ref=e414]: 隔离测试回复：界面精简后的发送回归
            - generic [ref=e415]:
              - button "使用的记忆与历史参考" [ref=e418] [cursor=pointer]
              - generic [ref=e421]:
                - generic [ref=e422]:
                  - button "重新生成回答" [ref=e423] [cursor=pointer]
                  - button "点赞" [pressed] [ref=e426] [cursor=pointer]
                  - button "点踩" [ref=e429] [cursor=pointer]
                  - button "取消收藏" [pressed] [ref=e432] [cursor=pointer]
                  - button "更多消息操作" [ref=e436] [cursor=pointer]
                - button "复制回复" [ref=e438] [cursor=pointer]
                - button "引用选区追问" [ref=e441] [cursor=pointer]
        - status [ref=e444]:
          - text: 当前进展：已完成 · 模型回合 1 · 请求尝试 1 · 只读工具 0 · 0秒 · 用量实际 60 tokens
          - generic [ref=e445]: 请求次数与用量包含标题等辅助请求；保守估算不代表供应商实际扣费。
        - generic [ref=e446]:
          - textbox "输入草稿" [ref=e447]:
            - /placeholder: 写下你的问题…
          - generic [ref=e448]:
            - button "添加附件或引用资料" [ref=e450] [cursor=pointer]
            - button "输入与工具信息" [ref=e454] [cursor=pointer]
            - button "本轮模型" [ref=e459] [cursor=pointer]:
              - generic [ref=e460]: fixture-model
            - button "发送" [disabled] [ref=e463]
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