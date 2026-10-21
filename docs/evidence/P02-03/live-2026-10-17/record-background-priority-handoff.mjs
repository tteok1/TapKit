import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const save = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n');
const observation = read('edit-observation-2026-10-17.json');
observation.status = 'not_accepted_wrong_answer_branch_creation_and_old_data_preserved';
observation.finding =
  'Latest edited input is exact and branch exists; source refs include it. Recalled5 old user instructions include2 no-tool phrases. Source text was promoted into system by assembly. This is a confirmed role-boundary defect; sole causal attribution awaits repaired live comparison.';
save('edit-observation-2026-10-17.json', observation);
const retest = read('edit-retest-baseline-2026-10-17.json');
Object.assign(retest, {
  status: 'waiting_user_one_edit_retest_fixed_app_open',
  caseId: '01a149b9-04f4-7d9c-9487-44b0b62e3b25',
  readiness: 'docs/evidence/P02-02/live-2026-10-15/tool-trace-review-1792238242810.json',
  baselineSnapshot: 'docs/evidence/P02-02/live-2026-10-15/snapshot-1792238242914.json',
  startedAfter: 1792238242914,
  expectedPromptVersion: 'chat-p04-2:source-data/1',
  launchExecSession: 99040,
  launchStatus: 'running_waiting_app_exit',
  launchExitCode: null,
});
save('edit-retest-baseline-2026-10-17.json', retest);
const fix = read('background-priority-fix-2026-10-17.json');
fix.finalVerification = {
  docsCheck: { exitCode: 0, tasks: 37 },
  gitDiffCheck: { exitCode: 0 },
  checkOnly: 'docs/evidence/P02-02/live-2026-10-15/check-1792238208220.json',
  launchPreflight: 'docs/evidence/P02-02/live-2026-10-15/check-1792238224248.json',
  traceReadiness: retest.readiness,
  postLaunchSnapshot: retest.baselineSnapshot,
  pendingUserRetest: 'edit-retest-baseline-2026-10-17.json',
};
save('background-priority-fix-2026-10-17.json', fix);
const section = `## 2026-10-17 编辑答复错误定位，历史数据角色隔离工程通过，待复验

首次A编辑新问题完全匹配、产生新branch/run，旧主分支4条消息和旧账本2576保持；新run completed/1回合/tools0/actual1259，但正文是“未执行工具”，不验收。当前问题本不需要工具，不能将该正文当程序状态提示或据tools0认定故障。公开引用确认自动召回5条旧用户指令，2条含该旧诊断短语；源码把history.background/memory.background原文拼进system。这是明确装配缺陷，与症状吻合；不以元数据声称模型选择的唯一因果已证明。

按ADR0054将两类源原文移到本轮消息之前的JSON user背景，可信产品/项目/个人指令保留；来源/授权/计数与pinned压缩沿用，当前显式用户原文最后，快照prompt_version附source-data/1。没有关闭历史/记忆或修改真实业务库、工具策略/预算/重试/账户/IPC/DB/native版本。三项先红后绿，相关integration49/unit11/check445文件/build:desktop均退出0；包括旧分支/标题原root、上下文、记忆和工具闭环回归。合成传输探针证明角色缺陷修复，不替代真人模型服从率。生产UI原账户1/编辑分支2条消息读取正常，9源码/619产物固定；用户确认退出后精确残留进程被停止，旧启动器exit1保留，不记正常退出。

修复版已打开原profile，新case 01a149b9-04f4-7d9c-9487-44b0b62e3b25的opened/attempts0已核对，无新增run/工具/预留。Agent模型请求/Key或native正文读取/正文导出/业务库手写0，未commit/push。下一仅用户在原主分支再编辑原英文问题为“P02E-1017R：请只回复‘编辑分支成功’。”保存一次，完成后切主/新编辑分支检查保留；不用工具，tools0正常，仍答错就停。现2分支/6消息/4旧账本actual3835基线均保留，用hash核对旧正文与账本。P02-03=implemented_not_live_verified、gate保持engineering_passed_external_pending，既有P02-02 A/B/C有限通过不重测，其他渠道暂缓。

证据[错误观察](../evidence/P02-03/live-2026-10-17/edit-observation-2026-10-17.json)、[工程修复](../evidence/P02-03/live-2026-10-17/background-priority-fix-2026-10-17.json)、同目录edit-retest-baseline-2026-10-17.json及acceptance.md。启动exec99040仍等待正常退出，不记exit0。

`;
for (const path of ['docs/progress/INDEX.md', 'docs/progress/P02-03.md']) {
  const file = join(root, path),
    body = readFileSync(file, 'utf8');
  if (body.includes('## 2026-10-17 编辑答复错误定位')) throw Error('Already recorded');
  const pos = path.endsWith('INDEX.md') ? 0 : body.indexOf('\n## ') + 1;
  writeFileSync(file, body.slice(0, pos) + section + body.slice(pos));
}
const currentFile = join(root, 'docs/progress/CURRENT.md');
let current = readFileSync(currentFile, 'utf8');
current = current.replace(
  '仅P02-02智谱普通Chat/FlashX增量补验',
  '当前P02-03消息编辑补验及共享上下文修复，沿用智谱普通Chat/FlashX',
);
current = current.replace(
  /^- 下一P02-03 A已只读准备.*$/m,
  '- P02-03首次编辑未通过：新branch/精确提问已保存，旧内容/账本保持，但答“未执行工具”(actual1259)。自动历史召回5旧用户指令(2含该短语)，源码原文被拼入system。ADR0054已改为当前消息之前的user背景，来源/预算/权限保留；3先红后绿，integration49/unit11/check445/build/UI退出0，9源码/619产物绑定。见docs/evidence/P02-03/live-2026-10-17/background-priority-fix-2026-10-17.json。\n- 修复版已打开原profile，case 01a149b9-04f4-7d9c-9487-44b0b62e3b25 opened/attempts0。下一仅按P02-03 acceptance.md当前A复验：选原主分支，编辑英文提问为“P02E-1017R：请只回复‘编辑分支成功’。”保存一次，再切主/新编辑分支；tools0正常。2分支/6消息/旧actual3835基线见edit-retest-baseline-2026-10-17.json，尚未live通过。Agent模型请求/Key/native读取/正文导出0，exec99040仍待退出。',
);
current = current.replace('P02-03/P04补验及P05未开展', 'P02-03正在补验，P04真实补验及P05未开展');
writeFileSync(currentFile, current);
const csv = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  csv,
  readFileSync(csv, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith('FR-07-012,')) return line;
      const fields = line.split(',');
      if (fields.length !== 8) throw Error('CSV mismatch');
      fields[5] +=
        ';docs/evidence/P02-03/live-2026-10-17/edit-observation-2026-10-17.json;docs/evidence/P02-03/live-2026-10-17/background-priority-fix-2026-10-17.json;docs/evidence/P02-03/live-2026-10-17/edit-retest-baseline-2026-10-17.json';
      fields[7] +=
        ';2026-10-17编辑与旧分支保留已核对但模型误答未执行工具不验收；ADR0054修复旧历史原文提升为system的角色缺陷；integration49/unit11/check/build/UI通过；新生产版待一次用户复验；原状态及其他渠道暂缓保持';
      return fields.join(',');
    })
    .join('\n'),
);
console.log('Observed failure, verified repair and pending single live retest synchronized.');
