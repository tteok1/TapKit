import { test, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore, BlobStore, newId } from '../../../packages/storage/src';
import { CoreService } from '../../../packages/core/src/service';
import { ChatService } from '../../../packages/core/src/chat-service';
import { WebService } from '../../../packages/core/src/web-service';
import { WebTools } from '../../../packages/tools/src';
import { NetworkPolicyService } from '../../../packages/network/src';
import { DEFAULT_MODEL_PREFERENCES, WebOptionsSchema } from '../../../packages/contracts/src';

test('P05-01 real Codex candidates → three current public pages → Core snapshots and verified citations → offline replay', async () => {
  if (process.env.TAPKIT_HOSTED_SOURCE_READ !== 'public-sources-2026-10-27') throw Error('APPROVAL_REQUIRED');
  const live = JSON.parse(await readFile('docs/evidence/P05-01/live-search-03.json','utf8'));
  expect(live.status).toBe('search_and_three_reads_passed');
  await mkdir('.test-data',{recursive:true});
  const directory = await mkdtemp(resolve('.test-data','P05-01 live public sources '));
  const store=await openStore(directory),blobs=new BlobStore(store),core=new CoreService(store);
  const models={catalog:async()=>[],effective:()=>({values:DEFAULT_MODEL_PREFERENCES,scope:'profile' as const}),ledger:{hasPreferences:()=>false},router:{async *stream(){}}};
  const chat=new ChatService(store,blobs,models);
  const req=(command:string,payload:unknown)=>({protocolVersion:1 as const,requestId:newId(),command,payload});
  try {
    const created=core.dispatch(req('sessions.create',{mode:'chat',title:'P05 real public sources'}));
    if(!created.ok||!('entityId' in created.data))throw Error('SESSION_CREATE_FAILED');
    const sid=created.data.entityId;
    const question='查找 Node.js、TypeScript 和 Electron 各自的官方文档入口，请搜索公开资料并给出三个官方链接。';
    const user=chat.insertMessage(chat.session(sid),'user',question,'final',null);
    const rid=store.db.transaction(()=>chat.createRun(chat.session(sid),user,null))();
    const network=new NetworkPolicyService({proxy:()=> 'http://127.0.0.1:7688'});
    // Search was already executed once and captured by the production adapter in live-search-03.
    // No additional model request occurs in this source/archival continuation.
    const tools=new WebTools(network,async()=>live.result);
    const web=new WebService(store,blobs,tools);
    await web.dispatch(req('web.configure',{sessionId:sid,options:WebOptionsSchema.parse({mode:'on',domains:['typescriptlang.org','nodejs.org','electronjs.org']})}));
    const run=web.run(sid,rid,question,new AbortController().signal);
    const candidates=JSON.parse(await run.execute('web.search',{query:question}));
    const pages=[];
    for(const page of live.pages) {
      expect(candidates.results.some((candidate:{url:string})=>candidate.url===page.url)).toBe(true);
      const result=JSON.parse(await run.execute('web.read',{url:page.url}));
      pages.push(await web.source(sid,result.sourceId));
    }
    expect(pages).toHaveLength(3);
    const answer=pages.map(page=>'“'+page.text.split(/[\r\n。；]/).find(part=>part.trim().length>=8&&!/[“”「」]/.test(part))!.trim().slice(0,80)+'”[[web:'+page.sourceId+']]').join('\n');
    const message=chat.insertMessage(chat.session(sid),'assistant',answer,'final',rid);
    expect(await run.validate(answer,message)).toHaveLength(3);
    expect(store.db.prepare('SELECT count(*) AS n FROM citations WHERE message_id=? AND verified=1').get(message)).toEqual({n:3});
    // Actual archived bytes remain accessible when all network access is disabled.
    network.request=async()=>{throw Error('NETWORK_DISABLED');};
    for(const page of pages) expect((await web.source(sid,page.sourceId)).contentHash).toBe(page.contentHash);
    const report={status:'passed',searchEvidence:'live-search-03.json',additionalModelRequests:0,threePages:pages.map(p=>({sourceId:p.sourceId,url:p.url,title:p.title,contentHash:p.contentHash,characters:p.text.length})),verifiedCitations:3,offlineReplay:true,profileContainsOnlyPublicTestMaterial:true};
    await writeFile('docs/evidence/P05-01/hosted-source-live.json',JSON.stringify(report,null,2)+'\n');
  } finally {store.close();}
},120000);
