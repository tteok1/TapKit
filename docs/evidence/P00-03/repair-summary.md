# P00-03 修复过程与经验摘要

更新日期：2026-10-02。当前状态：implemented_and_verified；P00-gate=passed。本文汇总已经核验的解决方式，历史尝试与失败结果保留在证据和 history.md 中。

## 最终结果与适用范围

P00-03 的核心困难是：让 Node、Python、Office 等程序在严格 Windows 隔离中真正工作，同时证明它们无法越权；管理员通过还不能代替普通用户通过。

最终采用每次任务独立的 AppContainer（Windows 应用容器）+ 最小文件权限 + Job 进程树管理 + 禁止网络。Office 使用 LibreOfficeKit 适配，Git 使用只接受固定操作的可信 GitBroker。专用 Windows 账户方案及其系统读取失败属于历史路线。

代码验收提交：`b901ef7ec788bcfcec772adcfc564974ab64f32b`。[CI 46](private-archive:TapKit) 全部成功：安装/检查/构建退出0，单元17/17、管理员集成46/46、Electron8/8、独立medium/non-admin标准用户22/22；无失败、跳过或缺失用例，三项能力available。具体步骤、源码和产物指纹、标准用户用例及行为证明见 [ci-run46.json](ci-run46.json)。文档清理不改变该代码验收结果，不重新执行原生测试。

## 问题、解决方式与证据

| 遇到的问题 | 现在怎样解决 | 可复核的依据 |
| --- | --- | --- |
| 普通启动方式不能直接套进沙箱。Office 内部管道和 Git 路径查询出现权限/兼容失败 | Office 改用 LibreOfficeKit 的受控加载和运行循环，并限定运行库、input、workspace 路径映射；Git 交给固定操作的 GitBroker。没有改成任意宿主进程执行 | office-ipc-probe.json、compat-experiments-review.md、runtime-compatibility.md；最终三格式转换和GitBroker测试 |
| 中间尝试的专用账户路线又卡在系统资源读取预检 | 按已确认的方向回到独立 AppContainer，移除旧账户执行前置；旧 KnownDlls/Kernel32 失败没有移作新路线结论 | sandbox-route-reassessment.md、account-after-uac.md、当前任务规格补丁；最终独立标准用户验收 |
| 隔离后还要正确取消、限制资源，并收拾强杀留下的资源 | 用 Job 管理整个进程树；保存属于本次运行的恢复记录；核验身份后恢复 ACL/profile/盘符映射。并发、取消、强杀及下一次恢复都有真实测试 | ci-run46.json、P00-03.sandbox/P00-03.office集成测试 |
| 管理员能运行，普通用户下 Node/Python/Office 却启动失败 | 发现目录有沙箱权限，而程序子文件没有继承到；给 CI 私有副本的宿主账户补齐管理子文件 DACL 的权限，使既定读执行权限正确传播。沙箱获得的权限掩码未扩大 | ci-run39.json 与 ci-run40.json 的清理前 ACL 对照；最终22/22 |
| 为定位问题加入的 Node 管道探针，反而破坏已通过的管理员测试 | 恢复之前成功的继承标准输入输出方式；诊断改为不阻塞事件处理的采集，并在运行前观察权限。进程数不再被误当作子程序已运行的证明 | admin-node-rollback.json、ci-run38至40.json、ci-fork-spawn.md |
| 部分测试可能“失败也算通过”：进程创建不等于负载运行，非零退出不等于内存限制有效 | 增加负载ready标记、真实内存分配和预期退出码；fork先测基线，再确认子负载ready、额外创建尝试及最终清空。保留越界、网络和清理断言 | ci-fork-spawn.md、ci-run40.json、ci-run46.json及当前严格集成测试 |
| 旧/不完整探测报告可能错误启用能力；迁移时 CI 参数还曾误跑旧测试 | 能力报告绑定helper、运行库和验收源码字节；22项必须完整通过，缺失、失败或来源变化即关闭能力。修正迁移期参数转发，并对当前路线执行完整验收 | ci-exclusion-forwarding.md、runtime-probe/required-cases源码、ci-run46.json |
| Office 外链配置值写反；仅看配置文本不能证明恶意文档被阻断 | 按锁定版本官方schema修正 Calc/Writer 的禁用值。构造真正能执行的宏和能更新的外链，在同一隔离边界做启用对照，证明样本有效、生产默认阻断、原件不变 | office-security-plan.md、ci-run45/46.json；office-render内两个身份各七份PDF |
| 新增 PDF 解析测试清理 API 用错；冷启动又超过默认测试时间 | 销毁PDF加载任务，并增加真实PDF单元回归；只给该依赖冷启动用例30秒预算，保留文本/清理断言，不改原生执行限额 | ci-run41/42.json、P00-03.pdf-parser.test.ts；最终17/17 |
| PowerShell 单项返回值被当字符串索引，清理错误掩盖真正结果 | 明确按数组接收返回值，保留完整映射目标；撤销前仍进行精确身份匹配 | ci-run43.json、office-security-plan.md、office-control-mappings.ps1 |
| Office 对照已经导出PDF，却仍无法结束；延长等待也没用 | 定位到还持有Office的原生对象引用。先释放文档/Desktop/Context引用，再销毁引擎；恢复原5秒退出检查 | ci-run44至46.json；锁定版PyUNO引用析构源码来源在office-security-plan.md |
| 测试已全绿，但最终 PDF 没进归档 | Electron 输出目录曾清空共用test-results；改为独立子目录，并归档标准用户七份固定名合成PDF。同轮核对哈希、解析文字并查看六张中文预览 | ci-run45/46.json、office-render及standard-user子目录 |

