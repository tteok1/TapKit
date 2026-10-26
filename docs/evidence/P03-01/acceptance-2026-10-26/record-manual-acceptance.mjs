import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const evidencePath = 'docs/evidence/P03-01/acceptance-2026-10-26/manual-acceptance.json';
const statement = '你交给我做的两项测试均已测试通过，都符合预期。下一步的计划是什么？';
const acceptance = {
  date: '2026-10-26', timezone: 'Asia/Shanghai',
  evidenceType: 'direct_user_report', userStatement: statement,
  items: [
    { id: 'M01', scope: 'Windows资源管理器跨窗口拖入合成文件', result: 'passed_user_acceptance' },
    { id: 'M02', scope: '系统默认应用实际显示合成正文', result: 'passed_user_acceptance' },
  ],
  independentlyReexecutedByAgent: false,
  pendingItemsInCurrentChecklist: [],
  automaticTestResultsUnchanged: { unit: 53, integration: 126, electron: 30 },
  deferredScopesUnchanged: true, realModelAcceptancePromoted: false,
  currentBranch: 'codex/test-fixes-2026-10-26', head: '9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a',
  commitOrPushPerformed: false,
};
await writeFile(join(evidence, 'manual-acceptance.json'), JSON.stringify(acceptance, null, 2) + '\n');
const checklistPath = join(evidence, 'manual-checklist.md');
let checklist = await readFile(checklistPath, 'utf8');
checklist = checklist.replace('# 剩余人工执行清单（2项）', '# 人工执行清单（2项均已通过）');
checklist = checklist.replace('这里只列本轮Agent尚未完成的两个Windows交互，预计5分钟。', '两项已于2026-10-26由用户确认全部通过、符合预期，无剩余人工待测项。以下保留原操作步骤供追溯；通过依据见[用户验收回执](manual-acceptance.json)，不冒充Agent独立重跑。');
checklist = checklist.replaceAll('- [ ] 待人工执行', '- [x] 2026-10-26 用户确认通过，符合预期');
checklist = checklist.replace('| M01 | 待测 | |', '| M01 | 通过（用户确认） | 符合预期 |').replace('| M02 | 待测 | |', '| M02 | 通过（用户确认） | 符合预期 |');
await writeFile(checklistPath, checklist);

const finalPath = join(evidence, 'final-outcome.json');
await copyFile(finalPath, join(evidence, 'final-outcome-before-manual.json'));
const final = JSON.parse(await readFile(finalPath, 'utf8'));
final.manualPending = [];
final.manualAcceptance = { evidence: 'manual-acceptance.json', source: 'direct_user_report', items: acceptance.items };
final.acceptedCurrentScope = 'automatic checks and two manual items completed; previously agreed deferrals remain';
await writeFile(finalPath, JSON.stringify(final, null, 2) + '\n');

const reportPath = join(evidence, 'verification.md');
let report = await readFile(reportPath, 'utf8');
report = report.replace('仅余[人工清单](manual-checklist.md)M01跨窗口拖入、M02默认应用正文显示。', 'M01跨窗口拖入、M02默认应用正文显示已由用户直接确认通过；[人工清单](manual-checklist.md)没有剩余待测项。');
report = report.replace('等待用户M01/M02回报，既有暂缓资源不重新要求验收。', '用户已回报M01/M02均通过，既有暂缓资源不重新要求验收。');
report += '\n## 2026-10-26 用户补测通过与下一步\n\n用户直接确认M01/M02均通过、符合预期；原Agent补测时的工具限制和失败回执作为历史保留，当前人工缺口由用户回执关闭，见manual-acceptance.json。没有再次启动应用、重跑模型或修改产品。本轮既定验收范围完成，P04真实模型及原其他暂缓范围保持，正式任务/gate状态不扩大。\n\n建议先交付当前修复分支：整理提交、推送并核对CI，再合入main；这些Git动作仅为计划，本轮未执行。之后按时间线从P05-01联网搜索/匿名网页读取/来源归档开始，随后P05-02引用/本地导出分享，最后P05-03聊天M1端到端验收。R06 Tavily当前pending；可先开发URL读取和无key明确提示，缺key时不宣称真实搜索通过。P05尚未开始。\n';
await writeFile(reportPath, report);

