import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, readdirSync, lstatSync, copyFileSync, unlinkSync, realpathSync, rmSync, statfsSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const batch = process.argv[2], round = process.argv[3];
const integration = ['P00','P01','P02','P03-01','P03-02','P03-03','P04','P05'].map((tag)=>['test:integration',tag]);
const batches = { all: [['check'], ['build'], ['test:unit'], ...integration, ['test:perf'], ['test:e2e']], final: [['check'], ['test:unit'], ['test:integration','P05'], ['test:e2e']], e2e: [['test:e2e']], integration, pack: [['pack:dir']], check: [['check'], ['docs:check']] };
batches.ui = [['check'], ['test:unit'], ['test:integration','P05'], ['test:e2e','--','--grep','P00-02 T05 Core kill|P01-02 real desktop UI|P01-03 real desktop model|P02|P03|P04|P05']];
batches.uiOnly = [batches.ui.at(-1)];
batches.two = [['check'], ['test:e2e','--','--grep','P01-03 real desktop model|P02-03 T22 compact chat.*960x640.*200']];
batches.model = [['check'], ['test:e2e','--','--grep','P01-03 real desktop model']];
batches.repairs = [['check'], ['test:e2e','--','--grep','P01-03 real desktop model|P02-01 UI redesign workbench renders|P02-03 T22 compact chat.*960x640.*200|P02-03 T22 dialogs fit 960x640.*200|P04-03 T11 explicit post-write|P05-01 T19 Chromium|P05-02 T20 recipient']];
batches.hosted = [['check'],['build'],['test:unit'],['test:integration','P01'],['test:integration','P05'],['test:e2e','--','--grep','P01-03 real desktop model|P05']];
batches.hostedFinish = [['check'],['test:integration','P05'],['test:e2e','--','--grep','P01-03 real desktop model|P05']];
batches.hostedModel = [['check'],['test:unit'],['test:integration','P01'],['test:e2e','--','--grep','P01-03 real desktop model|P05-03']];
if (!(batch in batches) || !/^run-[0-9]{2}$/.test(round ?? '')) throw Error('Expected batch and unique run-NN');
const output = join(root, 'docs/evidence/P05-03', batch + '-' + round); mkdirSync(output);
const node = join(root, '.runtime/node/node-v24.21.0-win-x64/node.exe'), pnpm = join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs');
const env = { ...process.env }, pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
env[pathKey ?? 'Path'] = dirname(node) + ';' + (env[pathKey] ?? '');
for (const key of ['TAPKIT_DATA_DIR','TAPKIT_CORE_DATA_DIR','TAPKIT_CHAT_FIXTURE','TAPKIT_WEB_FIXTURE','TAPKIT_TEST_BUILD','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL']) delete env[key];
const sourcePaths = spawnSync('git', ['ls-files','--cached','--others','--exclude-standard','-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.split('\0').filter((path) => path && /^(apps|packages|migrations|scripts|native|resources|tests)\//.test(path) && !/\/(out|dist|node_modules)\//.test(path) || /^[^/]+\.(json|yaml|lock)$/.test(path));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sources = () => Object.fromEntries(sourcePaths.map((path) => [path, hash(join(root, path))]));
const before = sources();
writeFileSync(join(output, 'sources.json'), JSON.stringify({ head: spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(), dirty: true, files: before }, null, 2));
// Old task evidence belongs to its original accepted source. Preserve all bytes, retain this run's changed artifacts separately.
const backup = join(root, '.test-data', 'P05-03-evidence-' + batch + '-' + round); mkdirSync(backup, { recursive: true });
const temps = resolve(root,'.test-data'), existingTemps = new Set(readdirSync(temps)), temporaryCleanup=[];
function cleanupTemps() {
  for(const name of readdirSync(temps)) {
    if(existingTemps.has(name)||! /^(?:P0[0-5][- ]|单元 集成-)/.test(name)||name.startsWith('P05-03-evidence-'))continue;
    const path=resolve(temps,name),meta=lstatSync(path);
    if(!path.startsWith(temps+'\\')||!meta.isDirectory()||meta.isSymbolicLink()||realpathSync(path).toLowerCase()!==path.toLowerCase())continue;
    try {rmSync(path,{recursive:true,force:true,maxRetries:3,retryDelay:100});temporaryCleanup.push({name,removed:true});}catch(error){temporaryCleanup.push({name,removed:false,error:String(error.code)});}
  }
}
function walk(path) { const info=lstatSync(path); if(info.isSymbolicLink()) throw Error('Evidence reparse point'); return info.isDirectory()?readdirSync(path).flatMap((name)=>walk(join(path,name))):[path]; }
const historicalRoots = readdirSync(join(root,'docs/evidence')).filter((name)=>/^P0[0-4]-/.test(name)).map((name)=>join(root,'docs/evidence',name));
const original = new Map();
for (const path of historicalRoots.flatMap(walk)) { const name=relative(root,path); original.set(name,hash(path)); const target=join(backup,name); mkdirSync(dirname(target),{recursive:true}); copyFileSync(path,target); }
writeFileSync(join(output,'historical-before.json'),JSON.stringify(Object.fromEntries(original),null,2));
let exitCode=0,executionError; const commands=[];
try {
  for(const args of batches[batch]) {
    const space=statfsSync(root);if(Number(space.bavail)*Number(space.bsize)<8*1024**3)throw Error('Less than 8 GiB free; stopping before a new batch.');
    const label=args[0].replaceAll(':','-')+(args.length>1?'-'+(args[0]==='test:integration'?args[1]:'filtered'):''), log=join(output,label+'.log'), fd=openSync(log,'w'), started=new Date().toISOString();
    console.log('Starting '+args.join(' ')); let result;
    try { result=spawnSync(node,[pnpm,...args],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]}); } finally { closeSync(fd); }
    const code=result.status??1; commands.push({args,started,finished:new Date().toISOString(),exitCode:code,log:label+'.log'}); console.log(label+' exit '+code);
    cleanupTemps();
    if(code){exitCode=code;break;}
  }
} catch(error){exitCode=1;executionError=String(error);} finally {
  cleanupTemps();
  const restored=[];
  for(const path of historicalRoots.flatMap(walk)) {
    const name=relative(root,path), prior=original.get(name); if(prior===hash(path))continue;
    const retained=join(output,'historical-current',name);mkdirSync(dirname(retained),{recursive:true});copyFileSync(path,retained);
    if(prior)copyFileSync(join(backup,name),path);else {if(!resolve(path).startsWith(join(root,'docs/evidence')+'\\'))throw Error('Unsafe evidence cleanup');unlinkSync(path);}
    restored.push({path:name,originalSha256:prior??null});
  }
  for(const [name,sha] of original) { const path=join(root,name); try{if(hash(path)===sha)continue;}catch{} mkdirSync(dirname(path),{recursive:true});copyFileSync(join(backup,name),path); }
  const unchanged=JSON.stringify(sources())===JSON.stringify(before); if(!unchanged)exitCode=1;
  writeFileSync(join(output,'results.json'),JSON.stringify({exitCode,sourcesUnchanged:unchanged,commands,executionError,temporaryCleanup,historicalEvidenceRestored:restored,liveModels:'R01-R05 deferred by user',liveSearch:'R06 pending'},null,2));
}
process.exitCode=exitCode;
