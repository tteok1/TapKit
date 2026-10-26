# T14 本地反馈与收藏修复

日期2026-10-26；分支 `codex/test-fixes-2026-10-26`；基点 `9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a`。对应 P02-03 / FR-07-018、FR-07-020，决定见 ADR0063。保留分支准备时的三份进度修改。

## 变更

- 点踩保存成功后直接打开本地反馈；更多菜单回显已保存说明/举报标记。反馈框支持键盘、Escape和焦点恢复，失败保留输入并在框内提示；明确不发送给模型服务商。
- 同一个点赞/点踩再次点击取消，切换评分仍互斥；其他收藏/反馈字段保持。
- 侧栏“收藏”页显示消息摘要、所属会话和归档标记，支持分页、取消收藏和原分支消息定位，跨窗口workspace刷新同步列表。只读查询限定当前profile及会话/分支/消息归属，排除删除/回收站/墓碑及临时消息。没有数据库迁移。

## 验证结果

使用 `scripts/pnpm.ps1` 的锁定Node24.21.0/pnpm12.4.1。

- `pnpm test:unit P02-03 --maxWorkers=1`：退出0，7/7；TEMP/TMP使用工作区目录，见unit-final.log。
- `pnpm test:integration P02-03.history`：退出0，45/45，见integration-final.log；覆盖评分清除/其他标记保持、摘要分页、归档/旧分支/回收站恢复、取消收藏、墓碑、过期异主归属、非法游标和临时查询拒绝。
- `pnpm check`：退出0，494文件格式、类型/边界/清单和全量107项桌面用例发现通过，见check-final.log。
- `pnpm docs:check`：退出0，37项任务/交接/证据链接通过；`git diff --check`退出0。见docs-check-final.log及最后Git检查回执。
- 本地Electron首轮 `electron-local`：2/6通过（两项T14完整功能和布局），四项失败分别为三处旧导航断言把固定收藏链接当成可排序项，以及原T06整体45秒超时截断了其既定125秒Core连接等待。导航断言改为只枚举四个data-navigation-key；回归运行的整体用例预算设180秒，Core连接断言仍125秒，未修改产品性能或安全门槛。
- `electron-final`：5/6通过（三项导航、T14布局、T06编辑/分支/重启），新增的“Escape后焦点回点踩”断言失败。截图已确认收藏条目应排除共享胶囊按钮边框，平整列表修正通过四种主题/尺寸检查。显式保留评分请求前的触发按钮后，`electron-focus-final`最终定向2/2通过（T14功能、T06消息对话框/分支/重启）；未再次做视觉调整。共6个不同用例分轮通过。脚本verify-electron.ps1保留实际日志/退出码并备份、恢复原回归截图。

## 保留的失败

- 首轮unit：沙箱临时转译文件ENOENT；单worker和工作区TEMP/TMP补验通过。
- 首轮integration：44过/1项测试样本违反单profile singleton约束；改为仅在隔离fixture注入过期归属标记并恢复，45项通过。
- 首轮check：新测试将desktop设置声明成通用Record导致类型检查失败，已改为SettingsValues。
- 首轮Electron：6项均在沙箱中启动进程失败，未进入界面断言；生产恢复另遇构建目录EPERM。已保留electron-first日志/回执并转授权本地环境继续。没有禁用Chromium沙箱或放宽安全断言。
- 本地轮的导航枚举/整体用例超时、焦点恢复失败和首批胶囊边框截图均保留；本轮是分轮验证，不宣称首次或同轮6项全绿。焦点补验不重复进行视觉调整。

## 边界

最终汇总 `results.json` 绑定110份产品源码、4份测试源码及626份生产产物；source-frozen.json与production-snapshot.json逐项一致，生产Core不含installChatFixture。布局确认后仅message-history.tsx补焦点恢复，两个受影响桌面用例已在最终源码上补验通过；没有用首轮产物冒充最终验证。

verify-electron.ps1每轮保留、恢复已有历史回归截图并核对原SHA。原目录此前不存在的branches-and-feedback.png为本轮回归生成，已归入本目录related-tests/electron-local，原目录不留新增旧批次截图；最终T06截图保存在related-tests/electron-focus-final。

原启动命令保持：

```powershell
& "D:\Tapkit-public\docs\evidence\P02-03\session-load-2026-10-21\run-app.ps1"
```

`.test-data/current-ui-review.json`已指向本轮results，原指针另存launcher-previous-pointer.json。对原命令执行 `-CheckOnly` 退出0，110份源码/626份产物及原profile路径校验通过，未启动应用；见launcher-check.json/log。用户需先从托盘退出旧TapKit，再运行原命令载入本轮Core/UI，继续原T14样本；本轮没有代替用户重启或记人工通过。

本轮测试只用新建合成profile和fixture，不关闭人工测试窗口、不编辑原profile、不发真实服务请求。没有commit/push；本轮工程修复不代替用户T14复验，任务/live/gate状态保持。
