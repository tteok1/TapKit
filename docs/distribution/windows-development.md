# TapKit Windows x64 开发测试安装包

运行 pnpm bootstrap 后执行 pnpm dist:win。构建在 release/TapKit-windows-… 生成安装 EXE、SHA-256 和构建记录。pnpm dist:win --acceptance 额外生成一个更高版本的测试夹具，用于流程验收。安装包包含 Electron、SQLite、Node、Python、MinGit、LibreOffice、helper、离线检索模型、字体和许可。

核对安装包的 SHA-256 后双击，按窗口提示安装。开发测试包未签名，Windows 可能显示未知发布者。标准用户可通过开始菜单打开 TapKit。首次启动时帮助页显示原生运行时校验进度。模型凭据由使用者在应用中配置。本地功能可离线使用。

再次双击同版或更高版本的安装包可修复或升级。升级安全关闭 TapKit，备份并验证 SQLite 后切换版本。安装中断时，重新运行安装包可恢复事务并继续。无法打开数据库时可从应用的恢复入口检查可用备份。在 Windows 的「已安装的应用」中卸载时默认保留资料。需要清除时勾选并核对列出的目录。命令行卸载使用 /S 时默认保留，/S /CLEAR-DATA 明确选择清除。

在帮助页中点击「检查更新」查询公开 GitHub Release。下载时 TapKit 校验大小和 SHA-256 并在文件资源管理器中定位成品。手动打开安装包完成升级。

## T21 干净 Windows 11 实测

Windows Server 2025 标准用户的自动验收通过。干净 Windows 11 客户端验收待 R09。测试包内 0.1.1 是升级夹具，可与 0.1.0 一起用于下列步骤。[CI #135 验收包](https://github.com/tteok1/TapKit/actions/runs/45409702302/artifacts/14932263707) · [CI 报告](https://github.com/tteok1/TapKit/actions/runs/45409702302/artifacts/14932218749)。

准备 Windows 11 x64 快照和一个全新的非管理员账号。环境中不预装 Node、Python、Git 或 Office。把 CI 的两份安装包、校验文件、构建记录和 tests/install 中的 verify.ps1 与 profile.cjs 放入虚拟机。测试可断开网络，建议将包放在含空格和中文的目录。先用于下表交互验收，恢复空白快照后再运行自动验收。

| 操作                                                                             | 记录                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 核对 SHA-256，双击安装并从开始菜单打开                                           | OS 构建号、Windows 账号权限、安装文件指纹、程序路径和应用版本 |
| 查阅帮助页运行时状态，导入中文资料并预览；生成 Office 示例；运行一个合成代码测试 | 运行时校验结果、资料定位、产物打开情况和代码退出码            |
| 打开模型设置，检查配置入口及无账号时的离线体验                                   | 连接设置页面是否可用，真实模型结果按 R01–R08 单独登记         |
| 保存资料与草稿，升级到更高版本，复核内容和应用版本                               | 升级前后版本、保存的合成内容、软件目录和备份                  |
| 测试安装器进程中断后的重试、卸载保留和清除勾选                                   | 前一版本恢复、二次安装、资料目录和外部文件校验                |

在全新标准账户中从 PowerShell 运行，-Packages 指向包含两份验证包的目录。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\verify.ps1 -Packages .\packages -Environment Win11 -Report .\P11-02-win11.json
```

自动脚本会对该空白账户执行安装、中断、迁移失败、真实迁移、未来 schema 拒绝和两种卸载选项。报告是 T21 自动部分的实机证据。界面、合成办公任务和离线步骤按上表记录。
