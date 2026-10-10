# P03-03 本地验收与开发记录

日期2026-10-10，目录D:/Tapkit-public；基线main4eff684，开发分支codex/p03-03-projects；起始clean。所有资料、项目及模型轨迹均为合成fixture，无真实模型请求。

命令前缀：`.runtime/node/node-v24.21.0-win-x64/node.exe .cache/tools/pnpm/package/bin/pnpm.mjs`。前期子命令使用现有PATH的Node24.18.0；最后构建、Host导出Electron、perf与收口检查显式将PATH前置锁定24.21.0，Windows CI同样使用锁定24.21.0。

| 检查 | 实际结果 | 证据/补充 |
| --- | --- | --- |
| fetch origin main + merge --ff-only origin/main | 退出0，Already up to date，ahead/behind 0/0 | 初始HEAD/origin/main=4eff68438b461eb873e89e9888ded36497a81d80；已有系统代理，未触碰凭据 |
| pnpm test:unit | 退出0，276/276，32文件 | unit-full.log |
| pnpm test:integration P03-03 | 初轮10/11退出1；删项目SQL字段修复后11/11；扩展最终14/14退出0 | integration-projects.log |
| pnpm test:integration（相关文件） | 首轮116/119退出1；3项修复后定向31/31退出0 | integration-related-first.log、integration-repair.log |
| pnpm check | 退出0，最终源码366文件零格式失败、类型/依赖/清单通过 | 最终文档变更另外完整检查 |
| pnpm build:desktop | 退出0，多轮真实产物 | 构建工具use client/注释告警为上游已有输出 |
| pnpm test:e2e -- --grep P03-03 | 初轮语法/定位器/类型导入及业务刷新/标签问题修复；最终4/4退出0 | e2e-projects-final.log；含真实Host/Core导出及覆盖拒绝 |
| pnpm build | 首轮占用helper.exe/EPERM退出1；原生退出后顺序重建退出0 | build-final.log；不更改权限或跳过隔离 |
| pnpm test:integration（全量） | 267/267、34文件，775.58秒，退出0 | integration-full.log |
| pnpm test:perf | 单独执行1/1、30.13秒，退出0 | perf.log |
| P00/P03相关Electron | 首轮32/33；固定桥清单更新后失败项1/1；项目最终4/4；CI整组34/34 | e2e-regression-first.log、e2e-bridge-repair.log、public-ci.json |
| docs:check / diff-check | 37任务状态及证据链接、空白检查退出0 | docs-check.log；最终文档再完整检查 |
| CI38063378626 | 实现源码59de6d7，check/startup全success | public-ci.json；unit276/integration267/Electron34/perf1 |
| CI artifact核验 | SHA256与API一致；标准P00 22/parser3/preview4零缺项；11源码摘要匹配；23启动隔离/零网络/零残留 | standard-user-acceptance.json |

三个外部开关各自先验证关闭，再只开一个并观察实际RoutingInput；项目乙唯一标记不会进入项目甲检索/模型输入。替换期间pending指针保留旧结构/索引；失败仍读旧版，跨原子切换的异步读返回CONFLICT，重试只返回完整新版，旧原件字节保持。导出撤权和已有目标均无覆盖/半成品；共享文件在项目删除后仍由合法项目访问。

视觉样本materials/scope/deletion/settings.png均为最终真实Electron截图，已观察文字、表单、范围和删除影响。首轮settings截图暴露概览读取不存在字段产生错误提示；已修复并新增真实概览任务状态及页面无alert断言，最终截图无错误提示。范围提供清空和重新加载，单次显式选择上限20；全部范围支持项目原文检索。

源码/迁移/契约变更见ADR0044与progress需求表。实现提交59de6d7cff76d6d3a610320fffa67b0844edec8c、CI原生报告和37源码摘要均已保存；最终文档提交后的最新Actions作为人工合入校验。不创建PR或合入main。

23:22检查点：概览修复后的P00/P03组合Electron32/33，唯一失败为新增preload方法未列入P00固定接口清单；更新精确清单后P00沙箱断言1/1退出0。最后使用锁定Node24.21.0实际构建并运行P03-03 Electron4/4退出0，新增Host保存授权→Core真实ZIP及拒绝覆盖错误提示；四张最终截图无概览错误提示，文字/表单/范围/删除均已观察。完整check366文件和docs-check37任务、diff-check退出0。完整原生集成仍在推进，未宣称通过。

23:28检查点：完整integration267/267（34文件、775.58秒）退出0；原生测试退出后顺序pnpm build成功，修复此前helper占用的构建安排。单独pnpm test:perf1/1退出0（30.13秒）。开发提交59de6d7cff76d6d3a610320fffa67b0844edec8c已push，CI38063378626正在集成步骤。37个改动源码/测试文件SHA256见source-digests.json，本机再次核对零不匹配、零未提交源码变更。需求实际状态写docs/progress/requirements.csv的21行，使用既定分号分隔；plan/execution-state表同步当前任务但不作为实际进度读取入口。

本轮本地原生JSONL增量复制到P03-03目录，旧截图/PDF/样本报告已恢复到开始时内容，以保留旧验收路径和字节。新增的P03-01解析JSONL和P00-02恢复截图仍保持原路径，未移动或删除。23条本轮P00启动记录均为AppContainer=true、identitySid匹配、networkCapabilities=0；本地管理员测试不冒充标准用户，标准门禁仍等待CI。

23:51最终源码验收：CI38063378626 completed/success，check和startup-diagnostics全部success；artifact11674401535下载SHA256=a03eb72e60109ae5461c3d714432962aecbd361e95fef503f0ee94fd88e6680b与GitHub元数据一致。标准用户P00 22/22、P03解析3/3、预览4/4均零failed/pending/missing；11源码摘要逐项与工作树相符。23标准用户原生启动身份匹配、无网络、零残留，Office宏/外链各3轮及fresh启动诊断通过。P03-03/21项需求=implemented_and_verified，P03-gate=passed，保留P01/P02历史live边界。最终文档提交须完整check/docs/diff及分支CI；源码/测试不再改动。
