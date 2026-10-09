# ADR 0001：pi-ai 官方包名

- 状态：接受；2026-09-15。
- 手册指定 pi-ai 0.85.1，未指定 npm scope。旧包 @mariozechner/pi-ai 的弃用声明要求迁移到 @earendil-works/pi-ai；后者具有指定的 0.85.1。
- 决定：精确使用 @earendil-works/pi-ai@0.85.1，归属 providers，不导入 CLI/Agent 引擎；没有修改指定版本。
- 初次曾尝试旧 scope，404 后在本次锁定结束前纠正；initial-lock.log 保留该真实失败，不将其作为最终锁。
- 官方元数据：https://registry.npmjs.org/@mariozechner%2fpi-ai/0.73.1 和 https://registry.npmjs.org/@earendil-works%2fpi-ai/0.85.1。P01-01 再验证实际订阅调用。
