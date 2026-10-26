# Fix分支提交推送交接

日期：2026-10-26，Asia/Shanghai。用户明确授权：“那你把当前的fix分支提交推送到远程，暂不合入main”。本次仅发布现有codex/test-fixes-2026-10-26，不创建PR或合并main，不开展P05。

## 提交范围与已有验证

本提交包含T14点踩直开反馈、同评分再次点击取消、收藏列表及聊天页入口调整；相关契约/后端/Renderer/回归测试、ADR0063及验收材料一并交付。保留此前所有既有改动；不包含原profile、运行时、构建缓存、凭据或原生推理数据。

现有最终验证：T14相关unit7/integration45，反馈/收藏桌面分轮通过；四批当前版本unit53/integration126/Electron30最终通过，PDF/DOCX/PPTX共9页视觉核对、真实Windows选择/保存与字节一致通过。用户已确认P01既定范围/P02原清单及M01/M02两项人工补测通过。失败轮与重跑记录保留，不重复计数，不扩大真实供应商验收。

提交前preflight.mjs逐项核对110产品源码、626生产产物均匹配已验快照；候选约16.5MB，未命中私钥/服务token/数据库等检查规则。实际候选清单与大小见preflight.json；检查不输出可疑值正文。最终check/docs/diff和原启动CheckOnly命令及实际退出码保存在checks.json/对应log。

首次暂存区diff检查退出2，仅原始测试日志的reporter行尾空白/空末行触发。保留日志正文及失败回执staged-diff-first.log；.gitattributes仅对docs/evidence/**/*.log设置-text/-whitespace，避免Git改变原始日志行尾或将reporter空白当作源码格式错误。源码/规格仍按原格式与diff规则检查；暂存区补验回执见staged-diff-final.log。此项为证据存储规则，不改产品或功能断言。

## Git边界与回执

发布前 `git ls-remote --heads origin refs/heads/main refs/heads/codex/test-fixes-2026-10-26` 退出0：main为9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a，目标fix分支尚不存在。使用普通 `git push --set-upstream origin HEAD:refs/heads/codex/test-fixes-2026-10-26`，无force、无main写入。

本提交即包含交接文档，不在文档中虚构自身SHA或提前宣称远程成功；完成后以本地HEAD、远程fix SHA及main前后SHA核验。实际提交/推送命令、退出码、远端SHA和最终工作区状态保存在本机.test-data/fix-branch-push-2026-10-26/receipt.json，并在最终回复提供提交链接。若远端状态变化，保持main不合并并按实际回执报告。

用户授权此次推送自然触发的既有CI；本次不以未完成的远程CI宣称通过。原profile、资源/live/gate与暂缓项保持。
