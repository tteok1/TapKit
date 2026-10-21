import { readReview, reviewedSource, rendererFingerprint, hash } from './build-review.mjs';
const { manifest, reviewed } = readReview();
const required = [
  'packages/core/dist/index.cjs',
  'apps/desktop/out/main/index.js',
  'apps/desktop/out/preload/index.js',
  'apps/desktop/out/renderer/index.html',
];
if (
  manifest.sourceCommit !== reviewed.sourceCommit ||
  manifest.sourceSHA256 !== reviewed.sourceSHA256 ||
  hash(reviewed.sourcePath) !== reviewed.sourceSHA256 ||
  required.some((path) => !manifest.files.some((file) => file.path === path))
)
  throw Error('Verified acceptance build/source binding failed. No application started.');
for (const source of reviewed.sources ?? []) {
  if (
    !reviewedSource(source.path) ||
    source.path.split('/').includes('..') ||
    hash(source.path) !== source.sha256
  )
    throw Error('Reviewed trace source changed. No application started.');
}
for (const source of reviewed.runtimeSources ?? []) {
  if (
    !/^scripts\/(execution-verification|runtime-inventory|runtime-probe|p03-parser-probe)\.mjs$/.test(
      source.path,
    ) ||
    hash(source.path) !== source.sha256
  )
    throw Error('Runtime verification source differs from the reviewed scope.');
}
if (reviewed.rendererFingerprint && reviewed.rendererFingerprint !== rendererFingerprint())
  throw Error(
    'UI source changed. Exit TapKit and rerun run-app.ps1 -RefreshUiBuild. No application started.',
  );
for (const file of manifest.files) {
  if (
    !/^(apps\/desktop\/out\/[\w./-]+|packages\/core\/dist\/index\.cjs)$/.test(file.path) ||
    file.path.split('/').includes('..') ||
    hash(file.path) !== file.sha256
  )
    throw Error('Acceptance build differs from the UI-verified artifacts. No application started.');
}
if (
  hash(required[0]) !== reviewed.coreBuildSHA256 ||
  hash(required[1]) !== reviewed.mainBuildSHA256
)
  throw Error(
    'Acceptance build differs from the reviewed title-root repair. No application started.',
  );
console.log(
  JSON.stringify({
    status: 'verified_production_build',
    files: manifest.files.length,
    uiEvidence: manifest.uiEvidence,
    modelRequests: 0,
  }),
);
