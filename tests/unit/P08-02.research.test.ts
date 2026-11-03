import { test, expect } from 'vitest';
import archived from '../evals/research/archived-excerpt.json';
import { researchQuoteBlock } from '../../scripts/p08-research-markdown.mjs';
import {
  researchTools,
  researchArgumentIssue,
  researchCanonicalArgs,
  researchSelectionShape,
} from '../../packages/core/src/research-driver';
import { validArguments } from '../../packages/providers/src/api/arguments';
import { researchEvidenceCatalog, researchCloseoutReady } from '../../packages/workflows/src';
import { ApiKeyAdapter, type ZhipuToolTrace } from '../../packages/providers/src';
import { resolveApiConfig } from '../../packages/contracts/src';
import {
  accountId,
  modelRequest,
  memoryNative,
  sseFrames,
  events,
  collect,
} from '../fixtures/P01-02.api';
import {
  ResearchSpecSchema,
  ResearchProgressSchema,
  ResearchWorkToolArgsSchema,
  type ResearchSource,
} from '../../packages/contracts/src';
import {
  defaultResearchQuestions,
  researchQuery,
  canonicalResearchUrl,
  verifyResearchFinding,
  researchHash,
  renderResearchReport,
  researchQuality,
} from '../../packages/workflows/src';
const id = (n: number) => '0199b35d-9700-7000-8000-' + String(n).padStart(12, '0');
const spec = () =>
  ResearchSpecSchema.parse({
    topic: '合成研究',
    questions: [{ key: 'q1', text: '公开产品的发布日期是什么？' }],
  });
