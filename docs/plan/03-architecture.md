# 技术架构、工程目录与运行环境

先读 [决策](02-decisions.md)。本文是一套指定方案，不要求开发者另选技术栈。依赖元数据已查阅，但尚未在新项目中构建验证；P00-01必须完成兼容性试验并提交精确 lockfile。

## 1. 指定技术

> **2026-09-30 当前方案补丁（基于旧隔离路线的实测问题优化，现以本补丁为准）**：代码、Python、终端和受控 Office 转换在独立 AppContainer + Job 中运行；仅授权 runtime/input/workspace 所需 ACL，不授予网络 capability。Office 走 LibreOfficeKit 适配；Git 由可信 GitBroker 处理固定操作。无需初始化 TapKit 专用账户或账户级 WFP。下方专用账户技术行保留为历史决策。

| 层 | 选择 | 用途 |
|---|---|---|
| 桌面 | Electron 44.3.0 + electron-vite 5.0.0 | Windows 打包、IPC、独立网页面板 |
| 界面 | React/ReactDOM 19.3.0、TypeScript 7.0.2、Vite 8.3.0 | 严格类型、组件与开发热更新 |
| UI基础 | TailwindCSS 4.3.3、Lucide 1.46.0 | 本地打包样式/图标，不依赖 CDN |
| 状态 | Zustand 5.0.15；TanStack Query 5.102.8、Virtual 3.14.13 | 临时布局/草稿与服务端式实体缓存分开 |
| 路由 | React Router 8.3.1，MemoryRouter | 桌面内部路由，无网络路由服务器 |
| 数据 | better-sqlite3 13.0.3 + SQLite FTS5 | SQL迁移、事务、事件、中文搜索；无外部DB |
| 契约 | Zod 4.6.5，严格对象校验 | IPC、工具、设置和模型输出统一校验 |
| 模型 | pi-ai 0.85.1只用于订阅；其余独立HTTP适配器 | 核心接口自有，供应商类型不扩散 |
| 检索 | Transformers.js 4.2.0 + 本地 BGE-small-zh-v1.5 ONNX | CPU嵌入；SQLite保存向量、作用域内精确余弦 |
| 解析 | PDF.js 6.3.289、Mammoth 1.12.3、ExcelJS 4.4.0、fast-xml-parser 5.11.1 | PDF、DOCX、XLSX、PPTX结构抽取 |
| 导出 | docx 9.7.1、PptxGenJS 4.0.1、ExcelJS；本地LibreOffice | 可编辑成果、PDF转换及Office预览 |
| 画布 | Tiptap React 3.31.3 | 后期正文编辑；不实现完整Office编辑器 |
| 浏览器 | Electron WebContentsView + webContents.debugger(CDP) | 匿名会话、DOM定位、用户接管；不开放调试端口 |
| 代码执行（当前，2026-09-30） | 自有Rust Windows helper；每次独立AppContainer + 最小ACL + Job Object + ConPTY | 不需TapKit专用账户或账户级WFP；无网络capability；xterm.js 6.0.0前端 |
| 代码执行（2026-09-24历史） | 自有Rust Windows helper；专用账户 + 受限令牌/ACL + Job Object + 内核网络规则 + ConPTY（ADR 0007） | 首次管理员初始化，日常标准用户；保留历史设计与证据，不作为当前标准 |
| 测试 | Vitest 5.0.0、Playwright 1.63.0 | 单元/集成/Electron UI/故障回归 |
| 打包 | electron-builder 26.15.3；Windows NSIS per-user | 源码构建、解压版本、用户级安装 |

工程使用 pnpm 12.4.1 workspace，开发 Node.js 24 LTS。P00-01通过官方发行目录选择 Node 24 当日最新补丁、Python 3.13补丁、Rust stable、LibreOffice 26.2稳定补丁、Git for Windows稳定版，立即记录精确版本、下载URL、SHA256和许可证到 runtime-lock.json，后续构建只读此锁；这是确定的首次锁定程序，不允许每次下载 latest。Node/Rust/Python构建工具仅开发机和CI需要。前述NPM直接依赖精确固定，不使用 ^ 或 ~。次级依赖只通过已提交 pnpm-lock.yaml 解析。

