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
    if (
      columns[2] !== task ||
      !['implemented_and_verified', 'implemented_not_live_verified'].includes(columns[3])
    )
      continue;
    for (const file of (columns[5] ?? '').split(';').filter(Boolean)) evidence.add(file);
  }
  if (
    ['implemented_and_verified', 'implemented_not_live_verified'].includes(status) &&
    !evidence.size
  )
    throw new Error('Completed task has no requirement evidence: ' + task);
  for (const match of handoff.matchAll(/docs\/evidence\/P\d{2}-\d{2}\/[A-Za-z0-9_.-]+/g))
    evidence.add(match[0]);
  for (const file of evidence) await access(join(root, file));
}
console.log(
  'All 37 task states, started handoffs and completed requirement evidence links verified',
);
