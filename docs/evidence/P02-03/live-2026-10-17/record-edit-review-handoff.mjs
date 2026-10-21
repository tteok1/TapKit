import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const reviewName = process.argv[2];
if (!/^edit-actual-session-review-\d+\.json$/.test(reviewName ?? ''))
  throw Error('Expected actual-session review');
const review = JSON.parse(readFileSync(join(dir, reviewName), 'utf8'));
const passed = review.status === 'passed_live_scoped_edit_and_branch_switch_actual_session';
if (
  Object.entries(review.checks).some(
    ([key, value]) => key !== 'switchedMainThenEditedBranch' && value !== true,
  )
)
  throw Error('Unresolved checks outside the pending switch');
const title = passed
  ? 'P02-03实际C5会话编辑与分支切换有限通过，准备重生成'
  : 'P02-03实际C5会话编辑答复通过，待切回编辑分支';
const marker = '## 2026-10-17 ' + title;
const evidence = `docs/evidence/P02-03/live-2026-10-17/${reviewName}`;
const outcome = passed
  ? '用户操作和收据均确认编辑完成后切回主分支，再回编辑分支，旧内容与新问答保留；无重放。A按实际会话有限通过。'
  : '已确认编辑完成后切回主分支；尚无再次切回新编辑分支的收据，当前活动仍为主分支，A闭环暂不整体通过。已请用户只切回新编辑分支确认，无需重复发送或重测已过内容。';
const next = passed
  ? '下一B仅在当前P02E-1017R编辑分支的“编辑分支成功”助手答复下点击“重新生成”一次，待完成后切旧编辑分支/新回答版本并保留两者；同账户同模型，正文相同正常，tools0预期。准备基线regenerate-baseline-2026-10-17.json，不自动代发。'
  : '下一只在刚才实际C5会话顶部选新“编辑分支”，确认P02E-1017R问题和“编辑分支成功”仍在；不重新保存/发送/重生成。收到后只读复核切换无新增run/attempt/工具，再记录A并准备B重生成。';
