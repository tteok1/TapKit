import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isMain, root } from './lib.mjs';

const blockedPath =
  /(?:^|\/)(?:\.env(?!\.example$)[^/]*|secrets|credentials\.json|id_(?:rsa|ed25519)|\.netrc|[^/]+\.(?:sqlite[0-9]*(?:-wal|-shm)?|db(?:-wal|-shm)?|pfx|p12|key))(?:\/|$)/i;
const credentialShapes = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|sk-(?:proj-|ant-api\d+-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b/,
];
export async function assertPublicFiles(base, paths, { bundle = false } = {}) {
  let scanned = 0;
  for (const path of paths) {
    if (
      isAbsolute(path) ||
      path.includes('\\') ||
      path.split('/').includes('..') ||
      blockedPath.test(path)
    )
      throw new Error('Release scan rejected a credential or profile path.');
    const full = join(base, path);
    const info = await lstat(full);
    if (!info.isFile()) throw new Error('Release scan rejected a link or non-file.');
    // The bundled third-party graph and runtime are locked distributions. Check
    // their paths above and scan first-party source, logs and built JS for credential shapes.
    if (bundle && /^(?:(?:\.runtime|\.cache|electron)\/|node_modules\/(?!@tapkit\/))/.test(path))
      continue;
    if (
      !/\.(?:[cm]?js|[cm]?ts|tsx|jsx|jsonl?|ya?ml|toml|md|txt|ps1|cmd|log|pem|map|css|html|py|rs)$/i.test(
        path,
      ) &&
      !/^(?:\.npmrc|\.env\.example)$/.test(path)
    )
      continue;
    const value = await readFile(full, 'utf8');
    if (credentialShapes.some((pattern) => pattern.test(value)))
      throw new Error('Release scan rejected credential-shaped content in ' + path);
    scanned++;
  }
  console.log(`Credential scan inspected ${paths.length} paths and ${scanned} text files.`);
}

if (isMain(import.meta.url)) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  ).split('\0');
  const candidates = [...new Set(paths)].filter(
    (path) => path && !/^(?:docs\/evidence\/|docs\/progress\/|\.agents\/|\.codex\/)/.test(path),
  );
  await assertPublicFiles(root, candidates);
  for (const path of process.argv.slice(2)) {
    if (!/^docs\/evidence\/P11-01\/[a-zA-Z0-9_.\/-]+$/.test(path) || path.split('/').includes('..'))
      throw new Error('Expected a P11-01 evidence file.');
    await assertPublicFiles(root, [path]);
  }
}
