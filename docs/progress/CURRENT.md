# 当前接续点

- 2026-10-11：D:/Tapkit-public，codex/p04-01-retrieval；main基线a43d8d0（fetch/ff-only exit0、clean），main CI38067903301 success。
- P04-01=in_progress；schema12/ADR0045/固定BGE CPU模型/混合检索/引用验证已实现。本地check、unit279、integration98、20k perf、Electron5通过；最后校准源码的Electron/远程CI待确认。
- 金标准32/32 Recall@20/首条来源支持、75/75定位、4无答案零来源；校准失败轮保留。P03门禁passed，P01/P02既有live缺口保持。
- 详见P04-01.md及docs/evidence/P04-01。用户禁止PR与合入main；验收后等待人工确认，不扩P04-02/03。
