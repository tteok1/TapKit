import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^unarchive-review-\d+\.json$/.test(name ?? '')) throw Error('Expected unarchive review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'trash-baseline-2026-10-18.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_archive_search_location_and_unarchive' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name
)
  throw Error('Missing completed scope or next preparation');
const marker = '## 2026-10-18 归档消息定位与取消归档有限通过，准备回收站检查点';
const section = `${marker}

用户确认“定位和恢复都正常”。只读核对11项通过：归档消息P02E-1017R查询历史时间在归档检查点之后、取消归档收据之前；当时归档索引预检已有唯一副本user ID，实际UI定位由用户确认，不伪称完整scope/点击遥测。随后该副本仅一次成功sessions.archive取消操作（target updatedIds精确1/failed0），archived_at恢复null、revision4→5、最近成员1/归档0，并有恢复后的sessions.read收据。标题/其他元数据、两问答SHA/来源/分支、原会话标题及旧7账本保持，全局25runs/41attempts/2tools/41ledger与用量总量不变，无活动/预留/未结算/重复。与10-17归档/标题开关检查点合并，F仅此副本归档—归档搜索定位—取消归档恢复范围有限通过，不提升完整任务或所有搜索/权限场景。

下一G只将“${next.titleQuery}”（${next.session.id}）移入回收站，先留在回收站核对，再给恢复步骤。准备基线trash-baseline-2026-10-18.json固定active/revision5/两问答hash/分支/计数/原会话指针；只读预检附件引用0/资源关联0/该副本消息支持的记忆0。用户右键此副本选“移入回收站”，确认弹窗的记忆影响预期三项0，点“删除会话并处理记忆”一次；若计数不同先停。确认最近列表移出且“聊天→回收站”可见后报告，保留中间状态。不做永久删除、不发送/重生成/AI命名或重新检测。仅准备G，尚未执行/通过；原会话不在操作范围。

证据[恢复核对](../evidence/P02-03/live-2026-10-18/${name})及[当前清单](../evidence/P02-03/live-2026-10-18/acceptance.md)。旧10-17步骤转历史，不重复已过P02-02有限范围和P02-03 A—F。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。其他渠道/协议及其他模型重答继续暂缓，P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P04真实补验/P05未开展。

`;
for (const pathName of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, pathName),
    text = readFileSync(path, 'utf8');
  if (text.includes(marker)) throw Error('Checkpoint exists');
  const split = text.indexOf('\n');
  writeFileSync(
    path,
    text.startsWith('# ')
      ? text.slice(0, split + 1) + '\n' + section + text.slice(split + 1).replace(/^\s*/, '')
      : section + text,
  );
}
writeFileSync(
  join(root, 'docs/progress/CURRENT.md'),
  `# 当前接续点

- 2026-10-18：D:/Tapkit-public，main / 3178a8b；保留既有未提交内容，无本轮commit/push授权。当前P02-03智谱普通Chat/FlashX增量验收；其他渠道/协议及其他模型重答继续暂缓。
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met仍保留。P02-03 A编辑版本/B同模型重生成/C成功分叉/D手动命名重开/E标题及限定消息搜索均有限通过，不重测；B重试estimated14335/actual1336分列。
- F完整的本副本归档/过滤/归档消息定位/取消归档范围有限通过：查询时间在取消前，用户确认UI定位；当前archived null/revision5/最近1/归档0，有后续read收据。两问答hash/来源/分支/原会话和旧7账本保持，全局25runs/41attempts/2tools/41ledger与用量不增。证据docs/evidence/P02-03/live-2026-10-18/${name}。
- 下一G只对副本“${next.titleQuery}”（${next.session.id}）右键移入回收站；弹窗记忆影响预期三项0，点“删除会话并处理记忆”一次，检查最近移出且聊天→回收站可见，先留在那里报告。预检附件/资源关联/记忆来源均0；trash-baseline-2026-10-18.json已留active/revision5/hash/计数，G尚未执行或通过。核对后才做恢复，不永久删除或发消息；原会话不动。
- 当前清单docs/evidence/P02-03/live-2026-10-18/acceptance.md。旧10-17清单为历史。搜索scope/高亮/点击位置由用户确认，查询时间/索引ID作佐证，不冒称完整遥测。C成功分叉未复制失败替代节点符合parent链，原失败记录/账本保留；原失败编辑会话同输入复验not_performed。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${next.caseId}且无活动/预留/未结算/重复；exec99040退出未核对不记exit0。历史见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
writeFileSync(
  join(dir, 'acceptance.md'),
  `# P02-03 增量验收，2026-10-18

沿用原profile/智谱Chat/FlashX，其他渠道与其他模型重答暂缓；已验P02-02及P02-03 A—F范围不重测。本清单接续live-2026-10-17，阶段/任务全量状态保持。

## 当前G第一步：移入回收站，保持中间状态

F归档消息定位/取消归档已有限通过，副本现在最近列表中、revision5，问答和用量保持。证据${name}。G仅准备，尚未执行或通过。

1. 在最近列表右键“${next.titleQuery}”，选择“移入回收站”。
2. 弹窗记忆影响预期三项均0（预检无附件/资源关联/记忆来源）；若不同先停。点击“删除会话并处理记忆”一次。
3. 确认它从“最近”移出，再到左侧“聊天”→“回收站”，确认该副本仍可找到。
4. 先留在回收站并报告结果，Agent核对中间状态后再给恢复步骤。本轮不永久删除或发送/重生成。

trash-baseline-2026-10-18.json已固定副本ID/revision5/两消息hash/分支/原会话指针及全局计数。下一验证软删除状态与目标收据、普通搜索隐藏及原数据保留；不因准备宣称G通过，也不把单副本测试概括为批量或永久删除验收。
`,
);
const oldPath = join(root, 'docs/evidence/P02-03/live-2026-10-17/acceptance.md');
let old = readFileSync(oldPath, 'utf8').replace(/^## 当前F第二步/gm, '## 历史F第二步');
const notice =
  '当前步骤已接续至[2026-10-18验收清单](../live-2026-10-18/acceptance.md)。以下保留历史，不重复已通过项目。';
if (!old.includes(notice)) {
  const split = old.indexOf('\n');
  old = old.slice(0, split + 1) + '\n' + notice + '\n' + old.slice(split + 1);
}
writeFileSync(oldPath, old);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      const complete = line.startsWith('FR-05-004,') || line.startsWith('FR-08-005,');
      const pending = line.startsWith('FR-08-006,') || line.startsWith('FR-08-007,');
      if (!complete && !pending) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      if (complete) {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-18/' + name;
        cells[7] +=
          ';2026-10-18本副本归档消息定位与取消归档有限live通过；查询时间在恢复前且用户确认UI定位；archived恢复null/revision5/最近1和后续read/旧hash账本保持；F本范围闭环但其他搜索/任务状态保持';
      } else {
        cells[5] +=
          ';docs/evidence/P02-03/live-2026-10-18/trash-baseline-2026-10-18.json;docs/evidence/P02-03/live-2026-10-18/acceptance.md';
        cells[7] +=
          ';2026-10-18仅准备对无附件/资料关联/记忆来源的命名测试副本移入回收站检查点；保留软删除状态待核对后再恢复；尚未执行或通过且不做永久删除或批量验收';
      }
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'F_scoped_complete_G_trash_checkpoint_prepared',
    review: name,
    localDate: '2026-10-18',
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
