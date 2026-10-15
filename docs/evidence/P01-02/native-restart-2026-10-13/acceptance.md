# 智谱Chat：加密原生状态重启复用验收

## 2026-10-14 本case已通过

用户case8c0fc973-e4c8-4ece-b1c4-4232d0e4a9c4真实两阶段passed，正式只读复核native重启/复用及原profile账本通过，actual48+66=114、预留0无重复。本case无需重跑；结果见docs/evidence/P01-02/native-live-2026-10-14/review.json。以下为此前准备步骤/历史检查点。

这是开发专用入口。工程结果见results.json；真实两次请求尚未执行。原生状态正文、Key和解密值不会显示到终端或报告。

1. 完全退出TapKit，结束旧的开发启动终端。保持原隔离profile和test1/FlashX/普通Chat配置，每日预算仍2000000；不需要重输Key。
2. 在PowerShell运行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\Tapkit-public\docs\evidence\P01-02\native-restart-2026-10-13\run-native.ps1
   ```

3. 启动器先核对公开配置，再启动两个连续的独立Electron进程。首轮回复固定标记并加密保存；首进程退出后第二进程读取旧状态并携引用续答。无需界面操作。
4. 等待结束，回报终端最后的status和reportPath。若失败，停止，不重复执行；可结合该报告的固定阶段/错误排查。

这一次最多两次请求、每次最大输出128，无重试、后备、自动标题或记忆请求。实际请求分别计入原隔离应用正式账本，缺usage仍按预留估算核销；不提高预算、不清账本。每次运行生成独立case报告；失败/已消费的checkpoint不会自动重放。原应用仍运行、存在进行中的run/标题或未结算预留时会拒绝。

`-PrepareOnly`仅构建测试入口和读取公开配置，不启动Electron、不读取凭据或native正文、不联网、不发模型请求。Agent工程阶段只运行此准备模式和新建合成fixture的进程测试。

通过标准为两阶段均passed、进程身份不同、第二阶段nativeLoadsDuringAdapter=1及nativeReuseConfirmed=true、两次账本各结算一次且预算预留归零。普通ChatService策略保持，后台自动标题NETWORK_ERROR及其他渠道/价格/各自编号live缺口继续跟踪，不据此提升整个P01。
