# P06 剩余真实验收：隔离直连检测未通过

2026-10-28 Asia/Shanghai。用户将连接检测总上限提高到10次；此前已执行5次，故此次在新隔离资料将网络设为direct，最多再执行5次。未改用户账号、原资料或系统代理。通过后才执行受限的工作模型验收。

- prepare-only退出0；正常Windows权限下执行退出1。先通过TapKit providers.check检测，5次文本检测均NETWORK_ERROR/response_headers_timeout，共5次HTTP，工具检测未进入。加此前代理路径5次共10次检测、11次HTTP；此前一项文本通过，其余未完整通过。两轮的实际检测token用量未知，不能视为零。probes.json和create-report.json为脱敏回执。
- 独立只读核对隔离资料网络mode=direct；本轮工作模型请求0，保守预留0。未执行真实审批、重启恢复或暂停；不把本地工程测试和先前真实单步生成当作这些链路通过。
- 系统代理路径与隔离直连的携Key请求均曾超时；前轮不携Key HEAD在两条路径均得到401。不能确定服务端或网络中哪一环造成等待响应头超时，亦不能证明密钥失效或仅代理造成问题。
- 测试入口已关闭、密钥密文副本移除，原排查资料保持。用户上限已用完，不自动发起额外连接或工作请求；P06-01仍implemented_not_live_verified，P06-02/03仍implemented_and_verified，gate=engineering_passed_external_pending；不进入P07、无commit/push。
- runner-source.txt、budget-source.txt、launcher-source.txt保存本次测试逻辑；此前系统代理路径见../live-acceptance-2026-10-28/verification.md。
