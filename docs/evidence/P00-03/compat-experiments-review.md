# P00-03 路径与 LibreOfficeKit 兼容实验

> **路线更新（2026-09-30；以下实验是当前路线的输入证据，不是产品集成验收）**：Office 的 LibreOfficeKit unipoll/runLoop 适配是当前接入方向；MinGit AppContainer 盘符别名只作兼容实验，当前产品 Git 路径仍由可信 GitBroker 提供。必须把 LOK 安全适配正式接入并验证映射生命周期；未完成前不得宣称 Office 能力通过。无需为复用这些证据创建专用账户或账户级 WFP。

2026-09-18T08:00:22.787Z

兼容实验已成功：原版 MinGit status/diff 在 AppContainer 退出 0；锁定 LibreOffice 26.2.6.3 通过官方 LOK unipoll/runLoop + 临时会话盘符映射完成 DOCX/XLSX/PPTX。只读输入复验三格式通过；runtime/input 写入及越界读写拒绝；活跃回环服务宿主前后连通而容器不可达。PDF 可解析且中文视觉检查正常。所有别名精确撤销，Job 活跃进程归零。仍属本机实验，未改产品执行路径，正式原生 9/11 与 test Core/沙箱 9/9 记录不变。

## MinGit

原版 Git for Windows v2.55.0.windows.5 compat/mingw.c 的 mingw_getcwd 先使用 GetFinalPathNameByHandleW DOS，再回退 GetLongPathNameW。Microsoft/mxc issue 694 也报告 AppContainer 下 DOS 卷名解析 Access Denied。没有修改系统对象 ACL；改为 DefineDosDeviceW 为当前登录会话创建 Z:→已授权 workspace。Git 子进程 cwd 为 Z:\\，status/diff 均通过；helper 仍以原始路径做 pin/ACL，AppContainer SID 验证成功且网络 capability 为 0。精确目标删除别名成功。

证据 git-drive-alias.json、git-drive-alias-cleanup.json。别名分配并发/竞争、盘符耗尽、硬杀恢复与边界拒绝尚待测试，不将实验脚本作为生产实现。

## Office

锁定 LibreOffice 26.2.6.3 的 mergedlo.dll 提供官方 LibreOfficeKit API。desktop/source/lib/init.cxx 关闭 RequestHandler，避免原 CLI interinstance pipe；官方转换例子使用 documentLoad/saveAs。普通 LOK 初始化在容器内挂起，unipoll event loop 报 User installation could not be completed。映射只读 LibreOffice 根及可写 workspace 后，DOCX 转换成功；XLSX documentLoad 超时，普通宿主对照也复现。因此不能将全部故障归因于 AppContainer。

证据 lok-exports.json、lok-convert.json、lok-unipoll.json、lok-loop.json、lok-host-control.json、lok-alias.json、lok-alias-cleanup.json。实验 fixture 在 workspace 中，只检查原件哈希；尚不代表 T07 的只读输入/字体/恶意宏外链验收。

## 上游来源

- https://github.com/git-for-windows/git/blob/v2.55.0.windows.5/compat/mingw.c
- https://github.com/microsoft/mxc/issues/694
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-definedosdevicew
- https://learn.microsoft.com/en-us/windows/win32/fileio/defining-an-ms-dos-device-name
- https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/desktop/source/lib/init.cxx
- https://dev.blog.documentfoundation.org/2024/07/25/libreofficekit-for-document-conversion/

Bug 168431 的旧挂起报告已有 23afeaedf4d4a03943338fc39ae41f5c423e5997 修复，不能把它直接当作当前故障原因；需继续核对当前线程/消息循环。第三方 Sicos1977/LibreOfficeKit 的 Windows Excel/PowerPoint 警告仅作线索，不当作已验证修复或官方结论。

## 成功实验及适用边界

2026-09-18T08:14:41.722Z：LOK 的 SAL_LOK_OPTIONS=unipoll；在调用 init 的主线程执行 runLoop，工作线程串行 documentLoadWithOptions/saveAs/destroy。此方式在当前版本成功，不能断言之前卡顿已精确归因于某个上游 bug，也不需要降级到旧版本。LOKit 禁用 RequestHandler，避免原 soffice CLI 的 interinstance pipe。

- lok-loop-three-alias.json：三格式首次全通过，工作区生成输入；lok-three-pdf-validation.json 与 3 个 lok-three-*-1.png 记录解析与渲染；人工视觉检查中文无方框/乱码、版面可读。
- lok-readonly-alias-verified.json：改用 LibreOffice 本身附带的 Python 3.12.14 运行 ctypes 适配层；runtimeRoot 为 LibreOffice；inputRoot 为独立只读 fixture 目录；workspace 私有可写。映射 Y:/X:/Z: 分别指向这三个已授权根。全部三格式通过，PDF 大小依次 73214/18428/19276 bytes，原件哈希不变，负载退出 0，Job activeProcesses=0。
- lok-readonly-alias-verified-cleanup.json：宿主连接同一个活动 127.0.0.1 服务前后都成功；只收到 2 次宿主连接；容器连接超时。未修改网络 capability，仍为 0。3 个映射均精确删除。
- 输入与 runtime 写入、受控未授权 sibling sentinel 读写均拒绝。仅覆盖这些实验路径，不代替全部 T19/所有网络/宏外链恶意样本。
- 首次只读轮次 lok-readonly-alias.json 因测试只接受 PermissionError 而未接受网络丢弃导致的 TimeoutError 提前失败；后轮增加明确网络分支和前后宿主正向对照。旧报告保留。

命令：node .cache/P00-03/git-drive-alias.mjs；node .cache/P00-03/lok-readonly-verified.mjs。完整 Python 和 helper 请求亦内嵌各 JSON。实验源码按原路径归档清单 compat-experiment-scripts.json；恢复相同相对路径后可复现，不能直接从 archive 目录执行带原相对 import 的 .mjs。脚本只适合串行诊断；不得直接部署。

## 接入前仍须完成

1. 在 helper 内创建和管理经 pin/身份校验的临时映射；验证并发分配、冲突、盘符耗尽、精确撤销和持久化恢复；避免误删其他会话/进程映射。映射不替代 ACL；仍拒绝不可信 reparse/UNC/ADS。
2. 封装 LOK 适配层，明确版本/C ABI、初始化 readiness、错误与取消。实验 worker 固定等待 2 秒，不能作为正式 readiness 契约；线程异常也须传回主进程。
3. 补只读原件、字体随包、宏与外链恶意样本和完整 T07/T08/T19；在独立 test 标准账户复测。并验证硬杀 helper/父进程后 ACL/profile/映射回收。
4. 正式执行路径目前仍是 soffice CLI 和原 Git cwd；需接入后重跑正式 11 项，能力报告不得凭本实验改 available。任何接口调整先同步 ADR/契约。

本次已满足“寻找兼容方案并实验成功”的研究目标，但不代表 P00-03 已完成。P00-gate 保持 failed，未进入 P01。

最终 PDF/映射核验：lok-readonly-pdf-validation.json 显示只读轮次三份 PDF 均单页、中文标题可提取，渲染像素与已人工检查的三张 PNG 完全一致；QueryDosDeviceW 查询 X:/Y:/Z: 均不存在（Win32 2）。文档与差异检查见 compat-experiment-validation.json。
