import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^restore-review-\d+\.json$/.test(name ?? '')) throw Error('Expected restore review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'group-baseline-2026-10-18.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_trash_restore_lifecycle' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name ||
  next.nameConflictCount !== 0 ||
  next.sections.length >= 100
)
  throw Error('Missing verified restore or group baseline');
const marker = '## 2026-10-18 回收站恢复及索引重建有限通过，准备自定义分组';
const section = `${marker}

用户确认“符合预期，都正常”。恢复只读核对及用户UI回执共12项通过：副本${review.session.id}只有一次成功sessions.restore目标收据（sequence${review.receipts[0].sequence}、updatedIds1/failed0），deleted_at恢复null、revision6→7，最近1/归档0/回收站0，并有其后的sessions.read。两条消息content SHA/来源/版本、分支与原标题/其他元数据均保持；搜索projection重建为session1+message2，合成标题和P02E-1017R消息索引均命中同一目标ID。查询历史在恢复后更新，用户确认当前会话+消息筛选及点击定位正常；后台未记录scope/实际返回列表/高亮范围/点击参数，不伪称完整UI遥测。原会话未归档/未删除、原标题与旧7账本hash保持；全局25runs/41attempts/2tools/41ledger及用量不增，无活动/预留/未结算/重复。

合并上一软删除检查点，G仅此无附件/资源/记忆来源的单副本“移入回收站—保留内容—恢复—索引重建/定位”有限live通过，不概括永久或批量删除、非零依赖恢复。下一H第一步只创建“${next.groupName}”，把“${next.titleQuery}”通过会话编辑弹窗的分组下拉框移入，点新分组打开确认原标题及两消息，保留分组待核对；不在本次步骤中改名或删除分组。只读预检现有分组${next.sections.length}/100、重名0、目标尚无分组；group-baseline-2026-10-18.json固定恢复后的revision7/消息hash/分支/索引/执行数及原分组清单、其他成员hash。会话编辑保存会正常产生sessions.update（即使标题等值未变）再sidebar.move，预期revision7→8；不能将准备当作创建/移入/改名/删组通过。

证据[恢复核对](../evidence/P02-03/live-2026-10-18/${name})、同目录group-baseline-2026-10-18.json及[当前清单](../evidence/P02-03/live-2026-10-18/acceptance.md)。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。已验P02-02有限范围及P02-03 A—G不重测；其他渠道/协议及其他模型重答继续暂缓。原失败编辑会话同输入复验仍not_performed、C5强当前用户ID语义not_met仍保留。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，未扩P04/P05。

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
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met仍保留。P02-03 A编辑/B同模型重生成/C成功分叉/D手动命名/E限定搜索/F归档—定位—取消归档已有限通过，不重测；原失败编辑会话同输入复验not_performed。B重试estimated14335/actual1336分列。
- G单副本回收站生命周期有限通过：恢复收据1/sequence${review.receipts[0].sequence}，deleted null/revision7、最近1/归档0/回收站0；原标题/两消息hash/来源/分支保持，session1+message2索引重建且查询在恢复后更新。用户确认内容及当前会话消息定位正常，后台不记录完整筛选/点击遥测。资源/附件/记忆来源0；不概括永久/批量/非零依赖恢复。证据docs/evidence/P02-03/live-2026-10-18/${name}。
- 下一H第一步：聊天→新建分组“${next.groupName}”；通过“${next.titleQuery}”的⋯编辑弹窗→分组下拉框选该组→保存；点新组打开副本确认原标题/两消息，保留分组待核对。预检现有分组${next.sections.length}/100、重名0、目标无分组；group-baseline-2026-10-18.json固定revision7/两消息hash/分支/索引/分组与其他成员基线。预计编辑保存会sessions.update至revision8再sidebar.move；创建/移入/改名/删除分组均尚未真人验收，不删除分组或发送/重生成/重启，原会话不动。
- 当前清单docs/evidence/P02-03/live-2026-10-18/acceptance.md。原会话标题和旧7账本hash保持，全局25runs/41attempts/2tools/41ledger与用量不变，同case ${next.caseId}且无活动/预留/未结算/重复；exec99040退出未核对不记exit0。C成功分叉未复制失败替代节点符合parent链，原失败记录/账本保留。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写；详细历史见INDEX/P02-03及docs/evidence。P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
const old = readFileSync(acceptancePath, 'utf8').replace(/^## 当前G第二步/gm, '## 历史G第二步');
const split = old.indexOf('\n');
writeFileSync(
  acceptancePath,
  old.slice(0, split + 1) +
    `
