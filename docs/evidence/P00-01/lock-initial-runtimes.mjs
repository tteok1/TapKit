import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async n=>await fs.readFile(`docs/evidence/P00-01/${n}-release-source.txt`,'utf8');
const get=async u=>{const r=await fetch(u);if(!r.ok)throw Error(`${r.status}: ${u}`);return r;};
const nodeVersion=JSON.parse(await read('node')).find(v=>v.version.startsWith('v24.')).version;
const nodeFile=`node-${nodeVersion}-win-x64.zip`,nodeUrl=`https://nodejs.org/dist/${nodeVersion}/${nodeFile}`;
const sums=await (await get(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`)).text();
const nodeHash=sums.split('\n').find(l=>l.endsWith(nodeFile)).split(/\s+/)[0];
const pythonVersion=[...(await read('python')).matchAll(/href="(3\.13\.\d+)\//g)].map(m=>m[1]).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
const pythonFile=`python-${pythonVersion}-embed-amd64.zip`, pythonUrl=`https://www.python.org/ftp/python/${pythonVersion}/${pythonFile}`;
const pythonBytes=Buffer.from(await (await get(pythonUrl)).arrayBuffer());
const pythonHash=createHash('sha256').update(pythonBytes).digest('hex');
await fs.mkdir('.cache/downloads',{recursive:true});await fs.writeFile(`.cache/downloads/${pythonFile}`,pythonBytes);
const rust=await read('rust'); const rustBlock=rust.match(/\[pkg\.rust\.target\.x86_64-pc-windows-msvc\][\s\S]*?(?=\n\[)/)[0];
const rustUrl=rustBlock.match(/xz_url = "([^"]+)"/)[1],rustHash=rustBlock.match(/xz_hash = "([^"]+)"/)[1];
const loVersion=[...(await read('libreoffice')).matchAll(/href="(26\.2\.\d+)\//g)].map(m=>m[1]).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
const loUrl=`https://download.documentfoundation.org/libreoffice/stable/${loVersion}/win/x86_64/LibreOffice_${loVersion}_Win_x86-64.msi`;
const loSums=await (await get(loUrl+'.sha256')).text(); const loHash=loSums.match(/[a-f0-9]{64}/i)?.[0];if(!loHash)throw Error('No LibreOffice SHA256');
const git=JSON.parse(await read('git'));const asset=git.assets.find(a=>/^MinGit-[\d.]+-64-bit.zip$/.test(a.name));
const runtimes={
 node:{version:nodeVersion.slice(1),url:nodeUrl,sha256:nodeHash,license:'MIT',licenseUrl:`https://raw.githubusercontent.com/nodejs/node/${nodeVersion}/LICENSE`,archive:'zip',directory:`node-${nodeVersion}-win-x64`,executable:'node.exe',scope:'development'},
 python:{version:pythonVersion,url:pythonUrl,sha256:pythonHash,hashSource:'Calculated from official HTTPS distribution on first lock',license:'PSF-2.0',licenseUrl:'https://docs.python.org/3.13/license.html',archive:'zip',directory:'.',executable:'python.exe',scope:'bundled'},
 rust:{version:rustUrl.match(/rust-([\d.]+)-/)[1],url:rustUrl,sha256:rustHash,license:'MIT OR Apache-2.0',licenseUrl:'https://www.rust-lang.org/policies/licenses',archive:'tar.xz',directory:rustUrl.split('/').at(-1).replace('.tar.xz',''),executable:'rustc/bin/rustc.exe',scope:'development'},
 libreoffice:{version:loVersion,url:loUrl,sha256:loHash,license:'MPL-2.0 AND LGPL-3.0-or-later',licenseUrl:'https://www.libreoffice.org/about-us/licenses',archive:'msi',directory:'.',executable:'program/soffice.exe',scope:'bundled'},
 git:{version:git.tag_name.replace(/^v/,''),url:asset.browser_download_url,sha256:asset.digest.replace('sha256:',''),license:'GPL-2.0-only',licenseUrl:'https://github.com/git-for-windows/git/blob/main/COPYING',archive:'zip',directory:'.',executable:'cmd/git.exe',scope:'bundled'},
};
await fs.writeFile('runtime-lock.json',JSON.stringify({schemaVersion:1,lockedAt:new Date().toISOString(),platform:'win32',arch:'x64',runtimes},null,2)+'\n',{flag:'wx'});
console.log(Object.fromEntries(Object.entries(runtimes).map(([k,v])=>[k,v.version])));