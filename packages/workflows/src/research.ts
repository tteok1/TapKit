import { createHash } from 'node:crypto';
import {
  ResearchFindingInputSchema,
  ResearchSpecSchema,
  type ResearchSpec,
  type ResearchSource,
  type ResearchFinding,
  type ResearchProgress,
} from '@tapkit/contracts';

export const researchHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function defaultResearchQuestions(topic: string) {
  return ['事实与背景', '证据与不同观点', '适用范围和局限'].map((part, i) => ({
    key: 'q' + (i + 1),
    text: (topic + '：' + part).slice(0, 500),
  }));
}
export function researchQuery(spec: ResearchSpec, questionKey: string, round: number) {
  const question = spec.questions.find((q) => q.key === questionKey);
  if (!question || round < 1 || round > 3) throw Error('QUESTION_OR_ROUND_INVALID');
  return (
    spec.topic.slice(0, 400) +
    ' ' +
    question.text +
    ['', ' 官方 数据', ' 差异 局限'][round - 1]
  ).slice(0, 1000);
}
export function canonicalResearchUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw Error('PUBLIC_URL_REQUIRED');
  url.hash = '';
  url.searchParams.sort();
  return url.href;
}
export function researchUrlAllowed(spec: ResearchSpec, raw: string) {
  try {
    const host = new URL(canonicalResearchUrl(raw)).hostname.toLowerCase();
    const matches = (d: string) => host === d || host.endsWith('.' + d);
    return (
      (!spec.includeDomains.length || spec.includeDomains.some(matches)) &&
      !spec.excludeDomains.some(matches)
    );
  } catch {
    return false;
  }
}
export function researchSourceUsable(spec: ResearchSpec, source: ResearchSource) {
  if (source.status !== 'ready' || source.excluded || spec.excludedSources.includes(source.id))
    return false;
  if (
    source.kind === 'web' &&
    (!spec.webEnabled || !source.url || !researchUrlAllowed(spec, source.url))
  )
    return false;
  if (
    source.kind === 'file' &&
    (source.ref?.kind !== 'file' ||
      !spec.localVersions.some(
        (v) =>
          source.ref?.kind === 'file' &&
          v.fileId === source.ref.fileId &&
          v.versionId === source.ref.versionId,
      ))
  )
    return false;
  if (spec.dates.from || spec.dates.to) {
    if (source.publishedAt === null) return false;
    const day = new Date(source.publishedAt).toISOString().slice(0, 10);
    if ((spec.dates.from && day < spec.dates.from) || (spec.dates.to && day > spec.dates.to))
      return false;
  }
  return true;
}
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const publisher = (source: ResearchSource) =>
  source.kind === 'web'
    ? new URL(source.url!).hostname.split('.').slice(-2).join('.')
    : source.ref?.kind === 'file'
      ? 'file:' + source.ref.fileId
      : source.canonical;
export type ResearchEvidence = {
  id: string;
  sourceId: string;
  contentHash: string;
  questionKeys: string[];
  start: number;
  end: number;
  quoteHash: string;
  quote: string;
};
/** Handles bind exact complete excerpts to an immutable read snapshot, never search snippets. */
export function researchEvidenceCatalog(
  source: ResearchSource,
  text: string,
  offset = 0,
  allowance = 8000,
): ResearchEvidence[] {
  if (source.status !== 'ready' || source.contentHash !== researchHash(text)) return [];
  const result: ResearchEvidence[] = [];
  let used = 0;
  for (const paragraph of text.matchAll(/[^\r\n]+/g)) {
    const parts =
      paragraph[0].length <= 1600
        ? [{ value: paragraph[0], start: paragraph.index }]
        : [
            ...paragraph[0].matchAll(/[^。！？.!?]+[。！？.!?](?:\s+|$)|[^。！？.!?]+[。！？]/g),
          ].map((part) => ({ value: part[0], start: paragraph.index + part.index }));
    for (const part of parts) {
      const quote = part.value.trim(),
        start = part.start + part.value.indexOf(quote);
      if (start < offset || start >= offset + allowance || quote.length < 4 || quote.length > 1600)
        continue;
      const end = start + quote.length;
      if (text.indexOf(quote) !== start) continue;
      // Match the same boundary rule as fact verification, including duplicate-text offsets.
      const prefix = text.slice(0, start),
        suffix = text.slice(end);
      if (
        (prefix.trim() && !/(?:\n\s*|[。！？]\s*|[.!?]\s+)$/.test(prefix)) ||
        (suffix.trim() &&
          !/[。！？]$/.test(quote) &&
          !(/[.!?]$/.test(quote) && /^\s/.test(suffix)) &&
          !/^\s*\n/.test(suffix))
      )
        continue;
      if (used + quote.length > allowance || result.length >= 24) continue;
      const quoteHash = researchHash(quote);
      result.push({
        id:
          'e_' +
          researchHash(
            JSON.stringify([source.id, source.contentHash, start, end, quoteHash]),
          ).slice(0, 16),
        sourceId: source.id,
        contentHash: source.contentHash!,
        questionKeys: source.questionKeys,
        start,
        end,
        quoteHash,
        quote,
      });
      used += quote.length;
    }
  }
  return result;
}

