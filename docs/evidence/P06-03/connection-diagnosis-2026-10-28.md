# 连接检测只读排查

2026-10-28 12:30 Asia/Shanghai。用户报告智谱 glm-4.7-flashx Chat 连接检测近一小时失败，截图为文本阶段 NETWORK_ERROR / response_headers_timeout。

- 复核此前 P06 记录：系统代理和隔离直连的携密钥请求均出现响应头超时；同日曾有文本、工具检测及真实单步成功。既有10次连接检测上限已用完，本轮未发携密钥请求或模型请求，未读取密钥。
- 在正常系统网络下执行 `curl.exe -sS -o NUL -w ... --noproxy "*" --connect-timeout 8 --max-time 15 -I https://open.bigmodel.cn/api/paas/v4/chat/completions`，退出码0，HTTP 401，DNS 0.019秒、TCP 0.042秒、TLS 0.517秒、首字节 0.588秒、总计 0.588秒；未携密钥。受限执行环境内同一命令 DNS失败、退出1，不代表本机正常网络状态。
- `packages/providers/src/api/http.ts` 在 DNS 前启动20秒定时器，直到收到响应头取消；`response_headers_timeout` 为请求阶段超时，不区分 TCP、TLS、代理隧道及上游等待。该无密钥HEAD不能验证账号、模型或携密钥POST，也不能确认服务端故障或密钥无效。
- 本轮未改产品代码、设置或任务验收状态；继续定位需要携密钥请求的安全阶段证据及供应商侧日志，遵守既有预算与授权范围。

- 文档校验：`pnpm docs:check` 因当前 shell Node 24.19.0 / pnpm 11.25.0 不符合项目版本退出1；改用项目内 Node 24.21.0 执行 `scripts/docs-check.mjs` 退出0，37项状态及证据链接通过。`git diff --check` 对已跟踪交接文件退出0。
