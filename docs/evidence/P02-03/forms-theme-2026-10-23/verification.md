# 全局表单与平整列表 UI 验证

日期：2026-10-23；分支 ui_fix；基线 394418f；保留全部已有未提交改动。

本轮按 ADR0062 只改界面：所有表单与聊天输入共用灰绿柔和聚焦阴影；下拉选项使用主题圆角菜单；checkbox 改圆形外观并保留独立多选；文字操作使用胶囊轮廓和共享间隔。会话/工作/分组及设置历史列表去掉标题外框，标题、右侧小字、选择和操作同行，分隔线两端淡出。文件/项目/记忆等同类列表复用分隔线，原网格视图保留。

## 功能保持与覆盖

- `control-integrity.json`：修改前后31个TSX文件的545个控件属性、值、禁用条件及事件一致；45组相邻操作增加布局容器。Host/Core/preload/contracts源码哈希保持。
- `runtime.json`：隔离生产 Electron 44.3 / Chromium 152 实测支持 base-select 及 picker。沿用原HTML控件语义和事件，不引入另一套选择状态。
- `final-electron.json` / `.log`：生产产物上同轮11/11通过。新增6项覆盖表单保存/取消、项目和分组变更、鼠标/键盘真实下拉、disabled、圆形独立多选、批量归档/恢复/删除预览及全局页面审查；原分组/提示2项、导航3项也通过。
- 四种表单组合：1440×900浅色、1440×900深色、960×640浅色、960×640深色200%。下拉菜单与dialog不越界，窄视口可滚动访问所有动作。`geometry-*.json`保存视口、行对齐、字段聚焦、下拉及操作间隔的实测数据。
- 全局实际页面覆盖设置、个人资料、模型、文件、项目、记忆、搜索；共享CSS同时覆盖聊天、会话/分组表单、账号诊断和阅读器原生控件。未逐一操作所有可用业务流程；完整性证据不等同于重新验收所有后端功能。
- 视觉：首批菜单、表单、模型截图后补调select展开态中性边框；最终复核浅色表单/平整列表与960×640深色200%的菜单/底部操作。`final/`保存最终截图；没有继续做无关视觉重设计。

## 实际命令与结果

使用仓库锁定Node和pnpm，临时目录在工作区；Electron均为新建的隔离合成profile，无真实模型请求。

| 命令 | 结果/回执 |
| --- | --- |
| pnpm build:desktop | final-build.json：退出0，生产Core，无测试fixture |
| pnpm test:unit P02-01 | unit.json：退出0，12/12 |
| pnpm exec playwright test tests/e2e/P02-01.form-controls.spec.ts tests/e2e/P02-01.group-tooltips.spec.ts tests/e2e/P02-01.navigation.spec.ts | final-electron.json：退出0，同轮11/11 |
| pnpm check | final-check.json / .log：退出0 |
| pnpm docs:check | final-docs-check.json / .log |
| git diff --check（通过pnpm exec执行） | diff-check.json / .log |

最终汇总与产物哈希见 `results.json`；109份产品源码及626份生产产物在桌面测试前冻结并在收口时逐项比对。

## 失败与修正

首轮沙箱构建遇到原生输出目录EPERM，使用授权本地构建环境重跑成功；首次静态检查发现新测试的未用参数，已修。初轮新测试的精确label定位包含可见选项，改按实际可访问combobox名称定位；键盘验证改成Space展开后Home/End和Enter提交。一次准备脚本默认编码读取失败，未成功更新测试；仅停止该隔离测试树后修正并重跑，中断回执保留。首轮docs:check在本说明落盘前检查其引用而报ENOENT，补齐后重跑。对应 build、check、docs-check、initial-electron、visual-electron、review-electron 原始日志和退出码均保留；最终11项完整同轮通过，没有放宽产品断言。

测试前持久备份旧 evidence，原回归写出的12份历史文件移到本目录 `related-tests/final-electron` 后按原字节恢复。恢复退出码与备份清单见各运行回执；原有历史证据不被本轮结果冒充。

## 启动与边界

原启动器保持：

```powershell
& "D:\Tapkit-public\docs\evidence\P02-03\session-load-2026-10-21\run-app.ps1"
```

完成收口后 `.test-data/current-ui-review.json` 指向本目录results；`-CheckOnly`校验所有当前源码/生产产物和既有profile路径，不启动应用。实际校验回执见 `launcher-check.json`。退出托盘中的旧TapKit后再执行原命令，才会载入最新生产UI。

本轮没有关闭用户原窗口、编辑原profile、发真实服务请求、修改Core/翻译/数据契约或迁移数据库，没有commit/push，原implemented_not_live_verified/live/gate状态保持。纯UI变更未重跑无关后端集成；生产桌面测试通过原IPC验证相关保存和批量命令。
