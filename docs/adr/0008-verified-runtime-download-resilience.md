# ADR 0008：锁定运行库下载的容错与缓存

- 状态/日期：采用，2026-10-02；用户已授权在新分支自主诊断、最小修复与CI复验，优先保护核心实现。
- 问题和实测证据：CI51独立诊断runner在LibreOffice26.2.6官方下载收到HTTP504；CI52同一来源三次504后按次数上限失败，测试未开始。CI53两个新runner冷缓存时也下载失败，证明单靠缓存无法解决首次准备。其他runner的完整P00验收通过。详见`docs/evidence/P00-02/main-ci-repair.md`。原CI49的建库/凭据保存超时没有复现，不能用下载故障解释其根因。
- 决定：暂态HTTP/明确连接错误最多三次传输尝试，共享原十分钟预算，退避并遵从Retry-After；哈希/永久HTTP/未知错误不自动重试。CI使用官方actions/cache的独立restore/save入口，只缓存`.cache/downloads`和`.cache/wheels`，精确key取三个运行库/依赖锁文件的hash，无前缀回退。bootstrap成功后立即保存；独立诊断job随后在新runner恢复，避免同一次工作流反复访问故障分发路径。诊断job在全量检查失败时仍运行，原失败仍导致工作流失败。
- 冷准备来源：保留原TDF URL，在runtime-lock的LibreOffice项增加显式mirrorUrls，仅在暂态错误后按顺序切换；max三次/原预算不变。OSU Open Source Lab镜像为TDF镜像网络来源，已实际流式读取完整373252096字节，SHA256 `f9877032fd908beb9c0ddf06df4af5c2e85f419c42e14876c4cce5aae5fb2660`与原锁完全相同；没有执行或安装本地副本。manifest验证备用URL必须HTTPS且最多两项。源/备用源的hash失败都立即终止，不继续换来源掩盖失败。
- 信任与兼容性：缓存只是传输复用，bootstrap仍按原锁重新计算每个archive/wheel的digest、解压、native ABI probe与构建；任何坏缓存立即失败。缓存不含node_modules、已解压.runtime、应用数据、凭据、测试报告或能力结果。运行库原URL/版本/hash、业务IPC/SQLite/DPAPI/隔离实现和原用例预算不变，只增加已核验字节的备用来源。actions/cache@v5运行在Node24，最低runner2.327.1；本轮2.337.0满足要求。
- 回归：14项下载异常单元测试纳入原pnpm test:unit，包括镜像选择及错误hash不继续换源；最终CI须再次跑完整check/unit/integration/build/Electron、独立标准用户22项以及新runner三轮初始化。不得跳过bootstrap的digest校验来制造cache-hit通过。
- 最终验证：代码`7214ae0c5ca54ec87e0b6b14729424f84f9ac9f2`的CI54全success，unit31/31含下载14项、integration46/46、Electron8/8、独立标准用户22/22及新runner三轮初始化通过；实测冷缓存官方504后备用完成、成功保存并在新runner命中。证据见`docs/evidence/P00-02/main-ci54.json`；不宣称旧CI49超时根因已确认。
- 规格同步：`docs/plan/tasks/P00-01.md`补充固定版本/hash下的传输容错；CURRENT/INDEX/P00-01/P00-02与requirements对应行记录新CI结果，不启动P01。
- 权威来源：[GitHub官方cache说明](https://github.com/actions/cache/blob/v5/README.md)、[独立restore](https://github.com/actions/cache/blob/v5/restore/README.md)、[独立save](https://github.com/actions/cache/blob/v5/save/README.md)、[Microsoft暂态故障处理](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults)。
- 镜像来源：[TDF官方镜像网络记录](https://listarchives.libreoffice.org/global/website/2013/msg02031.html)、[OSU当前文件目录](https://ftp.osuosl.org/pub/tdf/libreoffice/stable/26.2.6/win/x86_64/)、[OSU镜像服务说明](https://osuosl.org/services/hosting/policy/)。来源登记资料并不能替代本轮完整字节与原锁hash的实际核验。
