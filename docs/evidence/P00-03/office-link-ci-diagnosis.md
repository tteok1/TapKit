# Office 外链对照偶发输出 0（2026-10-02）

## 证据与定位

用户提供的是 `ci-office-shutdown-diagnostics.ps1` 步骤日志，没有 run ID，不能填写整轮 CI 最终状态。当前 checkout 为 `D:/tapkit/TapKit`、`codex/diagnose-main-ci`、HEAD `81eb571`；开始时工作区干净。

三轮同一 T19 原用例为 passed / passed / failed。第三轮在约24秒内返回测试失败，断言位于 `P00-03.office.test.ts:297`：启用对照 PDF 文本为 `0`，预期包含 `TK_LINK_UPDATED`。默认阻断 PDF 的缓存断言在前面已经通过。字体警告在成功轮次也存在，没有证据把它当作本次失败原因。

直接失败是正向对照没有证明外链读取成功；PowerShell末尾throw是正确汇总失败，本轮不是120秒Job超时。CI55的退出超时仍未关闭；其记录也曾出现control_updated.value=0，但不能认定两个问题有共同底层根因。

## 官方源码核对与候选修复

锁定tag为 `libreoffice-26.2.6.3`，本轮从官方raw下载并核对：

| 源码 | 相关行为 | 本轮SHA256 |
| --- | --- | --- |
| [docuno.cxx](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/sc/source/ui/unoobj/docuno.cxx) | calculateAll调用DoHardRecalc | 197cdbb9b46dfff4aea2853c6578627a06821b7fb30499932ccc06db3442f139 |
| [docsh4.cxx](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/sc/source/ui/docshell/docsh4.cxx) | 重算执行CalcAll；UpdateTableLinks在LM_ALWAYS下调用ReloadAllLinks/UpdateExternalRefLinks | f7f309cbde784ab79c92428ad708fea4c01a122dc8ddd44497820b72642af169 |
| [dispatchhelper.cxx](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/framework/source/services/dispatchhelper.cxx) | executeDispatch设置SynchronMode=true；支持通知时等待结果 | 211ee36418899c59fd5d4c105856ac3ff04410f2d3d41650028a273b00ec0d92 |
| [externalrefmgr.cxx](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/sc/source/ui/docshell/externalrefmgr.cxx) | 刷新重新加载源文档并填充外链缓存 | b62ff280fae74a85e0a7257fb2d7a1ff63da37bd12ff87fa8d14b52e8febb97a |

原UNO对照FULL_UPDATE加载后仅calculateAll并导出，无显式外链缓存重载及导出前标记检查。仅修改tests/integration/office-security-control.ts：在相同FULL_UPDATE对照内，通过DispatchHelper执行一次同步UpdateTableLinks，再重算；A1不等于TK_LINK_UPDATED时抛出OFFICE_CONTROL_LINK_NOT_UPDATED，不导出错误值PDF。没有重复失败测试或不断刷新直到成功。

增加loaded / links_refreshed / updated快照，记录A1值、公式、错误码、AllowLinkUpdate、外链数及输入源存在性；新增frame/dispatcher引用在销毁kit前释放。缓存/导入时序等底层原因仍须新CI快照证实，不能称已消除偶发故障。

保留生产worker、AppContainer/ACL/Job/零网络、120秒Job、5秒join、PDF标记、源文件及外部工作簿哈希、三轮任一失败门禁。没有依赖/接口决策变更，不需要新ADR。

## 本地验证与接续

当前checkout最初缺少锁定Node/pnpm/node_modules。本轮按原digest执行prepareRuntime(node)/preparePnpm及pnpm install --frozen-lockfile --ignore-scripts，退出0，锁文件不变；另准备原锁定Python仅用于语法编译，没有完整bootstrap或构建helper。

- Node24.21.0/pnpm12.4.1的check退出0：两项TS、ESLint、Prettier、boundaries、manifests通过。
- test:unit退出0，31/31。
- Node VM执行原测试模板替换，再用Python3.13.15 compile编译实际生成的整份控制脚本：退出0、OK，没有加载LibreOffice。
- 收尾使用锁定Node运行pnpm check及pnpm docs:check，实际CHECK_EXIT_CODE=0、DOCS_CHECK_EXIT_CODE=0；git diff --check退出0。没有新增模拟Office行为测试，现有真实T19仍是候选修复的验收入口。

真实Office管理员/独立标准用户及三轮新进程复验未执行：本checkout没有完整LO/helper；既有本机应用控制限制保留，不运行或绕过unsigned helper，不能迁移CI报告启用本机能力。

用户最新要求先本地commit，本轮提交说明为 `fix(P00-03): refresh Office external links before control export`，父提交81eb571；本次未推送/合并。后续推送后的现有CI需完整管理员integration、独立标准用户22项与三轮原T19全部通过；从新快照定位源值变0及销毁后退出问题，任一失败继续failed。P00-03保持in_progress、P00-gate=failed、完整验收2/37。
