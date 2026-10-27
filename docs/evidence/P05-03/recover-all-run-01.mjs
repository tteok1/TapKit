import { readdirSync,lstatSync,readFileSync,mkdirSync,copyFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { resolve,join,relative,dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd(), backup=resolve('.test-data/P05-03-evidence-all-run-01'), output=resolve('docs/evidence/P05-03/all-run-01');
function walk(path){const info=lstatSync(path);if(info.isSymbolicLink())throw Error('Reparse point');return info.isDirectory()?readdirSync(path).flatMap((name)=>walk(join(path,name))):[path];}
const hash=(path)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const original=new Map(walk(backup).map((path)=>[relative(backup,path),hash(path)])), restored=[];
const historical=readdirSync(join(root,'docs/evidence')).filter((name)=>/^P0[0-4]-/.test(name)).flatMap((name)=>walk(join(root,'docs/evidence',name)));
for(const path of historical){const name=relative(root,path), prior=original.get(name);if(prior===hash(path))continue;
  const target=join(output,'historical-current',name);mkdirSync(dirname(target),{recursive:true});copyFileSync(path,target);
  if(prior)copyFileSync(join(backup,name),path);else{if(!resolve(path).startsWith(join(root,'docs/evidence')+'\\'))throw Error('Unsafe recovery');unlinkSync(path);}
  restored.push({path:name,originalSha256:prior??null});
}
for(const [name,sha] of original){const path=join(root,name);try{if(hash(path)===sha)continue;}catch{}mkdirSync(dirname(path),{recursive:true});copyFileSync(join(backup,name),path);}
const sources=JSON.parse(readFileSync(join(output,'sources.json'),'utf8')).files;
const unchanged=Object.entries(sources).every(([name,sha])=>hash(join(root,name))===sha);
writeFileSync(join(output,'results-recovered.json'),JSON.stringify({recoveredAt:new Date().toISOString(),exitCode:1,sourcesUnchanged:unchanged,commands:[{args:['check'],exitCode:0},{args:['build'],exitCode:0},{args:['test:unit'],exitCode:0,passed:370},{args:['test:integration'],exitCode:3221226505,complete:false}],reason:'D drive ENOSPC; Vitest crashed, then evidence retention failed. This batch is not accepted.',historicalEvidenceRestored:restored,originalEvidenceFiles:original.size},null,2));
console.log(JSON.stringify({sourcesUnchanged:unchanged,restored:restored.length,originalEvidenceFiles:original.size}));
