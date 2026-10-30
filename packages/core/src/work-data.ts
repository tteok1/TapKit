import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AnalysisResultSchema,
  AnalysisSpecSchema,
  DATA_LIMITS,
  FILE_LIMITS,
  HelperRequestSchema,
  type AnalysisResult,
  type ResourceRef,
  type WorkToolArgs,
  type ExecutionCapabilities,
} from '@tapkit/contracts';
import { newId, StorageError, WorkRepository, type WorkRun } from '@tapkit/storage';
import { DATA_PROGRAM, projectChartTable } from '@tapkit/workflows';
import {
  NativeSandboxExecutor,
  OfficeWorker,
  runtimePaths,
  sanitizeChartSvg,
  type OfficeExecutor,
} from '@tapkit/tools';
import type { WorkArtifacts } from './work-artifacts';
import type { PreviewStaging } from './preview-staging';

export const DATA_SCRIPT_HASH = createHash('sha256').update(DATA_PROGRAM).digest('hex');
type DataArgs = Extract<WorkToolArgs, { tool: 'data.analyze' }>;
type Identity = {
  schemaVersion: 1;
  helperInstanceId: string;
  nativeRunId: string;
  directoryId: string;
  leaseEpoch: number;
  fileVersionId: string;
  state: string;
  pid: number | null;
  appContainerSid: string | null;
};

/** Called at every guard and read, including after async execution. */
export function dataSources(artifacts: WorkArtifacts, run: WorkRun, raw: unknown) {
  const spec = AnalysisSpecSchema.parse(raw),
    repo = new WorkRepository(artifacts.files.store);
  const current = repo.row(run.id),
    session = repo.session(run.session_id),
    state = repo.state(current);
  return spec.datasets.map((d) => {
    const selected = state.definition.refs.some(
      (r) =>
        r.kind === 'file' &&
        r.fileId === d.fileId &&
        r.versionId === d.versionId &&
        !r.locator &&
        !r.selection,
    );
    const origin = artifacts.files.store.db
      .prepare(
        'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=?',
      )
      .get(d.versionId) as { root_run_id: string } | undefined;
    if (!selected && origin?.root_run_id !== run.root_run_id)
      throw new StorageError('PERMISSION_DENIED');
    let file;
    try {
      file = artifacts.files.get(d.fileId, {
        versionId: d.versionId,
        owner: { type: 'session', id: run.session_id },
      });
    } catch (error) {
      if (
        !(error instanceof StorageError) ||
        error.code !== 'PERMISSION_DENIED' ||
        !session.project_id
      )
        throw error;
      file = artifacts.files.get(d.fileId, {
        versionId: d.versionId,
        owner: { type: 'project', id: session.project_id },
      });
    }
    if (!['csv', 'xlsx'].includes(file.version.extension))
      throw new StorageError('FORMAT_UNSUPPORTED');
    return {
      fileId: d.fileId,
      versionId: d.versionId,
      sha256: file.version.sha256,
      extension: file.version.extension,
    };
  });
}

