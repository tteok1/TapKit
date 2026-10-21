import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^archive-review-\d+\.json$/.test(name ?? '')) throw Error('Expected archive review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'unarchive-baseline-2026-10-17.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_archive_filter_checkpoint_restore_pending' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name ||
  !next.archivedMessageSearch
)
  throw Error('Missing checkpoint or next preparation');
next.status = 'prepared_waiting_archived_message_location_and_one_unarchive';
writeFileSync(
  join(dir, 'unarchive-baseline-2026-10-17.json'),
  JSON.stringify(next, null, 2) + '\n',
);
const marker = '## 2026-10-17 归档与标题过滤中间状态有限通过，待归档消息定位及取消归档';
const section = `${marker}

用户确认归档/最近列表移出/“包括归档”两种搜索均符合预期。只读核对10项通过：仅命名副本${review.session.id}有一次成功sessions.archive收据（updatedIds精确一项、failed0），当前revision3→4、archived_at非空；最近成员0/归档成员1，当前索引包括归档恰命中该副本、排除归档0命中，合成标题查询时间已更新。标题/其他元数据、两问答content SHA/来源/分支、原会话未归档及旧7账本hash保持，全局25runs/41attempts/2tools/41ledger与用量总量不变，无活动/预留/未结算/重复。UI开关实际可见结果由用户确认，SQL只佐证当前状态/命中ID；不冒称持久记录了每次查询参数。F第一检查点有限通过，取消归档未做，F整体不提升。

下一利用当前归档状态补T06尚未真人验过的“归档消息定位”，然后取消归档；不重做已过标题过滤。只读消息索引预检：当前会话/消息/包括归档、查询P02E-1017R唯一命中副本user ${next.archivedMessageSearch.expectedHits[0].id}，未调用app搜索或写查询历史，也不算UI通过。用户关闭搜索，左侧聊天→归档打开该副本，Ctrl+K当前会话+消息勾“包括归档”查P02E-1017R并点击定位；再回归档列表右键该副本选“取消归档”一次，最近列表打开确认原标题和问答保留。unarchive-baseline-2026-10-17.json固定归档状态/revision4/两消息hash/分支/旧收据/查询历史与执行计数，下一核对恢复null/revision5和一条新目标收据；归档消息UI定位仍须用户确认，不伪造遥测。

证据[归档检查点](../evidence/P02-03/live-2026-10-17/${name})及同目录unarchive-baseline-2026-10-17.json。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。已验P02-02范围及本任务A—E不重测，其他渠道/协议与其他模型重答暂缓。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，不扩P04/P05。

`;
for (const name of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, name),
    text = readFileSync(path, 'utf8');
  if (text.includes(marker)) throw Error('Checkpoint already written');
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

- 2026-10-17：D:/Tapkit-public，main / 3178a8b；保留既有未提交内容，无本轮commit/push授权。当前P02-03智谱普通Chat/FlashX增量验收；其他渠道/协议及其他模型重答继续暂缓。
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，强当前用户ID语义not_met仍保留。P02-03 A编辑分支/B同模型重生成版本/C成功分叉/D手动命名重开/E标题及限定消息搜索均有限通过，不重测。B重试estimated14335/actual1336分列。
- F归档/标题过滤检查点有限通过：副本“${next.titleQuery}”（${next.session.id}）当前revision4/archived_at非空，最近0/归档1；include归档索引1/排除0及用户UI确认一致。原hash/分支/7旧账本/global25runs/41attempts/2tools/41ledger和用量总量保持。证据docs/evidence/P02-03/live-2026-10-17/${name}。F整体仍待恢复。
- 下一先补当前归档消息定位：关闭搜索，左侧聊天→归档打开副本，Ctrl+K当前会话+消息，勾包括归档，查P02E-1017R并点进唯一问题；随后回归档列表右键该副本“取消归档”一次，再在最近打开检查标题/问答保留。unarchive-baseline-2026-10-17.json已存归档revision4/hash/旧收据/计数及唯一归档消息ID预检；实际UI定位和恢复尚未做，不能记完整F通过。不重测已过标题开关，无需发送或重启。
- 搜索history只存query/时间；范围/高亮/点击目的地靠用户确认与当前只读索引佐证，不伪称完整请求遥测。C副本不含原失败替代attempt符合成功parent链；原超时记录/账本保留，原失败编辑会话同输入复验not_performed。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${next.caseId}且空闲/无预留/未结算/重复；exec99040退出未核对不记exit0。详细见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const path = join(dir, 'acceptance.md'),
  old = readFileSync(path, 'utf8').replace(/^## 当前F第一步/gm, '## 历史F第一步');
const split = old.indexOf('\n');
writeFileSync(
  path,
  old.slice(0, split + 1) +
    `\n## 当前F第二步：归档消息定位，然后取消归档

F归档/标题过滤中间状态已有限通过；副本当前仍归档，revision4，原问答/hash/账本和用量保持。证据${name}。不重复已过标题过滤，F整体等本步核对后再记通过。

1. 关闭搜索框，进入左侧“聊天”页面，切“归档”，打开“${next.titleQuery}”。
2. Ctrl+K选择“当前会话”+“消息”，勾选“包括归档”，搜索“P02E-1017R”，点击唯一结果，确认能定位到副本中的问题。
3. 回到“归档”列表，右键该副本选“取消归档”一次。
4. 切到“最近”，打开该会话，确认标题和两条问答保留；报告归档消息定位与恢复是否正常。异常先停，不重复点击或发消息。

unarchive-baseline-2026-10-17.json已保存当前归档元数据/两消息hash/分支/旧收据/查询历史及global计数。归档消息索引唯一命中已只读预检，UI定位未通过；取消归档也仍未执行或验收。本步不调用模型。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      const archive = line.startsWith('FR-08-005,'),
        locate = line.startsWith('FR-05-004,');
      if (!archive && !locate) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      cells[5] +=
        ';docs/evidence/P02-03/live-2026-10-17/' +
        name +
        ';docs/evidence/P02-03/live-2026-10-17/unarchive-baseline-2026-10-17.json';
      cells[7] += archive
        ? ';2026-10-17副本归档/标题包括归档过滤中间检查点有限通过；revision4且archived非空/精确收据/索引1对0与用户可见结果一致；原hash/旧账本/用量保持；取消归档仍待验，完整需求状态不提升'
        : ';2026-10-17当前归档副本的P02E-1017R唯一消息ID只读预检；下一补归档消息UI定位后取消归档，尚未UI验收；不重复已过非归档定位';
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'F_archive_checkpoint_passed_archived_message_and_restore_prepared',
    review: name,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
