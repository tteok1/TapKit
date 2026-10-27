import { _electron as electron, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'), latest=JSON.parse(await readFile(join(root,'release/latest.json'),'utf8'));
const folder=resolve(root,latest.directory);
if(!folder.startsWith(join(root,'release')+'\\') || latest.nativeProbeExitCode!==0)throw Error('A successfully probed development directory is required');
for (const name of ['.test-data','test-results']) {
  const meta=await lstat(join(folder,name)).catch(()=>undefined);expect(meta,'probe scratch must be removed from actual package').toBeUndefined();
}
const compiledCore = await readFile(join(folder,'packages/core/dist/index.cjs'),'utf8');
expect(compiledCore).not.toContain('installChatFixture');
expect(compiledCore).not.toContain('P05 isolated web fixture');
await mkdir(join(root,'.test-data'),{recursive:true});
const dir=await mkdtemp(join(root,'.test-data/P05-03 packaged 中文 ')), source=join(dir,'包内资料.txt'), output=join(dir,'包内分享.zip');
const original='目录包真实解析和分享验证：中文资料，固定原字节。'; await writeFile(source,original);
const env={...process.env,TAPKIT_DATA_DIR:join(dir,'profile')};
for(const name of ['ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','TAPKIT_CHAT_FIXTURE','TAPKIT_WEB_FIXTURE','TAPKIT_TEST_BUILD'])delete env[name];
let app;
const result={directory:latest.directory,syntheticProfile:true,productionBuild:true,dialogChoices:'Electron open/save dialog responses supplied with synthetic paths; actual packaged Host/Core/parser/writer execute',started:new Date().toISOString()};
try{
  app=await electron.launch({executablePath:join(folder,'electron/electron.exe'),args:[join(folder,'apps/desktop')],env,chromiumSandbox:true});
  const page=await app.firstWindow();await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接',{timeout:125000});
  result.catalog=await page.evaluate(async()=>{
    const raw=crypto.randomUUID(),requestId=raw.slice(0,14)+'7'+raw.slice(15);const r=await window.tapkit.modelCommand({requestId},'models.catalog',{});
    if(!r.ok||!('catalog'in r.data))throw Error('catalog');return {ready:r.data.catalog.filter((m)=>m.status==='ready').length,fixture:r.data.catalog.some((m)=>m.modelId==='fixture-model')};
  });
  expect(result.catalog).toEqual({ready:0,fixture:false});
  await page.getByRole('link',{name:'文件',exact:true}).first().click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
  await page.getByRole('button',{name:'导入文件',exact:true}).click();
  const importing=page.getByRole('dialog',{name:'待导入文件',exact:true});await importing.getByRole('button',{name:'开始导入',exact:true}).click();
  await expect(importing.getByRole('button',{name:'关闭',exact:true})).toBeEnabled({timeout:45000});await importing.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.locator('.file-card').filter({hasText:'包内资料.txt'})).toContainText('内容已读取',{timeout:45000});
  await page.getByRole('checkbox',{name:'选择 包内资料.txt',exact:true}).check();
  await page.getByRole('button',{name:'导出分享副本',exact:true}).click();
  const exporting=page.getByRole('dialog',{name:'导出分享副本',exact:true});
  await expect(exporting).toContainText('包内资料.txt');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},output);
  await exporting.getByRole('button',{name:'选择位置并导出'}).click();
  await expect(exporting.getByRole('status')).toContainText('副本已保存',{timeout:60000});
  const bytes=await readFile(output);expect(bytes.subarray(0,2).toString()).toBe('PK');expect(bytes.includes(Buffer.from(original))).toBe(true);
  result.zip={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),containsOriginalBytes:true};
  result.renderer=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process}));expect(result.renderer).toEqual({require:'undefined',process:'undefined'});
  await page.screenshot({path:join(root,'docs/evidence/P05-03/pack-launched.png')});result.exitCode=0;
}catch(error){result.exitCode=1;result.error=String(error);throw error;}
finally{await app?.close();result.finished=new Date().toISOString();await writeFile(join(root,'docs/evidence/P05-03/pack-smoke.json'),JSON.stringify(result,null,2));}
