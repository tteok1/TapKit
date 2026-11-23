import { readFile, access } from 'node:fs/promises';
import { root } from './lib.mjs';
import { join } from 'node:path';
for (const file of ['INDEX.md', 'CURRENT.md', 'RESOURCES.md', 'requirements.csv'])
  await access(join(root, 'docs/progress', file));
const index = await readFile(join(root, 'docs/progress/INDEX.md'), 'utf8');
const rows = index.split('\n').filter((line) => /^\| P\d{2}-\d{2} /.test(line));
if (rows.length !== 37) throw new Error('Expected all 37 task rows');
const requirements = (await readFile(join(root, 'docs/progress/requirements.csv'), 'utf8'))
  .split('\n')
  .filter(Boolean);
const completed = new Set(['implemented_and_verified', 'implemented_not_live_verified']);
const taskIds = new Set(rows.map((row) => row.split('|')[1].trim()));
const requirementIds = new Set();
const paths = new Set();
for (const line of requirements.slice(1)) {
  const [id, scope, owner, status, tests, evidence, reference, notes] = line.trimEnd().split(',');
  if (requirementIds.has(id)) throw Error('Duplicate requirement: ' + id);
  requirementIds.add(id);
  if (status === 'deferred' && !notes) throw Error('Missing deferral reason: ' + id);
  if (!completed.has(status)) continue;
  if (!scope || !taskIds.has(owner) || !tests || !evidence || !reference)
    throw Error('Incomplete requirement mapping: ' + id);
  for (const file of evidence.split(';').filter(Boolean)) paths.add(file);
}
await Promise.all([...paths].map((file) => access(join(root, file))));
for (const row of rows) {
  const cells = row.split('|').map((cell) => cell.trim());
  const [task, status, path] = [cells[1], cells[4], cells[5]];
  if (status === 'not_started') continue;
  const handoff = await readFile(join(root, path), 'utf8');
  if (!handoff.includes(task) || !handoff.includes('status：' + status))
    throw new Error('Task status mismatch: ' + task);
  const evidence = new Set();
  for (const line of requirements) {
    const columns = line.split(',');
    if (columns[2] !== task || !completed.has(columns[3])) continue;
    for (const file of (columns[5] ?? '').split(';').filter(Boolean)) evidence.add(file);
  }
  if (completed.has(status) && !evidence.size)
    throw new Error('Completed task has no requirement evidence: ' + task);
  for (const match of handoff.matchAll(/docs\/evidence\/P\d{2}-\d{2}\/[A-Za-z0-9_.-]+/g))
    evidence.add(match[0]);
  for (const file of evidence) await access(join(root, file));
}
console.log(
  `All 37 task states, started handoffs and ${requirementIds.size} requirement mappings verified`,
);
