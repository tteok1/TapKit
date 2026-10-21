import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export const directory = dirname(fileURLToPath(import.meta.url));
export const root = resolve(directory, '../../../..');
export const hash = (file) =>
  createHash('sha256')
    .update(readFileSync(join(root, file)))
    .digest('hex');
export const rendererSource = (file) =>
  /^apps\/desktop\/src\/renderer\/[\w./-]+\.(?:css|tsx?|json|svg)$/.test(file) &&
  !file.split('/').includes('..');
export const reviewedSource = (file) =>
  rendererSource(file) ||
  /^apps\/desktop\/src\/main\/(?:index|core-startup)\.ts$/.test(file) ||
  (/^packages\/(core|providers|tools)\/src\/[\w/.-]+\.ts$/.test(file) &&
    !file.split('/').includes('..'));
export function productChanges() {
  return execFileSync('git', ['status', '--porcelain', '--', 'apps', 'packages', 'resources'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}
export const changedPaths = (changes) =>
  changes
    ? changes
        .split('\n')
        .map((line) => line.trim().replace(/^[A-Z?]{1,2}\s+/, ''))
        .sort()
    : [];
export function rendererFingerprint() {
  const digest = createHash('sha256');
  function walk(file) {
    const info = lstatSync(file);
    if (
      info.isSymbolicLink() ||
      resolve(realpathSync(file)).toLowerCase() !== resolve(file).toLowerCase()
    )
      throw Error('Renderer source links are not supported');
    if (info.isDirectory()) for (const name of readdirSync(file).sort()) walk(join(file, name));
    else if (info.isFile())
      digest
        .update(relative(root, file).replaceAll('\\', '/') + '\0' + info.size + '\0')
        .update(readFileSync(file));
    else throw Error('Renderer source special file is not supported');
  }
  walk(join(root, 'apps/desktop/src/renderer'));
  return digest.digest('hex');
}
export function readReview() {
  let manifestName;
  if (existsSync(join(directory, 'active-build.json'))) {
    const pointer = JSON.parse(readFileSync(join(directory, 'active-build.json'), 'utf8'));
    if (
      pointer.schemaVersion !== 1 ||
      !/^verified-build-[a-z0-9-]+\.json$/.test(pointer.buildManifest)
    )
      throw Error('Invalid active build pointer');
    manifestName = pointer.buildManifest;
  } else {
    manifestName = [
      'verified-build-account-scope-2026-10-19.json',
      'verified-build-context-priority-2026-10-17.json',
      'verified-build-tool-names-2026-10-17.json',
      'verified-build-2026-10-17.json',
      'verified-build-2026-10-16.json',
    ].find((name) => existsSync(join(directory, name)));
  }
  if (!manifestName) throw Error('No reviewed production build');
  const manifest = JSON.parse(readFileSync(join(directory, manifestName), 'utf8'));
  const reviewName = manifest.sourceReview ?? 'reviewed-source-2026-10-16.json';
  if (!/^reviewed-source-[a-z0-9-]+\.json$/.test(reviewName))
    throw Error('Invalid source review pointer');
  return {
    manifestName,
    manifest,
    reviewName,
    reviewed: JSON.parse(readFileSync(join(directory, reviewName), 'utf8')),
  };
}
// UI refresh cannot approve new or modified Core/provider/Host/runtime code.
export function validateUiRefresh(reviewed, changes, sourceHash = hash) {
  const frozen = new Map(
    (reviewed.sources ?? []).filter((s) => !rendererSource(s.path)).map((s) => [s.path, s.sha256]),
  );
  for (const [file, sha256] of frozen)
    if (sourceHash(file) !== sha256)
      throw Error('Backend source changed; UI-only refresh refused: ' + file);
  for (const file of changedPaths(changes))
    if (!rendererSource(file) && !frozen.has(file))
      throw Error('Unreviewed non-UI change; UI-only refresh refused: ' + file);
  for (const source of reviewed.runtimeSources ?? [])
    if (sourceHash(source.path) !== source.sha256)
      throw Error('Runtime source changed; UI-only refresh refused: ' + source.path);
}
