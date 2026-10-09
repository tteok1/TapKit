# P01-01 本地验收与限制

2026-10-03（Asia/Shanghai）。实现位于managed worktree C:/Users/private-user/.codex/worktrees/p01-01/TapKit、codex/p01-01；基线e8df1e7e98b12176c35ccdc15c1ce1a7d51dcb08由本次git fetch origin main取得。原D:/TapKit的8项tracked诊断改动和ci-run56.json未改变；本地验收时尚未commit/push，随后用户授权的Git交付见git-delivery.json。

## 最终证据

final-results.json含命令实际起止时间、退出码、原始脱敏输出及39项源码SHA256。最终check=0、unit37/37、integration36/36（P01-01 17项/storage 19项）、Electron7/7（P00-02 6项/P01-01 1项）。本地OAuth/模型测试使用实际锁定pi公开provider与synthetic凭据/mock HTTP，不宣称真实账户权限。P01-01 Host unit注入mock加密验证落盘/CAS语义；P00-02 Electron实际验证Windows safeStorage/ACL及无明文。

诊断截图PRIVATE_VISUAL_ARCHIVE.md（2174x1382）和PRIVATE_VISUAL_ARCHIVE.md（760x560）已查看，无水平溢出或文本重叠。PRIVATE_VISUAL_ARCHIVE.md为v3未来数据库拒绝且原文件不变的本轮证据；未覆盖P00历史截图。

## 修复检查点

一字节SSE流初测发现pull返回前没有读到完整帧，已改为持续读取直到帧或EOF；zstd请求断言改为按真实上游压缩解码。早期相关integration32/32随后新增device-code/真实端口占用/流取消/未知usage用例，最终36/36替代旧计数。

数据库v2引起原ready版本与未来版本fixture断言过期：首轮unit36/37、P00-02 Electron5/6。更新到当前v2/未来v3，保留安全语义与断言，最终unit37/37、组合Electron7/7。check早期格式/新增runner别名问题已修复；最终check完整退出0。

## Windows 弹窗

完整pnpm build实际退出1。锁定Rust/SDK/CRT/import库均完成准备，随后rustc -vV以0xc0e90002失败、cargo退出101。用户截图显示Windows安全中心因无法确认std-44a584f44bc3dd65.dll发布者而阻止rustc部分功能，和构建时错误一致。

未关闭Smart App Control/WDAC/Defender、未添加排除项、未绕过DLL校验，也未以受控检查通过推定该DLL已经独立可信认证。本任务没有原生helper变更。storage/Core/desktop/live runner分项构建分别退出0，不等同整体build通过；整体构建需在系统信任的工具链或受控CI复验，P00门禁仍failed。

## R01 与恢复

pnpm test:live -- --provider codex-subscription在缺显式R01授权及隔离profile时输出NOT RUN、pnpm退出2（PowerShell包装退出1），无账号读取/远程调用。live runner已编译，并在新建空profile启动后预期退出1/stage=profile；该检查只证明启动/缺账号分支，不证明live步骤通过。

connection-report.json明确live not_run。使用者提供可注销测试账号后，按P01-01交接建立.test-data/P01-01-live-*测试profile，通过TapKit自己的诊断页登录；从托盘退出后显式启用runner，验证真实文本、两轮native、echo提议/本地结果回填、取消、重新构造凭据store并强制刷新及注销。完整桌面进程重启后的真实账号场景仍需R01证据，不以同进程重建对象代替该场景。

2026-10-03 00:13（Asia/Shanghai）进度同步后，pnpm docs:check及check再次退出0；39项源码SHA256与final-results.json完全匹配，git diff --check退出0。

没有运行中构建/测试会话；没有后台server；不自动开展P01-02/P01-03、提交PR或发布。
