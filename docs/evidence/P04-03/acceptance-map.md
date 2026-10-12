# P04-03 需求与验收映射

本轮真实模型联调由用户明确暂缓。以下为本地工程验收，供应商提取表现和真实用量不宣称通过；CI收口另见implementation-2026-10-12.json。所有截图和测试资料为合成数据。

| 需求 | 实际入口和行为 | 核验 |
| --- | --- | --- |
| FR-29-008（部分） | 个人/项目/当前会话生效范围及三个外部背景开关；智能体范围规划中 | policy/UI；T10 project isolation；Electron范围与临时模式 |
| FR-29-010 | 个性化全局记忆/历史开关，当前会话显式覆盖；每次装配和后台job重验 | revisions fence / temporary / used refs integration；Electron会话开关 |
| FR-29-011 | “记住/更新记忆/纠正记忆/忘记/删除记忆”即时路径，向模型传实际Core结果，无预审批 | explicit write/correction/forget/undo integration；post-write Electron |
| FR-29-012 | memory.list中文短词/FTS长词查询与分页，创建/编辑/CAS删除/个人项目范围迁移 | search pagination/scope move/expiry；管理页Electron |
| FR-29-013 | 来源messageId/revision可打开原句，更新时间和显式/自动标识；来源失效拒绝 | two independent sources / source deletion；来源与重启Electron |
| FR-29-014（部分） | 创建或编辑选择个人/项目；跨scope保留ID并支持完整撤销；不提前建立Agent域 | scope move/undo integration；scope选择UI |
| FR-29-015 | 手工纠正优先；删除墓碑清索引/引用/候选；清空含零条时增加generation | delayed concurrent/clear / two session fence / FTS deletion；清空与撤销冲突Electron |
| FR-29-016 | 每个回答记录实际采用的memory/history ID与revision，展开再验证权限/删除/版本 | real chat used refs / T10 model background；used memories Electron |
| FR-29-017 | 临时store不读写/提取/上传记忆和历史，明确提示；关闭清除沿用P02 | temporary store integration；实际临时入口Electron |
| FR-29-018 | 删除预览合并多会话来源计数；默认删单来源/重新核验多来源，可保留显式记忆并脱离来源 | source deletion integration；真实删除预览/保留Electron |

T11额外负向：一次偏好不保存、临时要求/引用/第三方/健康敏感推断/凭据无job、复制来源不算独立事件、模型编造quote/低置信/敏感/临时/凭据输出拒绝、租约到期拒绝提交、两个并发会话候选不覆盖手工修改、设置/来源revision改变使旧job失效、schema13→14保留旧值与job且重跑安全。

T10额外负向：其他项目唯一标记不进入检索结果/模型背景，三个项目外开关独立；projectOnly关闭外部参考，过期/删后记忆不进入使用提示，完整记忆模块UTF-8保守计数≤1000。

最终补验：范围迁移及撤销为移出scope建立墓碑；任意事实唯一旧值纠正，缺失/含糊/空新值拒绝；后台绑定本轮实际模型账户、root预算和taskVersion，账户失效拒绝切换；复制会话去除写入成功回执且不重复写入。最终integration16/16，源码87633cf的CI38207594863全量unit293/integration314/perf2/Electron45、标准用户22/3/4和Office/启动诊断全部通过。真实模型联调仍由用户暂缓。
