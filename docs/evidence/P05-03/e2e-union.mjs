import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'../../..'), evidence=join(root,'docs/evidence/P05-03');
const expected=[...readFileSync(join(evidence,'ui-run-01/check.log'),'utf8').matchAll(/^\s+P\d\d[^\r\n]*?\s›\s(.+)$/gm)].map((m)=>m[1].trim());
if(expected.length!==114||new Set(expected).size!==114)throw Error('Unexpected collected test inventory');
const logs=process.argv.slice(2);if(!logs.length)throw Error('Expected explicit run log paths');
const passed=new Map();
for(const path of logs){
  const log=readFileSync(join(evidence,path),'utf8');
  for(const m of log.matchAll(/^\s+ok\s+\d+\s+[^\r\n]*?›\s(.+?)\s+\([\d.]+(?:ms|s|m)\)$/gm)){
    const title=m[1].trim();if(!expected.includes(title))throw Error('Uncollected passing title '+title);
    passed.set(title,path);
  }
}
const result={scope:'114 distinct Electron cases across explicit rounds; not a single all-green run',logs,expected:expected.length,passed:passed.size,missing:expected.filter((title)=>!passed.has(title)),cases:expected.map((title)=>({title,passedIn:passed.get(title)??null}))};
writeFileSync(join(evidence,'e2e-coverage.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({expected:result.expected,passed:result.passed,missing:result.missing},null,2));
if(result.missing.length)process.exitCode=1;