const source = (
  n = 1,
  host = 'first.example.com',
  text = '产品没有在2025年发布。',
): ResearchSource => ({
  id: id(n),
  kind: 'web',
  ref: { kind: 'web', sourceId: id(n), revision: 1 },
  questionKeys: ['q1'],
  title: '合成公开资料',
  url: 'https://' + host + '/page',
  canonical: 'https://' + host + '/page',
  contentHash: researchHash(text),
  fetchedAt: Date.parse('2026-10-31'),
  publishedAt: null,
  status: 'ready',
  excluded: false,
  error: null,
  truncated: false,
});
const fact = (s: ResearchSource, text = '产品没有在2025年发布。') => ({
  questionKey: 'q1',
  kind: 'fact',
  text,
  supports: [{ sourceId: s.id, quote: text }],
});
test('P08-02 live artifact verification checks exact quoted Markdown with HTML entities and line prefixes', () => {
  const text = '产品没有在2025年发布。\n条件：x < y & y > z。',
    s = source(1, 'first.example.com', text);
  const finding = verifyResearchFinding(
    fact(s, text),
    spec(),
    new Map([[s.id, { source: s, text }]]),
    id(10),
  );
  const markdown = renderResearchReport(
    spec(),
    ResearchProgressSchema.parse({ sources: [s], findings: [finding] }),
  ).markdown;
  expect(markdown).toContain(researchQuoteBlock(text));
  expect(markdown).not.toContain(researchQuoteBlock(text.replace('没有', '')));
  expect(researchQuoteBlock(text)).toContain('&lt; y &amp; y &gt;');
});
test('P08-02 archived failed live quote stays rejected while evidence selection restores the actual excerpt', () => {
  const text = archived.exactExcerpt,
    s = source(1, 'www.iana.org', text);
  const evidence = researchEvidenceCatalog(s, text);
  const excerpt = evidence.find((e) => e.quote.includes('Management'))!;
  expect(archived.rejectedExactInOriginal).toBe(false);
  expect(text).not.toContain(archived.rejectedQuote);
  expect(() =>
    verifyResearchFinding(
      fact(s, archived.rejectedQuote),
      spec(),
      new Map([[s.id, { source: s, text }]]),
      id(10),
    ),
  ).toThrow('QUOTE_NOT_IN_SOURCE');
  const selected = ResearchWorkToolArgsSchema.parse(
    researchCanonicalArgs(
      'research.record',
      { questionKey: 'q1', kind: 'fact', evidenceIds: [excerpt.id] },
      undefined,
      evidence,
    ),
  );
  if (selected.tool !== 'research.record') throw Error('record');
  const checked = verifyResearchFinding(
    selected.findings[0],
    spec(),
    new Map([[s.id, { source: s, text }]]),
    id(10),
  );
  expect(checked.text).toBe(excerpt.quote);
  expect(text.slice(checked.supports[0]!.start, checked.supports[0]!.end)).toBe(excerpt.quote);
  expect(checked.supports[0]!.quoteHash).toBe(researchHash(excerpt.quote));
});
test('P08-02 evidence handles retain negation, snapshot hash and literal offsets without model copying', () => {
  const text = '公开资料\n产品没有在2025年发布。\n发布日期仍然未知。',
    s = source(1, 'first.example.com', text);
  const evidence = researchEvidenceCatalog(s, text);
  const selected = evidence.find((e) => e.quote.includes('没有'))!;
  expect(selected).toBeDefined();
  expect(text.slice(selected.start, selected.end)).toBe(selected.quote);
  expect(selected.quoteHash).toBe(researchHash(selected.quote));
  expect(selected.contentHash).toBe(researchHash(text));
  const args = ResearchWorkToolArgsSchema.parse(
    researchCanonicalArgs(
      'research.record',
      {
        questionKey: 'q1',
        kind: 'fact',
        evidenceIds: [selected.id],
      },
      undefined,
      evidence,
    ),
  );
  expect(args).toMatchObject({
    findings: [
      {
        text: '产品没有在2025年发布。',
        supports: [{ sourceId: s.id, quote: '产品没有在2025年发布。' }],
      },
    ],
  });
  expect(researchEvidenceCatalog(s, text + '篡改')).toEqual([]);
  expect(
    researchEvidenceCatalog({ ...s, contentHash: researchHash(text + '新版') }, text + '新版').map(
      (e) => e.id,
    ),
  ).not.toContain(selected.id);
  for (const raw of [
    { questionKey: 'q2', kind: 'fact', evidenceIds: [selected.id] },
    { questionKey: 'q1', kind: 'fact', evidenceIds: ['e_0000000000000000'] },
  ])
    expect(() => researchCanonicalArgs('research.record', raw, undefined, evidence)).toThrow();
  expect(
    researchCanonicalArgs(
      'research.record',
      { questionKey: 'q1', evidenceIds: [selected.id], text: '产品在2025年发布。' },
      undefined,
      evidence,
    ),
  ).toMatchObject({ findings: [{ text: '产品没有在2025年发布。' }] });
});
test('P08-02 multiple selected excerpts become separate literal facts; only exact equal quotes share support', () => {
  const first = source(),
    second = source(2, 'other.example.net', '产品会在2026年发布。'),
    third = source(3, 'third.example.org');
  const items = [first, second, third].map((s) => ({
    source: s,
    text: s === second ? '产品会在2026年发布。' : '产品没有在2025年发布。',
  }));
  const evidence = items.flatMap((item) => researchEvidenceCatalog(item.source, item.text));
  const selected = ResearchWorkToolArgsSchema.parse(
    researchCanonicalArgs(
      'research.record',
      { questionKey: 'q1', kind: 'fact', evidenceIds: evidence.map((e) => e.id) },
      undefined,
      evidence,
    ),
  );
  if (selected.tool !== 'research.record') throw Error('record');
  expect(selected.findings).toHaveLength(2);
  const material = new Map(items.map((item) => [item.source.id, item]));
  const checked = selected.findings.map((f, i) =>
    verifyResearchFinding(f, spec(), material, id(10 + i)),
  );
  expect(checked.map((f) => f.distinctSourceGroups)).toEqual([2, 1]);
  expect(checked.map((f) => f.text)).toEqual(['产品没有在2025年发布。', '产品会在2026年发布。']);
  expect(
    researchQuality(
      spec(),
      ResearchProgressSchema.parse({ sources: [first, second, third], findings: checked }),
    ),
  ).toBe('partial');
});
test('P08-02 catalog never cuts a paragraph at the display boundary or invents sentence context', () => {
  const text = '  产品没有发布。\n下一段仍需核查。',
    s = source(1, 'first.example.com', text);
  const catalog = researchEvidenceCatalog(s, text, 0, 12);
  expect(catalog[0]?.quote).toBe('产品没有发布。');
  expect(researchEvidenceCatalog(s, text, 4, 5)).toEqual([]);
  expect(researchEvidenceCatalog({ ...s, status: 'unavailable' }, text)).toEqual([]);
  const long = '产品没有发布。'.repeat(260),
    longSource = source(1, 'first.example.com', long);
  for (const e of researchEvidenceCatalog(longSource, long)) {
    expect(e.quote.length).toBeLessThanOrEqual(1600);
    expect(long.slice(e.start, e.end)).toBe(e.quote);
  }
});
test('P08-02 closeout readiness preserves partial quality and requires every question to be covered', () => {
  const s = source(),
    other = source(2, 'other.example.net');
  const material = new Map(
    [s, other].map((s) => [s.id, { source: s, text: '产品没有在2025年发布。' }]),
  );
  const p = ResearchProgressSchema.parse({
    sources: [s, other],
    findings: [
      verifyResearchFinding(fact(s), spec(), material, id(10)),
      verifyResearchFinding(fact(other), spec(), material, id(11)),
    ],
  });
  expect(researchCloseoutReady(spec(), p)).toBe(true);
  expect(researchQuality(spec(), p)).toBe('partial');
  expect(renderResearchReport(spec(), p).markdown).toContain('尚未逐条交叉核验');
  expect(
    researchCloseoutReady(
      { ...spec(), questions: [...spec().questions, { key: 'q2', text: '未覆盖问题' }] },
      p,
    ),
  ).toBe(false);
  expect(researchCloseoutReady({ ...spec(), excludedSources: [other.id] }, p)).toBe(false);
  expect(
    researchCloseoutReady(
      spec(),
      ResearchProgressSchema.parse({
        findings: [
          {
            id: id(12),
            questionKey: 'q1',
            kind: 'gap',
            text: '尚无证据',
            supports: [],
            opposes: [],
            distinctSourceGroups: 0,
          },
        ],
      }),
    ),
  ).toBe(false);
});
test('P08-02 repair feedback names schema paths without retaining private fields or values', () => {
  const issue = researchArgumentIssue(
    'research.read',
    JSON.stringify({
      questionKey: 'q1',
      url: 'https://private-value.invalid',
      source: { kind: 'private-kind', 'private-field': 'private-value' },
    }),
  );
  expect(issue).toContain('source.kind:invalid_union');
  expect(issue).not.toMatch(/private|https/);
  expect(researchArgumentIssue('private-function', '{}')).not.toContain('private');
  expect(researchArgumentIssue('research.read', '{"secret":')).toContain('JSON不完整');
});

