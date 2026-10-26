# T14 收藏入口迁入聊天页

日期2026-10-26；分支 `codex/test-fixes-2026-10-26` / 基点9bfc156。接续上一轮T14修复，保留此前未提交的源码、测试和证据。

用户截图要求将收藏入口从侧栏移到“聊天”页顶部“归档”和“回收站”之间。本轮只改history-ui和sidebar-navigation：聊天页按“最近 / 归档 / 收藏 / 回收站 / 全部”显示，收藏继续打开既有列表，侧栏移除独立收藏入口；收藏页保留“聊天”高亮。原数据查询、消息定位、取消收藏和反馈存储逻辑保持。

反馈写入当前profile的 `db/app.sqlite` / `message_marks`，说明为note、举报勾选为report，消息ID为message_id；仅本机保存。当前验收启动配置指向的app.sqlite路径存在（只核对路径，未读数据库正文）。界面验证方法：保存后在同条回复“更多消息操作 → 本地反馈 / 举报”重开并核对说明/勾选，重启后再查看；取消评分不会清除反馈。本轮不读取用户真实反馈或执行外部举报。

## 验证结果

- 锁定工具链 `scripts/pnpm.ps1 check`：退出0，格式494文件及类型/边界/清单、全量107项E2E发现通过，见check.log。
- 修改既有T14桌面测试的真实入口路径和截图，验证按钮顺序、侧栏无收藏、收藏页聊天高亮；同时覆盖反馈持久化和原消息定位。首轮4/5通过（导航3项、T14功能/重启1项），布局在960/200%下因进入收藏后侧栏正常隐藏，默认仅可见元素的“聊天”定位失败；改为对隐藏的实际链接核验aria-current，未修改产品代码，最终四组合布局1/1通过，共5个不同用例分轮通过。首轮日志、失败截图保留，补验不冒充同轮5项全绿。
- 后端源码/契约未改；上一轮unit7及history integration45的证据保持，不为此次入口迁移重复执行。

## 边界

source-frozen.json与production-snapshot.json绑定110份产品源码、4份测试源码及626份生产产物，生产Core不含测试fixture，两轮产品源码一致。scope.json核对相对上一轮产品仅history-ui和sidebar-navigation变化，后端/反馈源码保持。verify-electron.ps1每轮备份、恢复原导航历史截图并核对SHA；本轮截图保存在此目录和visual-first，不覆盖上一轮T14证据。

原启动命令仍为 `& "D:\Tapkit-public\docs\evidence\P02-03\session-load-2026-10-21\run-app.ps1"`。本轮results及原入口CheckOnly校验见results.json、launcher-check.json/log；用户需先退出托盘旧程序，再运行原命令载入新界面。

所有桌面用例使用新建合成profile和fixture；原窗口、原profile、任务/live/gate保持，用户人工T14结论不由本轮替代。未commit/push。
