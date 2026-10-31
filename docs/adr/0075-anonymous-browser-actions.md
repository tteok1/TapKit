# ADR0075：匿名浏览器动作与可核对提交

- 日期：2026-10-31；状态：accepted，实施/验收见P08-01进度。
- 背景：P05匿名读取已完成，P08-01增加工作标签页、有限DOM操作及人工接管。
- 决策：schema19追加browser_sessions/tabs/snapshots；运行复用既有Work run、工具账本、根预算、审批/通知与恢复。p08-tools-1新增browser.open/observe/act，旧catalog保持原能力，任务明确开启浏览器才提供工具。
- Host独占非持久partition、WebContentsView、CDP与受控代理；Renderer/Core仅传严格DTO，不接受脚本/原生路径。固定观察/动作脚本在隔离world运行，句柄绑定frame/backendNodeId/epoch/DOM摘要；读取后变化拒绝陈旧动作。
- 提交先准备可读的目标/表单字段预览，在既有approvals表绑定完整参数、页面与任务版本及十分钟期限。批准后Host再次观察，表单网络写入仅允许本次匹配请求。无法判定动作副作用时转人工；响应丢失或进程中断记unknown，不自动重放。
- 接管立即锁住同tab自动派发；交回后生成新快照。任务撤权/删除/退出清理会话与cookie/cache/service worker；重启只恢复中断元数据，不恢复网站登录或重放提交。不读取Chrome资料，不代登录/验证码，不做购买付款。
- 网络：复用NetworkPolicyService验证公开地址及逐连接DNS绑定，浏览器独立受控代理与请求门禁；禁QUIC/WebRTC绕行、应用协议/IPC/设备权限。测试站仅在显式测试构建使用合成公开协议fixture，不放行生产localhost。
- 无新增依赖；Office/Node/Python隔离与已配置真实账户保持。验收必须含真实Chromium、Node网络边界和提交丢响应单业务记录。
- 审阅补充：预览与请求绑定采用submitter实际生效的formaction/formmethod/formenctype/formtarget/noValidate及完整字段；批准期间未匹配的导航/XHR拒绝。活跃标签优先于有界历史；重新观察真正读取DOM。原生视图仅在应用滚动口完整可见且未被对话框/菜单遮挡时附着，避免覆盖应用审批UI。手动接管复用WorkService暂停并立即中止当前模型请求，交回只产生新观察，暂停任务由用户明确继续。
- 智谱Chat沿用既有显式wire别名表，增加browser_open/browser_observe/browser_act，并按本次声明解码；canonical名称、账本与审批不变，未扩大其他协议/模型验收范围。
- 实测接续修正：给模型的browser_current_state附带真实observedAt与最多8条已成功浏览工具名；明确该状态为已完成动作的结果，资料足够即输出成果，遵守任务网址边界，不从网页指令扩大授权或编造日期。工具预算和安全门禁仍由确定性Core/Host校验，提示本身不代替门禁。
