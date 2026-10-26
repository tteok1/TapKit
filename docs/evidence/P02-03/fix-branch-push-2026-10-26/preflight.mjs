import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 }).trimEnd();
const branch = git('branch', '--show-current');
if (branch !== 'codex/test-fixes-2026-10-26') throw new Error('Unexpected branch');
const tracked = git('diff', '--name-only', '-z', 'HEAD').split('\0').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
const candidates = [...new Set([...tracked, ...untracked])].sort();
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{45,})\b/],
  ['service-key', /\bsk-(?:proj-|ant-api\d\d-)?[A-Za-z0-9_-]{32,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
];
const textExtensions = new Set(['.md','.json','.jsonl','.log','.ts','.tsx','.css','.csv','.mjs','.ps1','.txt','.yaml','.yml']);
const files = [], findings = [];
for (const path of candidates) {
  let info;
  try { info = await stat(join(root, path)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  files.push({ path, bytes: info.size });
  if (/(^|\/)(?:\.env(?!\.example$)[^/]*|[^/]*\.(?:sqlite(?:-wal|-shm)?|db|pfx|p12|pem)|id_rsa|credentials\.json)$/i.test(path)) findings.push({ path, rule:'private-data-filename' });
  if (info.size >= 50 * 1024 * 1024) findings.push({ path, rule:'large-file' });
  if (textExtensions.has(extname(path))) {
    const text = await readFile(join(root, path), 'utf8');
    for (const [name, pattern] of rules) if (pattern.test(text)) findings.push({ path, rule:name });
  }
}
const pointer = JSON.parse(await readFile(join(root, '.test-data/current-ui-review.json'), 'utf8'));
const verified = JSON.parse(await readFile(join(root, pointer.reviewPath), 'utf8'));
let sourceCount = 0, artifactCount = 0;
for (const [label, group] of [['source', verified.productSourceSha256], ['artifact', verified.production.artifactSha256]]) {
  for (const [path, expected] of Object.entries(group)) {
    const actual = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
    if (actual !== expected) throw new Error('Verified ' + label + ' changed: ' + path);
    if (label === 'source') sourceCount++; else artifactCount++;
  }
}
const result = {
  date: '2026-10-26', branch, base: git('rev-parse','HEAD'),
  authorizedAction: 'Commit and push current fix branch to origin; do not merge main',
  remoteMainBefore: '9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a', remoteTargetBefore: null,
  sourceCount, artifactCount, verifiedBuildMatches: true,
  fileCount: files.length, totalBytes: files.reduce((n,f)=>n+f.bytes,0),
  largestFiles: [...files].sort((a,b)=>b.bytes-a.bytes).slice(0,8), findings,
  tests: { priorFinalPassed: { unit:53,integration:126,electron:30 }, manual:'M01/M02 directly accepted by user', evidence:'docs/evidence/P03-01/acceptance-2026-10-26/final-outcome.json' },
  inventory: files,
  note: 'Inventory is captured before this preflight.json is written. No profile, runtime or build output is added.'
};
await writeFile(join(evidence, 'preflight.json'), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ branch, fileCount:result.fileCount, totalBytes:result.totalBytes, sourceCount, artifactCount, largestFiles:result.largestFiles, findings }));
if (findings.length) process.exitCode=1;
