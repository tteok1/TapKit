import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^group-rename-review-\d+\.json$/.test(name ?? ''))
  throw Error('Expected group rename review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'group-delete-baseline-2026-10-18.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_group_rename_delete_pending' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name ||
  next.group.revision !== 4
)
  throw Error('Missing verified rename checkpoint or deletion baseline');
const marker = '## 2026-10-18 同组改名有限通过，待删除分组保留会话';
const section = `${marker}

用户确认“符合预期”。H改名14项（含用户UI回执）通过：同一group ${review.group.id}的名称SHA匹配“${next.groupName}”，成员及排序不变。实际有3条成功sidebar.update目标收据，而非原准备时预期的一条；按packages/storage/src/foundation.ts的receipt规范重算已知合成请求指纹，sequence384精确匹配name=新名/expectedRevision1，385匹配collapsed=true/expectedRevision2，386匹配collapsed=false/expectedRevision3。故只有一次改名，另两次是折叠/展开，最终group revision4/collapsed0，不误记为三次改名或revision异常。指纹只在内存比对并导出匹配标签，无私人正文/Key/native内容。

目标副本${next.session.id}仍是组内唯一成员，原sidebar关联/sort key保持，其他分组/成员不变；session revision8、标题/备注/标签/项目/归档删除状态及两消息content SHA/来源/版本/分支全部保持，有更新后的sessions.read（sequence387）。用户确认改名列表、打开副本和两问答正常，后台不声称完整UI点击遥测。projection仍session1+message2、资源/附件/记忆来源仍0；原会话未归档/未删除且原标题与旧7账本hash保持。全局25runs/41attempts/2tools/41ledger和actual52958/estimated151455/total204413 tokens不增，无活动/预留/未结算/重复。

下一H只删除这个自定义组并验证会话回默认列表：聊天页面该分组标题旁⋯→“删除分组，内容回到默认列表”一次；确认组消失，点“默认列表”打开“${next.titleQuery}”，确认原标题及两消息完整，不删除会话或移入回收站、不发送/重生成/重启。group-delete-baseline-2026-10-18.json固定group ID/revision4/唯一成员/session revision8/hash/分支/索引/用量和收据基线388。预期一条同group sidebar.remove成功收据、group行移除、原sidebar_item.section_id按ON DELETE SET NULL回null，session保持active/revision8及内容；当前仍未删除，H删组保留内容及H整体仍待验收。

证据[改名核对](../evidence/P02-03/live-2026-10-18/${name})及同目录group-delete-baseline-2026-10-18.json、acceptance.md。本轮仅证据/进度更新，无产品修改/重建/重启/Agent模型请求/业务库手写，未commit/push；不重跑已验P02-02有限范围及P02-03 A—G/H先前检查点。其他渠道/协议及其他模型重答继续暂缓；C5强当前用户ID语义not_met与原失败编辑会话同输入复验not_performed保留。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，未扩P04/P05。

`;
for (const pathName of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, pathName),
    text = readFileSync(path, 'utf8');
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
- H新建/移入及同组改名有限通过：group ${next.group.id}现名“${next.groupName}”、revision4/collapsed0；收据384/385/386的规范请求指纹分别精确匹配改名(rev1)、折叠(rev2)、展开(rev3)，仅一次改名。组内唯一副本${next.session.id}，session revision8/元数据/两消息hash/来源/分支及原成员关系保持；有read387。原会话原标题和旧7账本保持，全局25runs/41attempts/2tools/41ledger及用量不增。证据docs/evidence/P02-03/live-2026-10-18/${name}；不概括拖拽/批量/项目移动或排序验收。
- 下一H删组保留会话：聊天页面“${next.groupName}”标题旁⋯→“删除分组，内容回到默认列表”一次；确认组消失，点“默认列表”打开“${next.titleQuery}”，核对原标题/两消息后报告。group-delete-baseline-2026-10-18.json固定group revision4/唯一成员/session revision8/hash/分支/索引/计数；预期remove1/group消失/sidebar sectionId null，session保持revision8/active。当前尚未删组或通过；不删除会话/移入回收站/发送/重生成/重启，原会话不动。
- 当前清单docs/evidence/P02-03/live-2026-10-18/acceptance.md；用户确认改名列表/打开/内容，后台收据/指纹匹配/成员/hash作佐证，无完整UI点击路径遥测。本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，同case ${next.caseId}且无活动/预留/未结算/重复；exec99040退出未核对不记exit0。
- 详细历史见INDEX/P02-03及docs/evidence。P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
const old = readFileSync(acceptancePath, 'utf8').replace(/^## 当前H第二步/gm, '## 历史H第二步');
const split = old.indexOf('\n');
writeFileSync(
  acceptancePath,
  old.slice(0, split + 1) +
    `
## 当前H第三步：删除分组，保留会话回到默认列表

同组改名有限通过，名称“${next.groupName}”；一次改名及附带折叠/展开各一次使group revision4，指纹精确匹配，组内唯一副本、session revision8/消息hash/分支及用量保持。证据${name}。删除分组尚未执行或通过。

1. 左侧“聊天”页面找到分组“${next.groupName}”，点击分组标题旁的“⋯”。
2. 点击“删除分组，内容回到默认列表”一次，确认该分组消失。
3. 点击“默认列表”，找到并打开“${next.titleQuery}”，确认原标题和两条问答完整。
4. 报告结果。这里操作分组，不删除会话或移入回收站；不用发送消息、重生成或重启。

group-delete-baseline-2026-10-18.json保留group ID/revision4/唯一成员及session revision8/hash/分支/索引/旧执行用量。下一只读核对同一group的一条sidebar.remove成功收据、group移除、sidebar关联sectionId null而会话active/revision8/标题/消息/分支/索引/资源和账本保持。该准备不算删组验收；未覆盖项目/批量/拖拽或排序。

沿用原profile/智谱Chat/FlashX；其他渠道/协议及其他模型重答暂缓，已验内容不重测。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const reqPath = join(root, 'docs/progress/requirements.csv');
const notes = {
  'FR-04-010':
    '2026-10-18同组改名有限live通过：同group ID/新名hash匹配；收据指纹精确匹配改名1及折叠展开各1，group revision4；删组仍待验收，全需求状态不提升',
  'FR-04-012':
    '2026-10-18改名后目标唯一分组成员和session revision8及两消息hash保持；不新增或重测移动，仍非项目批量拖拽验收',
  'FR-04-014':
    '2026-10-18创建移入和改名检查点已有限通过；group revision4唯一成员/session revision8/hash已存删组基线，下一删组验证内容回默认列表；当前尚未删除或验收',
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
        'docs/evidence/P02-03/live-2026-10-18/group-delete-baseline-2026-10-18.json',
      ])
        if (!cells[5].split(';').includes(p)) cells[5] += ';' + p;
      cells[7] += ';' + notes[id];
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'H_rename_checkpoint_passed_delete_prepared',
    review: name,
    updatedRequirementIds: Object.keys(notes),
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
