import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const reviewName = process.argv[2];
if (!/^regenerate-review-\d+\.json$/.test(reviewName ?? ''))
  throw Error('Expected regenerate review');
const review = JSON.parse(readFileSync(join(dir, reviewName), 'utf8'));
const fork = JSON.parse(readFileSync(join(dir, 'fork-baseline-2026-10-17.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_regenerate_and_version_switch' ||
  !Object.values(review.checks).every(Boolean) ||
  fork.priorAcceptance !== reviewName
)
  throw Error('Acceptance/preparation binding mismatch');
const marker = '## 2026-10-17 同模型重生成与版本切换有限通过，准备分叉会话';
const section = `${marker}

用户确认“符合预期。可以继续下一项验收”，只读元数据与脱敏trace核对13项通过：原C5会话的编辑分支下仅一次messages.regenerate，创建candidateFor/forkMessageId均指向原助手答复的新“回答版本”和独立run；复制的user有原来源ID、精确P02E-1017R问题，最终仍答“编辑分支成功”。旧7条消息的content SHA/来源/状态/版本与旧2分支/5条账本hash保持；主/编辑/回答版本三层仍保留。旧编辑分支和新回答版本来回切换多次，无新增run/工具或额外结算。

该run为1逻辑回合/tools0，实际2attempt：先NETWORK_ERROR/无HTTP响应，随后既有自动重试HTTP200/text/stop成功。两条各结算一次，均同原root与logicalCall；失败estimated14335保留，不当供应商实际消耗，成功actual1336（input1332/output4）。不是两次重生成或版本切换重放。上下文快照均source-data/1并含当前user，任务/队列/标题/记忆job/预留/未结算/重复结算均0。FR-07-013按此普通智谱Chat/FlashX场景有限通过，其他模型重答及其他渠道继续暂缓，任务与阶段全量状态不提升。

下一C仅验FR-07-015“从此消息分叉会话”。当前回答版本branch ${fork.sourceBranchId}，最终助手消息${fork.sourceMessageId}；生产界面按钮精确文案“从此消息分叉会话”。单击一次应开独立新会话并保留该消息之前路径，新标题带“ · 副本”；回原会话确认三个旧分支仍在，再回副本。只导航、不发送/重生成/AI命名。基线fork-baseline-2026-10-17.json保存原会话/3分支/10消息hash/7账本、可见路径来源hash、现有session IDs及全局run/attempt/tool/ledger计数；复制与导航预期0模型/工具/结算，尚未执行也不记通过。

证据[重生成核对](../evidence/P02-03/live-2026-10-17/${reviewName})、同目录fork-baseline-2026-10-17.json及acceptance.md。Agent模型请求/Key或native读取/正文导出/业务库手写0，无本轮产品修改/重建/重启或commit/push。P02-03仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；原P02-02已验范围和P02-03 A保留不重测，不进入P04/P05。

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

- 2026-10-17：D:/Tapkit-public，main / 3178a8b；保留既有未提交源码与记录，无本轮commit/push授权。当前P02-03智谱普通Chat/FlashX增量验收；其他渠道/协议与换其他模型继续暂缓。
- P02-02 A队列/B立即补充/C实际只读闭环的有限通过保留；C返回助手ID而非当前用户ID的强语义not_met保留。ADR0054历史背景角色隔离已工程通过，原失败会话未重新发请求，不冒称其复验完成。
- P02-03 A在实际C5会话01a14969-e3c4-77ee-b768-6fc59b1451d6的精确编辑/正确答复/来回分支切换有限通过。B同模型重生成与版本切换也有限通过：1run/1逻辑回合/tools0，NETWORK_ERROR后自动重试成功，2attempt分别estimated14335/actual1336；旧7消息hash/2分支/5账本保持，切换无重放。证据docs/evidence/P02-03/live-2026-10-17/${reviewName}。
- 当前同一会话新回答版本${fork.sourceBranchId}；下一C只点最终“编辑分支成功”助手答复下的“从此消息分叉会话”一次，确认独立副本含该路径，再回原会话/副本确认保留。不发送/重生成/AI命名，预期不产生模型/工具/结算。基线docs/evidence/P02-03/live-2026-10-17/fork-baseline-2026-10-17.json已准备，尚未C验收。
- 当前3分支/10消息/7账本的完整元数据与hash、分叉路径、全局计数已留基线；同case ${review.caseId}，无活动任务/队列/预留/未结算/重复。无需退出重启或重测A/B及既有P02-02范围。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。exec99040未核对退出，本轮不记exit0。详细历史见INDEX.md、P02-03.md及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
let acceptance = readFileSync(acceptancePath, 'utf8').replace(/^## 当前B/gm, '## 历史B');
const split = acceptance.indexOf('\n');
const current = `## 当前C：从消息分叉独立会话

A编辑与分支切换、B同模型重新生成与版本切换均已按实际C5场景有限通过，不重复；其他渠道/其他模型重答继续暂缓。重生成含一次NETWORK_ERROR自动重试，失败estimated14335与成功actual1336分开保留，不当重复重生成。证据${reviewName}。

1. 留在刚才新的“回答版本”，找到最终“编辑分支成功”助手答复，点击其下方“从此消息分叉会话”一次。
2. 应打开独立的新会话，标题带“ · 副本”，保留P02E-1017R问题和该回复。此处只复制，不发送内容。
3. 用顶部“后退”箭头回到原会话，确认原问题、回答和原分支/回答版本仍在；再用“前进”箭头回到副本确认内容保留。
4. 报告副本能否打开、原会话与副本是否正常。若异常先停，不重复点击。

本项不需要模型请求或工具调用。fork-baseline-2026-10-17.json固定原分支/message hash/账本及可见复制路径，后续核对新增独立session、来源映射、原件保留以及复制/导航零新增run/attempt/工具/结算。当前只准备C，尚未通过。

`;
writeFileSync(
  acceptancePath,
  acceptance.slice(0, split + 1) + '\n' + current + acceptance.slice(split + 1).replace(/^\s*/, ''),
);
const req = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  req,
  readFileSync(req, 'utf8')
    .split('\n')
    .map((line) => {
      if (!line.startsWith('FR-07-013,') && !line.startsWith('FR-07-015,')) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      if (cells[0] === 'FR-07-013') {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/' + reviewName;
        cells[7] +=
          ';2026-10-17原Chat/FlashX同模型重生成与旧新版本切换有限live通过；1run工具0含一次网络自动重试；失败estimated14335与成功actual1336分列；原消息hash/分支/旧账本保持且切换无重放；其他渠道暂缓与任务状态保持';
      } else {
        cells[5] +=
          ';docs/evidence/P02-03/live-2026-10-17/fork-baseline-2026-10-17.json;docs/evidence/P02-03/live-2026-10-17/acceptance.md';
        cells[7] +=
          ';2026-10-17仅准备从当前助手消息分叉独立会话的来源hash/原版本/旧账本及全局执行计数基线；只复制导航不发请求；尚未执行或验收；其他渠道暂缓';
      }
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'B_scoped_passed_C_fork_prepared',
    review: reviewName,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
