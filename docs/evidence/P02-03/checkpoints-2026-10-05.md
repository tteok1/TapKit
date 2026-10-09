# P02-03 会话组织、消息分支与全局搜索

## 当前状态

- task_id：P02-03；status：in_progress；updated_at：2026-10-05（Asia/Shanghai）。
- 目录D:/TapKit，分支codex/p02-01，开始HEAD f7e0156a0b5dd7f76bce3e922108a6a30b81ea79，工作区干净；本任务新增改动留在当前分支。
- 前置P02-02本地检查已通过，状态implemented_not_live_verified；P00/P01-gate保持failed，原生执行关闭，原用户模型请求未授权。
- 已读P02-03任务/读取地图行、04相关表/§3/6、05相关命令、12§1/3/8、02决定及15的P02部分。依据真实schema6追加迁移，不修改历史0002。

## 交付清单与检查点

- 已建立schema7增量迁移、共享history契约、Core分支/会话组织/FTS/回收站和临时内存store；界面已接入编辑/重生成/收藏、历史/分组/搜索/导出与临时模式。
- 2026-10-05检查点：pnpm test:integration P02-03退出0，9/9通过；root与renderer的tsc退出0。该结果对应首轮Core实现，后续修改仍须复验。
- 11:09检查点：history integration14/14退出0，新增schema6→7备份/幂等迁移、原子批量移动、项目/文件/任务准确定位和标题清理竞态。性能优化后万会话/十万消息列表P95 16.7ms、搜索403.3ms（前版818ms失败）；最新单节点协议清理修改待复验。
- Electron首轮当前用户3/4通过，临时提示选择器歧义已改；组合回归最新4/12通过，其余未启用测试fixture，正在检查构建链并重跑。生产构建已恢复；未将失败算作通过。
- 每日预算共享、旧备份session/message墓碑恢复与删除索引已实现；正在最终Electron、unit/受影响integration、check/build复验；尚未声明任务或阶段验收通过。

## 接口、迁移与决定

计划schema7 / 0007_chat_history.sql；共享history契约。临时会话使用内存SQLite/附件/协议状态及用量账本，不持久化正文/草稿/搜索；普通与临时请求共享模型并发限额。具体实现完成后写ADR并同步规格。

## 未完成与接续

1. 完成契约/迁移、Core版本分支/会话组织/搜索/回收站。
2. 接入消息操作、列表/分组、定位和临时模式UI。
3. 规定unit/integration/E2E、1万会话/10万消息分页fixture、受影响回归。
4. 需求对应、异常分支、真实资源缺口与P02-gate；不自动进入P03。

命令统一使用scripts/pnpm.ps1；E2E保持隔离fixture并恢复生产，不与重建产物的unit/build并发。R01/R13/R14及P01真实缺口、R02—R05 pending保持。
