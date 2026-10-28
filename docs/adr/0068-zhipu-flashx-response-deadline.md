# ADR 0068：智谱 FlashX 响应头期限

2026-10-28；关联 P01-02、P06-03。

## 证据和决定

隔离直连实测 TLS 完成及请求写出约57毫秒，但20秒仍无响应头；对照将期限设为60秒，文本和工具阶段响应头分别约56秒与43秒，检测通过。针对 `openai-compatible`、官方 `https://open.bigmodel.cn/api/paas/v4` Chat 和 `glm-4.7-flashx`，单次 DNS 至响应头期限从20秒调整为90秒，提供有限余量。其他模型、端点、协议保持20秒。检测两阶段总120秒、流空闲60秒、取消、DNS公共地址校验、TLS校验及不自动重试保持。90秒不是供应商响应保证，超过总期限仍失败；不由此推断所有网络或服务状态。

诊断观察器仅传固定阶段名和相对毫秒，不包含URL、地址、请求内容或密钥；观察器抛错不影响传输。证据见 `docs/evidence/P06-03/connection-stages-attempt-1-2026-10-28/probe-report.json` 和 `docs/evidence/P06-03/connection-stages-attempt-2-2026-10-28/probe-report.json`。
