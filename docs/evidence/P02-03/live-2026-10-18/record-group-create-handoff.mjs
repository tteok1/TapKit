import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^group-create-review-\d+\.json$/.test(name ?? ''))
  throw Error('Expected group create review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'group-rename-baseline-2026-10-18.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_group_create_and_move_rename_delete_pending' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name ||
  next.nameConflictCount !== 0
)
  throw Error('Missing verified create/move checkpoint or rename baseline');
const marker = '## 2026-10-18 自定义分组创建与移入有限通过，待同组改名';
const section = `${marker}

用户确认“符合预期”。H第一检查点16项（含用户UI回执）通过：新建“${next.originalGroupName}”返回分组${review.group.id}，revision1；只有一次成功sidebar.create（sequence378）和一次目标sidebar.move（sequence380，updatedIds仅副本/failed0）。中间sessions.update（sequence379）符合编辑弹窗保存流程，副本revision7→8而原标题/备注/标签hash和项目/归档删除状态均保持；随后sessions.read（sequence381）佐证已重新打开。组内恰一成员，目标01a14a2b-364a-7034-986d-79c884ee51a3只有一个分组关联，其他分组/成员基线保持。用户确认新分组列表和副本标题/两问答正常；后台不伪称持久记录了完整筛选/点击路径。

两消息content SHA/来源/版本及分支保持，session1+message2搜索projection和合成消息命中ID保持。资源/附件/记忆来源仍0，原会话未归档/未删除且原标题和旧7账本hash保持；全局25runs/41attempts/2tools/41ledger、actual52958/estimated151455/total204413 tokens不变，无活动/预留/未结算/重复。仅同一普通副本经编辑下拉框新建/移入自定义组有限live通过，不概括拖拽/批量/项目移动、排序或置顶；H整体的改名、删除保留会话尚未通过。

下一H只改同一分组名称为“${next.renamedGroupName}”：聊天页面点击分组标题旁“⋯”，改“分组名称”并保存一次；选择改名后的组打开原副本，确认原标题和两消息，保留分组待只读核对，不删除组/移动成员/发送或重生成。group-rename-baseline-2026-10-18.json已固定group ID/revision1/hash/成员，session revision8/消息hash/分支/执行用量及收据基线382；新名重名0。预期同一group ID/revision2/一条sidebar.update，session revision8及成员不变；改名尚未执行或验收。删除分组与内容回默认列表将在后续独立检查点进行。

证据[创建移入核对](../evidence/P02-03/live-2026-10-18/${name})及同目录group-rename-baseline-2026-10-18.json、acceptance.md。本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。已验P02-02有限范围和P02-03 A—G及本H检查点不重测，其他渠道/协议及其他模型重答继续暂缓；C5强当前用户ID语义not_met与原失败编辑会话同输入复验not_performed仍保留。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，未扩P04/P05。

`;
for (const pathName of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, pathName);
  const text = readFileSync(path, 'utf8');
  if (text.includes(marker)) throw Error('Checkpoint already recorded');
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
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met。P02-03 A编辑/B同模型重生成/C成功分叉/D手动命名/E限定搜索/F归档恢复/G单副本回收站恢复和索引重建有限通过，不重测；原失败编辑会话同输入复验not_performed。B网络重试estimated14335/actual1336分列。
- H创建/移入检查点有限通过：“${next.originalGroupName}”group ${review.group.id}、revision1，create378/move380各1，组内只有命名副本${next.session.id}；编辑保存update379使session revision7→8，元数据/两消息hash/来源/分支保持，read381确认重新打开。其他分组/成员及索引保持，原会话原标题/旧7账本保持，全局25runs/41attempts/2tools/41ledger及用量不增。证据docs/evidence/P02-03/live-2026-10-18/${name}；非拖拽/批量/项目移动或排序验收。
- 下一H只改分组名：聊天页面分组标题旁⋯→分组名称“${next.renamedGroupName}”→保存一次；选改名后的组打开“${next.titleQuery}”，确认原标题/两消息后保留组。group-rename-baseline-2026-10-18.json已存同一group/revision1/唯一成员/session revision8/消息hash/执行用量，预期group revision2及一条sidebar.update、session保持revision8。新名冲突0，改名与删组保留会话尚未执行或验收；不删除/移动成员或发消息/重生成/重启，原会话不动。
- 当前清单docs/evidence/P02-03/live-2026-10-18/acceptance.md；用户确认列表/打开/内容UI，后台凭收据/唯一成员/hash作佐证，无完整点击路径遥测。本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，同case ${next.caseId}且无活动/预留/未结算/重复；exec99040退出未核对不记exit0。
- 详细历史见INDEX/P02-03及docs/evidence。P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
const old = readFileSync(acceptancePath, 'utf8').replace(/^## 当前H第一步/gm, '## 历史H第一步');
const split = old.indexOf('\n');
writeFileSync(
  acceptancePath,
  old.slice(0, split + 1) +
    `
## 当前H第二步：同一自定义分组改名

H创建/移入检查点有限通过：group ${review.group.id}、revision1、唯一成员为命名副本；一次create/目标move，预期编辑save使session revision8，元数据/两消息hash/分支和执行用量保持。证据${name}。H改名与删除保留会话仍待验收。

1. 打开左侧“聊天”，找到分组“${next.originalGroupName}”，点击分组标题旁的“⋯”（分组的按钮，不是会话的按钮）。
2. 将“分组名称”改成“${next.renamedGroupName}”，点“保存”一次。
3. 点击改名后的分组，打开“${next.titleQuery}”，确认副本标题和原两条问答保持。
4. 保留分组并报告结果。本次不删除分组、不移动成员、不发送消息或重生成。

group-rename-baseline-2026-10-18.json固定同一group ID/revision1/成员与session revision8/消息hash/分支/索引/用量；预期新名hash匹配、group revision2及一条成功sidebar.update，成员及会话revision8保持，零新增执行/用量。只准备本次改名，不能记为已完成；待核对后再给删除分组且保留会话步骤。

沿用原profile/智谱Chat/FlashX；其他渠道/协议与其他模型重答继续暂缓，已验内容不重测。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const reqPath = join(root, 'docs/progress/requirements.csv');
const notes = {
  'FR-04-010':
    '2026-10-18自定义分组创建有限live通过：create1/group revision1；下一只改名基线已存，改名和删除尚未验收；不提升全需求状态',
  'FR-04-012':
    '2026-10-18命名副本经会话编辑分组下拉框移入一个新自定义组有限live通过：target move1/唯一成员，预期update使session revision8而元数据消息hash保持；不概括拖拽批量或项目移动',
  'FR-04-014':
    '2026-10-18删组保留内容前置创建和移入检查点有限通过；下一先改名，删组尚未执行或验收；同组唯一副本hash和成员基线已存',
};
writeFileSync(
  reqPath,
  readFileSync(reqPath, 'utf8')
    .split('\n')
    .map((line) => {
      const id = line.split(',', 1)[0];
      if (!notes[id]) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      for (const p of [
        'docs/evidence/P02-03/live-2026-10-18/' + name,
        'docs/evidence/P02-03/live-2026-10-18/group-rename-baseline-2026-10-18.json',
      ])
        if (!cells[5].split(';').includes(p)) cells[5] += ';' + p;
      cells[7] += ';' + notes[id];
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'H_create_move_checkpoint_passed_rename_prepared',
    review: name,
    updatedRequirementIds: Object.keys(notes),
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
