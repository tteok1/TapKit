import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'../../..');
const target=join(root,'docs/evidence/P05-03',process.argv[2]??'');
if(!target.startsWith(join(root,'docs/evidence/P05-03')+'\\'))throw Error('Expected evidence run directory');
const list=spawnSync('git',['diff','--name-only','-z','--','docs/evidence/UI-redesign'],{cwd:root}).stdout.toString().split('\0').filter(Boolean);
const receipt=[];
for(const path of list){
  if(!path.startsWith('docs/evidence/UI-redesign/')||!path.endsWith('.png'))throw Error('Unexpected evidence path');
  const original=spawnSync('git',['show','HEAD:'+path],{cwd:root,maxBuffer:20*1024**2});if(original.status!==0)throw Error('Missing baseline');
  const current=readFileSync(join(root,path)), kept=join(target,'historical-current',path);mkdirSync(dirname(kept),{recursive:true});writeFileSync(kept,current);writeFileSync(join(root,path),original.stdout);
  receipt.push({path,restoredSha256:createHash('sha256').update(original.stdout).digest('hex'),retainedSha256:createHash('sha256').update(current).digest('hex')});
}
writeFileSync(join(target,'ui-evidence-restored.json'),JSON.stringify(receipt,null,2));
