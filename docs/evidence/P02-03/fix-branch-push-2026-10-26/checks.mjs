import { spawnSync } from 'node:child_process';
import { openSync,closeSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence=fileURLToPath(new URL('.',import.meta.url)), root=resolve(evidence,'../../../..');
const plans=[
  ['check','pwsh.exe',['-NoProfile','-File',join(root,'scripts/pnpm.ps1'),'check']],
  ['docs-check','pwsh.exe',['-NoProfile','-File',join(root,'scripts/pnpm.ps1'),'docs:check']],
  ['diff-check','git',['diff','--check']],
  ['production-startup-check','pwsh.exe',['-NoProfile','-File',join(root,'docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1'),'-CheckOnly']],
];
const checks=[];
for(const [name,exe,args]of plans){
  console.log('Running '+name);
  const started=new Date().toISOString(), log=name+'.log', fd=openSync(join(evidence,log),'w');
  let result;
  try{result=spawnSync(exe,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd],timeout:300000});}finally{closeSync(fd);}
  checks.push({name,command:[exe,...args],started,finished:new Date().toISOString(),exitCode:result.status,error:result.error?.message,log});
  await writeFile(join(evidence,'checks.json'),JSON.stringify(checks,null,2)+'\n');
  console.log(name+': exit '+result.status);
}
if(checks.some(c=>c.exitCode!==0))process.exitCode=1;