test('P08-02 research schemas accept complete arguments at the real API boundary', () => {
  const args: Record<string, unknown> = {
    'research.search': { questionKey: 'q1' },
    'research.read': { questionKey: 'q1', url: 'https://example.com/' },
    'research.record': { questionKey: 'q1', kind: 'fact', evidenceIds: ['e_0123456789abcdef'] },
    'research.report': {},
  };
  for (const tool of researchTools) {
    expect(validArguments(args[tool.name], tool.parameters), tool.name).toBe(true);
    expect(
      validArguments({ ...(args[tool.name] as object), arbitraryExtra: true }, tool.parameters),
      tool.name,
    ).toBe(false);
  }
});
test('P08-02 minimal model selection requires evidenceIds and defaults to literal facts', () => {
  const tool = researchTools.find((t) => t.name === 'research.record')!;
  expect(
    validArguments({ questionKey: 'q1', evidenceIds: ['e_0123456789abcdef'] }, tool.parameters),
  ).toBe(true);
  expect(
    validArguments(
      { questionKey: 'q1', kind: 'inference', text: '没有引用的推断' },
      tool.parameters,
    ),
  ).toBe(false);
  expect(validArguments({ questionKey: 'q1', evidenceIds: [id(1)] }, tool.parameters)).toBe(false);
  expect(
    validArguments({ questionKey: 'q1', supports: ['e_0123456789abcdef'] }, tool.parameters),
  ).toBe(false);
  const s = source(),
    evidence = researchEvidenceCatalog(s, '产品没有在2025年发布。');
  expect(
    researchCanonicalArgs(
      'research.record',
      { questionKey: 'q1', evidenceIds: [evidence[0]!.id] },
      undefined,
      evidence,
    ),
  ).toMatchObject({ findings: [{ kind: 'fact', text: '产品没有在2025年发布。' }] });
});
test('P08-02 literal evidence selections use the existing twelve-finding batch ceiling', () => {
  const text = Array.from({ length: 12 }, (_, i) => '第' + i + '条公开原文完整句。').join('\n'),
    s = source(1, 'first.example.com', text);
  const evidence = researchEvidenceCatalog(s, text),
    raw = { questionKey: 'q1', evidenceIds: evidence.map((e) => e.id) };
  const tool = researchTools.find((t) => t.name === 'research.record')!;
  expect(evidence).toHaveLength(12);
  expect(validArguments(raw, tool.parameters)).toBe(true);
  const args = ResearchWorkToolArgsSchema.parse(
    researchCanonicalArgs('research.record', raw, undefined, evidence),
  );
  expect(args.tool === 'research.record' && args.findings.length).toBe(12);
  expect(
    validArguments(
      { ...raw, evidenceIds: [...raw.evidenceIds, raw.evidenceIds[0]] },
      tool.parameters,
    ),
  ).toBe(false);
  expect(() =>
    researchCanonicalArgs(
      'research.record',
      { ...raw, kind: 'inference', text: '综合推断' },
      undefined,
      evidence,
    ),
  ).toThrow();
});
test('P08-02 selection diagnostics retain only whitelisted keys, types and match counts', () => {
  const s = source(),
    evidence = researchEvidenceCatalog(s, '产品没有在2025年发布。');
  const shape = researchSelectionShape(
    {
      questionKey: 'private-value',
      evidenceIds: [evidence[0]!.id, 'private-id'],
      kind: 'private-kind',
      'private-field': 'secret',
      findings: [{ questionKey: 'private-value', evidenceIds: ['secret'] }],
    },
    evidence,
  );
  expect(shape).toContain('ids=2;matched=1;kind=invalid');
  expect(shape).toContain('batch_keys=evidenceIds,questionKey');
  expect(shape).not.toMatch(/private|secret|e_[a-f0-9]{16}/);
});
test('P08-02 flat model records retain strict multi-quote Core validation and legacy internal batches', () => {
  const first = source(),
    second = source(2, 'other.example.net');
  const finding = {
    ...fact(first),
    supports: [...fact(first).supports, ...fact(second).supports],
    opposes: [],
  };
  const args = researchCanonicalArgs('research.record', finding);
  expect(ResearchWorkToolArgsSchema.parse(args)).toEqual({
    tool: 'research.record',
    findings: [finding],
  });
  expect(researchCanonicalArgs('research.record', { findings: [finding] })).toEqual(args);
  expect(
    ResearchWorkToolArgsSchema.safeParse(
      researchCanonicalArgs('research.record', { ...finding, arbitraryExtra: true }),
    ).success,
  ).toBe(false);
});
test('P08-02 flat model reads still require the complete strict Core source variant', () => {
  for (const raw of [
    { questionKey: 'q1', url: 'https://example.com/' },
    { questionKey: 'q1', sourceKind: 'file', fileId: id(1), versionId: id(2) },
    { questionKey: 'q1', sourceKind: 'candidate', queryIndex: 0, candidateIndex: 0 },
    { questionKey: 'q1', sourceKind: 'source', sourceId: id(1) },
  ])
    expect(
      ResearchWorkToolArgsSchema.safeParse(researchCanonicalArgs('research.read', raw)).success,
    ).toBe(true);
  for (const raw of [
    { questionKey: 'q1' },
    { questionKey: 'q1', url: 'https://example.com/', fileId: id(1) },
    { questionKey: 'q1', sourceKind: 'file', fileId: id(1) },
    { questionKey: 'q1', url: 'https://example.com/', arbitraryExtra: true },
  ])
    expect(
      ResearchWorkToolArgsSchema.safeParse(researchCanonicalArgs('research.read', raw)).success,
    ).toBe(false);
});

