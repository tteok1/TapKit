# P03-03 本地验收与开发记录

日期2026-10-10，目录D:/Tapkit-public；基线main4eff684，开发分支codex/p03-03-projects；起始clean。所有资料、项目及模型轨迹均为合成fixture，无真实模型请求。

命令前缀：`.runtime/node/node-v24.21.0-win-x64/node.exe .cache/tools/pnpm/package/bin/pnpm.mjs`。本机子命令使用现有PATH的Node24.18.0；最终Windows CI使用锁定24.21.0，不将本地环境冒称锁定版本。

| 检查 | 实际结果 | 证据/补充 |
| --- | --- | --- |
| fetch origin main + merge --ff-only origin/main | 退出0，Already up to date，ahead/behind 0/0 | 初始HEAD/origin/main=4eff68438b461eb873e89e9888ded36497a81d80；已有系统代理，未触碰凭据 |
| pnpm test:unit | 退出0，276/276，32文件 | unit-full.log |
| pnpm test:integration P03-03 | 初轮10/11退出1；删项目SQL字段修复后11/11；扩展最终14/14退出0 | integration-projects.log |
| pnpm test:integration（相关文件） | 首轮116/119退出1；3项修复后定向31/31退出0 | integration-related-first.log、integration-repair.log |
| pnpm check | 退出0，365文件零格式失败、类型/依赖/清单通过 | 最终文档变更需再次确认 |
| pnpm build:desktop | 退出0，多轮真实产物 | 构建工具use client/注释告警为上游已有输出 |
| pnpm test:e2e -- --grep P03-03 | 初轮语法/定位器/类型导入失败；修复真实列表事件后2/3；无障碍标签修复后3/3；选择清空/重新加载扩展后3/3 | 最终概览修复后再执行相关回归 |
| pnpm build | 原生测试占用helper.exe时退出1/EPERM | 顺序重建待确认，不更改权限或跳过隔离 |
| pnpm test:integration（全量） | 运行中 | 不提前记录通过 |
| P00/P03相关Electron、最终check/docs/diff | 待收口 | 结果到达后更新 |

三个外部开关各自先验证关闭，再只开一个并观察实际RoutingInput；项目乙唯一标记不会进入项目甲检索/模型输入。替换期间pending指针保留旧结构/索引；失败仍读旧版，跨原子切换的异步读返回CONFLICT，重试只返回完整新版，旧原件字节保持。导出撤权和已有目标均无覆盖/半成品；共享文件在项目删除后仍由合法项目访问。

视觉样本materials/scope/deletion/settings.png均为真实Electron截图。首轮settings.png暴露概览读取不存在字段产生错误提示；已修复并新增真实概览任务状态及页面无alert断言，需用最终截图替换。范围提供清空和重新加载，单次显式选择上限20；全部范围支持项目原文检索。

源码/迁移/契约变更见ADR0044与progress需求表。最终提交、CI标准用户摘要和源码hash将在CI通过后追加；不创建PR或合入main。

23:22检查点：概览修复后的P00/P03组合Electron32/33，唯一失败为新增preload方法未列入P00固定接口清单；更新精确清单后P00沙箱断言1/1退出0。最后使用锁定Node24.21.0实际构建并运行P03-03 Electron4/4退出0，新增Host保存授权→Core真实ZIP及拒绝覆盖错误提示；四张最终截图无概览错误提示，文字/表单/范围/删除均已观察。完整check366文件和docs-check37任务、diff-check退出0。完整原生集成仍在推进，未宣称通过。
