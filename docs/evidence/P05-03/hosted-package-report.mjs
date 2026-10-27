import {readFileSync,writeFileSync,lstatSync,copyFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../../..'),latest=JSON.parse(readFileSync(join(root,'release/latest.json'),'utf8'));
if(latest.nativeProbeExitCode!==0)throw Error('Only a successfully probed package can be recorded');
const directory=resolve(root,latest.directory), evidence=join(root,'docs/evidence/P05-03/hosted-package');
if(!directory.startsWith(join(root,'release')+'\\'))throw Error('Package escaped release');
mkdirSync(evidence,{recursive:true});
const manifestBytes=readFileSync(join(directory,'snapshot-manifest.json')),manifest=JSON.parse(manifestBytes);
const hash=(path)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const probe=JSON.parse(readFileSync(join(directory,'resources/runtime/capabilities.json'),'utf8'));
if(probe.exitCode!==0||probe.missingCases.length||probe.tests.passed!==22||probe.tests.failed!==0)throw Error('Native acceptance incomplete');
const critical=['apps/desktop/out/main/index.js','packages/core/dist/index.cjs','packages/contracts/src/models.ts','packages/tools/src/execution/index.ts','vitest.source.config.ts','Start-TapKit.cmd'];
const checked=critical.map(path=>{
 const item=manifest.files.find(x=>x.path===path);if(!item||hash(join(directory,path))!==item.sha256)throw Error('Critical package hash mismatch '+path);
 return{path,sha256:item.sha256};
});
if(hash(join(directory,'vitest.source.config.ts'))!==hash(join(root,'vitest.config.ts')))throw Error('Original probe settings changed');
for(const name of ['.test-data','test-results']){try{lstatSync(join(directory,name));throw Error('Probe scratch remains');}catch(error){if(error.code!=='ENOENT')throw error;}}
for(const path of ['resources/runtime/capabilities.json','docs/evidence/P00-03/runtime-probe.json','docs/evidence/P00-03/runtime-probe.log','docs/evidence/P00-03/native-cases.jsonl'])copyFileSync(join(directory,path),join(evidence,path.split('/').at(-1)));
const result={directory:latest.directory,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),fileCount:manifest.files.length,payloadBytes:manifest.files.reduce((n,x)=>n+x.sizeBytes,0),dependencyCopies:manifest.dependencies.length,criticalHashes:checked,probeScope:probe.verification.scope,standardUser:probe.standardUser,tests:probe.tests,capabilities:probe.capabilities,probeScratchAbsent:true,originalTestConfigUnchanged:true};
writeFileSync(join(root,'docs/evidence/P05-03/hosted-package-summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
