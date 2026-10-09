import {spawn,spawnSync} from 'node:child_process';import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {root,runtimeExe,runtimeLock} from '../../scripts/lib.mjs';
const evidence=join(root,'docs/evidence/P00-03/git-drive-alias.json');
if(process.argv[2]!=='--child'){
 const base=await mkdtemp(join(root,'.test-data/P00-03-git-alias-')),workspace=join(base,'workspace');await mkdir(workspace);
 const git=runtimeExe('git');const run=args=>{const r=spawnSync(git,['-c','core.hooksPath=NUL',...args],{cwd:workspace,encoding:'utf8',windowsHide:true});if(r.status)throw Error(r.stderr);};
 run(['init','--quiet']);await writeFile(join(workspace,'readme.txt'),'before\n');run(['add','readme.txt']);await writeFile(join(workspace,'readme.txt'),'after 中文\n');
 const r=spawnSync(runtimeExe('python'),[join(root,'.cache/P00-03/compat-20260918/drive-host.py'),workspace,process.execPath,process.argv[1],'--child',workspace],{encoding:'utf8',windowsHide:true,timeout:80000});
 console.log(r.stdout);console.error(r.stderr);if(r.error)throw r.error;process.exitCode=r.status;
 await writeFile(join(root,'docs/evidence/P00-03/git-drive-alias-cleanup.json'),JSON.stringify({exitCode:r.status,stdout:r.stdout,stderr:r.stderr},null,2)+'\n');
}else{
 const workspace=process.argv[3],drive=process.argv[4],code=await readFile(join(root,'.cache/P00-03/compat-20260918/git-alias.py'),'utf8');
 const id=randomUUID().replace(/^(.{14})./,'$17'),request={protocolVersion:1,requestId:id,runId:id,leaseEpoch:1,operation:'diagnostic.execute',payload:{runtimeRoot:join(root,'.runtime/python'),executable:runtimeExe('python'),inputRoot:join(root,'.runtime/git',runtimeLock.runtimes.git.directory),workspace,args:['-c',code,runtimeExe('git'),workspace,drive],timeoutMs:20000,memoryBytes:2147483648,processLimit:8,outputBytes:1048576,terminal:false}};
 const startedAt=new Date().toISOString(),c=spawn(join(root,'resources/runtime/helper/tapkit-windows-helper.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.stdin.write(JSON.stringify(request)+'\n');const exitCode=await new Promise((res,rej)=>{c.on('error',rej);c.on('close',res)});
 const report={startedAt,endedAt:new Date().toISOString(),scope:'Temporary per-logon drive alias to the already granted workspace; no additional file access; compatibility experiment only',request,exitCode,events:out.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),stderr:err};await writeFile(evidence,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.events.map(x=>({event:x.event,data:x.data})),null,2));
}
