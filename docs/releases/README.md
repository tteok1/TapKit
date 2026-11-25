# Windows 发布维护

## 从版本标签准备开发候选

先从干净工作区按照项目 README 运行 `pnpm bootstrap`。Windows x64 构建入口是 `pnpm dist:win --acceptance`。输出包含当前版本、升级夹具、各自的 SHA-256 和 CycloneDX SBOM。保留具体版本记录和对应源码提交。

仓库在 `distribution.config.json` 中配置。维护者可在 GitHub Actions 的 **Prepare Windows release materials** 工作流选 `main`，输入已存在且可从主线到达的 `v<桌面版本>` 标签。工作流检查标签、源历史、测试、标准用户安装生命周期并输出工件和测试报告。下载页由同一份清单构建。

本地可用同一入口验证现有构建。第一个路径指向有构建记录和校验文件的目录，第二个路径是尚未创建的输出目录。

```powershell
node scripts/release/prepare.mjs "release/TapKit-windows-<stamp>" release/development-candidate v0.1.0
node scripts/release/site.mjs release/development-candidate/release-manifest.json
```

## 正式分发验收

- 用 R09 的干净 Windows 11 x64 标准用户按 T21 实测。记录归属到准确的包名、版本和 SHA-256。
- 随分发提供许可证文本与 [补充声明](../../THIRD_PARTY_NOTICES.md)，并核对 MinGit、LibreOffice 等的相应源码交付。源历史、样本和安装载荷的自动扫描记录需要配套人工审查。
- 在 R11 的签名服务中对同一验收包签名。核对 Authenticode 信任和授权签名者、产品版本、包内清单。签名会改变 EXE 的 SHA-256 和字节数，需从签名后的文件重新生成校验值、SBOM 主组件哈希和版本清单。
- R10 品牌和 R12 下载地址确认后，发布的签名资产名为 `TapKit-<版本>-windows-x64.exe`。同一 GitHub Release 提供 `release-manifest.json`。清单引用对应版本的 HTTPS 资产与发布说明。发布前后均对成品下载核对 SHA-256，镜像必须交付字节相同的包。
- 官网部署前验证源码、文档和正式下载链接。已获发布授权的维护者使用指定资源完成发布。

## 变更回归

- 依赖、运行时和模型变更时重跑锁文件校验、隔离测试、构建、包体积和包内自检，并重新生成 SBOM。
- 提示词和模板变更时重跑相应聊天、Office 或导出回归。订阅协议变化时先禁用受影响渠道，完成兼容性回归后再恢复。
- 版本、签名和下载地址变更时同时复验桌面更新与官网，校验错误或不可信跳转须阻止下载。保留过去版本的发布记录。
