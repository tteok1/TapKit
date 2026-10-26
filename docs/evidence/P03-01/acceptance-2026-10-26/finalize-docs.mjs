import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const report = 'docs/evidence/P03-01/acceptance-2026-10-26/verification.md';
const checklist = 'docs/evidence/P03-01/acceptance-2026-10-26/manual-checklist.md';
const batches = {
  'P03-01': ['38/38', '81/81', '17/17', '文件导入/资料库/版本/取消重试/真实受限解析及重启验证完成；真实OS文件/文件夹选择及下载保存补验通过。跨窗口资源管理器拖入待M01。'],
  'P03-02': ['11/11', '15/15', '5/5', '6份真实Office转换与9页PDF/Word/PPT视觉核对完成；预览/历史版本/选区/批注/200%通过。首轮仅旧15秒连接前置失败，测试准备对齐既有125秒后补验5/5；失败日志保留。默认应用已启动且副本hash一致，正文渲染待M02。'],
  'P03-03': ['2/2', '14/14', '4/4', '项目资料/笔记/本地URL快照/标签文件夹/范围隔离/版本/复制归档导出/共享删除影响均有自动覆盖，无需重复人工操作。'],
  'P04-03': ['2/2', '16/16', '4/4', '合成记忆的来源/搜索/纠正/删除/撤销/两项独立偏好自动保存/开关作用域/临时排除/重启保持通过；清空仅在新合成profile。真实模型联调仍暂缓，保持implemented_not_live_verified。']
};
for (const [batch, [unit, integration, electron, detail]] of Object.entries(batches)) {
  const path = join(root, 'docs/progress', batch + '.md');
  const text = await readFile(path, 'utf8');
  const header = '## 2026-10-26 当前版本';
  const start = text.indexOf(header), end = text.indexOf('\n## ', start + header.length);
  if (start < 0 || end < 0) throw new Error('Missing checkpoint section: ' + batch);
  const section = `## 2026-10-26 当前版本自动验收完成\n\n当前codex/test-fixes-2026-10-26 / 9bfc156+working-tree；unit${unit}、integration${integration}、Electron${electron}最终通过，实际命令/退出码与分轮结果见 ${report}。${detail}\n\n110份本轮起始产品源码hash保持，历史顶层证据逐字节恢复；原人工profile/窗口未执行输入或删除，本轮无真实供应商请求。仅三份E2E测试的核心连接前置等待对齐现用预算，未放宽功能/隔离断言。剩余人工操作只见 ${checklist}；原暂缓范围及任务/gate状态保持，未commit/push。\n`;
  await writeFile(path, text.slice(0, start) + section + text.slice(end));
}
const currentPath = join(root, 'docs/progress/CURRENT.md');
await writeFile(join(evidence, 'progress-before-final.md'), await readFile(currentPath));
await writeFile(currentPath, `# 当前接续点\n\n- 2026-10-26；目录D:/Tapkit-public；分支codex/test-fixes-2026-10-26；HEAD 9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a；保留已有未提交改动，未commit/push。\n- 用户确认P01既定范围和P02 live-2026-10-19/batch-checklist全部人工通过；此前同意的供应商/协议/预算、本机非管理员、P04真实模型及延期能力保持暂缓。\n- 本次按用户授权完成四批自动测试：P03-01 38/81/17、P03-02 11/15/5、P03-03 2/14/4、P04-03 2/16/4（unit/integration/Electron），累计53/126/30最终通过。P03-02首轮仅15秒连接前置失败，三份测试准备对齐既有125秒后补验；失败日志保留。产品110源码hash未变，生产构建已恢复。\n- PDF/Word/PPT各3页已核看；真实Windows文件/文件夹选择、取消、递归导入、下载保存已补验；下载与外部副本hash一致。默认应用记事本已启动，正文读取授权超时，跨窗口拖入未执行。收尾辅助截图报窗口关闭，已用本轮只读落盘审计核实状态，不冒充截图成功。\n- 只待用户执行2项：资源管理器跨窗口拖入M01、默认应用正文显示M02。具体步骤/独立profile启动/样本/回报表见[人工清单](../evidence/P03-01/acceptance-2026-10-26/manual-checklist.md)。原profile不清空，不发真实模型请求。\n- 原T14反馈/收藏修复保留：点踩反馈与同评分取消；收藏入口在聊天页归档/回收站之间。当前原启动入口仍为docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1，绑定.test-data/current-ui-review.json；独立人工补测用本轮start-manual.ps1。\n- P03工程verified、P04工程通过/真实服务pending；尚未开展P05。任务/需求/gate不扩大验收状态。完整结果见[验证报告](../evidence/P03-01/acceptance-2026-10-26/verification.md)，此前CURRENT全文保存在同目录progress-before-final.md；历史索引保留在INDEX.md。\n`);
const indexPath = join(root, 'docs/progress/INDEX.md');
const index = await readFile(indexPath, 'utf8');
const indexEnd = index.indexOf('\n## ', 4);
if (!index.startsWith('## 2026-10-26 当前版本四批自动验收') || indexEnd < 0) throw new Error('Unexpected INDEX checkpoint');
await writeFile(indexPath, `## 2026-10-26 当前版本四批自动验收完成\n\n用户确认P01既定范围/P02人工清单通过。P03-01 38/81/17、P03-02 11/15/5、P03-03 2/14/4、P04-03 2/16/4（unit/integration/Electron）最终通过，共53/126/30；首轮连接前置失败及补验保留。9页预览视觉核对和Windows真实文件/文件夹/下载选择通过，源文件/下载/外部副本hash一致。仅人工M01跨窗口拖入、M02默认应用正文待回报，详见 ${checklist}。110产品源码hash保持，历史证据恢复；原profile/暂缓/live/gate保持，无真实请求或commit/push。完整命令/退出码见 ${report}。\n` + index.slice(indexEnd));
for (const [gate, detail] of [['P03-gate.md', '本轮P03-01/02/03自动回归全部通过及9页视觉核对完成。真实OS选择和保存已验；M01原生跨窗口拖入/M02默认应用正文待人工，未将其记为真人完成。保持既有P03工程verified；此前已验隔离证据不移植为本机非管理员新验收。'], ['P04-gate.md', '本轮P04-03 unit2/integration16/Electron4最终通过，全部模型数据为新隔离profile的合成adapter。来源/纠正/撤销/清空/开关/重启链路已覆盖，真实供应商提取效果仍暂缓；保持engineering_passed_external_pending及implemented_not_live_verified，不开始P05。']]) {
  const path = join(root, 'docs/progress', gate);
  const text = await readFile(path, 'utf8');
  await writeFile(path, text + `\n## 2026-10-26 当前版本回归补充\n\n${detail}证据 ${report}，实际命令/退出码及首轮失败均保留；产品源码与原profile保持，未commit/push。\n`);
}
const csvPath = join(root, 'docs/progress/requirements.csv');
const csv = await readFile(csvPath, 'utf8');
const updates = {};
const lines = csv.split(/\r?\n/).map(line => {
  if (!line) return line;
  const columns = line.split(',');
  const data = batches[columns[2]];
  if (!data) return line;
  if (columns.length !== 8) throw new Error('Unexpected CSV width: ' + columns[0]);
  const append = (i, value) => { if (!columns[i].split(';').includes(value)) columns[i] += ';' + value; };
  append(4, columns[2] + '.current-2026-10-26');
  append(5, report);
  append(6, 'current-2026-10-26:9bfc156+working-tree');
  columns[7] = columns[7].replace(';2026-10-26当前版本unit38/integration81/Electron17通过；原profile与原暂缓范围保持；原生OS入口待补', '');
  const note = `2026-10-26当前版本unit${data[0]}/integration${data[1]}/Electron${data[2]}最终通过；仅M01跨窗口拖入和M02默认应用正文待人工；真实服务及原暂缓状态保持`;
  append(7, note);
  updates[columns[2]] = (updates[columns[2]] ?? 0) + 1;
  return columns.join(',');
});
await writeFile(csvPath, lines.join('\r\n'));
console.log(JSON.stringify({ requirementRowsUpdated: updates, statusesUnchanged: true }));
