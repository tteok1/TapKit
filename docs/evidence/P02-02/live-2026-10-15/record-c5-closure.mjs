import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const report = 'docs/evidence/P02-02/live-2026-10-15/round-c5-acceptance-2026-10-17.json';
const next = 'docs/evidence/P02-03/live-2026-10-17/edit-baseline-2026-10-17.json';
const section = `## 2026-10-17 P02-02只读闭环有限通过，准备P02-03消息编辑

用户截图正常后，脱敏trace/公开DB确认C完整提议→canonical history.search→固定query/limit1/精确原新会话scope→succeeded/side_effect none→callId配对结果→下一模型终答，旧账本不变，无重复/未结算/预留。两个独立run/不同clientMessageId分别工具1次，不冒充自动重复发送。原准备会话的run有一次NETWORK_ERROR重试（actual2103含标题213，另estimated12358非实际消耗）；截图另会话run是2前台回合+1自动标题，actual2364+212=2576，三次attempt不是三次前台或重复工具。标题及原root归属保持。

返回ID与真实工具首结果一致，但它是包含marker的助手提议消息ID，非初始推测的用户消息ID。现有history.search检索final user/assistant且最新优先，因此最初对“唯一marker一定命中用户”的预期不成立；保留原预期并明确强当前用户ID语义not_met，不将它标为通过。原P02-02 C需求是实际只读循环和结果终答，此范围passed_live_scoped_readonly_loop；不降低工具/权限/结算验收标准。准备时旧关键词0匹配、记忆0，运行后history-use行存在，加上新会话/英文/查询多变量，先前无调用唯一诱因仍未确定，不称全场景修复或所有渠道可用。

本轮A/B/C有限补验已分别记录，P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；其他渠道/协议/订阅继续暂缓。无本轮产品修改/重启/检测/Agent模型请求/Key或native正文读取/正文导出/业务库手写，未commit/push。证据[本轮验收](../evidence/P02-02/live-2026-10-15/round-c5-acceptance-2026-10-17.json)、同目录round-c5-review-2026-10-17.json及用户截图。

下一P02-03仅准备A消息编辑→新分支→切回原分支→回到编辑分支。沿用截图会话01a1498f-dbb2-7fa8-8829-be6b985c7926，基线1分支/4消息/旧3条actual共2576，原用户消息01a1498f-e8eb-7693-abc8-9dccfb56fdbf；不重跑工具或改其他渠道。用户编辑已发送英文提问为“P02E-1017：请只回复‘编辑分支成功’。”并保存一次，完成后切主/编辑分支核对旧内容与新内容，Agent再检查原版本/账本保持及切换不重放。仅准备未通过，具体以docs/evidence/P02-03/live-2026-10-17/acceptance.md及edit-baseline-2026-10-17.json为准，后续重生成/搜索/组织等逐项给步骤，不扩P04/P05。

`;
for (const path of [
  'docs/progress/INDEX.md',
  'docs/progress/P02-02.md',
  'docs/progress/P02-03.md',
]) {
  const file = join(root, path),
    body = readFileSync(file, 'utf8');
  if (body.includes('## 2026-10-17 P02-02只读闭环有限通过')) throw Error('Already recorded');
  const pos = path.endsWith('INDEX.md') ? 0 : body.indexOf('\n## ') + 1;
  if (pos < 0) throw Error('No section');
  writeFileSync(file, body.slice(0, pos) + section + body.slice(pos));
}
const current = join(root, 'docs/progress/CURRENT.md');
writeFileSync(
  current,
  readFileSync(current, 'utf8').replace(
    /^- 当前C5已就绪.*$/m,
    '- C只读闭环已有限通过：标准提议/精确scope网关成功/side_effect none/配对结果/终答/单次结算均核对；截图2前台回合+1标题共2576 actual，工具1次。返回ID属于匹配到的助手消息，非用户ID，强语义预期not_met；先前不调用的唯一诱因仍未确定。证据同目录round-c5-acceptance-2026-10-17.json；A/B/C不重测。\n- 下一P02-03 A已只读准备：截图会话01a1498f-dbb2-7fa8-8829-be6b985c7926，1分支/4消息/旧actual2576。用户仅编辑已发送英文提问为“P02E-1017：请只回复‘编辑分支成功’。”保存一次，切主/编辑分支核对保留；见docs/evidence/P02-03/live-2026-10-17/acceptance.md及edit-baseline-2026-10-17.json。尚未发送或通过；Agent模型请求/凭据及native读取/正文导出0。',
  ),
);
const csv = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  csv,
  readFileSync(csv, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (!/^(FR-06-017|FR-07-006|FR-07-007|FR-07-012),/.test(line)) return line;
      const fields = line.split(',');
      if (fields.length !== 8) throw Error('CSV mismatch');
      if (fields[0] === 'FR-07-012') {
        fields[5] += ';' + next + ';docs/evidence/P02-03/live-2026-10-17/acceptance.md';
        fields[7] +=
          ';2026-10-17原Chat/FlashX的P02-02有限补验收口；本需求仅准备一次历史问题编辑与分支保留live基线；未发送未验收且其他渠道暂缓';
      } else {
        fields[5] += ';' + report;
        fields[7] +=
          ';2026-10-17C真实history.search完整闭环有限通过；截图2前台回合加标题实际2576且工具一次；答案匹配工具首结果但ID为助手消息非用户；强语义预期未达不冒充通过；其他渠道与任务阶段状态保持';
      }
      return fields.join(',');
    })
    .join('\n'),
);
for (const path of ['docs/progress/RESOURCES.md', 'docs/progress/P02-gate.md']) {
  const file = join(root, path),
    body = readFileSync(file, 'utf8'),
    pos = body.indexOf('\n') + 1;
  const note =
    '\n2026-10-17 R13/P02-02限定智谱普通Chat/FlashX的A/B/C增量补验已分别记录，C实际只读网关/配对终答/结算闭环通过；强当前用户ID语义未达、旧无调用唯一诱因未定，其他渠道/协议继续暂缓，不提升全任务或gate。证据' +
    report +
    '。接续P02-03仅准备消息编辑/分支保留，尚未live通过。\n';
  writeFileSync(file, body.slice(0, pos) + note + body.slice(pos));
}
writeFileSync(
  join(dir, 'live-scope-summary-2026-10-17.json'),
  JSON.stringify(
    {
      task: 'P02-02',
      localDate: '2026-10-17',
      status: 'requested_zhipu_incremental_scope_recorded',
      A: 'round-a-acceptance-2026-10-16.json',
      B: 'round-b-acceptance-2026-10-16.json',
      C: 'round-c5-acceptance-2026-10-17.json',
      allProviderTaskStatus: 'implemented_not_live_verified',
      stageStatus: 'engineering_passed_external_pending',
      nextTask: 'P02-03',
      nextBaseline: next,
      agentModelRequests: 0,
    },
    null,
    2,
  ) + '\n',
);
console.log('P02-02 scoped acceptance and P02-03 edit preparation synchronized.');
