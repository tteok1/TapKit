# Office/Git 产品能力与执行边界重新评估

> **路线更新（2026-09-30；本报告中的方案推荐已被优化版取代）**：本报告记录的“专用账户优先”是 2026-09-24 的候选结论，保留其 Git cwd、Office 管道、兼容性与安全边界证据；当前开发标准改为 Node/Python/终端/受控 Office 使用 AppContainer，Git 使用可信 GitBroker，Office 接入 LibreOfficeKit 适配。不要按下方旧推荐初始化账户或 WFP。正式执行仍须等新路线集成及完整验收。

日期：2026-09-24。性质：按用户要求重新调研后提出的方案，尚未采纳为正式架构；没有更改计划、系统账户、防火墙或产品执行代码。

## 结论

Office 文件生成、Office 排版转换、Git 仓库管理、任意代码执行是四个不同能力。应分开执行、分开报错和验收，不要求全部经过同一个 AppContainer 启动器。

当前 MinGit 失败是 AppContainer 中的 Windows 路径解析兼容问题，不是 Git 仓库管理本身难以实现。原计划已经规定 Git broker，但 P00 同时把容器内 Git 兼容设为门禁；产品管理仓库是否可用不应仅由该探针决定。要调整门禁，必须先实现并验收实际 broker，不能直接删除失败测试宣称完成。

## 同类项目的真实做法

| 项目 | Office | Git/执行环境 | 证据边界 |
| --- | --- | --- | --- |
| Hermes | python-docx/openpyxl/python-pptx 生成和编辑；PDF/图片渲染另调 LibreOffice/Poppler；缺依赖明确返回未转换 | local backend 用 subprocess 启动本机 shell；这是默认宿主执行，不是 TapKit 的强制隔离 | 官方三种技能和 local.py；未运行该项目 |
| Claude 文档 Skills | docx-js 等生成文件；LibreOffice 转 PDF；soffice.py 还有 Linux AF_UNIX/LD_PRELOAD 兼容层及临时用户配置目录 | Claude Code 支持 Git worktree；技能脚本并不证明 Windows AppContainer 支持 | 文档技能为 source-available，不能直接视为可自由复制的开源实现 |
| Codex | 本次不据 Git 支持推定其内置 Office 转换保证 | Git worktree 管理；Windows 推荐专用低权限账户、文件权限及防火墙隔离；需管理员批准初始化；非管理员后备网络隔离较弱 | 官方当前文档；不是 AppContainer 同等配置 |
| Aider | 本次未找到可作为统一三格式转换保证的证据 | GitPython 调用普通 Git，做 diff/add/commit，维护提交与撤销 | 直接本地仓库管理；其自动提交脏文件策略不适合照搬 TapKit |
| OpenHands Agent Canvas | 本次不推定内置三格式转换 | 支持 local/Docker/VM/cloud 多后端 | 当前 README；不能将可选 Docker 路线说成唯一默认 |

Claude Cowork 需区分形态：当前入门文档描述云端隔离执行；Windows 桌面部署页仍要求虚拟机平台与管理员安装。两份资料不能合并成“全部在 Windows 普通用户下原生隔离转换”；本次也不据此推断其闭源内部转换器。

## Git 根因与新方案

Git for Windows v2.55.0.windows.5 的 mingw_getcwd 使用 GetFinalPathNameByHandleW，再回退 GetLongPathNameW；TapKit 中两个路径查询曾拒绝访问。Microsoft/mxc #694 有相同 DOS 卷名查询失败报告（NT 卷名成功）。问题关闭不等于我们的版本已修复。

建议 Git 管理由可信 GitBroker 完成，模型仅提交 inspect/diff/commit 等结构化请求，不传任意命令行。broker 使用锁定 Git、应用私有镜像和工作副本，固定 git-dir/work-tree；不把凭据或 Git 元数据给执行脚本。它可以在正常 Win32 环境运行，因此不经过这条 AppContainer cwd 故障路径。

实现必须包含：参数/操作白名单、关闭 hooks/filter/textconv/external diff/fsmonitor/配置 include/外部凭据助手，清空 Git 环境注入，限制网络操作与目标，按仓库加锁；在稳定快照上读取文件并拒绝 reparse/越界，避免检查后被沙箱替换；patch/baseHash 检测用户并发修改。正常 Win32 broker 属可信代码边界，仍承担 Git 解析器漏洞风险，不能把“固定命令”称为任意输入绝对安全。

该方案保留完整 Git 产品能力，不要求用户在任意终端里直接操作私有 .git。当前 packages/tools/src 与 packages/core/src 尚未发现正式 GitBroker/git.inspect 实现；本次只研究，没有把它记成已交付。

## Office 根因与新方案

生成 DOCX/XLSX/PPTX 可使用现有文件库，读正文也不需要先转 PDF；精准分页预览、PDF 导出和某些公式重算才需要 Office 渲染器。不能把 HTML 文本预览冒充版式一致的 PDF。

