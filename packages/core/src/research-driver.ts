import {
  ResearchWorkToolArgsSchema,
  IdSchema,
  z,
  type CanonicalMessage,
  type ErrorCode,
} from '@tapkit/contracts';
import { StorageError, newId } from '@tapkit/storage';
import { canonicalResearchUrl, type ResearchEvidence } from '@tapkit/workflows';
import type { ModelService } from './model-service';
import type { WorkDriver, WorkCandidate } from './work-service';
import type { ResearchService } from './research-service';
import { boundedSchema } from './office-tool-schema';
import prompt from '../../../resources/prompts/research.md?raw';

const descriptions: Record<string, string> = {
  'research.search': '按已授权questionKey搜索公开网页，Core生成查询并计数；候选不可直接作为引文。',
  'research.read':
    '读取授权来源。URL参数直接传url；文件传sourceKind=file和fileId/versionId；候选传sourceKind=candidate和两个索引；归档传sourceKind=source和sourceId。offset翻阅快照，refresh重新读取。',
  'research.record':
    '从materials.evidence选择编号。必填questionKey和evidenceIds；默认保存逐字fact，不传text。不同原文分别保存，相同原文才合并支持。可选kind=inference/conflict/gap；推断才写text，冲突用opposingEvidenceIds，缺口用空evidenceIds。',
  'research.report':
    '资料整理完成或无更多可核验来源时生成报告及来源清单；Core验证并导出指定格式，不能自己传正文。',
};
const modelRead = z.strictObject({
  questionKey: z.string().min(1).max(48),
  sourceKind: z.enum(['url', 'file', 'candidate', 'source']).default('url'),
  url: z.string().max(4096).optional(),
  fileId: z.string().optional(),
  versionId: z.string().optional(),
  queryIndex: z
    .number()
    .int()
    .min(0)
    .max(7)
    .describe('查询索引；同一问题只有一个可用查询时可省略，多个可用查询时必须明确指定')
    .optional(),
  candidateIndex: z.number().int().min(0).max(7).optional(),
  sourceId: z.string().optional(),
  offset: z.number().int().min(0).max(60000).default(0),
  refresh: z.boolean().default(false),
});
const modelRecord = z.strictObject({
  questionKey: z.string().min(1).max(48),
  kind: z.enum(['fact', 'inference', 'gap', 'conflict']).default('fact'),
  evidenceIds: z
    .array(
      z
        .string()
        .length(18)
        .regex(/^e_[a-f0-9]{16}$/),
    )
    .max(12)
    .describe(
      '必填，复制当前materials.evidence中的18字符e_编号，不是来源UUID；fact最多12条，推断/冲突最多6条，gap传空数组',
    ),
  opposingEvidenceIds: z
    .array(
      z
        .string()
        .length(18)
        .regex(/^e_[a-f0-9]{16}$/),
    )
    .max(6)
    .default([]),
  text: z.string().trim().min(1).max(2000).optional(),
});
type QueryContext = readonly {
  questionKey: string;
  status: string;
  candidates: readonly unknown[];
}[];
export function researchSelectionShape(
  raw: Record<string, unknown>,
  evidence: readonly ResearchEvidence[],
) {
  const keys = new Set([
    'questionKey',
    'evidenceIds',
    'kind',
    'text',
    'opposingEvidenceIds',
    'findings',
    'supports',
    'opposes',
    'sourceId',
    'quote',
  ]);
  const ids = Array.isArray(raw.evidenceIds) ? raw.evidenceIds : [];
  const kind =
    raw.kind === undefined
      ? 'default'
      : ['fact', 'inference', 'conflict', 'gap'].includes(String(raw.kind))
        ? String(raw.kind)
        : 'invalid';
  const row = (value: Record<string, unknown>) =>
    Object.keys(value)
      .slice(0, 12)
      .map((k) => (keys.has(k) ? k : '?'))
      .sort()
      .join(',');
  const batch = Array.isArray(raw.findings) ? raw.findings : [];
  return `selection_shape keys=${row(raw)};q=${typeof raw.questionKey};ids=${Array.isArray(raw.evidenceIds) ? ids.length : 'missing'};matched=${ids.filter((id) => evidence.some((e) => e.id === id)).length};kind=${kind};batch=${batch.length};batch_keys=${batch
    .slice(0, 2)
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? row(item as Record<string, unknown>)
        : 'invalid',
    )
    .join('|')}`;
}
export function researchCanonicalArgs(
  name: string,
  raw: Record<string, unknown>,
  queries?: QueryContext,
  evidence?: readonly ResearchEvidence[],
) {
  if (name === 'research.record' && !Object.hasOwn(raw, 'findings')) {
    if (
      evidence &&
      (Object.hasOwn(raw, 'evidenceIds') ||
        Object.hasOwn(raw, 'opposingEvidenceIds') ||
        raw.kind === 'gap')
    ) {
      const selected = modelRecord.parse(raw);
      if (selected.kind !== 'fact' && selected.evidenceIds.length > 6)
        throw Error('EVIDENCE_SELECTION_INVALID');
      const resolve = (ids: string[]) =>
        ids.map((id) => {
          const matches = evidence.filter(
            (item) => item.id === id && item.questionKeys.includes(selected.questionKey),
          );
          if (matches.length !== 1) throw Error('EVIDENCE_SELECTION_INVALID');
          const item = matches[0]!;
          return { sourceId: item.sourceId, quote: item.quote };
        });
      const supports = resolve(selected.evidenceIds),
        opposes = resolve(selected.opposingEvidenceIds);
      // Fact text is always generated from selected immutable evidence. Any model
      // prose in this shared optional inference field is untrusted and unused.
      if (selected.kind === 'fact' && supports.length && !opposes.length) {
        // Different selected excerpts are separate literal statements, never corroboration
        // of a synthesized claim. Preserve exact-equal quotes as multi-source support.
        const groups = new Map<string, typeof supports>();
        for (const quote of supports) {
          const group = groups.get(quote.quote) ?? [];
          if (!group.some((item) => item.sourceId === quote.sourceId)) group.push(quote);
          groups.set(quote.quote, group);
        }
        return {
          tool: name,
          findings: [...groups].map(([text, supports]) => ({
            questionKey: selected.questionKey,
            kind: 'fact' as const,
            text,
            supports,
            opposes: [],
          })),
        };
      }
      return {
        tool: name,
        findings: [
          {
            questionKey: selected.questionKey,
            kind: selected.kind,
            text:
              selected.kind === 'fact'
                ? supports[0]?.quote
                : selected.kind === 'inference'
                  ? selected.text
                  : '此问题尚无足够可核验的原文证据。',
            supports,
            opposes,
          },
        ],
      };
    }
    return { tool: name, findings: [raw] };
  }
  if (name !== 'research.read' || Object.hasOwn(raw, 'source')) return { ...raw, tool: name };
  const { questionKey, sourceKind = 'url', offset, refresh, ...fields } = raw;
  if (sourceKind === 'candidate' && fields.queryIndex === undefined && queries) {
    const applicable = queries.flatMap((query, index) =>
      query.questionKey === questionKey && query.status === 'ready' && query.candidates.length
        ? [index]
        : [],
    );
    if (applicable.length === 1) fields.queryIndex = applicable[0];
  }
  return { tool: name, questionKey, offset, refresh, source: { kind: sourceKind, ...fields } };
}
export const researchTools = ResearchWorkToolArgsSchema.options.map((schema) => {
  const { tool, ...shape } = schema.shape;
  return {
    name: tool.value,
    description: descriptions[tool.value]!,
    parameters: z.record(z.string(), z.unknown()).parse(
      boundedSchema(
        z.toJSONSchema(
          tool.value === 'research.read'
            ? modelRead
            : tool.value === 'research.record'
              ? modelRecord
              : z.strictObject(shape),
          {
            io: 'input',
            unrepresentable: 'any',
          },
        ),
      ),
    ),
  };
});
export function researchArgumentIssue(
  name: string,
  json: string,
  queries?: QueryContext,
  evidence?: readonly ResearchEvidence[],
) {
  if (!researchTools.some((tool) => tool.name === name)) return '工具名须来自当前tools列表';
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return name + ' 参数JSON不完整';
  }
  const raw = z.record(z.string(), z.unknown()).safeParse(value);
  if (!raw.success) return name + ' 参数必须是对象';
  if (Object.hasOwn(raw.data, 'tool')) return name + ' 参数不可包含tool字段';
  let canonical: unknown;
  try {
    canonical = researchCanonicalArgs(name, raw.data, queries, evidence);
  } catch {
    return name + ' evidenceIds必填且须来自本轮同一问题的evidence；默认fact不传text';
  }
  const parsed = ResearchWorkToolArgsSchema.safeParse(canonical);
  if (parsed.success) return name + ' 参数须符合所声明API schema';
  const fields = new Set([
    'questionKey',
    'source',
    'kind',
    'url',
    'fileId',
    'versionId',
    'queryIndex',
    'candidateIndex',
    'sourceId',
    'refresh',
    'offset',
    'findings',
    'text',
    'supports',
    'opposes',
    'quote',
    'evidenceIds',
    'opposingEvidenceIds',
  ]);
  return (
    name +
    ' ' +
    parsed.error.issues
      .slice(0, 4)
      .map(
        (issue) =>
          issue.path
            .map((key) => (typeof key === 'number' ? '[]' : fields.has(String(key)) ? key : '?'))
            .join('.') +
          ':' +
          issue.code,
      )
      .join(';')
  );
}
export function researchWorkDriver(models: ModelService, research: ResearchService): WorkDriver {
  return async (run, _step, signal) => {
    const { definition, spec, progress } = research.state(run, true),
      session = research.repo.session(run.session_id);
    const preferences = structuredClone(models.effective(run.session_id).values);
    if (definition.modelRef) preferences.selection = definition.modelRef;
    preferences.workRootTokenLimit = Math.min(
      preferences.workRootTokenLimit,
      definition.budgetOverrides.tokens,
    );
    const context = await research.context(run);
    const evidenceLimit = Math.max(1, Math.floor(12 / Math.max(1, context.materials.length)));
    const visibleMaterials = context.materials.map((material) => {
      const evidence = material.evidence.slice(0, evidenceLimit);
      return {
        ...material,
        evidence,
        nextOffset: material.evidence[evidence.length]?.start ?? material.nextOffset,
        truncated: material.truncated || evidence.length < material.evidence.length,
      };
    });
    const evidence = visibleMaterials.flatMap((material) => material.evidence);
    const traceSelection = (raw: Record<string, unknown>) => {
      if (
        process.env.TAPKIT_API_TRANSPORT_TRACE !== 'P08-02' ||
        process.env.TAPKIT_TOOL_TRACE_PROFILE !== research.store.profileId ||
        !IdSchema.safeParse(process.env.TAPKIT_TOOL_TRACE_CASE).success
      )
        return;
      try {
        research.store.db.transaction(() =>
          research.repo.event(run, 'tool.validation', researchSelectionShape(raw, evidence)),
        )();
      } catch {
        /* Opt-in diagnostics cannot change execution or expose raw values. */
      }
    };
    // Keep snapshot binding metadata inside Core. The model selects handles; it does
    // not need repeated hashes, offsets or a duplicate copy of every quoted paragraph.
    const modelContext = {
      ...context,
      materials: visibleMaterials.map((material) => ({
        ...material,
        text: material.text.slice(0, 240),
        previewOnly: true,
        evidence: material.evidence.map(({ id, quote }) => ({ id, quote })),
      })),
    };
    const pendingEvidence = context.materials.filter(
      (material) =>
        !progress.findings.some(
          (finding) =>
            [...finding.supports, ...finding.opposes].some(
              (quote) => quote.sourceId === material.source.id,
            ) ||
            (finding.kind === 'gap' && material.source.questionKeys.includes(finding.questionKey)),
        ),
    );
    const pendingCandidates = progress.queries.some(
      (query) =>
        query.status === 'ready' &&
        query.candidates.some(
          (candidate) =>
            !progress.sources.some(
              (source) => source.canonical === canonicalResearchUrl(candidate.url),
            ),
        ) &&
        !progress.findings.some(
          (finding) => finding.kind === 'gap' && finding.questionKey === query.questionKey,
        ),
    );
    const sourceGroup = (id: string) => {
      const source = progress.sources.find((item) => item.id === id);
      return source?.url
        ? new URL(source.url).hostname.split('.').slice(-2).join('.')
        : source?.ref?.kind === 'file'
          ? source.ref.fileId
          : id;
    };
    const reportReady = spec.questions.every((question) => {
      const facts = progress.findings.filter(
        (finding) => finding.questionKey === question.key && finding.kind === 'fact',
      );
      return (
        new Set(
          facts.flatMap((finding) => finding.supports.map((quote) => sourceGroup(quote.sourceId))),
        ).size >= 2
      );
    });
    const closing = research.repo.rootUsage(run).calls >= definition.budgetOverrides.maxCalls;
    // Consume existing candidates/evidence before another discovery round. A recorded
    // gap can release that phase; the report exit and original root limits remain available.
    const names = closing
      ? ['research.report']
      : reportReady
        ? ['research.report', 'research.record', 'research.read', 'research.search']
        : pendingEvidence.length
          ? ['research.record', 'research.read', 'research.report']
          : pendingCandidates
            ? ['research.read', 'research.record', 'research.report']
            : researchTools.map((tool) => tool.name);
    const tools = names.map((name) => researchTools.find((tool) => tool.name === name)!);
    const phaseBase = closing
      ? 'Core确认模型调用预算即将用尽。本轮只可调用报告工具保存已核验成果；缺口必须保留为部分报告，不再采集或重复记录。'
      : reportReady
        ? 'Core已确认每个问题都有至少两个不同来源组的逐字事实。优先调用本轮声明的报告工具保存成果；各条结论缺少独立核验的局限仍保留，不能因不同域名就宣称事实为真。剩余候选只在目标仍有明确缺口时读取或搜索，不必遍历所有候选；不要重复已有发现。'
        : pendingEvidence.length
          ? 'Core已确认存在尚未记录依据的已读原文。优先调用research.record，只需questionKey和evidenceIds（从materials.evidence复制相关编号），默认保存逐字事实，不写text。新来源仍需处理；不重复读取相同版本。'
          : pendingCandidates
            ? 'Core已确认搜索成功且仍有未读取候选。本轮不声明搜索工具；从当前queries候选读取不同主域名的相关来源。无法回答可明确记录gap，资料已足够可报告。不要重复搜索。'
            : 'Core当前进度已在research_current_state中提供，只执行尚未完成的步骤；阶段发现已经覆盖问题且没有更多可核查来源时调用报告工具。';
    const repair =
      progress.lastIssue === 'EVIDENCE_REQUIRED' ||
      progress.lastIssue === 'FACT_MUST_BE_A_VERBATIM_EXCERPT' ||
      progress.lastIssue === 'QUOTE_NOT_IN_SOURCE'
        ? '上一轮证据被拒绝。下一次只从materials.evidence选择相关编号，调用record传questionKey和evidenceIds=[编号]，不传text、quote或supports。'
        : progress.lastIssue?.startsWith('RESEARCH_ARGUMENTS_INVALID')
          ? '上一轮工具参数被拒绝。只使用本轮tools实际名称；record只传必填questionKey和evidenceIds，值是当前evidence编号数组；不要传supports、opposes、text、findings或quote。'
          : '';
    const phase = repair + phaseBase;
    signal.throwIfAborted();
    const messages: CanonicalMessage[] = [
      { role: 'user', text: JSON.stringify(modelContext) },
      {
        role: 'user',
        text: JSON.stringify({
          goal: definition.goal,
          topic: spec.topic,
          scope: spec.scope,
          purpose: spec.purpose,
          questions: spec.questions,
          outputFormat: spec.outputFormat,
        }),
      },
    ];
    const delegated = research.repo.state(run).delegateSummary;
    if (delegated?.length)
      messages.push({
        role: 'user',
        text: JSON.stringify({ trust: 'untrusted_subtask_data', subtasks: delegated }),
      });
    const inputTokens = JSON.stringify(messages).length;
    if (inputTokens > 90000) throw new StorageError('OUTPUT_LIMIT_REACHED');
    const catalog = await models.catalog(),
      candidate: WorkCandidate = { text: '', calls: [], finished: false };
    let lastError: ErrorCode | undefined,
      invalidArguments = false,
      argumentStreamRejected = false,
      argumentIssue = '';
    const deltas = new Map<string, { name: string; json: string }>();
    for await (const event of models.router.stream(
      {
        logicalCallId: newId(),
        runId: run.id,
        rootRunId: run.root_run_id,
        mode: 'work',
        foreground: false,
        preferences,
        ...(session.project_id ? { projectId: session.project_id } : {}),
        allowedAccounts: new Set(
          catalog
            .filter((m) => m.status === 'ready')
            .flatMap((m) => (m.accountId ? [m.accountId] : [])),
        ),
        need: { inputTokens, outputTokens: 4096, attachments: 0, needsTools: true },
        request: {
          taskVersion: run.task_version,
          branchId: session.active_branch_id,
          messages,
          systemModules: [
            { id: 'tapkit.research', text: prompt },
            { id: 'tapkit.research.phase', text: phase },
          ],
          tools,
          outputLimit: 4096,
        },
      },
      signal,
    )) {
      if (event.type === 'route.error') {
        if (
          argumentStreamRejected &&
          ['STREAM_INTERRUPTED', 'VALIDATION_ERROR'].includes(event.error.code)
        )
          break;
        throw new StorageError(event.error.code);
      }
      if (event.type === 'attempt') {
        models.store.db
          .prepare('UPDATE runs SET model_json=? WHERE id=? AND task_version=?')
          .run(
            JSON.stringify({ schemaVersion: 1, selection: event.model }),
            run.id,
            run.task_version,
          );
        candidate.text = '';
        candidate.calls = [];
        candidate.finished = false;
        lastError = undefined;
        invalidArguments = false;
        argumentStreamRejected = false;
        argumentIssue = '';
        deltas.clear();
      }
      if (event.type !== 'model.event') continue;
      const e = event.event;
      if (e.type === 'error') {
        lastError = e.error.code;
        argumentStreamRejected = e.error.diagnosticCode === 'invalid_tool_arguments';
        if (argumentStreamRejected) invalidArguments = true;
        if (argumentStreamRejected)
          argumentIssue = [...deltas.values()]
            .map((call) =>
              tools.some((tool) => tool.name === call.name)
                ? researchArgumentIssue(call.name, call.json, progress.queries, evidence)
                : '工具名须来自本轮tools列表',
            )
            .join('；')
            .slice(0, 800);
        const diagnostics: Record<string, string> = {
          invalid_tool_arguments: '模型返回的研究工具参数不符合完整格式，未执行本轮工具调用。',
          unterminated_sse: '模型响应未正常结束，未执行不完整的研究工具调用。',
          read_failed: '模型响应读取中断，未执行不完整的研究工具调用。',
        };
        const diagnostic = e.error.diagnosticCode;
        if (diagnostic && diagnostics[diagnostic])
          models.store.db.transaction(() =>
            research.repo.event(run, 'tool.validation', diagnostics[diagnostic]!),
          )();
      }
      if (e.type === 'text_delta') {
        candidate.text += e.text;
        if (candidate.text.length > 16000) throw new StorageError('OUTPUT_LIMIT_REACHED');
      }
      if (e.type === 'tool_delta') {
        const call = deltas.get(e.callId) ?? { name: '', json: '' };
        if (e.name) call.name = e.name;
        call.json += e.argumentsDelta;
        if ((deltas.size >= 12 && !deltas.has(e.callId)) || call.json.length > 64000)
          throw new StorageError('OUTPUT_LIMIT_REACHED');
        deltas.set(e.callId, call);
      }
      if (e.type === 'tool_end') {
        if (candidate.calls.length >= 12) throw new StorageError('OUTPUT_LIMIT_REACHED');
        const raw = z.record(z.string(), z.unknown()).safeParse(e.arguments);
        if (
          !tools.some((tool) => tool.name === e.name) ||
          !raw.success ||
          Object.hasOwn(raw.data, 'tool')
        ) {
          invalidArguments = true;
          if (!tools.some((tool) => tool.name === e.name))
            argumentIssue = '工具名须来自本轮tools列表';
          continue;
        }
        let canonical: unknown;
        try {
          canonical = researchCanonicalArgs(e.name, raw.data, progress.queries, evidence);
        } catch {
          invalidArguments = true;
          if (e.name === 'research.record') traceSelection(raw.data);
          argumentIssue = researchArgumentIssue(
            e.name,
            JSON.stringify(raw.data),
            progress.queries,
            evidence,
          );
          continue;
        }
        const parsed = ResearchWorkToolArgsSchema.safeParse(canonical);
        if (parsed.success) candidate.calls.push(parsed.data);
        else {
          invalidArguments = true;
          // API schema omits unsupported refinements (for example UUID format).
          // Give the same bounded, value-free paths for Core rejections as for API rejections.
          argumentIssue = researchArgumentIssue(
            e.name,
            JSON.stringify(raw.data),
            progress.queries,
            evidence,
          );
        }
      }
      if (e.type === 'finish') candidate.finished = true;
    }
    if (invalidArguments || (!candidate.calls.length && candidate.finished)) {
      for (const call of [...deltas.values()]
        .filter((call) => ['research.record', 'research_record'].includes(call.name))
        .slice(0, 2)) {
        try {
          const value: unknown = JSON.parse(call.json);
          const raw = z.record(z.string(), z.unknown()).safeParse(value);
          if (raw.success) traceSelection(raw.data);
        } catch {
          /* No raw values or partial JSON are persisted. */
        }
      }
      candidate.calls = [];
      research.parameterIssue(
        run,
        invalidArguments
          ? 'RESEARCH_ARGUMENTS_INVALID' + (argumentIssue ? '：' + argumentIssue : '')
          : 'RESEARCH_TOOL_REQUIRED',
      );
      candidate.finished = true;
    }
    if (!candidate.finished) throw new StorageError(lastError ?? 'STREAM_INTERRUPTED');
    return candidate;
  };
}
