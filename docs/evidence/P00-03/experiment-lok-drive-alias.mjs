import {spawn,spawnSync} from 'node:child_process';import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {root,runtimeExe} from '../../scripts/lib.mjs';import {officeFixtures} from '../../scripts/fixtures-office.mjs';
const label=process.env.LOK_EXPERIMENT_LABEL||'lok-alias';
if(process.argv[2]!=='--child'){
 const base=await mkdtemp(join(root,'.test-data/P00-03-'+label+'-')),workspace=join(base,'workspace');await mkdir(workspace);await officeFixtures(workspace);
 const r=spawnSync(runtimeExe('python'),[join(root,'.cache/P00-03/compat-20260918/two-drives-host.py'),workspace,join(root,'.runtime/libreoffice'),process.execPath,process.argv[1],'--child',workspace],{encoding:'utf8',windowsHide:true,timeout:80000});
 console.log(r.stdout);console.error(r.stderr);if(r.error)throw r.error;process.exitCode=r.status;
 await writeFile(join(root,'docs/evidence/P00-03/'+label+'-cleanup.json'),JSON.stringify({exitCode:r.status,stdout:r.stdout,stderr:r.stderr},null,2)+'\n');
}else{
 const workspace=process.argv[3],workDrive=process.argv[4],loDrive=process.argv[5];
 let code=await readFile(join(root,'.cache/P00-03/compat-20260918/'+(process.env.LOK_EXPERIMENT_CODE||'lok-convert.py')),'utf8');
 code=code.replace('p=sys.argv[1];w=pathlib.Path(sys.argv[2]);','p=sys.argv[1];w=pathlib.Path(sys.argv[2]);os.chdir(w);');
 const id=randomUUID().replace(/^(.{14})./,'$17'),request={protocolVersion:1,requestId:id,runId:id,leaseEpoch:1,operation:'diagnostic.execute',payload:{runtimeRoot:join(root,'.runtime/python'),executable:runtimeExe('python'),inputRoot:join(root,'.runtime/libreoffice'),workspace,args:['-c',code,loDrive+'\\program',workDrive+'\\'],timeoutMs:45000,memoryBytes:2147483648,processLimit:8,outputBytes:1048576,terminal:false}};
 const startedAt=new Date().toISOString(),c=spawn(join(root,'resources/runtime/helper/tapkit-windows-helper.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.stdin.write(JSON.stringify(request)+'\n');const exitCode=await new Promise((res,rej)=>{c.on('error',rej);c.on('close',res)});
 const report={startedAt,endedAt:new Date().toISOString(),scope:'LOKit plus temporary aliases to already granted roots; generated fixtures; not full T07 acceptance',workspace,request,exitCode,events:out.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),stderr:err};await writeFile(join(root,'docs/evidence/P00-03/'+label+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.events.map(x=>({event:x.event,data:x.data})),null,2));
}