## 当前H第一步：新建自定义分组并移入测试副本

G单副本回收站恢复及消息索引重建有限通过，恢复后revision7/deleted null；原标题/两问答hash/分支保持、同一消息ID可搜/定位，全局执行和用量未增。证据${name}。不概括永久/批量或非零资源/记忆影响验收。

1. 打开左侧“聊天”，点“新建分组”，名称填“${next.groupName}”，点“保存”。
2. 找到“${next.titleQuery}”，点击其“⋯”打开编辑弹窗；在“分组”下拉框选择“${next.groupName}”，点“保存”。原标题/备注/标签/项目保持原值。
3. 点击新分组，确认能看到并打开该副本，标题与原来的两条问答完整。
4. 保留新分组并报告结果，Agent先核对创建与移入回执。此次不改名/删除分组，不发送消息或重生成。

group-baseline-2026-10-18.json已固定目标revision7/消息hash/分支/索引/账本和分组基线；现有分组${next.sections.length}/100、同名0、目标无分组。下一核对一个新分组ID/创建收据、目标唯一sidebar.move成员关系；通过编辑弹窗保存会先sessions.update再sidebar.move，等值元数据hash应保持、revision预计7→8，问答/分支/执行/用量均不变。H只准备，未验收；分组改名/删除后保留会话将在后续单独给步骤。

沿用原profile/智谱Chat/FlashX，其他渠道和其他模型重答暂缓；已验范围不重测，不重启。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const requirementPath = join(root, 'docs/progress/requirements.csv');
const notes = {
  'FR-08-006':
    '2026-10-18单一无资源测试副本回收站软删除—恢复生命周期有限live通过；软删除清除索引且保留消息hash，恢复rev7/最近1/索引重建；无永久或批量删除验收',
  'FR-08-007':
    '2026-10-18单一无附件资源记忆来源副本恢复有限live通过；目标restore收据1/deleted null/rev7/两消息hash与分支不变/session1+message2索引重建；用户确认恢复及定位；不概括非零依赖恢复',
  'FR-05-004':
    '2026-10-18回收站恢复后P02E-1017R消息索引重建且命中原副本user ID，查询历史晚于恢复；用户确认当前会话消息点击定位；后台不记录完整scope与点击遥测',
  'FR-04-010':
    '2026-10-18仅准备新建P02验收分组-1018与移入命名副本；分组基线已存且重名0；创建重命名删除均尚未本轮真人验收',
  'FR-04-012':
    '2026-10-18仅准备将恢复后命名副本经编辑分组下拉框移入新自定义组；revision7消息hash及分组成员基线已存；尚未移入或验收，项目移动不在本步',
  'FR-04-014':
    '2026-10-18分组删除保留会话测试前置准备；先新建分组移入合成副本待核对；尚未删组或验收内容去向',
};
writeFileSync(
  requirementPath,
  readFileSync(requirementPath, 'utf8')
    .split('\n')
    .map((line) => {
      const id = line.split(',', 1)[0];
      if (!notes[id]) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      const evidence = [
        'docs/evidence/P02-03/live-2026-10-18/' + name,
        'docs/evidence/P02-03/live-2026-10-18/acceptance.md',
      ];
      if (id.startsWith('FR-04-'))
        evidence.push('docs/evidence/P02-03/live-2026-10-18/group-baseline-2026-10-18.json');
      for (const p of evidence) if (!cells[5].split(';').includes(p)) cells[5] += ';' + p;
      cells[7] += ';' + notes[id];
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'G_lifecycle_passed_H_group_first_step_prepared',
    review: name,
    updatedRequirementIds: Object.keys(notes),
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
