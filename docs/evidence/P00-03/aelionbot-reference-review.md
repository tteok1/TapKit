# P00-03 AelionBot 参考实现核查

- 核查日期：2026-09-17。
- 用户指定仓库：[FoyonaCZY/AelionBot](https://github.com/FoyonaCZY/AelionBot)。
- 固定提交：101935cda6071a4854d403c0b8bd3d602d44d729。
- 方法：读取 GitHub main 的完整文件树（truncated=false），获取 electron/runtime/scripts/tests 的相关文本源码及定点文档共 308 文件；逐文件核验 Git blob SHA1。未安装依赖、未执行第三方代码或测试。
- 证据索引：docs/evidence/P00-03/aelionbot-reference-source.json。源码缓存位于忽略目录 .cache/references/AelionBot-20260917，不作为 TapKit 源码提交。
- 本次只研究 P00-03 的可借鉴实现；未改变隔离架构、运行组件或能力状态，没有新增原生通过证据。

## 结论与范围

AelionBot 的主要工作环境为 QEMU/Linux VM，Office 预览通过 VmController.executePython 在 guest 执行。宿主工具另经用户审批运行普通进程。它不使用 TapKit 的 Windows AppContainer + Job Object + 零网络 capability 执行契约。

在上述 308 个文件中检索 AppContainer/CreateAppContainerProfile/DeleteAppContainerProfile/GetFinalPathNameByHandle/CreateNamedPipe/JobObject/MinGit 等关键符号，未找到解决 TapKit 当前 Windows 管道、DOS 路径规范化或容器 ACL 恢复问题的直接实现。此结论限于本次固定提交和核查范围，不覆盖其他分支/历史。

## 对应问题与参考价值

| TapKit 缺口 | AelionBot 实际实现 | 可采用范围与限制 |
| --- | --- | --- |
| Office 启动管道失败 | office-preview.ts 用 Linux guest 中的 LibreOffice；临时原件副本、独立 UserInstallation、宏等级、链接设置、65 秒超时、输入/输出大小限制、失败缓存清除 | 可借鉴错误分类、边界限制和缓存失败清除；私有 profile 等 TapKit 已有。没有 Windows LOCAL 管道适配，不能直接消除 AppContainer Win32 5 |
| Git cwd 退出 128 | desktop-profile.ts 在 guest 安装 Linux git；host.ts/host-platform.ts 为普通宿主命令封装 | 未找到 MinGit/GetFinalPathNameByHandleW 修复；宿主执行不能替代 TapKit 的隔离验收 |
| 正常退出与卡住清理 | Shutdown.run 共享同一 Promise；停止派发、等待有界 closeWork、关闭 VM、保存状态、退出；VM 关闭分层等待并核验身份 | 可改写为 TapKit 的退出协调器；异常被捕获后仍退出的行为不能直接当作安全清理成功 |
| 旧 PID/误杀 | owned-qemu.ts 先持有 OS 进程句柄，再核对映像、启动时间一致性、UUID、两块磁盘参数；状态命令在同一 QMP 连接核验 UUID | 借鉴“存储 PID 不足以证明归属”。TapKit 应核对 helper/负载实际身份、runId/leaseEpoch/SID，不照搬 QEMU 参数或 taskkill |
| 强杀后的权限恢复 | vm-storage.ts 有 pending/committed 持久事务、路径约束、恢复；store.atomicJson 用临时文件、fsync、rename | 可借鉴事务恢复结构，但该实现恢复 qcow2 文件，不会回收 AppContainer profile/ACL；TapKit 仍需自行实现恢复日志 |
| 安全回归 | shutdown.test.ts 含外来 UUID、不可信 PID、退出期间延迟启动、清理挂起等；vm-storage.test.ts 含中断事务和非法恢复路径 | 借鉴测试场景，重写为真实 helper/Job/ACL 测试。此次仅阅读，未声称这些第三方测试已经在本机通过 |
| Office 质量验收 | file-preview.test.ts 的转换用例主要 mock executePython，并检查缓存、边界和 PDF 标头 | 不能补充 TapKit 的三格式真实转换、PDF 可打开、中文字体、宏/外链攻击样本证据 |
| Node/ConPTY 兼容 | terminal-sessions.ts 的 host 用 node-pty/普通 spawn，guest 用 SSH PTY；包含 node-pty worker 释放处理 | 属于不同执行边界，没有修复 AppContainer 内 libuv 默认管道。TapKit 自有 ConPTY 已通过，暂不引入新库 |

## 建议转化为 TapKit 的最小实现

1. 借鉴事务模式，在负载不可写的宿主目录维护恢复记录；在修改权限前落盘 runId、leaseEpoch、profile/SID、规范化目标及文件身份、阶段与已尝试授权项。每次推进写入持久记录。
2. 恢复先核验任务/进程归属和活跃状态；仅撤销该任务 SID 的授权项，不用整份旧 DACL 覆盖后来权限。清理成功核验后再删除 profile 并完成记录；结果不明或部分失败仍关闭执行能力。
3. 正常退出阻止新派发和晚到启动，统一协调取消、Job 清理、权限回收和状态保存；有界等待不等于清理成功，失败留待恢复。
4. 补真实测试：每个授权/清理阶段强杀 helper、重启重复恢复、伪造记录/错误 SID/旧 PID、恢复失败、退出过程中延迟启动。保留当前进程树归零与目录权限证据。
5. Office/Git 继续单独定位和修复原生兼容；本参考项目未提供可直接应用的补丁。架构与运行时决策若变化，另写 ADR 并更新锁与真实验收。

以上为从参考代码推导的 TapKit 方案，尚未实施或通过测试。P00-03=in_progress，P00-gate=failed。

## 固定来源

- [Office preview](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/office-preview.ts)
- [Linux guest packages](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/desktop-profile.ts)
- [Owned Windows process](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/owned-qemu.ts)
- [Shutdown coordinator](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/shutdown.ts)
- [Bounded VM shutdown](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/vm-shutdown.ts)
- [Storage recovery transaction](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/vm-storage.ts)
- [Shutdown tests](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/tests/shutdown.test.ts)
- [Storage recovery tests](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/tests/vm-storage.test.ts)
- [Office preview tests](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/tests/file-preview.test.ts)
- [Host terminal](https://github.com/FoyonaCZY/AelionBot/blob/101935cda6071a4854d403c0b8bd3d602d44d729/electron/core/terminal-sessions.ts)