## 后续任务可以复用的经验

- 先保住已通过的基线。新增诊断尽量不改变原来的权限、句柄、输入输出和时序；一次验证一个假设。
- 分清启动失败、负载失败、清理失败和证据采集失败。错误发生在哪一层，修复就针对哪一层。
- 安全测试要证明“样本确实有效”和“系统确实阻断”。不要只检查配置文本、事件名称或退出码。
- 管理员与普通用户必须分别实测。目录权限、子文件继承及修改权限的权限是不同问题。
- 取消、强杀、并发和下一次恢复属于交付条件；清理只处理身份匹配、由本任务创建的资源。
- 每次结果绑定确切源码和产物；旧日志、旧路线、部分用例和不同主机报告不能冒充当前通过。
- 引擎卡住时先检查生命周期和实际阶段，而不是不断延长超时；验收还要确认产物留存、中文显示和原件保全。

## 本机仍保留的限制

本机应用控制拦截未签名helper，因此原生验收来自Windows CI；没有关闭或绕过系统策略。不同目标Windows必须重跑指纹绑定的22项probe。本地全量check仍受既有protected acl-probe的Prettier EPERM影响，该目录权限保持原状。后续文件业务界面、签名与安装交付按对应任务验收；本次不进入P01。

## 过程文件整理

进度状态已同步于CURRENT、INDEX、P00-03、requirements、RESOURCES及P00-gate。重复的进度/验收快照集中归档到history.md，日常接续使用当前任务记录与本文。

本地清理范围为`.cache/P00-03`、本任务`.test-data/P00-03*`临时目录以及两份旧`test-results/P00-03-native*.json`。包括CI下载副本、一次性编辑/分析脚本、官方源码研究副本、重复PDF/图片、试验SDK副本和测试负载。正式依赖/运行库、核心源码、自动测试、最终PDF/预览、CI摘要、决策资料与历史原始证据保留。受保护acl-probe及其他任务数据保留。

清理前检查本仓库无活跃进程；递归目标绝对路径均在工作区内；只对身份和目标已确认的12个测试junction移除链接本身，再清理普通目录。最终清理数量和检查结果在完成后写入下方。

清理实际结果：523个目标全部移除（520个测试目录、1个任务缓存目录、2份旧测试结果）；共2417个普通文件、237609761字节，约227MiB；12个已核验junction均先移除链接本身。复查`.cache/P00-03`及`.test-data/P00-03*`剩余0；最终验收证据完好，protected acl-probe保留。清理命令和范围预检退出0；文档与差异检查在提交前完成。

整理检查：docs:check、进度文档定向Prettier、git diff --check退出0；归档内容保全、需求表仅四行改动且其他行/行尾字节不变、最终14份PDF/6张预览SHA256保全、本任务临时目录剩余0均通过。锁定运行库和依赖保留；未修改核心源码。整理时使用的本地辅助脚本和检查副本随后一并删除。