若上述版本有可复现兼容错误，P00-01只允许调整产生冲突的直接依赖到同主版本最新兼容补丁；跨主版本变更先记录 ADR 和回归结果，仍由 coding agent 技术判断，不要求用户选择版本。不得用“最新版”替代锁文件。

Markdown展示依赖指定react-markdown、remark-gfm、remark-math、rehype-katex、katex、shiki、mermaid；压缩包指定yauzl/yazl；Tiptap补@tiptap/starter-kit、extension-table/link/image。这些配套包在P00-01首次锁定时读取npm正式稳定发行及peerDependencies，选择满足上述主栈的最高稳定版本并将精确版本/integrity写入dependency-baseline.json和lockfile；Tiptap所有扩展必须与React绑定同版本。Python包指定pandas、openpyxl、matplotlib，选择支持Python3.13的正式wheel，精确版本/hash写requirements.lock。此选择程序只执行一次，之后禁止无锁自动升级；不将模型输出转为新的应用依赖。

## 2. 进程与权责

~~~mermaid
flowchart LR
  UI[React界面] --> IPC[白名单Preload]
  IPC --> Host[Electron主进程]
  Host --> Core[Core utilityProcess]
  Core --> DB[(SQLite 单写者)]
  Core --> Models[供应商适配器]
  Host --> Vault[DPAPI凭据代理]
  Models --> Vault
  Core --> Gateway[工具与授权网关]
  Gateway --> Native[Windows隔离helper]
  Gateway --> Browser[匿名WebContentsView]
  Native --> Disk[任务目录与受控产物]
~~~

- Host：窗口、托盘、文件选择、safeStorage、匿名网页容器、受控网络代理和Native helper生命周期；不运行模型生成脚本。
- Core：唯一业务状态/DB写入者、任务调度、模型调用、授权决定、上下文、检索、索引任务。通过 utilityProcess.fork 启动；崩溃时Host重建，进入恢复核对。
- Renderer：仅UI，nodeIntegration=false、contextIsolation=true、sandbox=true；只公开逐个定义的 window.tapkit 方法，不公开 ipcRenderer/fs/任意channel调用。
- Parse/Embedding：独立受限worker，读取指定输入临时副本，返回结构化结果；不能接触DB和凭据。worker崩溃不影响聊天。
- Native：执行不可信脚本/第三方转换器；它是Windows OS隔离边界。utilityProcess、Worker thread和cwd限制都不能替代它。
- Browser：每根任务独立非持久 partition，无用户Chrome资料、无preload、无Node、无摄像头/麦克风权限。关闭后清除cookies、cache、service workers。

无常驻公网HTTP服务；Host↔Core用私有MessagePort，Host↔helper用继承句柄或只允许当前SID的命名管道。OAuth回调和预览端口例外，仅监听loopback，生命周期可跟踪。IPC调用必须检查发起窗口的app origin、frame与动作权限。

P02-01当前Host另有有限新窗口/头像/目录选择操作，Core保存桌面偏好和会话/项目名称元数据；窗口槽位布局留在对应Renderer本地存储。头像为本地SQLite拥有的静态缩略数据，不开放本地文件协议。边界、迁移和事件最小化见[ADR0022](../adr/0022-desktop-settings-and-metadata.md)。

## 3. 工程树

~~~
apps/desktop/
  src/main/                 # 窗口、IPC、vault、浏览器、OS集成
  src/preload/              # 有限typed bridge
  src/renderer/             # routes、features、components、locales
packages/contracts/src/    # DTO、Zod、事件、工具schema；无Node依赖
packages/core/src/         # sessions、projects、orchestrator、settings
packages/storage/src/      # DB单写服务、migrations、repositories、blobstore
packages/providers/src/    # codex、deepseek、hunyuan、xai、doubao、routing
packages/context/src/      # assembler、token budget、checkpoint、memory
packages/retrieval/src/    # ingest、FTS、embedding、fusion、citation
packages/tools/src/        # registry、gateway、approval、builtin工具
packages/workflows/src/    # research、office、coding；固定工作流，不是第三方插件
packages/network/src/      # URL policy、代理、HTTP/SSE、错误归一
packages/ui/src/           # 可复用组件、设计token
native/windows-helper/     # Rust crate、AppContainer隔离、最小ACL、Job、ConPTY、LOKit适配与租约恢复
resources/runtime/         # 构建时注入，源码库不放大二进制
resources/models/          # CPU检索模型及tokenizer，release打包
resources/prompts/         # 内核/模式/提取模板，独立版本
resources/catalogs/        # model-capabilities.json、prices.json、defaults.json
scripts/                   # bootstrap、dev、check、pack、runtime-fetch、fixture
                            # dev/build:desktop只编译桌面；build/bootstrap仍编译原生helper，见ADR 0010