async function readOutput(path: string, max = DATA_LIMITS.maxResultBytes) {
  const meta = await lstat(path);
  if (
    !meta.isFile() ||
    meta.isSymbolicLink() ||
    meta.size > max ||
    (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
  )
    throw new StorageError('PERMISSION_DENIED');
  const handle = await open(path, 'r');
  try {
    const pinned = await handle.stat();
    if (pinned.ino !== meta.ino || pinned.size !== meta.size || pinned.dev !== meta.dev)
      throw new StorageError('CONFLICT');
    const bytes = await handle.readFile();
    if (bytes.length !== meta.size) throw new StorageError('CONFLICT');
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function executeData(
  root: string,
  artifacts: WorkArtifacts,
  staging: PreviewStaging,
  run: WorkRun,
  args: DataArgs,
  guard: () => void,
  committed: (ref: ResourceRef) => void,
  signal: AbortSignal,
  capabilities: ExecutionCapabilities,
  identity?: (value: Identity) => void,
  executorOverride?: OfficeExecutor,
) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(360000)]);
  if (
    capabilities.nativeExecution.status !== 'available' ||
    capabilities.officeRender.status !== 'available'
  )
    throw new StorageError('SANDBOX_UNAVAILABLE');
  const sources = dataSources(artifacts, run, args.spec);
  if (sources[0]?.fileId !== args.fileId || sources[0].versionId !== args.versionId)
    throw new StorageError('VALIDATION_ERROR');
  const directory = await staging.create(args.versionId),
    input = join(directory, 'input'),
    workspace = join(directory, 'workspace');
  await mkdir(input);
  await mkdir(workspace);
  let settled = true;
  let last = {
    helperInstanceId: newId(),
    nativeRunId: newId(),
    pid: null as number | null,
    appContainerSid: null as string | null,
  };
  const report = (
    helperInstanceId: string,
    nativeRunId: string,
    state: string,
    pid?: number | null,
    appContainerSid?: string | null,
  ) => {
    if (last.helperInstanceId !== helperInstanceId)
      last = { helperInstanceId, nativeRunId, pid: null, appContainerSid: null };
    last = {
      ...last,
      ...(pid == null ? {} : { pid }),
      ...(appContainerSid == null ? {} : { appContainerSid }),
    };
    identity?.({
      schemaVersion: 1,
      ...last,
      directoryId: directory.split(/[\\/]/).at(-1)!,
      leaseEpoch: run.lease_epoch,
      fileVersionId: args.versionId,
      state,
    });
  };
  const base =
    executorOverride ??
    new NativeSandboxExecutor(root, (request, event) =>
      report(
        request.requestId,
        request.runId,
        'running',
        typeof event.data.pid === 'number' ? event.data.pid : undefined,
        typeof event.data.appContainerSid === 'string' ? event.data.appContainerSid : undefined,
      ),
    );
  const checked = () => {
    guard();
    signal.throwIfAborted();
    dataSources(artifacts, run, args.spec);
  };
  const executor: OfficeExecutor = {
    execute: async (request, options) => {
      checked();
      settled = false;
      report(request.requestId, request.runId, 'prepared');
      const result = await base.execute(request, options);
      const started = result.events[0],
        finished = result.events.at(-1);
      if (finished?.event === 'finished' && finished.data.activeProcesses === 0) settled = true;
      if (!settled) {
        report(request.requestId, request.runId, 'unknown');
        throw new StorageError('SIDE_EFFECT_UNKNOWN');
      }
      if (
        started?.event !== 'started' ||
        started.data.appContainer !== true ||
        started.data.networkCapabilities !== 0
      )
        throw new StorageError('SANDBOX_UNAVAILABLE');
      if (
        result.exitCode !== 0 ||
        finished?.data.exitCode !== 0 ||
        finished.data.status !== 'exited'
      ) {
        const diagnostic = typeof finished?.data.stderr === 'string' ? finished.data.stderr : '';
        const reason = /ValueError: ([A-Z_]+)\s*$/.exec(diagnostic)?.[1];
        const messages: Record<string, string> = {
          DUPLICATE_JOIN_KEY: '连接键存在重复项。请先去重，或明确允许重复键连接后再试。',
          NULL_JOIN_KEY: '连接键有缺失值。请先补充或筛除缺失键后再试。',
          DIVIDE_BY_ZERO: '计算出现除零。请修正分母或分析口径后再试。',
          INVALID_NUMBER: '数据包含不符合声明类型的数值。请核对列类型和缺失值规则。',
          INVALID_DATE: '日期无法按声明的日期格式读取。请修正日期后再试。',
          INVALID_TIMEZONE: '时区名称无效，请使用 Asia/Shanghai 等 IANA 时区后重试。',
          UNKNOWN_FIELD: '找不到声明的列。请核对原文件表头和分析字段。',
          INVALID_HEADER: '表头为空、重复或不是文本。请提供唯一的文本列名。',
          RAGGED_CSV: '数据行与表头的列数不一致。请修复 CSV 分隔符或表格范围。',
          INVALID_BOOLEAN: '布尔列只能包含 true、false 或缺失值，请核对类型。',
          FILTER_TYPE: '筛选值与列类型不匹配，请核对数值、日期或布尔条件。',
          JOIN_COLUMN_CONFLICT: '连接后的列名冲突，请先选择或重命名需要的列。',
          SPLIT_WIDTH: '拆分结果与目标列数不一致，请核对分隔符和数据。',
          COLUMN_EXISTS: '新计算或拆分列与现有列重名，请使用新的列名。',
          MISSING_SHEET: '找不到指定工作表，请核对工作表名称。',
          NUMBER_RANGE: '数值超出可精确表示的范围，请使用文本保留原值。',
          XML_ENTITY: '文件含不受支持的 XML 实体或编码，请另存标准 XLSX 副本。',
          ZIP_LIMIT: '文件解压体积或压缩比例超出安全上限，请缩小文件。',
          UNIT_REQUIRED: '计算字段的单位不能直接推断，请明确声明结果单位后重试。',
          CELL_LIMIT: '数据超出200,000行、200列或2,000,000单元格上限。请缩小数据范围。',
          DATA_BYTE_LIMIT: '结构化数据超过64 MiB结果预算，请减少输出列或先汇总。',
          CELL_TEXT_LIMIT: '单元格文本过长，请缩短到32,000字符以内后重试。',
          CHART_POINT_LIMIT: '图表超出1,000点。请先按分类或时间汇总。',
          CHART_SERIES_LIMIT: '分组图表超过6个系列，请先筛选分组或减少数值字段。',
          CHART_AGGREGATE_REQUIRED: '同一分组与横轴值有多条记录，请先明确汇总方式。',
          CHART_GROUP_INVALID: '当前分组不适用于此图表。饼图请按单一条件筛选后生成。',
          CHART_FIELD_TYPE: '图表数值字段必须声明为数值类型，请核对字段定义。',
          CHART_NO_DATA: '没有可绘制的数值，请核对筛选和缺失值规则，或先生成数据概况。',
          EXTERNAL_LINK: '文件含宏或外部链接，已停止处理。请提供不含宏和外链的副本。',
          UNSUPPORTED_FORMULA: '文件包含不支持的公式。请转换为数值或使用支持的函数。',
          FORMULA_CACHE_MISSING: '源文件公式缺少可核验的缓存。请先在Office中重算保存。',
          RECALC_MISMATCH: '重算结果与独立计算不一致，未交付文件。请核对公式与统计口径。',
        };
        if (reason && messages[reason])
          artifacts.files.store.db.transaction(() =>
            artifacts.repo.event(run, 'tool.validation', messages[reason]!),
          )();
        throw new StorageError(
          reason?.endsWith('LIMIT')
            ? 'OUTPUT_LIMIT_REACHED'
            : reason === 'EXTERNAL_LINK' || reason === 'UNSUPPORTED_FORMULA'
              ? 'FORMAT_UNSUPPORTED'
              : 'PARSE_FAILED',
        );
      }
      checked();
      report(request.requestId, request.runId, 'running');
      return result;
    },
  };
  try {
    for (const [index, source] of sources.entries()) {
      const original = await artifacts.files.original(source.fileId, {
        versionId: source.versionId,
      });
      checked();
      if (createHash('sha256').update(original.bytes).digest('hex') !== source.sha256)
        throw new StorageError('CONFLICT');
      await writeFile(join(input, 'source-' + index + '.' + source.extension), original.bytes, {
        flag: 'wx',
      });
    }
    await copyFile(
      join(root, 'resources/fonts/NotoSansCJKsc-Regular.otf'),
      join(input, 'font.otf'),
    );
    await writeFile(join(input, 'analyze.py'), DATA_PROGRAM, { flag: 'wx' });
    await writeFile(
      join(input, 'request.json'),
      JSON.stringify({
        spec: args.spec,
        inputs: sources.map(({ extension: _, ...v }) => v),
        extensions: sources.map((s) => '.' + s.extension),
        scriptHash: DATA_SCRIPT_HASH,
        limits: { ...DATA_LIMITS, ...FILE_LIMITS },
      }),
      { flag: 'wx' },
    );
    const runtime = await runtimePaths(root, 'python');
    const python = async (source: string, destination: string, mode: string) =>
      executor.execute(
        HelperRequestSchema.parse({
          protocolVersion: 1,
          requestId: newId(),
          runId: newId(),
          leaseEpoch: run.lease_epoch,
          operation: 'diagnostic.execute',
          payload: {
            ...runtime,
            inputRoot: source,
            workspace: destination,
            args: ['-I', join(source, 'analyze.py'), source, destination, mode],
            timeoutMs: 120000,
            memoryBytes: 2 * 1024 ** 3,
            processLimit: 4,
            outputBytes: 65536,
            terminal: false,
          },
        }),
        { signal },
      );
    await python(input, workspace, 'generate');
    checked();
    const result = AnalysisResultSchema.parse(
      JSON.parse((await readOutput(join(workspace, 'analysis.json'))).toString('utf8')),
    );
    if (
      result.scriptHash !== DATA_SCRIPT_HASH ||
      JSON.stringify(result.spec) !== JSON.stringify(args.spec) ||
      JSON.stringify(result.inputs) !== JSON.stringify(sources.map(({ extension: _, ...v }) => v))
    )
      throw new StorageError('PARSE_FAILED');
    const recalcInput = join(directory, 'recalc-input');
    await mkdir(recalcInput);
    const workbook = await readOutput(join(workspace, 'generated.xlsx'));
    await writeFile(join(recalcInput, 'source.xlsx'), workbook, { flag: 'wx' });
    const recalculated = await new OfficeWorker(root, executor).render(
      { fileVersionId: args.versionId, format: 'xlsx' },
      {
        fileVersionId: args.versionId,
        inputRoot: recalcInput,
        filename: 'source.xlsx',
        sha256: createHash('sha256').update(workbook).digest('hex'),
        workspace,
        requestId: newId(),
        runId: newId(),
        leaseEpoch: run.lease_epoch,
      },
      { signal },
    );
    const verifyInput = join(directory, 'verify-input'),
      verifyOutput = join(directory, 'verify-output');
    await mkdir(verifyInput);
    await mkdir(verifyOutput);
    await copyFile(join(input, 'analyze.py'), join(verifyInput, 'analyze.py'));
    await copyFile(join(input, 'request.json'), join(verifyInput, 'request.json'));
    await copyFile(join(workspace, 'analysis.json'), join(verifyInput, 'analysis.json'));
    const xlsx = await readOutput(recalculated.path);
    await writeFile(join(verifyInput, 'recalculated.xlsx'), xlsx, { flag: 'wx' });
    await python(verifyInput, verifyOutput, 'verify');
    if (
      JSON.parse((await readOutput(join(verifyOutput, 'verified.json'), 1000)).toString())
        .verified !== true
    )
      throw new StorageError('PARSE_FAILED');
    const outputs = [
      {
        name: '分析表格.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: xlsx,
      },
    ];
    for (let i = 0; i < result.spreadsheet.sheets.length; i++)
      outputs.push({
        name: '数据' + (i + 1) + '.csv',
        mime: 'text/csv',
        bytes: await readOutput(join(workspace, 'table-' + i + '.csv')),
      });
    const chartSvgs: string[] = [];
    for (let i = 0; i < result.spec.charts.length; i++)
      for (const ext of ['svg', 'png']) {
        let bytes = await readOutput(join(workspace, 'chart-' + i + '.' + ext));
        if (ext === 'svg') {
          const clean = sanitizeChartSvg(bytes.toString('utf8'));
          chartSvgs.push(clean);
          bytes = Buffer.from(clean);
        } else if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
          throw new StorageError('PARSE_FAILED');
        outputs.push({
          name: '图表' + (i + 1) + '.' + ext,
          mime: ext === 'png' ? 'image/png' : 'image/svg+xml',
          bytes,
        });
      }
    for (const [name, filename, mime] of [
      ['图表规范.json', 'charts.json', 'application/json'],
      ['分析报告.md', 'report.md', 'text/markdown'],
    ])
      outputs.push({
        name: name!,
        mime: mime!,
        bytes: await readOutput(join(workspace, filename!)),
      });
    outputs.push({
      name: '分析看板.html',
      mime: 'text/html',
      bytes: Buffer.from(renderDataHtml(result, chartSvgs)),
    });
    checked();
    report(last.helperInstanceId, last.nativeRunId, 'finished');
    return await artifacts.publishAnalysis(run, result, outputs, checked, committed);
  } catch (error) {
    if (!settled) throw new StorageError('SIDE_EFFECT_UNKNOWN');
    throw error instanceof StorageError
      ? error
      : new StorageError(signal.aborted ? 'CANCELLED' : 'PARSE_FAILED');
  } finally {
    if (settled) await staging.release(directory);
  }
}

