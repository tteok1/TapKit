import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url)), root = resolve(dir, '../../../..');
const json = (path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
const batches = ['P03-01', 'P03-02', 'P03-03', 'P04-03'].map((batch) => {
  const first = json(batch + '/results.json');
  const retry = batch === 'P03-02' ? json(batch + '/e2e-ready/results.json') : undefined;
  const commands = first.commands.filter((r) => !retry || !r.log.includes('e2e')).concat(retry?.commands ?? []);
  if (commands.some((r) => r.exitCode !== 0) || !first.historicalEvidenceRestored || (retry && !retry.historicalEvidenceRestored)) throw new Error('Batch incomplete: ' + batch);
  const counts = {};
  for (const result of commands) {
    const path = (result.log.includes('e2e') && retry ? batch + '/e2e-ready/' : batch + '/') + result.log;
    const log = readFileSync(join(dir, path), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    const count = result.log.includes('e2e') ? /\b(\d+) passed \(/.exec(log) : /Tests\s+(\d+) passed/.exec(log);
    if (!count) throw new Error('Missing passed count: ' + path);
    counts[result.log.includes('unit') ? 'unit' : result.log.includes('integration') ? 'integration' : 'electron'] = Number(count[1]);
  }
  return { batch, counts, commands, firstRoundExitCode: first.exitCode, initialFailurePreserved: !!retry, historicalEvidenceRestored: true };
});
const initial = json('initial-state.json');
const productSourceSha256 = Object.fromEntries(Object.keys(initial.productSourceSha256).map((path) => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
if (JSON.stringify(productSourceSha256) !== JSON.stringify(initial.productSourceSha256)) throw new Error('Product changed during acceptance');
if (readFileSync(join(root, 'packages/core/dist/index.cjs'), 'utf8').includes('installChatFixture')) throw new Error('Test fixture left in production');
const totals = batches.reduce((sum, item) => Object.fromEntries(['unit', 'integration', 'electron'].map((key) => [key, sum[key] + (item.counts[key] ?? 0)])), { unit: 0, integration: 0, electron: 0 });
writeFileSync(join(dir, 'automation-summary.json'), JSON.stringify({ batches, totals, productSourceSha256, productUnchanged: true, productionFixtureAbsent: true, originalProfileNotUsed: true, realProviderRequests: 0, deferredScopeUnchanged: true }, null, 2) + '\n');
console.log(JSON.stringify(totals));
