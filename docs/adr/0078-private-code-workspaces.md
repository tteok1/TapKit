# ADR0078：私有代码镜像、版本审阅和有界修改

2026-11-05；P09-01；accepted。

Host 的专用目录选择器经私有 `code.attach` 通道授予工作任务代码范围；公共 IPC 和模型不能提交宿主目录。Core 保存 run→代码项目→私有镜像/工作目录映射。schema22 追加 code_projects/worktrees，不复用原计划中已被聊天历史占用的0007编号，不建立第二套运行状态。

Git broker 不对用户 `.git/config` 执行 Git。它验证并复制对象字节及分支引用到 DATA/code-private 的新 bare 仓库，不继承配置、hooks、凭据、hardlink 或 alternates。私有镜像登记独立 `tapkit/<task短ID>` worktree，使用固定对象读取物化正文，避免 checkout filter、textconv、fsmonitor 和 submodule 执行。Git 创建的工作目录指针移除，元数据映射仅保留在 Core。后续P09-02只可授权执行目录，不能授权code-private或原仓库元数据。

默认基于指定已检测分支/HEAD，不带脏改动；显式带入仅允许已检测 tracked 版本及勾选 untracked，读取时重验 hash。非Git目录只建立有来源记录的副本，不隐式初始化Git。第一版只物化UTF-8文本，最多1000个文件、16MiB正文、单文件1MiB、对象复制1GiB；链接、子模块、二进制及超量给出明确拒绝。排除元数据、依赖缓存、秘密路径和Windows别名。原目录不写入、不stash/reset。broker临时复制index只进行禁用扩展的cached diff以检测暂存区，随后删除，工作副本不继承原index。

每次单文件修改绑定 baseHash（新增为null），提前持久化前像，最终重读核验；冲突保留现有字节。接受为审阅标记；撤销和恢复均只修改副本并校验期望hash。准备过程先记录unknown日志，再物化；中断后仅补写缺失且未冲突的已登记内容。任务结束不删除副本。

新增严格 code.* DTO 与 code.applyPatch 工作工具，复用 WorkRepository、ModelRouter、根预算、tool_calls/attempts 及不可变JSON修改回执；回执不声称运行代码测试。工具没有任意命令、联网或Git提交能力。执行中的意图无回执则恢复为unknown，不自动重放。源文件和AGENTS正文作为不可信项目材料，不能扩大权限。反馈绑定path/hash/side/line，新任务版本复制当前内容并继承反馈，保留旧任务副本。

远程连接、commit/push/PR由P09-03实现；终端/依赖/代码测试由P09-02实现，本任务不提前放行。P09阶段需全部任务和安全实测后收口。本任务验收范围见docs/progress/P09-01.md，真实模型须先应用内检测；新增检测额度独立计10次，不合并旧任务余量。

真实验收补充：智谱Chat的固定协议别名表增加code.applyPatch→code_applyPatch，边界解码仍还原canonical并执行原参数/schema/hash校验。缺失映射的首轮本地拒绝保留，estimated不冒充actual或账单；没有扩大工具权限。

差异渲染补充：左右真实源行号通过patience锚点与有界LCS对齐；大规模无锚点片段采用保守替换块，不分配平方矩阵。空缺侧没有可引用行；无差异文件不着色。每次最多显示300对齐行，其余分页，正文按Core固定版本分页读取。行号为24px独立反馈目标，选中/焦点不依赖增删底色。
