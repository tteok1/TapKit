import { readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const meta = JSON.parse(readFileSync('docs/evidence/P02-02/live-2026-10-15/tool-trace-current.json', 'utf8'));
const rows = existsSync(meta.tracePath) ? readFileSync(meta.tracePath,'utf8').trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s)) : [];
const ipcPath = join(meta.dataDir,'logs/ipc.jsonl');
const ipc = existsSync(ipcPath) ? readFileSync(ipcPath,'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-12).map((s) => JSON.parse(s)) : [];
const result = {
  checkedAt:new Date().toISOString(),localDate:'2026-10-20',launcherSession:62166,
  launcherStatus:'running_exit_not_observed',exitCode:null,caseId:meta.caseId,profileId:meta.profileId,
  coreOpenedReceipt:rows.some((r)=>r.kind==='opened'),attemptRows:rows.filter((r)=>r.kind==='attempt').length,
  openedAfterMs:existsSync(meta.tracePath) ? Math.round(statSync(meta.tracePath).birthtimeMs-Date.parse(meta.preparedAt)) : null,
  publicIpcUpdatedAfterLaunch:existsSync(ipcPath) && statSync(ipcPath).mtimeMs > Date.parse(meta.preparedAt),
  replies:ipc.map((r)=>({command:r.command,ok:r.ok,...(r.code?{code:r.code}:{})})),
  modelRequestsByAgent:0,
};
if (!result.coreOpenedReceipt || !result.publicIpcUpdatedAfterLaunch || !ipc.length || result.replies.some((r)=>r.ok!==true) || result.attemptRows!==0) throw Error('Original profile readiness not confirmed; no success record written');
writeFileSync('docs/evidence/P02-03/selection-result-2026-10-20/normal-reopen.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