tests/{unit,integration,e2e,live,security,fixtures,evals}/
docs/{plan,adr,progress,evidence}/
.github/workflows/         # Windows验证、打包；真实凭据不进入PR工作流
~~~

依赖方向：UI→contracts；core→contracts/storage/providers/context/tools；providers不导入core；tools不直接修改UI；storage不调用模型。通过包exports和依赖检查脚本强制。任何供应商raw响应只允许存在providers或加密opaque存储中。

## 4. 本地目录

正式数据根使用 app.getPath('userData') 下 TapKit profile，文档统一简写 DATA。开发和E2E通过受控 TAPKIT_DATA_DIR 指向单独目录；正式构建不接受网页/模型修改该值。

~~~
DATA/
  db/app.sqlite
  blobs/sha256/aa/<hash>    # 普通资料，blob+fileVersion映射
  workspaces/<runId>/      # 已授权任务私有空间
  tmp/<jobId>/             # 解析与临时成果；启动清理
  previews/<versionId>/    # 可再生，manifest记录渲染器版本
  backups/<backupId>/      # DB快照+blob清单，不能只复制活动sqlite
  secrets/<credentialId>  # DPAPI密文，文件ACL仅当前Windows用户
  logs/                   # 脱敏诊断，轮转
  runtime-manifest.json
~~~

app安装目录只读；任何运行期写入进DATA。产物ID不使用绝对路径；Host为受信UI提供 tapkit-artifact: 自定义scheme，检查profile/fileVersion有效性后返回流。外部网页不能访问该scheme。显示路径不作为授权凭据。

DB设 WAL、foreign_keys=ON、busy_timeout=5000、synchronous=FULL；短事务，模型/网络不在事务中执行。所有排序稳定包含ID；时间戳UTC毫秒，重复计划等延期字段不提前编造。

## 5. 环境准备和供应链

开发脚本统一PowerShell可运行；不要求bash、make或开发者系统Python PATH。bootstrap只从runtime锁文件取包，校验哈希后解包，不执行远程返回命令。CI使用锁定Rust及微软SDK/CRT（可项目内解包并用Rust自带LLD链接，见ADR 0006），runtime包从官方来源构建/抽取，保留许可证。

完整版安装包包含Electron、helper、Python受控发行、必要wheel、LibreOffice运行文件、MinGit、检索ONNX、字体和模板，用户无需后装依赖。体积目标下载≤1.5GiB、安装≤4GiB；超目标先清理不使用语言包/示例/符号，不牺牲所列能力。用户代码项目的新增依赖仍按明确下载策略获取，不混同应用依赖。

pi、Office组件、字体、Git的许可不同。主仓库MIT不覆盖第三方文件；THIRD_PARTY_NOTICES记录版本、来源、许可、源码获取方式。不得重新标注第三方授权或直接打包他人浏览器资料。

## 6. 网络与安全依据

Electron渲染器隔离、IPC发起者验证、远程页面不接触Node依照官方安全文档；safeStorage在Windows提供基于系统的凭据加密。进程故障隔离不能替代代码执行隔离。[Electron安全](https://www.electronjs.org/docs/latest/tutorial/security)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

**2026-09-30 当前方案补丁（基于旧方案优化，现以本补丁为准）**：GitBroker 继续使用正常 Win32 固定操作及私有元数据；OfficeWorker/脚本/终端使用每次独立 AppContainer、最小 ACL、Job 和无网络 capability。OfficeWorker 以 LibreOfficeKit 适配替代旧 soffice CLI 启动路线。以下 2026-09-24 账户隔离要求仅保留历史：

> 按 [ADR 0007](../adr/0007-windows-execution-boundaries.md)，GitBroker 使用正常 Win32 固定操作及私有元数据；OfficeWorker/脚本执行使用专用账户、受限令牌/ACL、内核网络规则和 Job。初始化、进程树与恢复须实测；旧 AppContainer 仅保留诊断，不作自动降级。采用 API 本身不能称为已安全。[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