/** A closeout threshold, not a truth or complete-quality verdict. */
export function researchCloseoutReady(spec: ResearchSpec, progress: ResearchProgress) {
  return spec.questions.every((q) => {
    const findings = progress.findings.filter((f) => f.questionKey === q.key);
    // A gap may release a discovery phase; it is not proof that further approved
    // sources have been exhausted. Explicit report/budget closeout remains available.
    const groups = new Set<string>();
    for (const finding of findings.filter((f) => f.kind === 'fact' || f.kind === 'conflict'))
      for (const quote of [...finding.supports, ...finding.opposes]) {
        const source = progress.sources.find((s) => s.id === quote.sourceId);
        if (source && researchSourceUsable(spec, source)) groups.add(publisher(source));
      }
    return groups.size >= 2;
  });
}
export function verifyResearchFinding(
  raw: unknown,
  spec: ResearchSpec,
  material: Map<string, { source: ResearchSource; text: string }>,
  id: string,
): ResearchFinding {
  const finding = ResearchFindingInputSchema.parse(raw);
  if (!spec.questions.some((q) => q.key === finding.questionKey)) throw Error('UNKNOWN_QUESTION');
  const publishers = new Set<string>();
  const quote = (input: { sourceId: string; quote: string }) => {
    const item = material.get(input.sourceId);
    if (!item || !researchSourceUsable(spec, item.source)) throw Error('SOURCE_NOT_USABLE');
    if (!item.source.questionKeys.includes(finding.questionKey))
      throw Error('SOURCE_QUESTION_MISMATCH');
    const start = item.text.indexOf(input.quote);
    if (start < 0) throw Error('QUOTE_NOT_IN_SOURCE');
    if (finding.kind === 'fact' || finding.kind === 'conflict') {
      const prefix = item.text.slice(0, start);
      const suffix = item.text.slice(start + input.quote.length);
      if (
        (prefix.trim() && !/(?:\n\s*|[。！？]\s*|[.!?]\s+)$/.test(prefix)) ||
        (suffix.trim() &&
          !/[。！？]$/.test(input.quote) &&
          !(/[.!?]$/.test(input.quote) && /^\s/.test(suffix)) &&
          !/^\s*\n/.test(suffix))
      )
        throw Error('FACT_QUOTE_NEEDS_SENTENCE_CONTEXT');
    }
    publishers.add(publisher(item.source));
    return {
      ...input,
      start,
      end: start + input.quote.length,
      quoteHash: researchHash(input.quote),
    };
  };
  const supports = finding.supports.map(quote),
    opposes = finding.opposes.map(quote);
  if (finding.kind === 'gap') {
    if (supports.length || opposes.length) throw Error('GAP_CANNOT_ASSERT_EVIDENCE');
  } else if (!supports.length) throw Error('EVIDENCE_REQUIRED');
  if (
    finding.kind === 'fact' &&
    (opposes.length ||
      !supports.some((q) => compact(q.quote) === compact(finding.text)) ||
      !supports.every((q) => compact(q.quote).includes(compact(finding.text))))
  )
    throw Error('FACT_MUST_BE_A_VERBATIM_EXCERPT');
  if (
    finding.kind === 'conflict' &&
    (!opposes.length ||
      !supports.some((a) =>
        opposes.some((b) => a.sourceId !== b.sourceId && compact(a.quote) !== compact(b.quote)),
      ))
  )
    throw Error('DISTINCT_CONFLICT_EVIDENCE_REQUIRED');
  if (finding.kind === 'inference') {
    // A new number/date cannot gain authority merely by attaching an unrelated citation.
    const evidence = supports.map((q) => q.quote).join('\n');
    for (const token of finding.text.match(/\d+(?:[.,:/-]\d+)*(?:%|％)?/g) ?? [])
      if (!evidence.includes(token)) throw Error('UNSUPPORTED_NUMBER_OR_DATE');
  }
  return {
    ...finding,
    ...(finding.kind === 'conflict'
      ? { text: '已记录不同来源的原文，差异与冲突尚未裁决。' }
      : finding.kind === 'gap'
        ? { text: '此问题尚无足够可核验的原文证据。' }
        : {}),
    id,
    supports,
    opposes,
    distinctSourceGroups: publishers.size,
  };
}
export function researchQuality(
  spec: ResearchSpec,
  progress: ResearchProgress,
): 'complete' | 'partial' {
  if (progress.earlyFinish || progress.findings.some((f) => f.kind === 'gap')) return 'partial';
  for (const q of spec.questions) {
    const findings = progress.findings.filter((f) => f.questionKey === q.key && f.kind !== 'gap');
    const publishers = new Set<string>();
    for (const f of findings)
      for (const quote of [...f.supports, ...f.opposes]) {
        const s = progress.sources.find((v) => v.id === quote.sourceId);
        if (s && researchSourceUsable(spec, s)) publishers.add(publisher(s));
      }
    if (
      !findings.some((f) => f.kind === 'fact' || f.kind === 'conflict') ||
      publishers.size < 2 ||
      findings.some((f) => f.kind === 'fact' && f.distinctSourceGroups < 2)
    )
      return 'partial';
  }
  return 'complete';
}
export function researchEvidenceHash(spec: ResearchSpec, progress: ResearchProgress) {
  return researchHash(
    JSON.stringify({
      spec,
      sources: progress.sources,
      findings: progress.findings,
      earlyFinish: progress.earlyFinish,
      searches: progress.searches,
      reads: progress.reads,
      queries: progress.queries,
    }),
  );
}
const md = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]#!|]/g, '\\$&');
export function renderResearchReport(raw: ResearchSpec, progress: ResearchProgress) {
  const spec = ResearchSpecSchema.parse(raw);
  const quality = researchQuality(spec, progress);
  const labels = {
    fact: '原文陈述（逐字核验）',
    inference: '推断（尚需独立核验）',
    gap: '证据缺口',
    conflict: '相互矛盾或有差异的证据（未裁决）',
  };
  const lines = [
    '# ' + md(spec.topic),
    '',
    '## 问题与范围',
    '',
    '用途：' + md(spec.purpose),
    '',
    '范围：' + md(spec.scope),
    '',
    '研究状态：' +
      (quality === 'complete' ? '已完成本轮证据整理' : '部分成果；存在未覆盖或未充分核验的问题'),
    '',
    '## 结论与依据',
    '',
  ];
  const sourceNumber = new Map(progress.sources.map((s, i) => [s.id, i + 1]));
  for (const q of spec.questions) {
    lines.push('### ' + md(q.text), '');
    const findings = progress.findings.filter((f) => f.questionKey === q.key);
    if (!findings.length) lines.push('尚无可核验的结论。', '');
    for (const f of findings) {
      lines.push('**' + labels[f.kind] + '**：' + md(f.text), '');
      if (f.kind === 'fact' && f.distinctSourceGroups < 2)
        lines.push('核验缺口：此条原文陈述仅有一个来源组支持，尚未逐条交叉核验。', '');
      for (const [role, refs] of [
        ['支持', f.supports],
        ['不同证据', f.opposes],
      ] as const)
        for (const quote of refs)
          lines.push(
            `${role} [${sourceNumber.get(quote.sourceId)}]（字符 ${quote.start}–${quote.end}）：`,
            '',
            '> ' + md(quote.quote).replace(/\n/g, '\n> '),
            '',
          );
    }
  }
  lines.push(
    '## 方法与局限',
    '',
    `实际搜索 ${progress.searches} 次，本轮实际读取 ${progress.reads} 次。只把已读取、固定版本且未被排除的原文作为依据。`,
    '',
    '搜索候选不是引用证据；逐字核验只能证明来源如此陈述，不能自动证明陈述为真。推断与冲突仍需核查。发布日期未知时不能声称满足日期筛选。相同主域名不视为不同来源；不同域名或文件身份也不自动证明发布者独立。每个问题不足两个不同来源时保留为部分成果。',
    '',
    '时间范围：' + (spec.dates.from ?? '不限起日') + ' 至 ' + (spec.dates.to ?? '不限止日') + '。',
    '',
    '## 来源清单',
    '',
  );
  for (const [i, s] of progress.sources.entries()) {
    lines.push(
      `${i + 1}. ${md(s.title)}${s.excluded || spec.excludedSources.includes(s.id) ? '（已排除）' : ''}`,
      `   来源：${md(s.url ?? s.canonical)}`,
      `   访问/固定时间：${new Date(s.fetchedAt).toISOString()}；网页声明发布日期：${s.publishedAt === null ? '未知' : new Date(s.publishedAt).toISOString()}。`,
      `   状态：${s.status}；内容SHA256：${s.contentHash ?? '无可读取内容'}。`,
      '',
    );
  }
  return { markdown: lines.join('\n'), quality };
}