建议设独立 OfficeWorker，输入为文件版本 ID 与固定转换目标，输出为经过验证的 PDF/页面；不接受模型传入任意 LibreOffice 参数或宏。读取只读副本，每任务私有 profile/output；限时/限内存/取消杀进程树，禁宏/外链/网络，核对原件哈希并解析/渲染结果。

渲染引擎继续选 LibreOffice：这是已查项目复用的成熟组件。改变执行环境比重写 Office 排版引擎实际。OfficeWorker 本身仍必须隔离，不能因为命令固定就把不可信文档直接交给有全部用户权限的宿主进程。

## 可实现路线与推荐

| 路线 | 隔离与兼容 | 安装代价 | 判断 |
| --- | --- | --- | --- |
| Windows 原生兼容路线（优先建议） | GitBroker 正常 Win32；OfficeWorker/任意脚本用专用低权限账户、受限令牌、目录 ACL、Job Object、按身份强制网络规则；本地 API 仍可正常工作 | 首次管理员批准设置账户/网络规则；日常低权限运行，无需 Docker/WSL | 参考 Codex 的工程路线；不再把 AppContainer 当作统一前提；具体 Office/隔离组合仍需本机原型验收 |
| 严格免管理员路线 | GitBroker 正常 Win32；Office 专用 AppContainer + 已验证 LOK 适配；任意脚本仍 AppContainer | 无管理员初始化，但继续承担工具适配、临时路径与恢复成本 | 有本机三格式实验依据，可行；不能承诺任意 Win32 工具兼容 |
| 本地 Linux VM/容器路线 | 在固定环境中打包 Git、LibreOffice、字体和脚本；限定文件交换及网络 | 虚拟化/镜像体积/安装服务或 Docker/WSL 成本；不是简单换一个启动参数 | 兼容性与可复现性有优势，但安装负担较大；不作为轻量 Windows 首选 |

优先推荐原生兼容路线，明确取舍是放宽“首次安装也不能需要管理员”，换取更接近通用 Windows Agent 的执行兼容性。该建议不授权立即创建账户或改防火墙；当前实现与 gate 均保持原状态。若产品坚持免管理员，则使用第二条，不能同时宣称获得第一条的兼容范围。

## 实施顺序和验收

1. 先明确新信任边界并写 ADR/同步 02、03、07、08、P00-03/P09-01 的相关要求；分开 Git 管理、Office 生成、Office 渲染和代码执行能力门禁。
2. 最小 GitBroker 验证 status/diff/commit、中文/脏仓库、原仓库保全、恶意配置与符号链接、错误路径/并发冲突；使用正常 Win32 Git，不再投入通用盘符方案作为 Git 主路线。
3. 对推荐账户隔离方式做独立原型：原版 soffice CLI 三格式转换 + Node/Python/子进程/ConPTY；检查未授权目录和实际可达网络正向对照。不能把“专用账户”自动等同所有私密目录不可读。
4. 完成账户/权限生命周期、强杀/断电后恢复、任务隔离、宏外链恶意文档、PDF 中文版式与标准用户全量验收后，才替换现有后端。原型失败应保留明确错误，不退回普通宿主执行不可信内容。

## 本机证据（本次复核，未重新执行）

- docs/evidence/P00-03/git-drive-alias.json：容器内临时路径映射后 status/diff 退出 0，证明不是 Git 功能缺失。
- docs/evidence/P00-03/lok-readonly-alias-verified.json、lok-readonly-pdf-validation.json：LOK 三格式、只读输入、原件保持、越界拒绝、回环正向对照和 PDF 中文渲染实验成功；不代表推荐账户后端已验收。
- 正式 native 仍 9/11；test 标准用户 Core/沙箱子集 9/9；P00-03 in_progress / P00-gate failed。

## 本次核查的一手来源

- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/productivity/docx/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/productivity/xlsx/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/productivity/powerpoint/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/tools/environments/local.py
- https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md
- https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/scripts/office/soffice.py
- https://github.com/anthropics/skills
- https://learn.chatgpt.com/docs/windows/windows-sandbox
- https://learn.chatgpt.com/docs/environments/git-worktrees
- https://aider.chat/docs/git.html
- https://raw.githubusercontent.com/Aider-AI/aider/main/aider/repo.py
- https://code.claude.com/docs/en/common-workflows
- https://raw.githubusercontent.com/OpenHands/OpenHands/main/README.md
- https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork
- https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows
- https://raw.githubusercontent.com/git-for-windows/git/v2.55.0.windows.5/compat/mingw.c
- https://github.com/microsoft/mxc/issues/694

在线 main/产品文档按本次读取内容解释，不推定未来不变；旧固定提交研究见 agent-windows-reference-review.md。未安装或执行第三方项目，未发送外部消息。
