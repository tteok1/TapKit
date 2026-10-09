# P03-01 公开修复验收审计

2026-10-09接续：下表保留6361510的24项真实验收；收口文档CI发现T08测试等待竞态，FR-03-002暂回in_progress。受控真实回包延迟复现后，仅修改测试等待页面会话ID及输入加载；T08三轮15/15与完整P03 17/17、check/docs/diff退出0，新测试源码CI待核验。业务/原生源码不变；最新状态和证据以 [导航同步复核](public-navigation-sync-2026-10-09.json) 为准。

status：implemented_and_verified；验收源码 6361510faf904402eea8a5cb18eec21b112b4b7e，公开修复分支 codex/p03-01-ci-repair。本地运行结果和首轮失败详见 [修复验证](public-ci-repair-2026-10-09.json)，真实源码6361510的push CI37938112057与PR CI37938119655均completed/success。原 [需求审计](requirements-audit-2026-10-09.md) 是历史接续资料，本表对应当前公开源码和本轮实际检查。

本轮全量 unit263/263，明确清单的11个P03便携集成文件78/78，开启启动诊断的完整P03 Electron17/17，bootstrap/ABI、production desktop build、check、docs检查均退出0。编排模拟、便携进程和合成OCR界面不替代真实AppContainer及标准用户验收。

| 需求 | 当前代码与实际测试链路 | 验收结果与既定边界 |
| --- | --- | --- |
| FR-03-002 | chat-file-import/preload/Main/Host token；物理File、导航取消/晚到、虚拟粘贴unit与Electron | 图片理解延期 |
| FR-13-001 | file-selections/service/parser；TXT、Markdown、代码、CSV/TSV、JSON、YAML/YML、XML、HTML、PDF、DOCX、XLSX、PPTX、ZIP | native15种后缀样例及扫描PDF在管理员/标准用户通过；ZIP只提供安全目录元数据 |
| FR-13-002 | 媒体在Core原件路径结束，不调用executor；媒体原件Electron与编排通过 | OCR/音视频/图像分析延期；ZIP不提取内含文档 |
| FR-13-003 | 只读选择token、中文相对路径与folder事务；selection/service与真实drop/文件夹Electron | 无未授权目录遍历 |
| FR-13-005 | importInfo与共享FILE_LIMITS；格式/大小/20个批量/可用空间，service和响应式Electron | 100MiB、500页、120秒等生产上限未扩大 |
| FR-13-006 | 按项进度/取消/重选；固定版本cancelParse/retryParse；service/files及导航Electron | native取消、hard-kill与单版本fenced retry在管理员/标准用户通过 |
| FR-13-007 | 原件imported与parseStatus分离；启动失败SANDBOX_UNAVAILABLE，明确parser_failed保留业务原因 | native正向发布在管理员/标准用户通过；组件不可用失败关闭 |
| FR-13-008 | keep/skip/明确replace新增版本、hash去重与副本；files/service和完整版本Electron | 固定引用不漂移；源字节不覆盖 |
| FR-13-009 | empty/encrypted/corrupt/magic/格式/OCR具体原因及恢复入口；unit、portable parser与详情Electron | native7项失败输入和OCR状态在管理员/标准用户通过 |
| FR-13-011 | library/project/session目标与固定版本引用；service/material与范围/聊天Electron | 撤权、其他profile与坏pin拒绝 |
| FR-13-012 | 原件导出前后权限及wx；exporter与失败/媒体/OCR/旧版本Electron | 读取失败仍可下载；取消不继续开启下载框 |
| FR-14-001 | uploaded资料及messages.saveNote确定文本成果同库；schema9迁移、history及生成笔记Electron | P07办公生成与模型live不属于本任务 |
| FR-14-002 | 类型/来源/owner/日期/收藏与排序；files/service和范围Electron | 范围视图使用固定旧版元数据 |
| FR-14-003 | 名称及已解析固定版本file_search_documents；files/history与生成笔记Electron | native上传正文检索在管理员/标准用户通过；不检索未解析二进制原件 |
| FR-14-004 | FileView/VersionView名称/格式/大小/owners/更新时间/hash；契约、files和详情Electron | 历史版元数据保持 |
| FR-14-005 | folder、rename/move/copy/favorite revision/scope检查；files/service、目录和版本Electron | 副本复制所看版本；共享物理父目录语义保留 |
| FR-14-006 | 批量结果、move/download/trash与impact；service/files及批量下载Electron | 未完成项保留选择；失败不冒充成功 |
| FR-14-007 | resource_links与accepted run/message/task_version投影；usage及任务使用Electron | 保存引用/排队不冒充执行使用 |
| FR-14-008 | link/unlink固定fileVersion与接收范围根目录；material/files及跨范围Electron | 其他scope、撤权、坏pin仍拒绝 |
| FR-14-009 | versions/restoreVersion新增版本/copy指定版；files及完整版本Electron | 不覆写旧原件或重绑历史引用 |
| FR-14-010 | unlink与实体trash分别预览影响；files/service及回收站/范围Electron | 实体删除影响全部关联；移除引用仅当前范围 |
| FR-14-011 | purgeAfter/restore/purge、fsync journal、备份恢复防复活；files与回收站Electron | blob由有效引用及备份保留规则管理 |
| FR-14-012 | 原件/结构/预览/备份占用去重、大小排序、原子clearPreview；files/storage与library Electron | 不清原件、结构正文或备份仍引用的blob |
| FR-33-008 | DOM File物理拖入、Host文件夹授权与目录关系；selection/service与drop Electron | 本任务部分范围；截图/屏幕采集延期 |

