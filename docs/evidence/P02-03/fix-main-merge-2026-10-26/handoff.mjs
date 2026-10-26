import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence=fileURLToPath(new URL('.',import.meta.url)),root=resolve(evidence,'../../../..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const source='0604099a2110cb65b7d71c394644c31283e06c0a';
if(git('branch','--show-current')!=='main'||git('rev-parse','HEAD')!==source||git('rev-parse','HEAD^{tree}')!=='7996c7802370553fd5c449b76d0dafbe8a7c02d3')throw new Error('Unexpected merged state');
const record='docs/evidence/P02-03/fix-main-merge-2026-10-26/verification.md';
const summary='2026-10-26用户报告CI已通过并明确允许合入main；连接器核实0604099的CI59/40328437523及check/startup-diagnostics均success。main已从9bfc156快进至0604099，完整合入树与已验源树一致；随后仅本次交接文档更新，fix分支保留，原profile/live/gate及暂缓范围保持。本次main交接提交包含本记录，最终推送SHA以Git回执为准';
await writeFile(join(root,'docs/progress/CURRENT.md'),`# 当前接续点\n\n- 2026-10-26；目录D:/Tapkit-public；当前main。用户已授权合入并推送；main从9bfc156快进至已验fix提交0604099a2110cb65b7d71c394644c31283e06c0a。fix分支codex/test-fixes-2026-10-26保留。\n- 已通过GitHub连接器核实[CI59](https://github.com/tteok1/TapKit/actions/runs/40328437523)：head=0604099，check/startup-diagnostics均completed/success，含独立标准用户/Office及启动诊断步骤。\n- 合入时完整Git树7996c7802370553fd5c449b76d0dafbe8a7c02d3与已验fix完全一致；后续只补本次交接文档。最终main SHA与远端一致性以Git及.test-data/fix-main-merge-2026-10-26/receipt.json为准。\n- T14点踩反馈/同评分取消/聊天收藏入口随本次合入。当前版本53项unit、126项integration、30项Electron最终通过及9页预览视觉核对沿用；原始失败与补验完整保留。\n- 用户确认P01既定范围、P02原清单及M01跨窗口拖入/M02默认应用正文均通过，本轮无剩余人工待测项。两项用户回执见docs/evidence/P03-01/acceptance-2026-10-26/manual-acceptance.json。\n- P03工程verified，P04工程通过/真实服务pending；供应商/协议/预算、本机非管理员、P04真实模型及延期能力保持暂缓。未改变任务/gate状态，不由本次CI扩大真人验收。\n- 原profile/已开窗口/当前生产构建保持，不重启、不发真实模型请求。原启动入口docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1及.test-data/current-ui-review.json继续可用。\n- 本轮仅合入与交接，未开展P05。后续按用户指示从P05-01推进；R06 Tavily仍pending。合入证据 ${record}；main推送将触发新CI，该轮未提前记通过。\n`);
for(const [file,heading]of [['INDEX.md','## 2026-10-26 fix分支CI通过并合入main'],['P02-03.md','## 2026-10-26 fix分支main交接']]){
  const path=join(root,'docs/progress',file),text=await readFile(path,'utf8');
  const section=heading+'\n\n'+summary+'。证据 '+record+'；不开展P05，不创建PR。\n\n';
  await writeFile(path,file==='INDEX.md'?section+text:text.replace('# P02-03 会话组织、消息分支与全局搜索\n','# P02-03 会话组织、消息分支与全局搜索\n\n'+section.trimEnd()+'\n'));
}
const csvPath=join(root,'docs/progress/requirements.csv'),rows=(await readFile(csvPath,'utf8')).split(/\r?\n/);
let changed=0;
for(let i=1;i<rows.length;i++){
  const c=rows[i].split(',');
  if(!['P03-01','P03-02','P03-03','P04-03'].includes(c[2])&&!['FR-07-018','FR-07-020'].includes(c[0]))continue;
  if(c.length!==8)throw new Error('Unexpected CSV width');
  if(!c[5].split(';').includes(record))c[5]+=';'+record;
  if(!c[6].split(';').includes('main:fast-forward(0604099)'))c[6]+=';main:fast-forward(0604099)';
  if(!c[7].includes(summary))c[7]+=';'+summary;
  rows[i]=c.join(',');changed++;
}
await writeFile(csvPath,rows.join('\r\n'));
console.log(JSON.stringify({mergedSource:source,originalTreeMatched:true,requirementRowsUpdated:changed,statusesUnchanged:true,productUnchanged:true}));
