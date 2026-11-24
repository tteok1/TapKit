# ADR 0089 Windows 用户级安装事务

状态：已采用，T21 分环境验收。

使用锁定的 electron-builder 26.15.3 生成 x64 NSIS 和应用归档。NSIS 使用当前用户权限，将压缩载荷解包到安装目录旁的暂存目录。普通界面进入 app.asar。需要系统加载的 Core、原生模块、模型、字体、helper 和运行时放在 resources/tapkit。文件清单涵盖整个展开后的载荷，构建阶段扫描凭据形态和资料路径。目标为下载不超过 1.5 GiB，安装不超过 4 GiB。

应用归档固定使用 Nsis7z 支持的 BCJ 过滤器。7-Zip 的自动模式会对 LibreOffice 内置 Python 的 ARM64 启动模板使用新版过滤器，旧解包组件会跳过该数据块。固定过滤器保留锁定运行时的原始文件和完整展开校验。三文件 NSIS 小包复现及 SHA-256 对照见 [压缩兼容性记录](../evidence/P11-02/ci134-codec.json)。

程序目录固定在 %LOCALAPPDATA%\Programs\TapKit。%APPDATA%\TapKit 仍是资料入口，既有资料目录指针可指向 TapKit 创建的子目录。安装器串行化事务，并通过标记阻止新 Host 开始写入。运行中的 Host 使用正常 Core 关闭流程，在任务、SQLite 和凭据写入停止后确认退出。

安装先检查载荷和 SQLite ABI，再用 SQLite Backup API 生成快照。在快照副本上完成迁移及完整性检查。程序目录通过同卷重命名整体切换，迁移成功时使用 Windows 文件替换发布数据库。安装事务标记删除后允许 Host 写入。中断期间重跑安装包会恢复上一套程序目录和数据库前像。独立删除日志继续由原启动路径应用；卸载也沿用同一串行化和关闭流程。默认保留资料。清除范围为用户资料根和当前 TapKit 创建的迁移子目录。

发行元数据记录当前版本、渠道与 GitHub 仓库。桌面端只在用户选择时查询 HTTPS Release，校验目标名称、仓库、来源、大小和 SHA-256。验证后才发布到用户所选路径，由用户手动打开。签名与正式发布归 R11 和后续分发流程。

首次启动校验安装清单，并同步原生探测机密无关的合成用例到当前账户。报告写入 DATA，绑定实际 Windows 令牌和安装资源指纹。AppContainer、Office 和终端继续在原验证门禁后启用。Windows Server CI 的标准用户证据与干净 Windows 11 的实机证据分别登记。

- [electron-builder 的自定义 NSIS 脚本说明](https://www.electron.build/v26/docs/nsis/)
- [NSIS 脚本与用户权限](https://nsis.sourceforge.io/Docs/Chapter4.html)
- [7-Zip 23.01 过滤器变更](https://github.com/ip7z/7zip/releases/tag/23.01)
- [GitHub Release API](https://docs.github.com/en/rest/releases/releases)
