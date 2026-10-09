# ADR 0031：原件下载的Host保存授权

日期：2026-10-06。状态：accepted（实现中）。

Renderer的saveOriginal仅接收FileGetSchema的文件ID、可选版本及owner；Host先请求受控文件元数据，再打开保存对话框并冻结版本。路径只通过私有files.export消息传给Core，不接受公共files.export请求，不把源路径或原件字节返回Renderer。

Core FileRepository.original读前和读后验证profile、版本、未删除状态及归属。解析失败不阻止下载原件；指定旧版固定读取旧blob；未固定版本时读取期间换版返回CONFLICT。

FileExporter拒绝相对路径、非法名称、junction及真实父目录不一致，wx创建新文件，绝不截断既有用户文件/托管blob；需要另选未占用文件名。固定256KiB分块写入/fsync，写后再验证原件权限；取消/窗口关闭/停止时终止并仅清理自己创建且身份匹配的目标。无法核验或清理返回SIDE_EFFECT_UNKNOWN。最多2并行、120秒截止，Host等待130秒。

无新依赖或schema迁移，未调用受限helper。五项合成集成验收覆盖真实文件字节、失败解析仍下载、既有文件保护、junction拒绝、旧版、读中删除和写后撤权/取消清理。后续ADR0032的真实Electron验收已覆盖Host/preload/Core原件保存和批量保存框取消；对话框选中路径仅使用测试合成返回值，交互式系统选择框未人工验收。批量下载由UI逐项调受控保存，不伪造全批成功。
