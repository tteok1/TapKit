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
const reviewableText =
  /\.(?:[cm]?js|[cm]?ts|tsx|jsx|jsonl?|ya?ml|toml|md|txt|ps1|cmd|log|pem|map|css|html|py|rs)$/i;
const scanText = (path) => reviewableText.test(path) || /^(?:\.npmrc|\.env\.example)$/.test(path);
const hasCredentialShape = (value) => credentialShapes.some((pattern) => pattern.test(value));

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
    if (!scanText(path)) continue;
    const value = await readFile(full, 'utf8');
    if (hasCredentialShape(value))
      throw new Error('Release scan rejected credential-shaped content in ' + path);
    scanned++;
  }
  console.log(`Credential scan inspected ${paths.length} paths and ${scanned} text files.`);
}

const historyBatchBytes = 24 * 1024 * 1024;
export function auditReleaseHistory(cwd) {
  const git = (args, options = {}) =>
    execFileSync('git', args, { cwd, maxBuffer: 48 * 1024 * 1024, windowsHide: true, ...options });
  if (git(['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true')
    throw Error('Full reachable Git history is required for release review.');
  const objects = git(['rev-list', '--objects', 'HEAD'], { encoding: 'utf8' })
    .trimEnd()
    .split('\n');
  const names = new Map();
  let pathFindings = 0;
  for (const entry of objects) {
    const sep = entry.indexOf(' ');
    if (sep < 0) continue;
    const path = entry.slice(sep + 1);
    if (blockedPath.test(path)) pathFindings++;
    if (scanText(path)) names.set(entry.slice(0, sep), path);
  }
  const rows = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    input: [...names.keys()].join('\n') + '\n',
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  let textBlobs = 0;
  let credentialFindings = 0;
  let oversizedTextBlobs = 0;
  let batch = [];
  let batchBytes = 0;
  function inspectBatch() {
    if (!batch.length) return;
    const raw = git(['cat-file', '--batch'], {
      input: batch.map(({ hash }) => hash).join('\n') + '\n',
    });
    let offset = 0;
    for (const { hash, size } of batch) {
      const header = raw.indexOf(0x0a, offset);
      if (raw.toString('ascii', offset, header) !== hash + ' blob ' + size)
        throw Error('Git history object list changed during review.');
      const end = header + 1 + size;
      if (hasCredentialShape(raw.toString('utf8', header + 1, end))) credentialFindings++;
      offset = end + 1;
      textBlobs++;
    }
    batch = [];
    batchBytes = 0;
  }
  for (const row of rows) {
    const [hash, type, sizeText] = row.split(' ');
    if (type !== 'blob') continue;
    const size = Number(sizeText);
    if (size > historyBatchBytes) {
      oversizedTextBlobs++;
      continue;
    }
    if (batchBytes + size + 150 > historyBatchBytes) inspectBatch();
    batch.push({ hash, size });
    batchBytes += size + 150;
  }
  inspectBatch();
  return { textBlobs, pathFindings, credentialFindings, oversizedTextBlobs };
}

if (isMain(import.meta.url)) {
  if (process.argv[2] === '--history' && process.argv.length === 3) {
    const audit = auditReleaseHistory(root);
    console.log(JSON.stringify(audit));
    if (audit.pathFindings || audit.credentialFindings || audit.oversizedTextBlobs)
      process.exitCode = 1;
  } else {
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
      if (
        !/^docs\/evidence\/P11-01\/[a-zA-Z0-9_.\/-]+$/.test(path) ||
        path.split('/').includes('..')
      )
        throw new Error('Expected a P11-01 evidence file.');
      await assertPublicFiles(root, [path]);
    }
  }
}
