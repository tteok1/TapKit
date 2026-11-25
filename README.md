# TapKit

TapKit 是 Windows 本地 AI 工作空间。开发版提供聊天、文件预览和引用、项目资料与记忆、持久工作任务、Office 成果、匿名浏览与研究、受限代码运行、本地网站预览、文档画布以及本地备份与恢复。验收进度见源码中的 [P11-01 交接](docs/progress/P11-01.md)。

## 从源码启动

需要 Windows 11 24H2 或更新版本的 x64 系统、8 GB 内存和 10 GB 可用磁盘。先安装用于首次引导的 Node 24，在源码根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
.\scripts\pnpm.ps1 dev
```

引导脚本按锁文件安装依赖并验证下载哈希。Node、Python、Rust、MinGit、LibreOffice、字体和本地嵌入模型由项目准备，Node 和 pnpm 使用项目锁定的版本。准备后也可双击源码根目录的 `Start-TapKit.cmd`。修改 Core、Host、Preload 或 Renderer 时开发入口会监听源码。通过应用菜单或托盘的“退出”停止后台 Core。

```powershell
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 pack:dir
```

`pack:dir` 生成带 Electron 和运行时的 Windows 开发目录，生成位置保存在 `release/latest.json`。目录包含 `Start-TapKit.cmd`、`snapshot-manifest.json` 和 `SHA256SUMS.txt`。在当前 Windows 主机上生成的原生能力报告绑定运行环境，换机后须重新实测。

`pnpm dist:win` 构建自带运行时的 Windows x64 开发测试安装包。安装 EXE、SHA-256、SBOM 和构建记录位于 `release/TapKit-windows-*`。[安装、升级、卸载和 T21 实测](docs/distribution/windows-development.md) · [版本维护](docs/releases/README.md) · [安全问题报告](SECURITY.md)。

## 配置和使用

- 在“设置 → 模型”登录 Codex 订阅，或新建 DeepSeek、混元、Grok、豆包、OpenAI 兼容、Anthropic 兼容账户。填写服务商要求的模型 ID，保存后执行连接检测。自动 API 后备可能产生服务商费用，可在模型设置中管理。真实通道范围见 [验收指引](CONTRIBUTING.md)。
- 在“文件”导入 PDF、DOCX、XLSX、PPTX、Markdown、纯文本、CSV、常见文本代码或 ZIP。等待内容读取完成后提问，再点击引用查看固定版本。扫描件、加密、损坏或超限输入视情况保留原件供下载。图片、音视频可保留原件，文档工作可使用获授权的静态 PNG。
- 在“项目”设置指令和资料后创建会话。在“工作”查看计划并补充要求，完成后可预览和下载成果。写入审批绑定具体版本和内容，过期后重新预览并批准。
- 源码热更新入口的默认数据目录为 `.test-data/development`。开发目录直接启动默认使用 Electron 的 `%APPDATA%\TapKit`，也可在数据设置查看或迁移实际根目录。源码测试可用绝对路径 `TAPKIT_DATA_DIR` 指向独立 profile。凭据由 Windows 凭据保护机制存放在本地，备份或共享前核对包含的数据。

## 恢复和范围

断网后先检查任务状态、保留的成果和诊断，再使用界面提供的继续或重试入口。显示外部副作用未知时，先核对实际远端结果。暂停或关闭窗口后可从工作中心和通知回到任务。清理前先查看影响，使用设置中的备份和恢复功能处理旧快照。

插件、Skills、模板广场和定时任务提供状态页。媒体理解或生成、系统桌面控制、在线协作、公网托管和商业化延期。代码、Office 和终端依赖已验证的 Windows 隔离能力，隔离不可用时入口显示失败原因。

提交规范和验证命令见 [CONTRIBUTING.md](CONTRIBUTING.md)。许可为 MIT，第三方文件见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
