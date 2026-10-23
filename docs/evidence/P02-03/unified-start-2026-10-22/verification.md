# 统一首页 / 新建任务 UI 验证

2026-10-22；D:/Tapkit-public / ui_fix / 394418f。最终源码、生产产物和命令回执以本目录 results.json 为准。

## 交付

- 首页与“新建任务”共用页面，聊天/临时聊天/工作横向选择条带 hover 说明及键盘操作；项目页继续创建项目。
- 用户明确确认三模式共用文字、引用与待添加附件，切换不重建输入框、不提前创建会话。首次提交建立对应记录，工作保存草稿，临时聊天按原内存服务退出清理。
- 保留“从这里开始”，删除介绍及独立模型链接。推荐问题按场景变化，可隐藏/恢复且保留偏好。输入停靠底部；未配置模型时显示指定提示及框内“设置模型”。
- inputs.references 无 sessionId 时限当前 profile 可明确选择的资料，发送仍按目标会话核验版本/权限。物理 File 仍走正式 Host 令牌，只有无路径 File 使用原字节通道。
- 修复工作草稿交接被旧输入框清空的竞态：已交接内容不再重复卸载保存，未加载完成的草稿不写空。共享首页草稿在路由交接后清理。翻译逻辑未调整，selection-v3 保留。

## 实际验证

| 检查 | 结果与回执 |
| --- | --- |
| pnpm test:unit | 354/354；unit.log、service-checks.json |
| pnpm exec vitest run --config vitest.config.ts --project integration P02-01 P02-02.chat P02-03.history P03-03 P04-03 | 85/85；integration.log、service-checks.json |
| 完整 P02-01 与相关发送/临时清理/翻译/物理附件导航 Electron | 18个不同用例分轮通过：首轮14过/4失败，最终补验6/6，含2个已过的受影响回归；e2e-regression.log/json、final.log/json。不称单轮18全绿。 |
| pnpm check / pnpm docs:check / git diff --check | 实际命令、退出码及耗时见 checks.json，含全量用例发现。 |
| 生产构建 | 测试入口 finally 恢复生产；最终绑定源码/产物 SHA，核验 fixture 不进入 Core。 |
| 布局 | 实际1441/961宽（Windows取整1px）、100%/200%、浅深主题；geometry.json。输入框不越界，短窗口上方独立滚动。 |

初轮两个新用例因测试 UUIDv4 被既有 v7 契约拒绝，修正测试后完整回归发现工作交接清空、旧浮层按 dialog 而非 region 定位，以及附件测试总45秒/启动15秒不足。修复时序并更新定位/等待后，补验覆盖后端保存的工作文字及附件、普通发送、IME/队列、跨页附件归属、Host 选择释放。初次沙箱单测因共享临时模块目录/链接权限失败，保留 unit-sandbox-failed.log；后续用仓库临时目录实际通过，不放宽业务契约或隔离。

截图按一轮批量检查及一次必要修正复核完成：去掉通用样式覆盖造成的设置/推荐开关边框，收紧短窗口顶部间距；未进行额外视觉循环。

## 历史证据恢复范围

完整回归后的 Python 恢复旧 PNG 遇到 OSError 22，后续确认映射中的 PNG 无法原地截断。该轮开始前无已跟踪旧证据改动；21个覆盖产物已使用初始 Git 字节恢复。补验采用持久逐文件备份；原生写入仍遇到映射限制，已通过带备份的原子 File.Replace 恢复9个文件并核验旧跟踪证据无差异，final.json 保留初次恢复失败及重试退出0。

旧未跟踪截图的初始字节相同性在首轮异常后无法证明，不宣称全部历史截图不变；旧结果 JSON 不充当本轮通过证据。本轮失败/补验单独记录，新输出收集到 related-tests。

## 启动与边界

原入口保持：`& "D:\Tapkit-public\docs\evidence\P02-03\session-load-2026-10-21\run-app.ps1"`。最新生产快照由 .test-data/current-ui-review.json 指向本目录；-CheckOnly 校验回执见 launch-check.json，不启动或关闭应用。已有窗口需要用户自行从托盘退出后重开才能载入新产物。

全部测试使用隔离资料及合成模型，真实供应商调用0，原业务库无手工写入，原窗口未关闭。工作执行及临时聊天原有文件权限/导入边界不扩展。无 commit/push，不提升功能/live 或阶段 gate 状态。
