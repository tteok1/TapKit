# ADR0035：文件的任务附件使用记录

状态：2026-10-09 已采纳；P03-01 仍在实施。

文件详情此前只显示保存到会话/项目的引用，不能证明某个任务执行使用了哪个附件版本。P02 已持久保存 tasks/task_versions/runs 以及执行对应的用户消息附件，采用只读投影复用这些记录，避免建立第二套任务状态或把当前引用反写成历史使用。

files.usage 新增 records 与 recordsTruncated。每项返回 run/task/session ID、执行时的 taskVersion、对应 task_versions 的目标摘要、当前会话标题、固定 fileVersionId、创建时间和原 RunStatus。同一执行的重复附件去重；按时间与稳定ID倒序，最多显示100项并提示截断。保存引用和未接受的排队输入不产生任务记录；queued/cancelled 等实际执行状态明确呈现，不宣称模型已读取。旧版本历史无须迁移或回填。现有 FileOwner 仍仅允许 library/session/project，不新增工作任务写入或 P06 编排。

读取对每个关联表校验 profile、会话归属、删除状态和文件版本归属；引用名称也来自本profile未删除owner。损坏的消息JSON或非对象附件不进入记录。会话回收后隐藏、恢复后恢复显示，永久删除后跟随既有内容清理；回收站可读文件元数据，但不允许原件下载。DTO与摘要有界，无源路径；文本由React转义，查询不执行附件、解析worker或模型。

验证包含真实 ChatService 接受/取消/排队与重放、版本替换/SQLite重开、会话trash/restore/purge、合成损坏profile/JSON、任务历史版本和100条边界；Electron使用合成种子经真实Host/preload/Core显示、重启、删除恢复和旧版下载。夹具没有启动模型调度或helper；这些检查不代替P03原生解析验收。命令与结果见 docs/evidence/P03-01/task-usage-checkpoint-2026-10-09.json。
