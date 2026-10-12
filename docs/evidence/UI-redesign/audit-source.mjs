import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';

const files = [
  'apps/desktop/src/renderer/src/desktop-shell.tsx',
  'apps/desktop/src/renderer/src/desktop-settings.tsx',
  'apps/desktop/src/renderer/src/chat-surface.tsx',
  'apps/desktop/src/renderer/src/history-ui.tsx',
];
const controls = new Set(['button', 'input', 'select', 'textarea', 'details', 'summary', 'Route']);
function inspect(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const counts = {}, events = [], commands = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXOpeningElement') {
      const name = node.name.name;
      if (controls.has(name)) counts[name] = (counts[name] ?? 0) + 1;
    }
    if (node.type === 'JSXAttribute' && /^on[A-Z]/.test(node.name.name)) {
      events.push(JSON.stringify(node, (key, value) => ['start', 'end', 'loc', 'extra'].includes(key) ? undefined : value));
    }
    if (node.type === 'StringLiteral' && /^(sessions|messages|inputs|drafts|projects|files|sidebar|memory|context|models|settings|chat)\./.test(node.value)) commands.push(node.value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return { counts, events, commands: commands.sort() };
}
const results = files.map((file) => {
  const before = inspect(execFileSync('git', ['show', '5268fc0:' + file], { encoding: 'utf8', windowsHide: true }));
  const after = inspect(readFileSync(file, 'utf8'));
  const remaining = [...after.events];
  const missingEvents = before.events.filter((event) => {
    const index = remaining.indexOf(event);
    if (index < 0) return true;
    remaining.splice(index, 1); return false;
  }).length;
  return { file, originalControls: before.counts, currentControls: after.counts, missingEvents,
    commandsUnchanged: JSON.stringify(before.commands) === JSON.stringify(after.commands) };
});
const changed = execFileSync('git', ['diff', '--name-only', '5268fc0'], { encoding: 'utf8', windowsHide: true }).trim().split('\n');
const backendChanges = changed.filter((path) => /^(apps\/desktop\/src\/(main|preload)\/|packages\/(core|storage|providers|contracts|context|retrieval|tools|network|workflows)\/|native\/)/.test(path));
const report = { baseline: '5268fc03c822388d26cd0a4cf7f157f9a6b3ae1c', backendChanges, results,
  note: 'Static inventory supplements actual Electron regressions; it does not replace functional testing.' };
writeFileSync('docs/evidence/UI-redesign/source-boundary.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (backendChanges.length || results.some((r) => r.missingEvents || !r.commandsUnchanged || Object.entries(r.originalControls).some(([name, count]) => (r.currentControls[name] ?? 0) < count))) process.exitCode = 1;
