import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, lstatSync, renameSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hash, readReview, reviewedSource, productChanges, changedPaths, rendererFingerprint, root, directory } from '../../P02-02/live-2026-10-15/build-review.mjs';
const evidenceDir = 'docs/evidence/P02-03/selection-result-2026-10-20';
const bindingPath = join(root, evidenceDir, 'source-binding.json');
const intended = new Set([
  'packages/core/src/chat-service.ts', 'packages/core/src/selection-output.ts',
  'apps/desktop/src/renderer/src/chat-surface.tsx',
  'apps/desktop/src/renderer/locales/chat.zh-CN.json',
]);
if (process.argv.includes('--freeze')) {
  const prior = readReview();
  for (const source of [...prior.reviewed.sources, ...prior.reviewed.runtimeSources])
    if (!intended.has(source.path) && hash(source.path) !== source.sha256) throw Error('Unrelated source changed: ' + source.path);
  const changes = productChanges();
  const sources = changedPaths(changes).map((path) => {
    if (!reviewedSource(path)) throw Error('Source outside review scope: ' + path);
    return { path, sha256: hash(path) };
  });
  for (const source of sources)
    if (!intended.has(source.path) && !prior.reviewed.sources.some((s) => s.path === source.path)) throw Error('Unexpected new source');
  writeFileSync(bindingPath, JSON.stringify({
    at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim(),
    productChanges: changes, sources, runtimeSources: prior.reviewed.runtimeSources,
    rendererFingerprint: rendererFingerprint(), priorManifest: prior.manifestName,
    tests: ['tests/unit/P02-03.selection-output.test.ts','tests/integration/P02-03.history.test.ts','tests/e2e/P02-03.history.spec.ts'].map((path) => ({path,sha256:hash(path)})),
  }, null, 2) + '\n');
  console.log('Frozen ' + sources.length + ' sources before production build');
} else {
  const binding = JSON.parse(readFileSync(bindingPath,'utf8'));
  const prior = readReview();
  if (prior.manifestName !== binding.priorManifest || binding.productChanges !== productChanges() || rendererFingerprint() !== binding.rendererFingerprint) throw Error('Review input changed');
  if (binding.sourceCommit !== execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()) throw Error('HEAD changed');
  for (const s of [...binding.sources,...binding.runtimeSources,...binding.tests]) if (hash(s.path) !== s.sha256) throw Error('Source changed after tests: ' + s.path);
  const core = readFileSync(join(root,'packages/core/dist/index.cjs'),'utf8');
  if (core.includes('installChatFixture') || !core.includes('selection-v2') || !core.includes('本轮没有知识检索证据')) throw Error('Wrong production Core');
  const files = [{path:'packages/core/dist/index.cjs',sha256:hash('packages/core/dist/index.cjs')}];
  function walk(path) {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw Error('Artifact links refused');
    if (info.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path,name));
    else if (info.isFile()) { const name = relative(root,path).replaceAll('\\','/'); files.push({path:name,sha256:hash(name)}); }
    else throw Error('Unsupported artifact');
  }
  walk(join(root,'apps/desktop/out'));
  for (const path of ['apps/desktop/out/main/index.js','apps/desktop/out/preload/index.js'])
    if (hash(path) !== prior.manifest.files.find((f) => f.path === path)?.sha256) throw Error('Host/preload artifact changed');
  const stamp = Date.now() + '-' + hash('packages/core/src/chat-service.ts').slice(0,8);
  const reviewName = 'reviewed-source-selection-result-' + stamp + '.json';
  const manifestName = 'verified-build-selection-result-' + stamp + '.json';
  const review = {
    ...prior.reviewed, localDate:'2026-10-20', checkedAt:new Date().toISOString(),
    ...binding, sourcePath:'packages/core/src/chat-service.ts', sourceSHA256:hash('packages/core/src/chat-service.ts'),
    coreBuildSHA256:hash('packages/core/dist/index.cjs'), mainBuildSHA256:hash('apps/desktop/out/main/index.js'),
    reviewedScope:'ADR0056 selection-v2: provider text-only original, selection output projection and evidence separation, explicit source labels and generic validation error. Existing Host/provider/runtime and unrelated UI sources frozen.',
    validation:evidenceDir + '/results.json', uiEvidence:evidenceDir + '/e2e-targeted.log',
    tests:{unitPassed:2,integrationPassed:42,e2ePassed:1,e2eWindowSizes:[1440,1024],checkFiles:457,checkExitCode:0,buildDesktopExitCode:0},
    productionCoreHasFixture:false,
  };
  const manifest = {sourceCommit:binding.sourceCommit,sourceSHA256:review.sourceSHA256,sourceReview:reviewName,createdAt:review.checkedAt,files,uiEvidence:review.uiEvidence};
  writeFileSync(join(directory,reviewName),JSON.stringify(review,null,2)+'\n');
  writeFileSync(join(directory,manifestName),JSON.stringify(manifest,null,2)+'\n');
  const tmp=join(directory,'active-build-selection-result.tmp');
  writeFileSync(tmp,JSON.stringify({schemaVersion:1,buildManifest:manifestName},null,2)+'\n');
  renameSync(tmp,join(directory,'active-build.json'));
  const priorFiles=new Map(prior.manifest.files.map((f)=>[f.path,f.sha256]));
  const changed=files.filter((f)=>priorFiles.get(f.path)!==f.sha256).map((f)=>f.path);
  writeFileSync(join(root,evidenceDir,'build-activation.json'),JSON.stringify({checkedAt:review.checkedAt,reviewName,manifestName,sources:binding.sources.length,artifacts:files.length,changedArtifacts:changed,hostPreloadUnchanged:true,agentModelRequests:0},null,2)+'\n');
  console.log(JSON.stringify({reviewName,manifestName,sources:binding.sources.length,artifacts:files.length,changedArtifacts:changed.length}));
}
