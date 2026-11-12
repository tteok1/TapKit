# CI #100 画布回复定位回归

- [CI #100 的 Electron 作业](https://github.com/tteok1/TapKit/actions/runs/43231256398/job/131226840726) 对应提交 `27e2fe7`。P00-01 沙箱桥接用例已通过。59/60 条 Electron 用例通过，唯一失败为 P10-01 从聊天回复打开画布并验证双窗口冲突。`check` 和 `office-native` 作业均通过。
- 原测试全页按精确文本查找回复。自动标题先到达时，顶栏标题和助手回复正文同时命中，Playwright 拒绝选择不唯一的元素。
- 隔离用例预先设置与助手回复同文的会话标题，复现这一场景。测试在对应助手消息中等待回复完成，然后打开该消息的菜单和画布。双窗口保存冲突与副本断言继续执行。
- 本机隔离复跑 `pnpm test:e2e -- --grep 'P00-01 sandbox bridge errors|P10-0[12]'` 退出码 0，7/7 通过。`pnpm check`、`pnpm docs:check` 和 `git diff --check` 均退出 0。
