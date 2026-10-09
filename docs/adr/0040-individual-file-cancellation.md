# ADR0040：按文件取消导入与按版本取消解析

2026-10-09；P03-01，FR-13-006。此前 files.cancelImport 只能停止整批，资料库也缺少内容读取取消入口。

files.cancelImport 增加可选 selectionToken，只允许当前批次中的 Host token 和原窗口。每项独立 AbortController 与整批信号组合；读取或暂存后的取消在版本提交前再次检查。等待项不读取源并写取消收据，已提交项保持成功，取消一项继续其余项；整批仍返回逐项状态，不把部分取消标整批成功。选择阶段可以单独释放选择；失败/取消项的“重新选择原件”发新授权与新请求，旧收据不会盲目重读。

新增有限公开命令 files.cancelParse，DTO 仅 fileVersionId。Repository 校验本 profile 的 live 文件版本，只取消对应 file.parse jobs，复用已有持久取消与租约 fencing；晚到结果拒绝发布，不取消该文件其他版本。资料库仅对 pending/parsing 提供取消，对 failed/cancelled 提供重试，并重新读取固定范围详情。成功、unsupported 与需 OCR 版本不提供无效的重试。

接口变更不增加路径、argv、profile 或任意 job ID 授权，不新增任务状态。真实 helper 的取消/kill/重试仍需原有 P03 native 验收；本地暂存取消、收据恢复、版本 fencing 和实际选择 UI 分别留证，不冒充真实 native 中断。
