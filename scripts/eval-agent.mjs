import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { availableParallelism, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { root, nodeExe, lockedEnv } from './lib.mjs';

const output = join(root, 'test-results/P11-01');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'eval-'));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const suite = await readJson(join(root, 'tests/evals/P11-01.json'));
const gold = await readJson(join(root, 'tests/evals/retrieval/gold.json'));
const heldOut = suite.retrieval.map((id) => gold.cases.find((sample) => sample.id === id));
const counts = { chat: 10, context: 10, work: 10, research: 5, coding: 5, authorization: 5 };
if (
  suite.schemaVersion !== 1 ||
  heldOut.length !== 15 ||
  new Set(suite.retrieval).size !== 15 ||
  heldOut.some((sample) => !sample) ||
  Object.keys(suite.cases).length !== Object.keys(counts).length ||
  Object.entries(counts).some(([group, count]) => suite.cases[group]?.length !== count)
)
  throw new Error('Invalid P11-01 retained regression set');

const runCases = Object.entries(counts).flatMap(([group]) =>
  suite.cases[group].map(([file, title, input, expected], index) => ({
    id: group + '-' + String(index + 1).padStart(2, '0'),
    group,
    file: 'tests/integration/' + file + '.test.ts',
    title,
    input,
    expected,
  })),
);
const standalone = ['P04-01.retrieval', 'P08-03.ablation', 'P11-01.work-fallback'];
const filters = [...new Set([...runCases.map((sample) => sample.file), ...standalone])];
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const reportPath = join(directory, 'vitest.json');
const result = spawnSync(
  nodeExe(),
  [
    join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
    'test:integration',
    ...filters,
    '--reporter=json',
    '--outputFile=' + reportPath,
  ],
  {
    cwd: root,
    env: lockedEnv({ TAPKIT_P11_EVAL_DIR: directory }),
    stdio: 'inherit',
    windowsHide: true,
    timeout: 900_000,
  },
);
const report = await readJson(reportPath).catch(() => ({ testResults: [] }));
const usedAssertions = new Set();
const cases = await Promise.all(
  runCases.map(async ({ file, title, ...sample }) => {
    const testFile = report.testResults.find((item) =>
      item.name.replaceAll('\\', '/').endsWith('/' + file),
    );
    const assertions =
      testFile?.assertionResults.filter((item) => item.title.includes(title)) ?? [];
    const [assertion] = assertions;
    const key = file + ':' + assertion?.fullName;
    const matched = assertions.length === 1 && !usedAssertions.has(key);
    if (matched) usedAssertions.add(key);
    return {
      ...sample,
      unacceptable: '违反预期判据：' + sample.expected,
      scorer: { file, title: assertion?.fullName ?? title },
      fixtureSha256: sha256(await readFile(join(root, file))),
      budget: { paidRequests: 0 },
      status: matched ? assertion.status : 'unscored',
    };
  }),
);
const retrieval = await readJson(join(directory, 'gold-report.json')).catch(() => null);
const ablation = await readJson(join(directory, 'ablation.json')).catch(() => null);
for (const sample of heldOut) {
  const row = retrieval?.results.find((entry) => entry.id === sample.id);
  const passed =
    row &&
    (sample.expected
      ? row.recalledAt20 && row.topCitationSupported && row.located === row.hits && row.hits > 0
      : row.hits === 0);
  cases.push({
    id: 'retrieval-' + sample.id,
    group: 'retrieval',
    input: sample.query,
    expected: sample.expected ? sample.text : '当前资料无答案',
    unacceptable: sample.expected ? '未召回指定来源或引用不可定位' : '虚构来源',
    scorer: { file: 'tests/integration/P04-01.retrieval.test.ts', title: sample.id },
    fixtureSha256: sha256(JSON.stringify(sample)),
    budget: { paidRequests: 0, recallDepth: 20 },
    status: row ? (passed ? 'passed' : 'failed') : 'unscored',
  });
}
const selected = cases.filter((sample) => sample.group === 'retrieval');
const passed =
  result.status === 0 &&
  cases.length === 60 &&
  cases.every((sample) => sample.status === 'passed') &&
  ablation?.rows.length === 60;
const summary = {
  task: 'P11-01',
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  source: {
    commit: git('rev-parse', 'HEAD'),
    trackedDiffSha256: sha256(
      git('diff', 'HEAD', '--', 'scripts', 'tests', 'packages', 'apps', 'package.json'),
    ),
    retainedSetSha256: sha256(JSON.stringify([suite, heldOut])),
  },
  os: {
    platform: process.platform,
    version: release(),
    availableParallelism: availableParallelism(),
    ramBytes: totalmem(),
  },
  model: { language: 'deterministic fixture streams', embedder: retrieval?.modelRevision ?? null },
  promptVersion: sha256(await readFile(join(root, 'packages/core/src/chat-fixture.ts'))),
  usage: { source: 'offline fixtures', paidRequests: 0, providerTokens: null, providerCost: null },
  offlineRegression: { status: passed ? 'passed' : 'failed', runnerExitCode: result.status, cases },
  retrieval: {
    retainedCases: selected.length,
    totalBenchmarkCases: retrieval?.results.length ?? 0,
    recallAt20: retrieval?.recallAt20 ?? null,
    citationSupportRate: retrieval?.citationSupportRate ?? null,
    locatableRate: retrieval?.locatableRate ?? null,
    noAnswerInventedSources: retrieval?.noAnswerInventedSources ?? null,
  },
  delegation: ablation
    ? { single: ablation.single, delegated: ablation.delegated, automaticDelegationEnabled: false }
    : null,
  productionQuality: {
    status: 'not_verified',
    semanticAnswerPassRate: null,
    modelToolCompletionRate: null,
    modelJudgeCalibration: 'not_run',
    resources: ['R01', 'R02', 'R03', 'R04', 'R05', 'R08'],
  },
};
await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(
  `P11-01 offline: ${cases.filter((sample) => sample.status === 'passed').length}/60. Report: ${directory}`,
);
if (!passed) process.exitCode = 1;
