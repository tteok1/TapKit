import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^search-review-\d+\.json$/.test(name ?? '')) throw Error('Expected search review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'archive-baseline-2026-10-17.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_search_with_user_UI_confirmation' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name
)
  throw Error('Unverified review or baseline');
const marker = '## 2026-10-17 标题与限定会话消息搜索有限通过，准备归档筛选检查点';
const section = `${marker}

用户确认两次搜索/高亮/跳转都正常。只读核对8项通过：新标题和P02E-1017R的两个合成查询历史ID/lastUsed均为本轮新增；当前唯一索引ID仍分别为副本会话和其中user消息，目标分支/会话元数据与两条问答content SHA/来源完全保持，全局25runs/41attempts/2tools/41ledger不变，trace无新attempt且空闲/无预留/未结算/重复。E按这两个查询有限通过。search_history只存query与更新时间，不存实际scope/types/返回hits/高亮范围或点击locator，本次没有新导航read收据；实际范围、高亮和目的地由用户确认，当前唯一索引与hash只作佐证，不伪称已有独立请求/点击遥测。排序/归档/历史删除/跨项目权限不因此通过。

下一F只对副本“${next.titleQuery}”（${next.session.id}）右键“归档”，先保持归档。Ctrl+K全局/会话查精确标题，“包括归档”勾选应1命中，取消后再次查找应0。用户报告后Agent只读核对archived_at/归档收据/两种过滤ID与原hash/账本/零新增执行；中间状态通过再给取消归档/最近列表恢复步骤，不提前把完整F记通过。基线archive-baseline-2026-10-17.json已保留revision3/archived null、两问答hash/分支/查询历史与全局计数；尚未归档或验收。无需发送/重生成/AI命名或重启。

证据[搜索核对](../evidence/P02-03/live-2026-10-17/${name})与同目录archive-baseline-2026-10-17.json/acceptance.md。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。已验A—D及P02-02有限范围不重测；其他渠道/协议与其他模型重答暂缓。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending，不扩P04/P05。

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

- 2026-10-17：D:/Tapkit-public，main / 3178a8b；保留既有未提交内容，无本轮commit/push授权。当前P02-03智谱普通Chat/FlashX增量验收；其他渠道/协议及其他模型重答继续暂缓。
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met仍保留。P02-03 A编辑/分支切换、B同模型重生成/版本切换、C成功分叉、D副本手动命名重开已有限通过，不重测；B网络重试的estimated14335/actual1336分列。
- E两次标题/限定会话消息搜索有限通过：两合成查询历史新写、当前索引唯一ID/问答hash/分支保持，全局25runs/41attempts/2tools/41ledger未增；范围/高亮/跳转由用户确认，非持久查询参数/点击遥测。证据docs/evidence/P02-03/live-2026-10-17/${name}。
- 下一F只将副本“${next.titleQuery}”（${next.session.id}）右键归档，再全局+会话搜完整标题，“包括归档”勾选应1命中、取消后再次查找应0；先保持归档并报告，不提前取消。Agent核对archived中间状态后再给取消归档恢复步骤。archive-baseline-2026-10-17.json已准备，F尚未执行/通过。原会话不动，不发送/重生成/AI命名或重启。
- 副本当前revision3/title_manual1/archived null、两问答hash和分支均保持；已留搜索历史/global基线。C副本不含原超时失败节点符合成功parent路径，原记录/账本保留；原失败编辑会话同输入复验not_performed。排序/历史删除/跨项目权限等留后续。
- 本轮无产品修改/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${next.caseId}且无活动/预留/未结算/重复。exec99040退出未核对不记exit0。详细历史见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const path = join(dir, 'acceptance.md'),
  old = readFileSync(path, 'utf8').replace(/^## 当前E/gm, '## 历史E');
const split = old.indexOf('\n');
writeFileSync(
  path,
  old.slice(0, split + 1) +
    `\n## 当前F第一步：归档与搜索开关，保持归档待核对

E标题/当前会话消息搜索已按用户UI确认及查询历史/索引/hash佐证有限通过，不重测。证据${name}。当前仅准备F，取消归档要等中间状态核对后再操作。

1. 在左侧对“${next.titleQuery}”副本右键选“归档”；它应从“最近”列表移出。
2. Ctrl+K搜索范围选“全局”、结果类型选“会话”，输入完整标题“${next.titleQuery}”。勾选“包括归档”后点“查找”，应命中该副本。
3. 取消“包括归档”勾选，再点“查找”，应无命中。
4. 先保持归档，报告最近列表和两种搜索结果。Agent核对中间状态后再给取消归档步骤。异常先停，不重复归档或发送问题。

本步不调用模型；archive-baseline-2026-10-17.json固定ID/revision/hash/全局执行计数。预期仅该副本archived_at改变且索引/问答/旧账本保持；搜索过滤的可见结果由用户回执与当前只读索引比较佐证，不假称已记录每个搜索请求参数。F整体仍待归档及恢复两检查点。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      const search = /^FR-05-00[1345],/.test(line),
        archive = line.startsWith('FR-08-005,');
      if (!search && !archive) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      if (search) {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/' + name;
        cells[7] +=
          ';2026-10-17标题与当前会话消息搜索有限live通过；两个合成查询历史新写及唯一索引/hash保持佐证；实际scope/高亮/跳转由用户确认且不冒称持久请求或点击遥测；其他搜索场景与任务状态保持';
      } else {
        cells[5] +=
          ';docs/evidence/P02-03/live-2026-10-17/archive-baseline-2026-10-17.json;docs/evidence/P02-03/live-2026-10-17/acceptance.md';
        cells[7] +=
          ';2026-10-17仅准备命名副本归档与包括归档搜索开关的中间检查点；先保持归档待核对后再取消归档；原hash/分支/全局计数基线已留；尚未执行或验收';
      }
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'E_scoped_passed_F_archive_checkpoint_prepared',
    review: name,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
