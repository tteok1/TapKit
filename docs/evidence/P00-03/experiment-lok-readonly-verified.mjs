import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';import net from 'node:net';
import {root,runtimeExe} from '../../scripts/lib.mjs';import {officeFixtures} from '../../scripts/fixtures-office.mjs';
const label='lok-readonly-alias-verified';
async function run(exe,args){const c=spawn(exe,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);const exitCode=await new Promise((r,j)=>{c.on('error',j);c.on('close',r)});return{exitCode,stdout,stderr};}
if(process.argv[2]!=='--child'){
 const base=await mkdtemp(join(root,'.test-data/P00-03-'+label+'-')),workspace=join(base,'workspace'),input=join(base,'input'),outside=join(base,'outside/sentinel.txt');
 await mkdir(workspace);await mkdir(join(base,'outside'));await writeFile(outside,'PRIVATE-SENTINEL');await officeFixtures(input);
 let accepted=0;const server=net.createServer(s=>{accepted++;s.end()});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 await new Promise((r,j)=>{const c=net.connect(port,'127.0.0.1',()=>{c.end();r()});c.on('error',j)});
 try{
 const result=await run(runtimeExe('python'),[join(root,'.cache/P00-03/compat-20260918/three-drives-host.py'),workspace,join(root,'.runtime/libreoffice'),input,process.execPath,process.argv[1],'--child',workspace,input,outside,String(port)]);
 await new Promise((r,j)=>{const c=net.connect(port,'127.0.0.1',()=>{c.end();r()});c.on('error',j)});
 console.log(result.stdout);console.error(result.stderr);await writeFile(join(root,'docs/evidence/P00-03/'+label+'-cleanup.json'),JSON.stringify({hostLoopbackPositiveBeforeAndAfter:true,acceptedConnections:accepted,expectedHostConnections:2,port,...result},null,2)+'\n');process.exitCode=result.exitCode||Number(accepted!==2);
 }finally{server.close();}
}else{
 const [workspace,input,outside,port,workDrive,loDrive,inputDrive]=process.argv.slice(3);
 const code=await readFile(join(root,'.cache/P00-03/compat-20260918/lok-readonly.py'),'utf8');
 const id=randomUUID().replace(/^(.{14})./,'$17'),request={protocolVersion:1,requestId:id,runId:id,leaseEpoch:1,operation:'diagnostic.execute',payload:{runtimeRoot:join(root,'.runtime/libreoffice'),executable:join(root,'.runtime/libreoffice/program/python.exe'),inputRoot:input,workspace,args:['-c',code,loDrive+'\\program',workDrive+'\\',inputDrive+'\\',outside,port],timeoutMs:45000,memoryBytes:2147483648,processLimit:8,outputBytes:1048576,terminal:false}};
 const startedAt=new Date().toISOString(),c=spawn(join(root,'resources/runtime/helper/tapkit-windows-helper.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.stdin.write(JSON.stringify(request)+'\n');const exitCode=await new Promise((r,j)=>{c.on('error',j);c.on('close',r)});
 const report={startedAt,endedAt:new Date().toISOString(),scope:'Compatibility experiment with bundled LibreOffice Python, read-only input/runtime, private workspace, outside sentinel and live loopback control; not full P00 acceptance',workspace,sourceSha256:createHash('sha256').update(code).digest('hex'),request,exitCode,events:out.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),stderr:err};await writeFile(join(root,'docs/evidence/P00-03/'+label+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.events.map(x=>({event:x.event,data:x.data})),null,2));
 const end=report.events.at(-1);process.exitCode=end?.event==='finished'&&end.data.status==='exited'&&end.data.exitCode===0&&end.data.stdout.includes('"failures": []')?0:1;
}