test('P08-02 missing candidate query indices resolve only from one applicable ready query', () => {
  const raw = { questionKey: 'q1', sourceKind: 'candidate', candidateIndex: 0 };
  const query = { questionKey: 'q1', status: 'ready', candidates: [{}] };
  const context = [{ ...query, questionKey: 'q2' }, query];
  expect(researchCanonicalArgs('research.read', raw, context)).toMatchObject({
    source: { kind: 'candidate', queryIndex: 1, candidateIndex: 0 },
  });
  for (const context of [[], [{ ...query, status: 'unavailable' }], [query, query]])
    expect(
      ResearchWorkToolArgsSchema.safeParse(researchCanonicalArgs('research.read', raw, context))
        .success,
    ).toBe(false);
  expect(researchCanonicalArgs('research.read', { ...raw, queryIndex: 0 }, context)).toMatchObject({
    source: { queryIndex: 0 },
  });
  expect(
    ResearchWorkToolArgsSchema.safeParse(
      researchCanonicalArgs('research.read', { ...raw, queryIndex: null }, context),
    ).success,
  ).toBe(false);
});

test.each([
  ['tool_name', 'private-unknown-function', '{}'],
  ['json', 'research_search', '{"questionKey":'],
  ['schema', 'research_search', '{"private-field":"trace-private-value"}'],
] as const)(
  'P08-02 safe API diagnostics distinguish %s without retaining model arguments',
  async (stage, name, args) => {
    const config = resolveApiConfig('openai-compatible', {
      apiFormat: 'openai-chat',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      modelId: 'glm-4.7-flashx',
    });
    const native = memoryNative(),
      records: ZhipuToolTrace[] = [];
    const frames = events('openai-chat', true, false, args).map((raw) => {
      const frame = structuredClone(raw) as any;
      if (frame?.choices?.[0]?.delta?.tool_calls)
        frame.choices[0].delta.tool_calls[0].function.name = name;
      return frame;
    });
    const channel = new ApiKeyAdapter(
      accountId,
      config,
      async () => 'fixture-key',
      native.store,
      async () => sseFrames(frames),
      (trace) => records.push(trace),
    );
    const result = await collect(channel, { ...modelRequest(config), tools: researchTools });
    expect(result.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED' } });
    expect(result.some((event) => event.type === 'tool_end')).toBe(false);
    expect(records[0]?.response.argumentFailure).toBe(stage);
    expect(JSON.stringify(records)).not.toMatch(
      /private-unknown-function|private-field|trace-private-value|fixture-key/,
    );
    expect(native.values.size).toBe(0);
  },
);

test('P08-02 public research tools cannot accept private query rewrites or host execution parameters', () => {
  for (const injected of [
    { query: '本地资料中的秘密' },
    { script: 'process.exit()' },
    { projectId: id(9) },
  ])
    expect(
      ResearchWorkToolArgsSchema.safeParse({
        tool: 'research.search',
        questionKey: 'q1',
        ...injected,
      }).success,
    ).toBe(false);
  expect(defaultResearchQuestions('主题')).toHaveLength(3);
  expect(researchQuery(spec(), 'q1', 1)).toBe('合成研究 公开产品的发布日期是什么？');
  expect(researchQuery(spec(), 'q1', 3)).toBe('合成研究 公开产品的发布日期是什么？ 差异 局限');
  expect(() => researchQuery(spec(), 'q1', 4)).toThrow();
  expect(() => researchQuery(spec(), 'hidden-local-question', 1)).toThrow();
});
test('P08-02 fact validation preserves negation and sentence context, not just a matching source ID', () => {
  for (const quote of ['5万元。', '总金额为1.']) {
    const decimal = source(9, 'decimal.example.com', '总金额为1.5万元。');
    expect(() =>
      verifyResearchFinding(
        fact(decimal, quote),
        spec(),
        new Map([[decimal.id, { source: decimal, text: '总金额为1.5万元。' }]]),
        id(10),
      ),
    ).toThrow('SENTENCE_CONTEXT');
  }
  const s = source(),
    material = new Map([[s.id, { source: s, text: '产品没有在2025年发布。' }]]);
  expect(verifyResearchFinding(fact(s), spec(), material, id(3)).supports[0]).toMatchObject({
    start: 0,
    end: 13,
  });
  expect(() =>
    verifyResearchFinding({ ...fact(s), text: '产品在2025年发布。' }, spec(), material, id(3)),
  ).toThrow('VERBATIM');
  expect(() => verifyResearchFinding(fact(s, '在2025年发布。'), spec(), material, id(3))).toThrow(
    'SENTENCE_CONTEXT',
  );
  expect(() =>
    verifyResearchFinding(fact(s, '产品在2026年发布。'), spec(), material, id(3)),
  ).toThrow('QUOTE_NOT_IN_SOURCE');
});
test('P08-02 excluded, inaccessible and undated sources cannot silently support new dated conclusions', () => {
  const s = source();
  for (const invalid of [
    { ...s, excluded: true },
    { ...s, status: 'unavailable' as const },
  ])
    expect(() =>
      verifyResearchFinding(
        fact(invalid),
        spec(),
        new Map([[s.id, { source: invalid, text: '产品没有在2025年发布。' }]]),
        id(3),
      ),
    ).toThrow('NOT_USABLE');
  const dated = ResearchSpecSchema.parse({
    ...spec(),
    dates: { from: '2025-01-01', to: '2025-12-31' },
  });
  expect(() =>
    verifyResearchFinding(
      fact(s),
      dated,
      new Map([[s.id, { source: s, text: '产品没有在2025年发布。' }]]),
      id(3),
    ),
  ).toThrow('NOT_USABLE');
  const published = { ...s, publishedAt: Date.parse('2025-05-01') };
  expect(
    verifyResearchFinding(
      fact(s),
      dated,
      new Map([[s.id, { source: published, text: '产品没有在2025年发布。' }]]),
      id(3),
    ).kind,
  ).toBe('fact');
});
test('P08-02 contradictory sources stay separate, and a model inference cannot invent a date', () => {
  const a = source(),
    b = source(2, 'second.example.net', '产品在2025年发布。');
  const material = new Map([
    [a.id, { source: a, text: '产品没有在2025年发布。' }],
    [b.id, { source: b, text: '产品在2025年发布。' }],
  ]);
  const finding = verifyResearchFinding(
    {
      ...fact(a),
      kind: 'conflict',
      text: '两份资料的说法不同，需要继续核对。',
      opposes: [{ sourceId: b.id, quote: '产品在2025年发布。' }],
    },
    spec(),
    material,
    id(3),
  );
  expect(finding.distinctSourceGroups).toBe(2);
  expect(finding.opposes[0]?.sourceId).toBe(b.id);
  expect(() =>
    verifyResearchFinding(
      { ...fact(a), kind: 'inference', text: '因此产品在2026年发布。' },
      spec(),
      material,
      id(3),
    ),
  ).toThrow('UNSUPPORTED_NUMBER');
});
test('P08-02 no-answer and early-ended reports remain partial and disclose missing evidence', () => {
  const progress = ResearchProgressSchema.parse({});
  expect(researchQuality(spec(), progress)).toBe('partial');
  const report = renderResearchReport(spec(), progress);
  expect(report.markdown).toContain('尚无可核验的结论');
  expect(report.markdown).toContain('部分成果');
  expect(report.markdown).not.toContain('https://');
  progress.earlyFinish = true;
  expect(renderResearchReport(spec(), progress).quality).toBe('partial');
});
test('P08-02 subdomains are not counted as independent evidence and report text cannot inject HTML', () => {
  const a = source(),
    b = source(2, 'second.example.com');
  const progress = ResearchProgressSchema.parse({
    sources: [a, b],
    findings: [
      verifyResearchFinding(
        fact(a),
        spec(),
        new Map([[a.id, { source: a, text: '产品没有在2025年发布。' }]]),
        id(3),
      ),
    ],
  });
  expect(researchQuality(spec(), progress)).toBe('partial');
  expect(
    renderResearchReport({ ...spec(), topic: '<img src=x onerror=alert(1)>' }, progress).markdown,
  ).not.toContain('<img');
  expect(canonicalResearchUrl('https://EXAMPLE.com/a?b=2&a=1#old')).toBe(
    'https://example.com/a?a=1&b=2',
  );
});
