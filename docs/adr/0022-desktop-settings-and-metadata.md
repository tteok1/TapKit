# ADR 0022：桌面设置、窗口布局和首页元数据

- 日期：2026-10-05（Asia/Shanghai）
- 状态：accepted
- 任务：P02-01；基线 c9cd482，分支 codex/p02-01

## 决定

桌面外壳复用 Core 的设置 CAS、请求回执、事件和 P01 模型账户接口。Renderer 不获得文件读取、凭据解密、任意 IPC 或任意窗口 URL 能力。新窗口、头像选择、目录选择是逐个定义并检查主 frame 的 Host 操作。

SQLite schema 5 添加 sessions.pinned_at、projects 的名称元数据和 provider_accounts.credential_hint。Core/Host 握手版本同步为 5；请求协议和业务 JSON 仍为 1。迁移保留既有账户、用量、会话及偏好；备份恢复接受已支持的 schema 1–5，更高版本拒绝并保留原库。旧测试的未来版本样本调整为 6。

settings.preferences 增加 desktop、personal、personalization、network 四组字段；旧 JSON 缺少这些字段时读取补默认值，不覆盖已保存字段。写 patch 不注入缺省组，否则保存一个旧字段会清空个人资料。编辑界面保存开始编辑时的 revision，跨窗口发生冲突时保留草稿并提示重新加载。

settings.updated 新事件仅保存 revision，workspace.updated 仅保存 entityId，避免把昵称、背景、指令、头像或代理地址复制进事件日志。历史 settings 事件仍可解析。首页快照带 eventSeq；窗口从快照之后订阅，再读取最新状态，避免每次启动重放全部旧设置造成刷新风暴。

## 窗口和本地资料

默认 1280×800，最小 960×640。每次进程启动的窗口序号是稳定槽位，主窗口为 0，随后为 1、2 等；相同槽位重开恢复布局。侧栏 260，可调 200–400，折叠 64；右面板默认 440，可调 320–600。正文最大 800；窄窗口使用面板抽屉，缩放时侧栏可展开为抽屉。每槽位仅存路由、宽度、折叠及最多 50 个路由滚动值，不存草稿、Key 或个人资料。布局数据用同一共享 schema 验证，损坏时回到默认布局。

个人资料、长期指令与聊天/工作偏好留在本地 SQLite。回答偏好复用 P01 的 AnswerPreferencesSchema，避免不同页面产生不一致的枚举。P01 的模型选择、预算、推理、后备、请求格式与会话覆盖继续使用原接口；P02 的背景/指令和每模式默认值供后续上下文构建读取。优先级按共享规格：本次显式覆盖 > 会话 > 项目 > 允许生效的个人设置 > defaults。关闭个性化保留已保存值，恢复默认是明确保存操作。本任务没有消息发送，因此不宣称模型回答已应用这些设置，连接检测也不发送私人指令。

头像先检查真实文件、5 MiB 字节上限、格式签名和 4096×4096 尺寸，再解码。PNG/JPEG 使用 nativeImage，WebP 在隔离 preload 中由 Chromium 解码并转为 96×96 静态 PNG，清除临时 image/canvas 引用。[Electron 的 nativeImage 文档](https://www.electronjs.org/docs/latest/api/native-image#supported-formats)列出的通用格式是 PNG/JPEG。Core 再校验 PNG 签名和最大 96×96，公开值最多 64 KiB。

当前采用 SQLite 管理的静态缩略图 data URL，不另存原图或绝对文件路径；缩略图随设置事务、备份和恢复。将原“托管文件”实现细节调整为“托管缩略数据”，避免提前引入 P03 文件服务或开放本地文件协议。profiles.avatar_file_id 仍为后续文件领域的保留字段。默认头像使用自有几何 SVG。

## 网络和凭据

代理只有继承环境、直连、手动 HTTP/HTTPS 三种模式；手动地址禁止用户名、密码、路径、查询和 fragment。保存应用偏好不更改系统代理、进程环境或原用户账户。API 传输使用请求时的设置快照，既有公网 DNS 固定、SNI、TLS 和重定向限制保留。Codex 使用 Core 内原代理配置接口并在换配置前恢复之前的配置。

Node 24.21 的 setGlobalProxyFromEnv 对空代理映射返回 no-op，不能靠空映射清除已有 dispatcher。直连因此使用 NO_PROXY=* 和不会连接的有效占位地址建立新的 dispatcher；本地 CONNECT → 直连回归检查该行为，产品没有新增服务；测试仅使用回环fixture。[Node 官方接口说明](https://nodejs.org/docs/latest-v24.x/api/http.html#httpsetglobalproxyfromenvproxyenv)及锁定运行时函数源码已核对。代理变更用于后续请求，当前流不主动重启。

新保存的 API Key 仅从 Host 提取尾 4 位进入 credential_hint；完整 Key 仍只走 Vault 私有链路。不解密旧 Key 来补尾号。保存后清空输入及临时可变对象，页面卸载清空挂起输入引用。账户视图不包含完整 Key，IPC 审计没有请求 payload。

## 范围与验证边界

新聊天/工作创建真实 session 和主 branch；新项目仅创建真实名称记录。置顶有 CAS、幂等回执和删除检查。最近会话、未读、项目、文件与待确认数读取 Core；尚无 run 接口时明确显示执行未开放，不建立第二套 run 状态。

首页示例仅填草稿；研究、创作、智能体、工具、模板、插件、Skills、定时入口按规划中隐藏/展示。发送、任务执行、资料导入、项目规则和全文搜索属于后续任务。本地名称搜索最多检索已载入的 100 个会话和 100 个项目。

本任务使用隔离 fixture 资料、合成凭据、虚拟模型检测和本地回环代理；真实模型请求为 0。P01/P00 门禁及智谱 FlashX Responses 暂按不支持的 ADR0021 保持，不自动开启失败的执行能力，不写 P02 阶段门禁。
