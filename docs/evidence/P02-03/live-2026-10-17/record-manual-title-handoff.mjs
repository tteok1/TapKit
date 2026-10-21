import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const name = process.argv[2];
if (!/^manual-title-review-\d+\.json$/.test(name ?? ''))
  throw Error('Expected manual title review');
const review = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const next = JSON.parse(readFileSync(join(dir, 'search-baseline-2026-10-17.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_manual_title_and_reopen' ||
  !Object.values(review.checks).every(Boolean) ||
  next.priorAcceptance !== name
)
  throw Error('Unverified review or next baseline');
const marker = '## 2026-10-17 副本手动命名与重新进入有限通过，准备搜索定位';
const section = `${marker}

用户确认符合预期；只读核对8项通过：副本${review.session.id}一次sessions.update成功，标题精确为“${next.titleQuery}”、title_manual1、revision2→3；保存后的sessions.read收据与用户离开重开观察一致。两条问答content SHA/来源/版本、原分支/备注/tags/project均保持，原会话标题hash和旧7账本hash保持。无sessions.title或新模型/工具/执行/结算，全局25runs/41attempts/2tools/41ledger仍不变，无活跃/预留/未结算或重复。FR-08-001仅手动命名/持久化范围有限通过，不冒称自动标题竞争、AI重命名或完整需求live通过。

下一E只验标题和限定会话消息搜索/高亮/定位。只读FTS及索引ID预检已确认全局+类型会话+精确新标题仅命中该副本；当前会话+类型消息+“${next.messageQuery}”仅命中副本user消息${next.messageSearch.expectedHits[0].id}，分支${review.session.branchId}。没有调用search.query或写搜索历史，SQL预检不算UI验收。用户先Ctrl+K全局/会话查完整新标题并点击结果，再在打开的副本Ctrl+K当前会话/消息查P02E-1017R，检查片段高亮后点击命中问题；确认仍定位此副本、不跳原会话且问答正常。两次本地查询不应发模型/工具请求；不发送消息、不归档或改其他会话。search-baseline-2026-10-17.json记录预期命中ID、消息hash/分支/global计数及既有合成查询历史ID/时间，下一核对实际查询历史与用户UI回执。排序、归档检索、删除搜索历史及跨项目权限仍未本轮真人验收，不用这两次查询概括全部搜索要求。

证据[手动命名核对](../evidence/P02-03/live-2026-10-17/${name})及同目录search-baseline-2026-10-17.json/acceptance.md。无本轮产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P02-02及本任务A/B/C已验范围不重测，其他渠道/协议与其他模型重答继续暂缓，不扩P04/P05。

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
- P02-02 A队列/B立即补充/C只读闭环有限通过保留，C强当前用户ID语义not_met仍保留。P02-03 A编辑/分支切换、B同模型重生成/版本切换、C成功消息分叉均有限通过，不重测；B网络重试的estimated14335与actual1336分列。
- D副本手动命名/离开重开有限通过：${review.session.id}新标题“${next.titleQuery}”，revision3/title_manual1；两消息hash/来源/分支/其他元数据、原标题和7旧账本保持，全局25runs/41attempts/2tools/41ledger不增。证据docs/evidence/P02-03/live-2026-10-17/${name}。不代表自动标题竞争或AI命名已验。
- 下一E在副本Ctrl+K：全局+会话查完整新标题并打开，再Ctrl+K当前会话+消息查P02E-1017R，检查高亮并点进问题，确认仍在该副本且准确定位。预期各1命中；只读索引ID预检通过，真实UI搜索未执行/未验。search-baseline-2026-10-17.json已保存预期ID/hash/分支/计数及合成查询历史基线。无需模型请求或发新消息；排序/归档/历史清理/跨项目权限留后续逐项。
- C副本不含原超时提示符合成功parent路径语义；超时是正文0的失败替代attempt，原消息/账本保留；不声称从失败节点分叉/全会话备份已验。原失败编辑会话同输入复验仍not_performed。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${next.caseId}，无活动/预留/未结算/重复；exec99040退出未核对不记exit0。详细历史见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const path = join(dir, 'acceptance.md'),
  old = readFileSync(path, 'utf8').replace(/^## 当前D/gm, '## 历史D');
const split = old.indexOf('\n');
writeFileSync(
  path,
  old.slice(0, split + 1) +
    `\n## 当前E：标题与当前会话消息搜索定位

D手动命名/重新进入已有限通过，新标题与问答保留、原会话标题未变，无模型/工具/结算增加。A/B/C已验范围不重测；其他渠道继续暂缓。证据${name}。

1. 从已命名副本按Ctrl+K（或左侧“搜索”），搜索范围选“全局”，结果类型选“会话”，输入完整标题“${next.titleQuery}”，点“查找”，再点击唯一命中结果，应打开该副本。
2. 在打开的副本再次按Ctrl+K，将搜索范围改为“当前会话”、结果类型改为“消息”，搜索“${next.messageQuery}”。
3. 检查命中片段中关键词高亮，点击该结果，应定位到副本中的对应问题；会话标题仍是新标题，原问题和成功回复均在。
4. 报告两次搜索能否找到/打开正确目标、是否有高亮和错误。若异常先停，不发送测试问题或重生成。

预期标题命中1个会话、限定范围消息命中1条user；只读FTS/索引ID预检不算UI通过。search-baseline-2026-10-17.json已准备，后续用公开查询元数据/原消息hash/执行计数与用户观察核对；本步不调用模型。排序、归档查询、历史删除和跨项目权限未在本步验收。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      const manual = line.startsWith('FR-08-001,'),
        search = /^FR-05-00[1345],/.test(line);
      if (!manual && !search) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      if (manual) {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/' + name;
        cells[7] +=
          ';2026-10-17副本手动命名与离开重开有限live通过；1次手动update后read且新标题/消息hash/原标题/旧账本保留；无模型工具结算增加；不代表自动标题竞争或AI重命名通过';
      } else {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/search-baseline-2026-10-17.json';
        cells[7] +=
          ';2026-10-17仅准备全局标题+会话类型及当前会话消息范围的搜索/高亮/定位；合成查询索引各1预期ID预检通过但UI尚未执行或验收；其他搜索条件/权限范围留后续且状态保持';
      }
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'D_scoped_passed_E_search_prepared',
    review: name,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
