# 0005：P00-02 基础契约与恢复边界

- 日期：2026-09-17；状态：采用。
- 依据：04 §1—5、05 §1/3—5、P00-02；未增加外部依赖版本。

Core 是业务 SQLite 唯一写入者。Host 的单实例锁先于 Core；多窗口共享它。Core ready 携带 protocolVersion=1/schemaVersion=1，未握手不转发业务请求。Renderer 只获得逐方法白名单，不暴露通用 invoke。内部 request 消息仍由 Core 严格校验。

本任务提供 app.bootstrap、settings.get/set（profile 范围的已定义基础偏好）、providers.saveApiKey（仅保存，status=unconfigured）、events.subscribe/replay、data.backup、jobs.cancel。其余 v1 命令返回 FEATURE_NOT_AVAILABLE。jobs.cancel 是基础作业取消扩展，不注册产品定时任务。事件只包含可显示 EntityView；P02 再增 session/message 操作和草稿流式语义。资源/定位/验收 DTO 已定义，不等于相应工具已开放。

写回执与业务状态、事件、outbox 同事务。requestId 同 payload 返回持久回执，异 payload 返回 CONFLICT。CAS 错误补充 currentRevision。公开 UUID 使用 v7。回执包含 schemaVersion=1 包装；凭据在 Host 入站即从转发载荷和诊断中剥离，只有 credentialId 入库。Vault 按当前 Windows 用户 DPAPI 加密，目录限制为当前用户；不可加密即拒绝，不标连接成功。

jobs/outbox 使用 5 秒心跳和 15 秒租约，回调核对 owner/epoch/有效期。只有已实现的幂等本地 blob.gc/data.backup 被注册。未知外部副作用不能接入此自动恢复队列，后续工具须自行 reconcile。事件传输允许重复，按 seq/eventId 去重；不是跨进程 exactly-once 保证。

0001 只含本任务基础表；未来领域 ID 暂保留 TEXT，所属迁移建立相应实体/FK。JSON 字段由 contracts 版本化 schema 定义，未来 repository 写入须先校验；临时会话不落本迁移的 sessions（temporary 恒为 0）。

blob 先 fsync/同盘 rename 后登记；GC 与 blob 写入/备份共享 I/O 串行队列。备份使用 SQLite backup API + 哈希清单，排除 secrets；每日备份保留最近 7 份。删除先隐藏版本并留下墓碑，完整产品清理/导入恢复仍属 P10-03。损坏库自动寻找最近通过完整性/哈希校验的快照，原数据库/WAL/SHM移入 DATA/db/quarantine 保留；恢复后重放先行 fsync 的文件删除日志，防止旧快照复活删除。无完整快照或遇到较新 schema 则保留原件、拒绝写入并显示恢复提示。完整跨机器导入/清理交互仍由 P10 实现。

窗口关闭保留托盘和后台 Core，菜单/托盘显式退出先停止派发、取消幂等本地作业并关闭数据库。普通崩溃最多连续重建三次；租约未过期不抢占。该进程边界不被用作 Windows OS 隔离证明，P00-03 尚未验证。
