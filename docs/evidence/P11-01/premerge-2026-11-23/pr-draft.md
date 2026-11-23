# P11-01: 优化大数据量响应并交付系统验收开发版

目标：tteok1/TapKit；base：main；head：codex/p11-01-dev-acceptance。GitHub 连接器创建 PR 返回 403，未创建、未合并。

大量历史和资料曾导致聊天/检索超时，开发版启动与空闲内存也曾超限。本次优化检索作用域查询、索引分块调度和流式事件分发，按需加载桌面功能，并补齐系统工程验收与独立开发目录交付。

## 变更

- Core 基础就绪与原生验证并行；解析、Office、代码和终端仍须验证通过后执行。桌面画布、预览、终端、Markdown 和网页能力按需加载。
- 索引分块分段让出事件循环，继续前复核取消与资料作用域；分块定位、哈希、同步入口和原子发布保持兼容。
- 工作与聊天共用背景 user 消息封装，记忆与历史正文不进入系统指令，封装计入工作输入预算。
- 常规 push/PR 保留四个工程作业，采样器启动有独立诊断；真实 API 流程仍限制为受保护 main 的手动触发。

更新：最新 CI #120 流式 P95 107ms 超限，当前暂不合并；以下 CI #119 与开发包记录保留为前轮结果。

## 验证

- [Windows CI #119](https://github.com/tteok1/TapKit/actions/runs/45186766343) 在 `ab99be766e609d47e0c0ee35500c916eaa70c82c` 上四个必需作业通过，覆盖主工程、Electron、原生 Office 与安全、联合负载。
- 联合负载：CI 展示 P95 73 ms，取消回执9.5 ms、停止84.3 ms；聊天/索引峰值929.44 MiB、双Office峰值1578.10 MiB。本机同版本P95 62 ms，取消与内存也通过；两轮各有22个流式片段与索引重叠，两个Office工作均完成。
- 新包 `release/TapKit-development-2026-11-23T14-02-19-648Z` 包内隔离22/22。四轮16次启动通过：首次最高2.06 s、重启最高1.34 s、空闲峰值672.82 MiB；70340项校验和一致，741个实现/测试文件对应CI源码。
- 背景角色回归与分块取消回归均先红后绿；需求映射574项核对通过。失败轮次、修复和完整命令回执见[审查记录](https://github.com/tteok1/TapKit/blob/codex/p11-01-dev-acceptance/docs/evidence/P11-01/premerge-2026-11-23/review.md)与[交付核对](https://github.com/tteok1/TapKit/blob/codex/p11-01-dev-acceptance/docs/evidence/P11-01/premerge-2026-11-23/delivery.json)。

## 待验

P11-01保持in_progress。规格Windows 11设备和R01–R08完整真实资源测试待验，真实模型联调按用户约定暂缓。P11-02安装、升级、卸载尚未开始；工程候选不代替这些验收。
