# P06 智谱真实工作验收及通知修复

2026-10-28 Asia/Shanghai。用户报告另一会话将智谱FlashX响应头超时改为90秒并授权最多20次连接检测；本次首次启动通过TapKit providers.check，1次检测、2次HTTP、文本及工具均通过。检测实际usage未知。继承同一账号/网络配置，新建隔离资料，使用该会话修复后的源码编译runner。

- create报告退出0：计划先审阅期间无模型请求；两个实际工作模型请求完成，生成原文件并提出托管副本修改审批。重启后保留待审批状态；编辑后批准，未重发模型请求。核验修改新版本内容及原版本；steer创建新版本，接受计划前取消，旧终态保持且无额外模型请求。
- 第一次resume报告误取成果列表第一项，导致内容断言失败；实际列表包含额外成果和原文件的新版本，独立核对后修正测试查找fileId/version，保留resume-first-failed.json。此问题不证明额外成果原因。
- 真实流式暂停首轮NETWORK_ERROR/connection_failed，保留resume-pause-failed.json；在预算内仅补试一次：真实部分流被中止，未派发不完整工具，暂停后取消，未额外发请求。resume-report.json记录暂停通过后完成通知断言失败。
- 诊断发现完成事件在消费前遇到steer提升taskVersion时被误过滤。work-notifications.ts修复：仅对已完成run且版本一致的完成事件允许历史版本，其他旧版本事件仍过滤。新增P06-03 T20集成回归：延迟消费仍有一次完成通知、无过期等待通知、不重复。修复后定向集成7/7，类型检查退出0；pnpm test:recovery正常Windows权限12/12退出0，P06 Electron 4/4退出0且生产构建恢复。修复后使用本轮真实任务数据库的无凭据隔离副本重放完成事件，两次sync仅生成一条完成通知，模型请求0；真实链分轮完成，并非同一轮全部通过。
- 相关崩溃组合在受限环境after_native超时并中断；同用例正常Windows权限补验1/1、完整recovery12/12通过。生产build受限环境EPERM，正常Windows权限重跑退出0。
- 统一scripts/check.mjs首轮退出1，格式检查列11项；其中三项临时脚本移入证据目录，其余进度文档仅格式化，保留内容；重跑退出0，格式、依赖边界、manifest及118个E2E用例收集通过（收集不等于执行）。
- 真实工作共4次请求：2次actual 1925输入+162输出=2087 tokens；网络失败和暂停取消各1条estimated，合计保守估算9250，实际usage未知；工作预算累计保守预留19339，当前未结算0/预留0。连接检测另有2次HTTP且usage未知，上述数字不等于整轮实际总消耗。
- 本次真实模型验收有分轮失败，通知修复以真实任务事件副本复验；P06-01升级为implemented_and_verified（限已授权智谱Chat/FlashX与固定工具），P06-02/03工程验证保持。其他模型及历史资源仍暂缓，阶段gate保持engineering_passed_external_pending。R01—R05/R13/R14其他范围不提升，不进入P07，未提交/推送。隔离Key密文副本移除，marker关闭，原用户资料/窗口保留。

- 通知副本回放先因CJS不支持顶层await构建失败，修正包装后退出0；notification-replay.json记录真实run完成事件46、通知1条、模型请求0。
