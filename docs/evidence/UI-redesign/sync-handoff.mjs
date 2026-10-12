import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const baseline = '5268fc03c822388d26cd0a4cf7f157f9a6b3ae1c';
const evidence = 'docs/evidence/UI-redesign/';
const csvPath = 'docs/progress/requirements.csv';
const csv = readFileSync(csvPath, 'utf8');
const extraIds = new Set([
  ...Array.from({ length: 10 }, (_, i) => `FR-15-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 6 }, (_, i) => `FR-15-T${String(i + 1).padStart(2, '0')}`),
  'FR-04-001', 'FR-05-001', 'FR-06-001', 'FR-12-001', 'FR-13-001', 'FR-29-010',
]);
const selected = [];
const seenExtra = new Set();
const addField = (value, addition) => value.split(';').includes(addition) ? value : value + (value ? ';' : '') + addition;
const lines = csv.split(/\r?\n/).map((line) => {
  if (!line) return line;
  const columns = line.split(',');
  if (columns[2] !== 'P02-01' && !extraIds.has(columns[0])) return line;
  if (columns.length !== 8) throw new Error('Unexpected CSV shape: ' + columns[0]);
  selected.push({ id: columns[0], owner: columns[2], status: columns[3] });
  if (extraIds.has(columns[0])) seenExtra.add(columns[0]);
  columns[4] = addField(columns[4], 'UI-01.frontend-local');
  columns[5] = addField(addField(columns[5], evidence + 'coverage.md'), evidence + 'results.json');
  columns[7] = addField(columns[7], '2026-10-12 UI-01仅视觉修订本地通过；原功能和live状态保持；后端未改；codex/ui-redesign未提交');
  return columns.join(',');
});
if (seenExtra.size !== extraIds.size) throw new Error('Missing selected requirement IDs');
writeFileSync(csvPath, lines.join(csv.includes('\r\n') ? '\r\n' : '\n'));

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const changed = [...new Set([
  ...git('diff', '--name-only', baseline).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean))].sort();
const source = changed.filter((path) => /^(apps\/|packages\/|tests\/e2e\/)/.test(path));
const backend = changed.filter((path) => /^(apps\/desktop\/src\/(main|preload)\/|packages\/(core|storage|providers|contracts|context|retrieval|tools|network|workflows)\/|native\/)/.test(path));
if (backend.length) throw new Error('Backend changes: ' + backend.join(';'));
const checksPassed = process.argv.includes('--final-checks-pass');
const report = {
  task: 'UI-01',
  scope: 'Supplementary local frontend redesign; original 37 task/live statuses unchanged',
  date: '2026-10-12',
  timezone: 'Asia/Shanghai',
  baseline,
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  initialWorktree: 'clean',
  currentWorktree: 'uncommitted',
  commitPushMerge: false,
  backendChanges: backend,
  routesRetained: 13,
  sourceInventory: 'source-boundary.json',
  commands: [
    { command: 'pnpm build:desktop', exitCode: 0, log: 'build-first.log', note: 'Later Electron runs also restore the production build, including ui-final.log.' },
    { command: 'renderer tsc --noEmit', exitCode: 0, log: 'typecheck-first.log' },
    { command: 'pnpm test:unit', exitCode: 0, passed: 293, log: 'unit.log' },
    { command: 'pnpm test:integration P02-01.desktop P03-02.artifacts P03-03.projects P04-03.memory', exitCode: 0, passed: 45, log: 'integration.log' },
    { command: 'pnpm test:e2e', exitCode: 0, passed: 67, log: 'e2e-final.log', note: 'Full suite on compact-composer snapshot before the final visual-only review fixes.' },
    { command: "pnpm test:e2e -- --grep 'P02-01 UI'", exitCode: 0, passed: 5, log: 'ui-final.log', note: 'Final source: routes/settings/preview/input, normal and 200% dialog geometry, dark theme, actual primary-action hover/keyboard contrast and successful Save.' },
    { command: 'pnpm check', exitCode: checksPassed ? 0 : null, log: 'check-handoff.log' },
    { command: 'pnpm docs:check', exitCode: checksPassed ? 0 : null, log: 'docs-handoff.log' },
    { command: 'git diff --check', exitCode: checksPassed ? 0 : null, log: 'diff-handoff.log' },
  ],
  runtime: 'Repository-pinned Node v24.21.0 and cached pnpm 12.4.1; unrelated PATH pnpm not used',
  nativeUI: 'Actual isolated Electron windows; synthetic profiles; animation timing disabled for capture; no live model or credential access',
  screenshots: readdirSync(evidence).filter((name) => name.endsWith('.png')).sort(),
  review: {
    initial: 'recapture: invalid zoom framing rejected; actual input layout corrected',
    newFull: '38 valid primary captures plus named regression states reviewed; three visual findings corrected',
    final: 'All three scored findings resolved; ship limited to scored-fix scope',
    additional: 'Primary Save hover finding corrected and recaptured; separately scored resolved with ship limited to that finding',
    record: 'review.md',
  },
  failureHistory: ['visual-first.log', 'zoom-recapture.log', 'e2e-regression.log'],
  historicalEvidence: 'Original tracked phase screenshots restored byte-for-byte to baseline; new regression captures archived separately with SHA256 in regression-archive.json',
  designDocumentation: { files: ['DESIGN.md', '.impeccable/design.json'], roles: 32, previews: 10, documenterValidationExitCode: 0 },
  requirements: { count: selected.length, entries: selected, statusChanges: 0, note: 'Only UI evidence/test tag/notes appended; all prior scope/status/code references retained.' },
  sourceSha256: Object.fromEntries(source.map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
};
writeFileSync(evidence + 'results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ branch: report.branch, backendChanges: backend, requirements: selected.length, sources: source.length, screenshots: report.screenshots.length, finalChecksPassed: checksPassed }));
