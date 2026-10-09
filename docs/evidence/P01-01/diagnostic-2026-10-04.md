# P01-01 用户实测失败与诊断补充

日期：2026-10-04；checkout：D:/tapkit/TapKit；branch：codex/p01-01；HEAD：3840347+working-tree。

用户在独立.test-data/P01-01-live-manual配置OAuth，截图显示“登录完成，请检测模型连接”，GPT-5.6 Luna检测失败STREAM_INTERRUPTED；用户随后确认GPT-5.5结果相同。未读取真实凭据，未由代理执行真实API调用、刷新或注销。根因尚未确认，不能据此断定模型权限、网络代理或OAuth实现错误；R01配置已提供，完整live验收待完成。

本次增加枚举化诊断字段并显示文本/工具阶段、HTTP状态（如有）和上游error code。区分模型请求前失败、网络、非SSE内容、解码、读流和帧终结；不打印原始响应/异常/headers/token。补充识别非SSE网关内容，避免尝试当SSE解析；保留已捕获上游错误，避免后续读流异常覆盖。决定与契约见ADR0011。

回归：完整build退出0；unit37/37（最终结果见diagnostic-unit.log）；相关integration58/58（原50+8诊断回归）；P01-01实际Electron4/4（包括新增utilityProcess成功及网关诊断用例）。首次unit35/37失败是原SSE夹具未设Content-Type；已补正确MIME，保留原EOF/多行/凭据保护断言并验证新增诊断字段。check/docs:check和源码SHA256以diagnostic-results.json为准。

证据：diagnostic-build.log、diagnostic-unit.log、diagnostic-integration.log、diagnostic-electron.log；没有真人账号或聊天内容。早前repair-results.json仍为前次修复快照，不能覆盖本次未完成的真实连接问题。

下一步：从托盘退出开发实例，重新启动相同独立profile，执行一次检测并记录新版完整诊断。只需失败阶段、固定reason和HTTP状态，不复制回调地址或token。真实检测通过后再按P01-01交接执行显式opt-in live；最终脚本会刷新并注销测试账号。当前任务in_progress，未提交/推送，P00门禁保持failed。
