# ui_fix CI55 修复记录

2026-10-23；分支ui_fix；失败基线cb5b099。远程原始运行：https://github.com/tteok1/TapKit/actions/runs/39947832462 。

## 原因和修正

CI55的Check、unit360、integration351、性能、标准用户原生验证、Office退出诊断和startup-diagnostics通过。Electron 47/50通过，3项失败的原始摘录见ci55-failures.log；完整日志和失败trace保留于本地隔离目录，未将整个远程产物再次加入Git。

1. 两项聊天用例在page.reload后仍假定原会话存在于主区，与ADR0058正常启动/刷新默认首页的设计不符。失败快照确为新建任务页。新增reopenSessionFixture按相同sessionId从侧栏重开，先断言首页，再继续原有标题失败持久化/无重放、IME、排队/停止断言，不创建替代会话。
2. 新附件用例直接要求物理文件解析ready，未区分原件导入与实际host token的原生解析能力。与现有P03-01测试保持一致，从真实bootstrap读取能力；available必须ready，否则必须failed且errorReason=SANDBOX_UNAVAILABLE。额外核验未取消文件的SHA256、原件内容和固定版本引用，取消的同批文件仍不得回到草稿；不修改生产能力检查或执行器。
3. 本地冷启动超过旧测试的15秒启动等待，聊天fixture统一为现有125秒Core就绪上限，并为整例提供180秒时限，功能断言时限保持。原生复制保护钩子移入真正操作系统剪贴板的describe；只测附件的用例不读取剪贴板。原剪贴板有无法备份的格式时，实际复制测试继续拒绝执行，保护逻辑没有放宽。

仅改E2E测试和fixture，不修改产品UI、Host、Core、翻译、附件处理、权限或CI工作流。109份产品源码逐项与上一轮已验快照比对保持。

## 验证与边界

最终本地和远程结果分别以本目录的运行回执及CI链接为准；验证进行中时不宣称CI已通过。所有Electron使用合成隔离profile，原窗口/profile不变，无真实模型请求，不合入main，不提升原live/gate。

早期准备失败保留：targeted-electron的grep未包含P02构建标记而未启用fixture；corrected-electron在本地旧15秒启动等待和剪贴板备份前置处失败，仅物理文件回归通过。之后修正初始化并使用带P02标签的命令复测，未通过重试或跳过业务断言掩盖原失败。

本地最终相关Electron 5/5通过（final-local-electron.log/json，退出0，266.67秒）；包含标题失败持久化、IME/队列/停止、附件批内取消、长文本粘贴和物理文件引用。官方脚本已恢复生产构建，历史证据7份按原字节还原。此前准备失败的回执保留，不计入通过。最终静态检查及远程CI待完成。

109份产品源码哈希不变；原启动入口run-app.ps1 -CheckOnly退出0，626生产产物与既有已验快照一致，测试fixture未残留。最终check首轮仅进度文档格式失败（check-final.log），格式修正后复查；未引入产品修改。

最终pnpm check退出0（check-final2.log/json，收集105个E2E用例）；pnpm docs:check退出0（docs-final.log/json）；排除原始证据的git diff --check退出0。当前提交只包含3个E2E文件及本次进度/证据，待推送ui_fix并复验完整远程工作流。
