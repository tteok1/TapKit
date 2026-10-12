import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('.');
const paths = execFileSync('git', ['diff', '--name-only', '--', 'docs/evidence'], { encoding: 'utf8', windowsHide: true }).trim().split('\n').filter((path) => path.endsWith('.png') && !path.startsWith('docs/evidence/UI-redesign/'));
const manifestPath = 'docs/evidence/UI-redesign/regression-archive.json';
const records = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).records : [];
for (const path of paths) {
  const source = resolve(root, path);
  if (relative(root, source).startsWith('..')) throw new Error('Invalid evidence path');
  const fresh = readFileSync(source);
  const destination = join(root, 'docs/evidence/UI-redesign/regression', path.slice('docs/evidence/'.length));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, fresh);
  const original = execFileSync('git', ['show', '5268fc0:' + path], { windowsHide: true });
  writeFileSync(source, original);
  records.push({ originalPath: path, freshPath: relative(root, destination).replaceAll('\\', '/'), freshSha256: createHash('sha256').update(fresh).digest('hex'), restoredSha256: createHash('sha256').update(original).digest('hex') });
}
const newCaptures = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'docs/evidence'], {encoding: 'utf8', windowsHide: true}).trim().split('\n').filter((path) => /^docs\/evidence\/P\d{2}-\d{2}\/.+\.png$/.test(path));
for (const path of newCaptures) {
  const source = resolve(root, path);
  if (relative(root, source).startsWith('..') || !source.startsWith(join(root, 'docs/evidence') + '\\')) throw new Error('Invalid new capture path');
  const fresh = readFileSync(source);
  const destination = join(root, 'docs/evidence/UI-redesign/regression', path.slice('docs/evidence/'.length));
  mkdirSync(dirname(destination), {recursive: true});
  writeFileSync(destination, fresh);
  records.push({originalPath: path, freshPath: relative(root, destination).replaceAll('\\', '/'), freshSha256: createHash('sha256').update(fresh).digest('hex'), wasUntrackedTestOutput: true});
  unlinkSync(source);
}
const uniqueRecords = [...new Map(records.map((record) => [record.originalPath, record])).values()];
writeFileSync(manifestPath, JSON.stringify({ baseline: '5268fc0', reason: 'Preserve historical captures; new UI regression captures are stored separately. These are functional-state captures; use primary UI-redesign captures for final layout after review fixes.', records: uniqueRecords }, null, 2) + '\n');
console.log('Archived ' + uniqueRecords.length + ' unique regression captures; clean-baseline historical files preserved.');