export function renderDataHtml(result: AnalysisResult, sanitizedSvgs: string[]) {
  const escape = (v: unknown) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  const details = result.spec.includeDetailsInHtml
    ? result.spreadsheet.sheets
        .map(
          (s) =>
            '<h2>' +
            escape(s.name) +
            '</h2><table><thead><tr>' +
            s.columns.map((c) => '<th>' + escape(c.label) + '</th>').join('') +
            '</tr></thead><tbody>' +
            s.rows
              .map((r) => '<tr>' + r.map((v) => '<td>' + escape(v) + '</td>').join('') + '</tr>')
              .join('') +
            '</tbody></table>',
        )
        .join('')
    : '';
  return (
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>' +
    escape(result.spec.title) +
    '</title><style>body{font:16px system-ui;color:#242b27;max-width:1100px;margin:32px auto;padding:16px}svg{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccd6ce}</style><h1>' +
    escape(result.spec.title) +
    '</h1><p>' +
    escape(result.spec.methodology) +
    '</p>' +
    sanitizedSvgs.join('') +
    details +
    '</html>'
  );
}

export function analysisPage(
  result: AnalysisResult,
  input: {
    sheetId?: string | undefined;
    offset: number;
    filters: Array<{
      field: string;
      op: string;
      value?: unknown;
      values?: unknown[];
      min?: number;
      max?: number;
    }>;
    sort?: { field: string; descending: boolean } | undefined;
  },
) {
  const selectedId = input.sheetId ?? result.spec.charts[0]?.datasetId;
  if (input.sheetId && !result.spreadsheet.sheets.some((s) => s.id === input.sheetId))
    throw new StorageError('NOT_FOUND');
  const sheet =
    result.spreadsheet.sheets.find((s) => s.id === selectedId) ?? result.spreadsheet.sheets[0]!;
  const filter = (
    columns: typeof sheet.columns,
    rows: typeof sheet.rows,
    conditions = input.filters,
  ) =>
    rows.filter((row) =>
      conditions.every((f) => {
        const index = columns.findIndex((c) => c.key === f.field);
        if (index < 0) throw new StorageError('VALIDATION_ERROR');
        const type = columns[index]!.type;
        const valid = (v: unknown) =>
          v === null || (type === 'date' ? typeof v === 'string' : typeof v === type);
        if (
          f.op === 'between'
            ? type !== 'number' || f.min! > f.max!
            : f.op === 'in'
              ? !f.values?.every(valid)
              : !valid(f.value)
        )
          throw new StorageError('VALIDATION_ERROR');
        const value = row[index];
        return f.op === 'eq'
          ? value === f.value
          : f.op === 'in'
            ? f.values?.includes(value)
            : typeof value === 'number' && value >= f.min! && value <= f.max!;
      }),
    );
  const rows = filter(sheet.columns, sheet.rows);
  if (input.sort) {
    const index = sheet.columns.findIndex((c) => c.key === input.sort!.field);
    if (index < 0) throw new StorageError('VALIDATION_ERROR');
    rows.sort((a, b) => {
      const x = a[index],
        y = b[index];
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'zh-CN')) * (input.sort!.descending ? -1 : 1)
      );
    });
  }
  const page: typeof rows = [];
  let bytes = 0;
  for (const row of rows.slice(input.offset, input.offset + 50)) {
    const clipped = row.map((v) => (typeof v === 'string' ? v.slice(0, 160) : v)),
      size = Buffer.byteLength(JSON.stringify(clipped));
    if (bytes + size > 16000 && page.length) break;
    bytes += size;
    page.push(clipped);
  }
  return {
    title: result.spec.title,
    question: result.spec.question,
    methodology: result.spec.methodology,
    sheetId: sheet.id,
    sheets: result.spreadsheet.sheets.map(({ id, name }) => ({ id, name })),
    columns: sheet.columns,
    rows: page,
    total: rows.length,
    offset: input.offset,
    nextOffset: input.offset + page.length,
    profiles: result.profiles,
    warnings: result.warnings,
    inputs: result.inputs,
    operations: result.spec.operations,
    exports: result.exports,
    charts: result.spec.charts.map((spec) => {
      const data = result.spreadsheet.sheets.find((s) => s.id === spec.datasetId)!;
      return projectChartTable({
        spec,
        columns: data.columns,
        rows: filter(data.columns, data.rows, [
          ...spec.filters,
          ...input.filters.filter((f) => data.columns.some((c) => c.key === f.field)),
        ]),
      });
    }),
  };
}