/** Structured sections keep office output readable without interpreting untrusted Markdown. */
export function researchDocumentSpec(
  spec: ResearchSpec,
  progress: ResearchProgress,
  definition: { audience: string; language: string },
) {
  const paragraph = (text: string) => ({ type: 'paragraph' as const, text });
  const labels = {
    fact: '原文陈述',
    inference: '推断（待核验）',
    conflict: '不同证据（未裁决）',
    gap: '证据缺口',
  };
  return {
    schemaVersion: 1 as const,
    title: spec.topic.slice(0, 500),
    audience: definition.audience,
    language: definition.language,
    sections: [
      {
        blockId: 'scope',
        heading: '问题与范围',
        blocks: [
          paragraph('用途：' + spec.purpose),
          paragraph('范围：' + spec.scope),
          paragraph(
            researchQuality(spec, progress) === 'complete'
              ? '已完成本轮证据整理。'
              : '部分成果：存在未覆盖或未充分核验的问题。',
          ),
        ],
      },
      ...spec.questions.map((q) => ({
        blockId: 'question-' + q.key,
        heading: q.text,
        blocks: progress.findings
          .filter((f) => f.questionKey === q.key)
          .flatMap((f) => [
            paragraph(labels[f.kind] + '：' + f.text),
            ...(f.kind === 'fact' && f.distinctSourceGroups < 2
              ? [paragraph('核验缺口：此条原文陈述仅有一个来源组支持，尚未逐条交叉核验。')]
              : []),
            ...[...f.supports, ...f.opposes].map((quote) =>
              paragraph(`来源 ${quote.sourceId}，字符 ${quote.start}–${quote.end}：${quote.quote}`),
            ),
          ]),
      })),
      {
        blockId: 'limits',
        heading: '方法与局限',
        blocks: [
          paragraph(
            `本轮搜索 ${progress.searches} 次、读取 ${progress.reads} 次。逐字核验只证明来源如此陈述，不证明陈述为真。冲突未裁决，推断待核验。不同域名或文件不自动证明发布者独立；每问题不足两个不同来源时保留部分成果。`,
          ),
          paragraph(
            `时间范围：${spec.dates.from ?? '不限'} 至 ${spec.dates.to ?? '不限'}；发布日期未知的网页不能证明满足日期筛选。`,
          ),
        ],
      },
      {
        blockId: 'sources',
        heading: '来源清单',
        blocks: progress.sources.flatMap((s) => [
          paragraph(`${s.title}（${s.id}）${s.excluded ? ' 已排除' : ''}`),
          paragraph(
            `${s.url ?? s.canonical}\n访问/固定时间：${new Date(s.fetchedAt).toISOString()}；网页声明发布日期：${s.publishedAt === null ? '未知' : new Date(s.publishedAt).toISOString()}\n状态：${s.status}；SHA256：${s.contentHash ?? '无'}`,
          ),
        ]),
      },
    ],
    citations: [],
  };
}
