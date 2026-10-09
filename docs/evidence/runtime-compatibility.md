# P00-03 Windows 运行时兼容性

## 当前验收（2026-10-02）

源码`b901ef7ec788bcfcec772adcfc564974ab64f32b`的[CI run46](private-archive:TapKit)全部success；P00-03=implemented_and_verified、P00-gate=passed。管理员integration46/46、独立medium/non-admin标准用户22/22、完整P00 Electron8/8。命令、源字节fingerprint、日志/产物指纹及真实对照记录见P00-03/ci-run46.json。

| 组件/边界 | 当前真实结果 |
| --- | --- |
| Rust helper | 锁定Rust/SDK/CRT编译；独立AppContainer/profile/SID、最小ACL/Job/零网络；路径、越界、DACL攻击拒绝与恢复通过 |
| Node/Python | 中文空格目录只读input/写workspace；child真实成功；取消、fork、输出、内存、超时和硬杀整树通过；Node验证inherit stdio |
| ConPTY | 容器内真实交互，Job/网络/ACL边界继续生效 |
| Git | 可信GitBroker固定status/diff和私有字节快照；模型参数、恶意配置、external diff/SSH和元数据指针拒绝；不在容器内运行MinGit |
| LibreOffice | 锁定LOKit unipoll/runLoop与任务私有profile；三格式中文PDF渲染/原件保全通过；宏禁用、Calc Link=1/Writer Link=2；真实宏/外链默认阻断且隔离内启用对照有效 |
| 生命周期 | 并发独立SID/ACL；强杀租约回收；Office仅撤销记录且身份匹配的盘符；损坏文档超时后清理0并恢复正常转换 |
| 能力门禁 | 完整标准用户22项及运行源码/字节指纹通过才available；缺失/失败/来源变化均失败关闭，存储仍可用 |

该报告证明CI目标环境，不替代当前本机probe：本机unsigned helper被应用控制阻断、protected acl-probe导致本地全量check EPERM；均未绕过。签名与安装交付留给对应后续任务。原生报告不跨不同目标环境复用。合成PDF/渲染指纹保存在P00-03/office-render。

## 历史检查点（以下保留当时状态）

2026-09-17；D:/TapKit；main 基线 071d15c5c45db4e91d232a4d26db7904061bc89b + 当前未提交 P00-03 改动。本机是管理员组成员的 Medium token，不是独立标准用户结果。

| 组件/边界 | 真实观察 | 验收状态 |
| --- | --- | --- |
| Rust helper | Cargo.lock + 锁定 SDK/CRT/Rust LLD 真实编译；AppContainer SID 校验；Job kill-on-close/内存/进程/输出上限 | 已实现，整体安全验收未完成 |
| Node | 中文空格目录读 input、写 workspace、继承输出的子进程；取消与资源限制 | 本机通过；默认 child_process pipe 已观察到 libuv 兼容问题 |
| Python | Unicode 输出、子进程、超内存限制 | 本机通过；DOS 实路径查询仍有访问拒绝警告 |
| 网络/路径 | 公网 EACCES；loopback/metadata 未连接；UNC/ADS/../junction 根路径拒绝 | 已有真实用例；完整标准用户证明待补 |
| ConPTY | 标准句柄明确置 INVALID_HANDLE_VALUE，保留伪终端属性；Node 交互用例通过 | 本机通过；test 标准用户修补回归亦通过（用户回传） |
| MinGit | status 返回 128，Unable to read current working directory: Permission denied | failed |
| LibreOffice | soffice.com 在 AppContainer 中退出 1；未生成可验收的三类 PDF | failed |
| Core | 三项执行能力失败时 storage/bootstrap 仍可用；没有 renderer 任意执行入口 | 真实 SQLite 集成通过 |
| 标准用户 test | 首轮 7/10 保留；修补后 standardUser=true、Core/沙箱 9/9、exitCode=0；两个修补 SHA 与源码一致 | 子集通过（用户回传）；不含 Office/Git与完整安全验收；门禁不放行 |

MinGit 的定点 Win32 探测显示 GetFinalPathNameByHandleW 在 DOS/GUID 卷名模式返回错误 5；NT/无卷名模式可返回路径。给可修改祖先目录仅属性/遍历/同步权限后仍无法完成 DOS 规范化。未扩大磁盘根目录或整个用户目录的读取权限。祖先元数据 ACL 使用 SetKernelObjectSecurity 避免递归传播；运行时/input/workspace 根按各自权限传播。

Office 使用任务私有 UserInstallation，禁用宏并设置 Writer/Calc 外链更新为 0；零网络 capability 仍生效。转换本身失败，不能宣称中文字体、PDF 可打开、宏/链接恶意样本验证通过。测试生成 DOCX/XLSX/PPTX，原件校验逻辑已建立；后续转换成功后仍须补可打开与中文字形检查。

历史 CodeIntegrity 3077 曾拦截一个 helper 构建，见 P00-03/policy-block.json。后续源码构建已经能真实启动；当前失败不能再归因为单一系统拦截。未修改系统应用控制、杀毒或防火墙策略。

证据：P00-03/final-results.json、P00-03/native-cases.jsonl、P00-03/office-git-cases.jsonl、P00-03/runtime-probe.json。能力报告绑定 helper/锁与所有运行时文件字节；缺报告或失败时关闭能力。当前不能以 implemented_not_live_verified 放行依赖。

最新本机同标签完整验收：9/11，见 P00-03/native-final.json。中间 probe 的 8/11 含已修复的 EPERM 断言问题，原记录保留。test 用户回传结果见 P00-03/standard-user-reported.json；其私有目录读权限被 OS 拒绝，尚未直接读取原报告。两次中断残留已按用户授权清理并核验。

标准账户失败摘要已回传：Core 套件因漏拷 migrations 未加载（不计入 10 项）；Node 断言未接受 EPERM；Office/Git 确为兼容失败。修补脚本在当前账户独立 C 盘副本 9/9；test 同一副本也已回传 standardUser=true、9/9、退出 0，见 P00-03/standard-user-repair-reported.json。原生包无需重下载。

弹窗文本与 [LibreOffice 中文资源](https://raw.githubusercontent.com/LibreOffice/translations/master/source/zh-CN/desktop/messages.po) 的启动失败/内部错误完全匹配；隔离 --version 成功，转换初始化失败，具体 Win32/UNO 操作尚未定位。上游 [Windows pipe 实现](https://raw.githubusercontent.com/LibreOffice/core/master/sal/osl/w32/pipe.cxx) 的命名管道和 [bootstrap](https://raw.githubusercontent.com/LibreOffice/core/master/desktop/source/app/app.cxx) 是后续排查线索，不是已证实根因。

14:39Z 新增定点对照证据：P00-03/office-ipc-probe.json。当前 sal3.dll 的 osl_createPipe 在宿主成功、在 AppContainer 失败（Win32 5 / oslError 1）；同容器默认 Win32 管道失败而 LOCAL 管道成功，全部正常清理。对照仅调用可信运行库创建临时管道，未在隔离外转换文档。结合 [同版本管道实现](https://raw.githubusercontent.com/LibreOffice/core/libreoffice-26.2.6.3/sal/osl/w32/pipe.cxx)、[同版本启动映射](https://raw.githubusercontent.com/LibreOffice/core/libreoffice-26.2.6.3/desktop/source/app/app.cxx) 与 [Windows 管道约束](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea)，已确认内部 IPC 的兼容故障；仍未捕获原转换进程调用栈，不能排除另有启动失败点。修复不能用文件目录 ACL 扩权替代管道命名空间适配。
