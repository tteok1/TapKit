# P07-01 结构与版本基础验证（2026-10-28）

工作区 D:/Tapkit-public，基点 aa6debf；未提交改动为 P07-01 实施。运行环境为项目锁定 Node 24.21.0、pnpm 12.4.1，TEMP/TMP 为工作区 .test-data/p07-temp。无真实模型请求。

- `pnpm exec vitest run --config vitest.config.ts --project unit P07-01`：退出 0，10/10；测试结构、三种空大纲、具名字段替换、中文/数值、非法数据、授权引用和文档字节解析。此为内存与解析测试，不是视觉或产品验收。
- `pnpm exec vitest run --config vitest.config.ts --project integration P07-01.document-access`：退出 0，1/1；真实 SQLite fixture 下复用 ChatService 校验已选资料、固定版本、序列化后删除及可信名称。该准备器尚未接入网关。
- 首轮 `pnpm exec vitest run --config vitest.config.ts --project integration P07-01 P06-01.migration P00-02.storage` 退出 1，21通过、2个 P00 子进程测试超时；当时 storage/dist 为旧 schema17 bundle。重新构建 `pnpm exec vite build --config packages/storage/vite.config.ts` 退出 0 后，原组合复验退出 0，23/23，包括两个强杀点；结果与旧 bundle 不兼容解释一致。
- `pnpm exec vitest run --config vitest.config.ts --project unit P07-01 P00-02.contracts`：退出 0，14/14。
- `pnpm exec vitest run --config vitest.config.ts --project integration P01-02.api P01-03.usage P02-01.desktop P02-03.history P03-01.migration P03-02.artifacts P04-02.context P04-03.memory -t 'migrat|compactions'`：退出 0，19通过、85跳过（按名称选择；不代表全部测试执行）。
- `pnpm check`：退出 0；包含静态检查、清单和 E2E 列表，不代表执行 E2E。

迁移17→18 fixture 核对任务行保留、外键和完整性、重跑及迁移前备份；版本测试核对新旧记录、事务回滚、baseVersion 冲突和删除清理。此前存储测试首次未考虑历史版本的 session 固定链接，报 PERMISSION_DENIED；改为使用现有 task 版本权限读取旧版、检查当前 session 对象后复验通过。无验收宣称：尚未持久化接入、产品入口、受限转换、视觉检查及 live。