const currentPath = join(root, 'docs/progress/CURRENT.md');
let current = await readFile(currentPath, 'utf8');
current = current.replace('- 只待用户执行2项：资源管理器跨窗口拖入M01、默认应用正文显示M02。具体步骤/独立profile启动/样本/回报表见[人工清单](../evidence/P03-01/acceptance-2026-10-26/manual-checklist.md)。原profile不清空，不发真实模型请求。', '- 2026-10-26用户直接确认M01资源管理器跨窗口拖入、M02默认应用正文显示均通过、符合预期。本轮清单无剩余人工待测项；[用户回执](../evidence/P03-01/acceptance-2026-10-26/manual-acceptance.json)。未代替用户重跑，不提升P04真实模型或原暂缓范围。');
current += '- 下一步建议：先交付当前修复分支（提交/推送/CI/合入main），再从P05-01联网搜索、匿名网页读取与来源归档推进；后续P05-02引用/本地分享导出、P05-03聊天M1。R06 Tavily仍pending，URL读取可先做；本轮只记验收和计划，未执行Git发布或开展P05。\n';
await writeFile(currentPath, current);

const indexPath = join(root, 'docs/progress/INDEX.md');
let index = await readFile(indexPath, 'utf8');
index = index.replace('仅人工M01跨窗口拖入、M02默认应用正文待回报，详见', 'M01跨窗口拖入、M02默认应用正文于2026-10-26由用户确认均通过，本轮无剩余人工项，详见');
index = '## 2026-10-26 两项人工补测通过\n\n用户直接确认M01/M02均通过、符合预期；四批209项自动测试结果保持，清单无剩余待测项。回执 ' + evidencePath + '。只同步记录，原失败轮和暂缓范围保持，P04真实模型/gate不提升。当前分支尚未提交/推送；建议先交付该修复分支，再按P05-01→P05-02→P05-03推进聊天M1。R06 Tavily仍pending；本轮未执行发布或开始P05。\n\n' + index;
await writeFile(indexPath, index);

for (const task of ['P03-01', 'P03-02', 'P03-03', 'P04-03']) {
  const path = join(root, 'docs/progress', task + '.md');
  let text = await readFile(path, 'utf8');
  text = text.replace('跨窗口资源管理器拖入待M01。', '跨窗口资源管理器拖入M01已由用户确认通过。');
  text = text.replace('正文渲染待M02。', '正文渲染M02已由用户确认通过。');
  text = text.replace('剩余人工操作只见 docs/evidence/P03-01/acceptance-2026-10-26/manual-checklist.md；', '两项人工补测M01/M02已于2026-10-26由用户直接确认通过；回执 ' + evidencePath + '；本轮清单无剩余人工项；');
  await writeFile(path, text);
}
const gatePath = join(root, 'docs/progress/P03-gate.md');
let gate = await readFile(gatePath, 'utf8');
gate = gate.replace('M01原生跨窗口拖入/M02默认应用正文待人工，未将其记为真人完成。', 'M01原生跨窗口拖入/M02默认应用正文已于2026-10-26由用户直接确认均通过；本轮人工清单已闭合，依据 ' + evidencePath + '。');
await writeFile(gatePath, gate);
const memoryGatePath = join(root, 'docs/progress/P04-gate.md');
let memoryGate = await readFile(memoryGatePath, 'utf8');
memoryGate += '\n2026-10-26用户确认本轮M01/M02文件交互补测均通过，本轮人工清单已完成；这两项不验证P04真实供应商提取，原engineering_passed_external_pending保持。回执 ' + evidencePath + '。下一阶段只列计划，尚未开展P05。\n';
await writeFile(memoryGatePath, memoryGate);

const csvPath = join(root, 'docs/progress/requirements.csv');
const rows = (await readFile(csvPath, 'utf8')).split(/\r?\n/);
let changed = 0;
const tasks = new Set(['P03-01', 'P03-02', 'P03-03', 'P04-03']);
for (let i = 1; i < rows.length; i++) {
  const columns = rows[i].split(',');
  if (!tasks.has(columns[2])) continue;
  if (columns.length !== 8) throw new Error('Unexpected requirement columns');
  if (!columns[5].split(';').includes(evidencePath)) columns[5] += ';' + evidencePath;
  columns[7] = columns[7].replace('仅M01跨窗口拖入和M02默认应用正文待人工', 'M01跨窗口拖入和M02默认应用正文已由用户确认通过');
  rows[i] = columns.join(','); changed++;
}
await writeFile(csvPath, rows.join('\r\n'));
console.log(JSON.stringify({ userAccepted: ['M01','M02'], currentChecklistPending: 0, requirementRowsUpdated: changed, statusesUnchanged: true, gitPublishingPerformed: false }));
