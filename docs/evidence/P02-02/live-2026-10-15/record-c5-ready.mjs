import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const section = `## 2026-10-17 C5空白会话与背景隔离预检通过，待一次用户请求

用户已新建普通聊天；只读核对session 01a14969-e3c4-77ee-b768-6fc59b1451d6零消息、无项目/接续背景，原账户ready/revision15、Chat/FlashX及偏好revision4保持；生产619产物摘要一致、任务/队列/预留/未结算均0。现有trace仍只有C4三个attempt，没有新增模型请求。合成marker未出现；提示词全部28个关键词对所有旧消息0匹配，active memories0/个人指令长度0，避免自动历史背景重新引入旧拒绝。

同账户/模型/构建下只发一条新session限定的C5，精确英文提示在acceptance.md；只读工具history.search预期limit1/仅本session，结果对应本次消息ID，再核对终答及结算。此对照同时改变会话/合成查询/英文表述，不能据成功证明旧会话是唯一原因，也不据失败断言FlashX不支持工具。普通自动标题若触发单列辅助账本；不重测已通过项或其他渠道。无产品改动/重启/检测/Agent模型请求/Key或native正文读取/正文导出/业务库手写；任务/gate保持，未commit/push。

证据docs/evidence/P02-02/live-2026-10-15/clean-control-preflight-1792233054679.json、c5-prompt-preflight-1792233116793.json、snapshot-1792233054773.json、tool-trace-review-1792233055005.json、round-c5-start-2026-10-17.json。

`;
for (const path of ['docs/progress/INDEX.md', 'docs/progress/P02-02.md']) {
  const file = join(root, path);
  const body = readFileSync(file, 'utf8');
  const pos = path.endsWith('INDEX.md') ? 0 : body.indexOf('## 2026-10-17 C4');
  if (pos < 0 || body.includes('## 2026-10-17 C5空白')) throw Error('Unexpected handoff state');
  writeFileSync(file, body.slice(0, pos) + section + body.slice(pos));
}
const currentFile = join(root, 'docs/progress/CURRENT.md');
const current = readFileSync(currentFile, 'utf8').replace(
  /^- 下一：等待用户新建空白普通聊天.*$/m,
  '- 当前C5已就绪：用户新建session 01a14969-e3c4-77ee-b768-6fc59b1451d6，零消息/无项目/无接续背景。英文提示28关键词均不匹配旧消息，记忆0/个人指令空；账户ready、偏好revision4及619产物保持。下一仅用户按acceptance.md当前C5发一次，Agent核对工具scope/结果/终答/结算；多变量对照不证明唯一根因，失败即停。证据同目录c5-prompt-preflight-1792233116793.json及round-c5-start-2026-10-17.json。无产品修改/重启/Agent模型请求或正文导出。',
);
writeFileSync(currentFile, current);
const csv = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  csv,
  readFileSync(csv, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (!/^(FR-06-017|FR-07-006|FR-07-007),/.test(line)) return line;
      const fields = line.split(',');
      if (fields.length !== 8) throw Error('Unexpected CSV');
      fields[5] +=
        ';docs/evidence/P02-02/live-2026-10-15/round-c5-start-2026-10-17.json;docs/evidence/P02-02/live-2026-10-15/c5-prompt-preflight-1792233116793.json';
      fields[7] +=
        ';2026-10-17C5用户新建空白普通会话及背景隔离预检通过；原Chat/FlashX/偏好/产物保持；待一条用户对照请求不提升状态；不据多变量对照证明唯一根因';
      return fields.join(',');
    })
    .join('\n'),
);
console.log('C5 ready handoff recorded; no live send.');
