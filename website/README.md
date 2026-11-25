# TapKit 静态下载页

使用项目锁定的 Node.js 运行 `node scripts/release/site.mjs`。打开 `website/dist/index.html` 可离线预览。生成结果只需要静态文件托管。

品牌、仓库和站点地址在 `distribution.config.json` 中配置。版本、平台、文件大小、SHA-256 与下载地址来自根目录 `release-manifest.json`。入口也接受一个指定的清单路径。正式下载需要已确认的品牌图片、站点地址和签名验收通过的清单。

桌面预览沿用仓库中 `.impeccable/review/desktop.png` 的合成研究示例。它只显示示例资料和保留域名，原图随此页面分发。