const section = `${marker}

本轮实际操作发生在会话01a14969-e3c4-77ee-b768-6fc59b1451d6（原C5准备会话），不是原失败会话01a1498f-dbb2-7fa8-8829-be6b985c7926。单次messages.edit收据对应新branch/run，精确P02E-1017R问题与“编辑分支成功”答复均通过SQL布尔核对；1回合/1attempt/HTTP200-text-stop/tools0，actual1336（input1332/output4），单次结算且同root。两个context快照属于同一logicalCall，均为chat-p04-2:source-data/1且含当前用户引用，不是两次请求。

实际C5原主分支5条消息（含此前NETWORK_ERROR的interrupted助手）ID/role/status/length保留，原英文问题与准备原文/最终ID与此前工具首结果精确比较通过，原4条账本各字段保持。没有为该备用会话预先采集全正文hash，不能声称此前正文逐字节hash全量不变；真人界面观察与这些比较支持有限保留验收。原失败会话6条消息hash/2分支/4旧账本仍保持且没有新请求，因此“原失败会话同输入复验”是not_performed，不能当已验证。${outcome}

全profile仅新增此1run/1attempt/0tools，无额外标题/重试/重复结算，任务/队列/记忆job/预留/未结算均0。未调用模型、未读Key/native正文、未导出聊天正文、未手写业务库，未改产品或重建/重启，未commit/push。原P02-02 A/B/C已验范围保留，其他渠道/协议仍暂缓；本轮不是所有会话上下文服从率、原工具不调用唯一因果或完整P02-03/gate通过。P02-03=implemented_not_live_verified、gate=engineering_passed_external_pending保持。

${next}

证据[实际会话核对](../evidence/P02-03/live-2026-10-17/${reviewName})，同目录edit-retest-review-1792239439169.json核对原计划会话无新请求。初始诊断计数误假定旧消息4条/快照1份，已按此前C5的5消息和同logicalCall多次装配更正，保留中间报告，不算产品失败。

`;
for (const name of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, name);
  const current = readFileSync(path, 'utf8');
  if (current.includes(marker)) throw Error('Checkpoint already recorded');
  const split = current.indexOf('\n');
  writeFileSync(
    path,
    current.startsWith('# ')
      ? current.slice(0, split + 1) + '\n' + section + current.slice(split + 1).replace(/^\s*/, '')
      : section + current,
  );
}
const currentPath = join(root, 'docs/progress/CURRENT.md');
const archive = join(dir, 'current-before-edit-review-2026-10-17.md');
if (!existsSync(archive)) writeFileSync(archive, readFileSync(currentPath), { flag: 'wx' });
writeFileSync(
  currentPath,
  `# 当前接续点

- 2026-10-17：D:/Tapkit-public，main / 3178a8b；保留既有未提交源码与记录，无本轮commit/push授权。当前P02-03智谱Chat/FlashX增量验收，其他渠道/协议继续暂缓。
- P02-02 A队列/B立即补充/C真实只读循环的有限通过保留，不重复测试；C返回助手ID而非当前用户ID的强语义not_met保留，不能称所有渠道或唯一根因已验证。
- ADR0054历史/记忆原文角色隔离已工程通过（integration49/unit11/check445/build/UI），生产版已打开原profile。当前case ${review.caseId}；没有本轮源码改动/重启/Agent模型请求，账户和偏好保持。
- 实际C5会话01a14969-e3c4-77ee-b768-6fc59b1451d6的编辑精确问题/正确答复通过，1run/1attempt/tools0/actual1336，原主分支5条元数据与问答语义、4旧账本保持；原失败会话无新请求，其6消息hash/2分支/旧账本保持，同会话错误复验not_performed。详见${evidence}。
- ${outcome}
- ${next}
- 无新增重复/未结算/预算预留。未读Key/native或导出正文，未写业务库。exec99040上次仍等退出，本轮不把它记exit0。详细历史见INDEX/P02-03和本目录current-before-edit-review-2026-10-17.md。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
const acceptanceText = readFileSync(acceptancePath, 'utf8');
const acceptance = passed ? acceptanceText.replace(/^## 当前A/gm, '## 历史A') : acceptanceText;
const split = acceptance.indexOf('\n');
const currentSection = passed
  ? `## 当前B：同模型重新生成与回答版本

A已按实际C5会话的编辑/来回分支切换有限通过。原失败会话未重发，不将其列为复验成功。证据${reviewName}；其他渠道暂缓。

1. 留在问题以“P02E-1017R”开头、答复为“编辑分支成功”的新编辑分支。
2. 点击该助手答复下方的“重新生成”一次。不要选“用其他模型重答”，不用再改问题或底部发送。
3. 完成后，顶部下拉应新增“回答版本”。切回刚才编辑分支，确认原答复保留，再切到新回答版本。
4. 报告新答复和版本切换情况；若出错先停，不重复点。问题要求固定文字，因此两个版本内容相同正常；tools0预期。

基线regenerate-baseline-2026-10-17.json将核对候选关系/旧消息hash/旧账本、新单次run与结算、切换无重放。当前仅准备，不算B通过。

`
  : `## 当前A：只补切回新编辑分支

已确认实际C5会话编辑为P02E-1017R后回复“编辑分支成功”，1run/1attempt/tools0/actual1336；原主分支与旧账本保持。现在收据只显示切回主分支，尚缺再切回新编辑分支。证据${reviewName}。

请只在刚才实际测试的会话顶部“消息分支 / 回答版本”选择新“编辑分支”，确认P02E-1017R提问和正确答复还在，然后报告结果。无需再次编辑/发送/重生成。此操作本身不应发起模型请求或执行旧工具。完成前不将A整体或B记通过。

原计划失败会话与本轮实际C5会话不同；前者6消息hash/2分支/旧账本保持且没有新增请求，原错误场景复验not_performed。以下旧操作步骤是历史记录，不再要求重复发送。

`;
writeFileSync(
  acceptancePath,
  acceptance.slice(0, split + 1) +
    '\n' +
    currentSection +
    acceptance.slice(split + 1).replace(/^\s*/, ''),
);
const requirementsPath = join(root, 'docs/progress/requirements.csv');
const csv = readFileSync(requirementsPath, 'utf8');
writeFileSync(
  requirementsPath,
  csv
    .split('\n')
    .map((line) => {
      if (passed && line.startsWith('FR-07-013,')) {
        const cells = line.replace(/\r$/, '').split(',');
        if (cells.length !== 8) throw Error('Unexpected regenerate requirement row');
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/regenerate-baseline-2026-10-17.json';
        cells[7] +=
          ';2026-10-17原Chat/FlashX的编辑与分支切换已有限通过；本项仅准备同模型重新生成一次与版本切换的hash/账本基线；尚未执行或验收；其他渠道暂缓';
        return cells.join(',');
      }
      if (!line.startsWith('FR-07-012,')) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      cells[5] += ';' + evidence;
      if (passed)
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/regenerate-baseline-2026-10-17.json';
      cells[7] +=
        ';2026-10-17实际C5会话精确编辑与正确答复已核对actual1336工具0且原主分支/账本保持；' +
        (passed
          ? '来回切分支有限通过；下一准备同模型重生成'
          : '已回主分支但待再回编辑分支；整体A待闭环') +
        '；原失败会话无新请求且未复验；任务/其他渠道状态保持';
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: passed ? 'A_scoped_passed_B_prepared' : 'A_edit_reply_verified_switch_back_pending',
    evidence,
    productChangesThisTurn: 0,
    agentModelRequests: 0,
  }),
);