## 异常与安全验收

- 中文同名/相同hash/大写后缀：files/service与版本Electron已通过；新增版本和独立副本原件相等。
- 空文件、密码PDF/ZIP、CRC损坏、magic不匹配、旧Office、宏格式、XML实体：unit/portable通过；native7项拒绝与扫描PDF在管理员/标准用户通过。
- ZIP穿越、ADS、Windows别名、大小写冲突、符号链接、压缩炸弹、嵌套预算：有界中央目录及CRC测试已通过；真实压缩炸弹/链接/穿越native在管理员/标准用户通过。没有向宿主解压文件。
- 半导入取消/ENOSPC/并发替换：service真实取消信号与提交fencing、注入磁盘满通过；ENOSPC不是填满用户磁盘。
- 实际导入进程终止及SQLite/Electron重开：已提交原件保留，未完成token重选、旧请求不重复；本轮恢复Electron通过。
- parser暂存进程终止/租约/链接目录保护：staging集成通过；native取消/helper hard-kill、零残留进程及单版本重试在管理员/标准用户通过。
- 不授予磁盘根ACL，不改AppContainer、零网络、固定只读输入、Job killOnClose/breakaway/processLimit、120秒生产限时或输出身份/摘要/租约检查。Node加载选项不承担安全校验。

本轮首个集成命令的exclude未应用于Vitest项目，意外选入native；该轮native2/3，ZIP测试对既定目录元数据范围使用了错误正文检索断言，另有两项共享bundle重建ENOENT。真实helper观察与全部失败保存在修复证据中，不转植为生产能力报告；修复后便携78/78，native已在6361510的管理员与独立标准用户复验通过。本机生产capability仍失败关闭，系统策略未改，未使用宿主进程解析回退。

24项需求按既定范围implemented_and_verified。管理员全量integration238/238；独立标准用户P00 22/22、P03 3/3零pending/缺项；Office宏/外链各三轮、startup的storage/vault各三轮通过。P03-02/03未开始，无P03-gate，不进入P04。

标准用户新鲜kit排除dist，构建准备已补齐到standard-user-test的两个probe之前，避免测试并行重建；语法和完整check通过，源码6361510的真实双CI全部成功，构建准备有效。

## 最终原生与交接证据

[标准用户P03](public-ci-6361510-standard-parser.json)、[标准P00](public-ci-6361510-standard-runtime.json)、[标准用户26事件](public-ci-6361510-standard-native-cases.jsonl)、[管理员26事件](public-ci-6361510-admin-native-cases.jsonl)、[Office六轮](public-ci-6361510-office-diagnostics.json)已核验。每组25条正常结束事件满足AppContainer、SID匹配、零网络、Job killOnClose/无breakaway/processLimit2与activeProcesses0；强制终止另记录helper信号，随后原件及暂存清理、同版本唯一发布重试通过。标准parser摘要34721611394eb3697828f9b8beae68e1b3360f5f4a13a37a86294224abd286d0与本地生产bundle一致。

本轮交接止于P03-01。程序、测试和harness源文件保持为已通过CI的6361510，之后只有收口文档。P03-02按阅读地图读取其预览/定位任务，不把本任务的解析结构当成预览/PDF批注交付。P03-03项目索引、P03-gate未开始。实际使用前仍须该Windows机器的有效标准用户probe；不迁移CI能力报告或调用未授权真实模型。
