import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^trash-review-\d+\.json$/.test(name ?? '')) throw Error('Expected trash review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'restore-baseline-2026-10-18.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_trash_checkpoint_restore_pending' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name
)
  throw Error('Missing verified checkpoint or recovery baseline');
const marker = '## 2026-10-18 回收站软删除检查点有限通过，待恢复及消息索引重建';
const section = `${marker}

用户确认记忆影响/最近移出/回收站可见符合预期。只读核对10项通过：命名副本${review.session.id}只有一次成功sessions.trash目标收据（updatedIds1/failed0、无restore/purge），当前deleted_at非空、revision5→6，最近0/归档0/回收站1。两条消息content SHA/来源/版本和原分支、标题/其他元数据仍保留；该session的搜索projection0、完整合成标题FTS0，已从普通搜索移除。关联资源/附件/该副本记忆来源仍0，原会话active且原标题/旧7账本hash保持，全局25runs/41attempts/2tools/41ledger及用量不变，空闲/无预留/未结算/重复。只标G移入回收站中间检查点有限通过；恢复尚未执行，G整体不通过。无批量/永久删除、文件引用恢复或非零记忆影响验收。

下一只恢复同一副本：左侧聊天→回收站，勾选其左侧复选框，点列表“恢复”一次；切最近打开，确认原标题/两问答。再Ctrl+K当前会话+消息查P02E-1017R并点击定位，验证回收站恢复后的本地消息索引重建，不重测先前未删除状态的索引。restore-baseline-2026-10-18.json固定当前deleted/revision6/hash/分支/旧trash收据/执行数和预期session1+message2的搜索projection、唯一user ID；当前projection仍0，不把预期当已恢复。本步不永久删除/发消息/重生成或重启。

证据[软删除核对](../evidence/P02-03/live-2026-10-18/${name})及同目录restore-baseline-2026-10-18.json/acceptance.md。用户观察支撑弹窗与列表UI，后台只佐证持久状态与索引，不伪称完整UI遥测。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。已验P02-02有限范围及P02-03 A—F不重测，其他渠道/协议及其他模型重答暂缓；P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，未进入P04/P05。

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
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met仍保留。P02-03 A编辑/B同模型重生成/C成功分叉/D手动命名/E限定搜索/F本副本归档—搜索定位—取消归档均有限通过，不重测；B重试estimated14335/actual1336分列。
- G软删除检查点有限通过：副本“${next.titleQuery}”（${next.session.id}）deleted非空/revision6，最近0/归档0/回收站1，目标trash收据1；两问答hash/来源/分支/原标题保留，该副本搜索projection0/完整标题FTS0。资源/附件/记忆来源0，原会话及7旧账本保持，全局25runs/41attempts/2tools/41ledger与用量不增。证据docs/evidence/P02-03/live-2026-10-18/${name}。G整体仍待恢复。
- 下一G恢复：聊天→回收站勾该副本复选框，点“恢复”一次；最近打开确认原标题/两问答，Ctrl+K当前会话+消息搜P02E-1017R并点进问题，核对删除后重建索引。restore-baseline-2026-10-18.json已存deleted/revision6/hash/旧trash收据/计数及预期3条projection和user ID，尚未恢复或通过。不永久删除/发送/重生成或重启，原会话不动。
- 当前清单docs/evidence/P02-03/live-2026-10-18/acceptance.md。UI范围/高亮/定位与记忆弹窗/列表由用户确认，索引/时间/ID作佐证，不伪称完整请求遥测。C成功分叉未复制失败替代节点符合parent链，原失败记录/账本保留；原失败编辑会话同输入复验not_performed。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${next.caseId}且无活动/预留/未结算/重复；exec99040退出未核对不记exit0。详细历史见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const path = join(dir, 'acceptance.md'),
  old = readFileSync(path, 'utf8').replace(/^## 当前G第一步/gm, '## 历史G第一步');
const split = old.indexOf('\n');
writeFileSync(
  path,
  old.slice(0, split + 1) +
    `\n## 当前G第二步：从回收站恢复及消息索引重建

G移入回收站检查点已有限通过：副本revision6/deleted非空，原两消息hash/分支保留且普通搜索projection/FTS已移除，原会话与账本不变。证据${name}。恢复未执行，G整体仍待完成。

1. 进入左侧“聊天”→“回收站”，勾选“${next.titleQuery}”左侧复选框，点击列表“恢复”一次。
2. 切到“最近”，打开它，确认标题和两条问答完整。
3. Ctrl+K选“当前会话”+“消息”，搜索“P02E-1017R”，点击结果，确认可定位到恢复后的问题。
4. 报告恢复和消息搜索是否正常。异常先停，不重复恢复或发送内容；不做永久删除。

restore-baseline-2026-10-18.json已固定当前软删除状态/消息hash/分支/旧收据与执行数。下一核对一条恢复收据、deleted null/revision7、最近成员、同一消息ID/hash与搜索projection/FTS重建，以及零新增模型/工具/用量。本项只是无附件/资源/记忆来源的单副本恢复，不概括永久或批量删除、文件/记忆影响恢复。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      const trash = line.startsWith('FR-08-006,'),
        restore = line.startsWith('FR-08-007,');
      if (!trash && !restore) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      cells[5] +=
        ';docs/evidence/P02-03/live-2026-10-18/' +
        name +
        ';docs/evidence/P02-03/live-2026-10-18/restore-baseline-2026-10-18.json';
      cells[7] += trash
        ? ';2026-10-18单一无资源测试副本移入回收站检查点有限live通过；deleted非空/revision6/目标trash收据1/消息hash保留与搜索projection清除；原会话和用量保持；非批量或永久删除验收'
        : ';2026-10-18已核对副本在回收站且两消息hash仍存；下一仅恢复与搜索索引重建，基线已留但尚未恢复或验收；不做永久删除，完整需求状态保持';
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'G_trash_checkpoint_passed_recovery_prepared',
    review: name,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
