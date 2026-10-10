# ADR0043 Office私有路径与原生租约别名

- 日期：2026-10-10
- 状态：accepted；实施验收以P03-02 progress为准

## 问题与实测

cef6781的CI首次两Office转换在初始化前超时，独立标准用户撤权/重试也在初始化前超时。标准首样本另在openStore失败：测试在已有较长kit路径上再次附加固定长度填充，增加了数据库/备份路径长度。不能将这些失败标为验收。

本机直接探针使用314字符input和318字符workspace，原生路径打开在path.open.input失败。内部Win32路径打开加扩展前缀后可继续准备，但CreateProcess的长cwd仍失败；给cwd直接加扩展前缀也失败。这些是该主机的实际结果，原始报告保存在本地cache。

## 实施决定

客户端仍只传原有正常本地路径。先执行原有词法限制，再逐组件以内部Win32扩展路径打开；保留reparse拒绝、最终路径一致性、持续句柄和最小ACL。祖先访问仍仅traverse/read-attributes/synchronize且不继承。调用方提供的扩展命名空间或路径别名仍拒绝。

Office已有原生三目录盘符租约。启动cwd明确采用该活跃租约的workspace别名，固定LOK脚本的profile/source/output URI和TEMP等私有环境保留同一短别名，不再resolve回深物理路径。参数只存在于Rust内部调用，不进入payload或模型接口；ACL、范围/版本及句柄验证仍针对原物理目录。通用执行cwd路线保持原有行为。

原allocation mutex、每run lease、精确目标journal、AppContainer身份、零网络、Job限制及关闭回收仍执行。固定Office宏/外链策略和渲染版本保持。新路径必须重验P00隔离/宏/外链/中断恢复与独立标准用户。

## 验证设计

六Core样本按绝对路径长度动态填充，避免标准用户kit再次叠加；另增不使用SQLite的真实Office深私有workspace用例，要求input/workspace超过260字符、真实PDF、原件hash与AppContainer/Job清理，并证明调用方扩展路径仍被拒绝。标准预览报告核对四个必选案例及11份源码摘要。

集成测试文件独占固定CPU/IO预算，用例内部保持两真实Office Job并发。所有原测试、超时与安全断言保留；最终需要本地、实际Electron、完整同源码CI及独立标准用户通过。
