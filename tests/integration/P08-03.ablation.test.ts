import { test, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import gold from '../evals/delegation/gold.json';
import { delegationFixture } from './P08-03.fixture';
import { type DelegateResult, type PlanStepInput } from '../../packages/contracts/src';
import { StorageError } from '../../packages/storage/src';

test('P08-03 T15 ten cases times three same-root-budget single versus delegated operational ablation', async () => {
  const rows: {
    caseId: string;
    repetition: number;
    mode: string;
    budget: unknown;
    elapsedMs: number;
    calls: number;
    tools: number;
    quality: { supported: boolean; exact: boolean; failureDisclosed: boolean };
    fee: null;
    paidModelTokens: null;
    sourceSha256: string;
    status: string;
  }[] = [];
  const budget = { tokens: 32768, activeMs: 30000, maxCalls: 6, maxTools: 12 };
  for (const sample of gold.cases)
    for (let repetition = 1; repetition <= 3; repetition++)
      for (const mode of ['single', 'delegated'] as const) {
        const source = sample.a + '\n' + sample.b,
          records: Record<string, DelegateResult> = {};
        async function response(key: string): Promise<DelegateResult> {
          await new Promise((r) => setTimeout(r, 25));
          if (key === 'b' && 'failB' in sample) throw new StorageError('NETWORK_ERROR');
          const quote = key === 'a' ? sample.a : sample.b,
            start = source.indexOf(quote);
          return {
            conclusion: quote,
            evidence: [{ inputIndex: 0, start, end: start + quote.length, quote }],
            artifacts: [],
            actions: [],
            uncertainty: ['合成来源，未做外部核验'],
            incomplete: false,
          };
        }
        const f = await delegationFixture(
          { budgetOverrides: budget },
          source,
          async (_run, step) => {
            if (step.stepKey === 'a' || step.stepKey === 'b')
              try {
                records[step.stepKey] = await response(step.stepKey);
              } catch {
                records[step.stepKey] = {
                  conclusion: '未完成分支',
                  evidence: [],
                  artifacts: [],
                  actions: [],
                  uncertainty: ['网络失败'],
                  incomplete: true,
                };
              }
            return {
              text: '合成验收输出',
              finished: true,
              calls: [
                {
                  tool: 'artifact.write',
                  name: step.stepKey + '.md',
                  content: JSON.stringify(records),
                },
              ],
            };
          },
        );
        try {
          if (mode === 'delegated') {
            for (const key of ['a', 'b'])
              await f.add(key, {
                goal: '合成分支 ' + key,
                budget: { tokens: 8192, activeMs: 10000, maxCalls: 1, maxTools: 2 },
              });
            f.work.delegation.driver = async (_run, spec) => response(spec.key);
          } else {
            const steps: PlanStepInput[] = ['a', 'b', 'summary'].map((key, index) => ({
              stepKey: key,
              title: '合成步骤 ' + key,
              dependencies: index ? [['a', 'b'][index - 1]!] : [],
              inputRefs: [f.ref],
              outputContract: { kind: 'files', formats: ['md'] },
              acceptance: [],
              optional: false,
            }));
            f.work.repo.setSteps(f.parent(), steps);
            const state = f.work.repo.state(f.parent());
            state.selected = ['a', 'b', 'summary'];
            f.work.repo.save(f.parent(), state);
          }
          const started = performance.now();
          await f.start();
          await f.finished();
          const elapsedMs = performance.now() - started;
          const results =
            mode === 'single'
              ? Object.values(records)
              : (f.work.repo
                  .state(f.parent())
                  .delegateSummary?.flatMap((s) => (s.result ? [s.result] : [])) ?? []);
          const expected = [
            'failB' in sample ? sample.a : sample.a,
            ...('failB' in sample ? [] : [sample.b]),
          ];
          const quotes = results.flatMap((r) => r.evidence.map((e) => e.quote));
          const supported = expected.every((q) => quotes.includes(q));
          const exact = results.every((r) =>
            r.evidence.every((e) => source.slice(e.start, e.end) === e.quote),
          );
          const failureDisclosed =
            !('failB' in sample) ||
            (mode === 'single'
              ? results.some((r) => r.incomplete)
              : f.parent().status === 'partial');
          expect(supported && exact && failureDisclosed, sample.id + ' ' + mode).toBe(true);
          const usage = f.work.repo.rootUsage(f.parent());
          expect(usage.calls).toBeLessThanOrEqual(budget.maxCalls);
          expect(usage.tools).toBeLessThanOrEqual(budget.maxTools);
          rows.push({
            caseId: sample.id,
            repetition,
            mode,
            budget,
            elapsedMs,
            calls: usage.calls,
            tools: usage.tools,
            quality: { supported, exact, failureDisclosed },
            fee: null,
            paidModelTokens: null,
            sourceSha256: createHash('sha256').update(source).digest('hex'),
            status: f.parent().status,
          });
        } finally {
          await f.close();
        }
      }
  const summarize = (mode: string) => {
    const subset = rows.filter((r) => r.mode === mode);
    return {
      runs: subset.length,
      meanElapsedMs: subset.reduce((n, r) => n + r.elapsedMs, 0) / subset.length,
      calls: subset.reduce((n, r) => n + r.calls, 0),
      tools: subset.reduce((n, r) => n + r.tools, 0),
      qualityPassed: subset.filter((r) => Object.values(r.quality).every(Boolean)).length,
      fee: null,
    };
  };
  const report = {
    task: 'P08-03',
    scope: gold.scope,
    fixtureSha256: createHash('sha256').update(JSON.stringify(gold)).digest('hex'),
    repetitions: 3,
    cases: 10,
    rows,
    single: summarize('single'),
    delegated: summarize('delegated'),
    automaticDelegationEnabled: false,
    qualification:
      'Not qualified: deterministic synthetic responses and unknown paid fees cannot establish production quality or fee multiplier. Keep single-agent default; explicit delegation remains available.',
  };
  await mkdir('docs/evidence/P08-03', { recursive: true });
  await writeFile('docs/evidence/P08-03/ablation.json', JSON.stringify(report, null, 2) + '\n');
  expect(rows).toHaveLength(60);
}, 180000);
