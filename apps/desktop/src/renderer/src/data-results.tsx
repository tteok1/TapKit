import { useEffect, useState } from 'react';
import {
  WorkReplySchema,
  type DataPage,
  type ChartSpec,
  type ResourceRef,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { useViewer } from '../features/viewer/state';

const chartLabels = {
  bar: '柱状图',
  line: '折线图',
  scatter: '散点图',
  area: '面积图',
  pie: '饼图',
};
function operationText(op: DataPage['operations'][number]) {
  switch (op.op) {
    case 'select':
      return `保留列：${op.columns.join('、')}`;
    case 'filter':
      return `按 ${op.filters.map((f) => f.field).join('、')} 筛选数据`;
    case 'sort':
      return `按 ${op.field} ${op.descending ? '降序' : '升序'}排序`;
    case 'fill':
      return `将 ${op.field} 的缺失值填为 ${String(op.value)}`;
    case 'deduplicate':
      return `按 ${op.keys.join('、')} 去重，保留首行`;
    case 'join':
      return `按 ${op.leftKey} 与 ${op.rightKey} 连接数据；${op.how === 'left' ? '保留左表' : '仅保留匹配项'}；${op.duplicateKeys === 'reject' ? '拒绝重复键' : '允许重复键'}`;
    case 'split':
      return `将 ${op.field} 按“${op.separator}”拆分为 ${op.columns.join('、')}`;
    case 'classify':
      return `根据 ${op.field} 的指定取值生成分类列 ${op.column}`;
    case 'calculate':
      return `${op.column} = ${op.left} ${{ add: '+', subtract: '−', multiply: '×', divide: '÷' }[op.operator]} ${op.right}；保留 ${op.scale} 位小数`;
    case 'aggregate':
      return `按 ${op.groupBy.join('、') || '全部数据'} 汇总：${op.metrics.map((m) => `${m.field} ${{ sum: '求和', mean: '平均值', min: '最小值', max: '最大值', count: '非空计数' }[m.function]} → ${m.as}`).join('；')}`;
  }
}
function DataChart({ chart }: { chart: DataPage['charts'][number] }) {
  const [type, setType] = useState<ChartSpec['type']>(chart.spec.type),
    [title, setTitle] = useState(chart.spec.title),
    [legend, setLegend] = useState(chart.spec.showLegend);
  const xIndex = chart.columns.findIndex((c) => c.key === chart.spec.xField);
  const series = chart.spec.yFields.map((field) => ({
    field,
    index: chart.columns.findIndex((c) => c.key === field),
    label: chart.columns.find((c) => c.key === field)?.label ?? field,
  }));
  const numbers = chart.rows.flatMap((row) =>
    series.map((s) => row[s.index]).filter((v): v is number => typeof v === 'number'),
  );
  const low = Math.min(0, ...numbers),
    high = Math.max(0, ...numbers),
    range = high - low || 1;
  const y = (v: number) => 275 - ((v - low) / range) * 225;
  const x = (index: number) => 55 + (index / Math.max(1, chart.rows.length - 1)) * 625;
  const numericX = chart.rows.every((r) => typeof r[xIndex] === 'number');
  const xs = chart.rows.map((r) => Number(r[xIndex]));
  const sx = (v: number) =>
    55 + ((v - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)) * 625;
  const pieAllowed =
    series.length === 1 &&
    numbers.length === chart.rows.length &&
    numbers.every((v) => v >= 0) &&
    numbers.reduce((a, b) => a + b, 0) > 0;
  let angle = -Math.PI / 2;
  return (
    <section className="data-chart" aria-label={chart.spec.title}>
      <div className="data-toolbar">
        <label>
          图表标题
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          图表类型
          <select
            aria-label="图表类型"
            value={type}
            onChange={(e) => setType(e.target.value as ChartSpec['type'])}
          >
            {Object.entries(chartLabels).map(([value, label]) => (
              <option
                key={value}
                value={value}
                disabled={(value === 'scatter' && !numericX) || (value === 'pie' && !pieAllowed)}
              >
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={legend} onChange={(e) => setLegend(e.target.checked)} />
          显示图例
        </label>
      </div>
      <svg viewBox="0 0 740 340" role="img" aria-label={title || chart.spec.title}>
        <title>{title || chart.spec.title}</title>
        <desc>{`${chart.rows.length} 条数据；${chart.spec.xField}；${series.map((s) => s.label).join('、')}`}</desc>
        <text x="370" y="24" textAnchor="middle" className="data-chart-title">
          {title}
        </text>
        {type !== 'pie' && (
          <>
            <path d="M55 45V275H690" fill="none" stroke="currentColor" />
            {[0, 0.5, 1].map((t) => (
              <text key={t} x="48" y={y(low + t * range) + 4} textAnchor="end">
                {(low + t * range).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              </text>
            ))}
          </>
        )}
        {type === 'pie' && pieAllowed
          ? chart.rows.map((row, i) => {
              const value = Number(row[series[0]!.index]),
                total = numbers.reduce((a, b) => a + b, 0),
                next = angle + (value / total) * Math.PI * 2;
              const start = [370 + 105 * Math.cos(angle), 165 + 105 * Math.sin(angle)],
                end = [370 + 105 * Math.cos(next), 165 + 105 * Math.sin(next)];
              const d = `M370 165L${start.join(' ')}A105 105 0 ${next - angle > Math.PI ? 1 : 0} 1 ${end.join(' ')}Z`;
              angle = next;
              return chart.rows.length === 1 ? (
                <circle key={i} cx={370} cy={165} r={105} className="data-series-0">
                  <title>
                    {String(row[xIndex])}：{value}
                  </title>
                </circle>
              ) : (
                <path key={i} d={d} className={'data-series-' + (i % 6)}>
                  <title>
                    {String(row[xIndex])}：{value}
                  </title>
                </path>
              );
            })
          : series.map((s, si) => {
              const points = chart.rows.flatMap((row, i) =>
                typeof row[s.index] === 'number' ? [{ i, value: row[s.index] as number }] : [],
              );
              const segments: Array<typeof points> = [];
              for (const point of points) {
                const last = segments.at(-1);
                if (!last || point.i !== last.at(-1)!.i + 1) segments.push([point]);
                else last.push(point);
              }
              return (
                <g key={s.field} className={'data-series-' + (si % 6)}>
                  {segments.map((segment, index) => {
                    const path = segment.map((p) => `${x(p.i)},${y(p.value)}`).join(' ');
                    return (
                      <g key={index}>
                        {type === 'area' && (
                          <polygon
                            points={`${x(segment[0]!.i)},${y(0)} ${path} ${x(segment.at(-1)!.i)},${y(0)}`}
                            opacity=".25"
                          />
                        )}
                        {(type === 'line' || type === 'area') && (
                          <polyline
                            points={path}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        )}
                      </g>
                    );
                  })}
                  {points.map(({ i, value }) =>
                    type === 'bar' ? (
                      <rect
                        key={i}
                        x={
                          55 +
                          (i / Math.max(1, chart.rows.length)) * 625 +
                          (si * 480) / Math.max(1, chart.rows.length * series.length)
                        }
                        y={Math.min(y(0), y(value))}
                        width={Math.max(0.5, 460 / Math.max(1, chart.rows.length * series.length))}
                        height={Math.max(0.5, Math.abs(y(0) - y(value)))}
                      >
                        <title>{`${String(chart.rows[i]?.[xIndex])} · ${s.label}：${value}`}</title>
                      </rect>
                    ) : (
                      <circle
                        key={i}
                        cx={type === 'scatter' ? sx(Number(chart.rows[i]?.[xIndex])) : x(i)}
                        cy={y(value)}
                        r="3"
                      >
                        <title>{`${String(chart.rows[i]?.[xIndex])} · ${s.label}：${value}`}</title>
                      </circle>
                    ),
                  )}
                </g>
              );
            })}
        {type !== 'pie' &&
          chart.rows.map(
            (row, i) =>
              i % Math.max(1, Math.ceil(chart.rows.length / 8)) === 0 && (
                <text
                  key={i}
                  x={
                    type === 'bar' ? 55 + ((i + 0.4) / Math.max(1, chart.rows.length)) * 625 : x(i)
                  }
                  y="296"
                  textAnchor="middle"
                >
                  {String(row[xIndex] ?? '').slice(0, 12)}
                </text>
              ),
          )}
        <text x="370" y="324" textAnchor="middle">
          {chart.spec.xLabel || chart.spec.xField}
          {chart.spec.yLabel ? ' · ' + chart.spec.yLabel : ''}
        </text>
      </svg>
      {legend && (
        <div className="data-legend">
          {(type === 'pie'
            ? chart.rows.map((r) => String(r[xIndex]))
            : series.map((s) => s.label)
          ).map((field, i) => (
            <span key={i}>
              <i className={'data-series-' + (i % 6)} />
              {field}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function DataResults({
  runId,
  taskId,
  reference,
}: {
  runId: string;
  taskId: string;
  reference: Extract<ResourceRef, { kind: 'file' }>;
}) {
  const viewer = useViewer(),
    [page, setPage] = useState<DataPage>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [sheetId, setSheet] = useState(''),
    [offset, setOffset] = useState(0),
    [filterField, setFilterField] = useState(''),
    [filterValue, setFilterValue] = useState(''),
    [filterMax, setFilterMax] = useState(''),
    [filterOp, setFilterOp] = useState('eq'),
    [applied, setApplied] = useState<unknown[]>([]),
    [sortField, setSortField] = useState(''),
    [descending, setDescending] = useState(false);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError('');
    void window.tapkit
      .workCommand(requestOptions(), 'runs.data', {
        runId,
        fileId: reference.fileId,
        versionId: reference.versionId,
        ...(sheetId ? { sheetId } : {}),
        offset,
        filters: applied,
        ...(sortField ? { sort: { field: sortField, descending } } : {}),
      })
      .then((reply) => {
        if (stale) return;
        if (!reply.ok) throw Error(reply.error.code);
        const parsed = WorkReplySchema.parse(reply.data);
        if (!('dataPage' in parsed)) throw Error('PARSE_FAILED');
        setPage(parsed.dataPage);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [
    runId,
    reference.fileId,
    reference.versionId,
    sheetId,
    offset,
    applied,
    sortField,
    descending,
  ]);
  return (
    <section className="data-results" aria-label="数据分析成果" aria-busy={loading}>
      <h2>{page?.title || '数据分析成果'}</h2>
      {error && (
        <p role="alert">数据暂时无法读取（{error}）。请检查资料权限，或回到任务补充材料后重试。</p>
      )}
      {loading && <p role="status">正在读取数据…</p>}
      {page && (
        <>
          <p>{page.methodology}</p>
          <details>
            <summary>数据概况与计算依据</summary>
            <p>{page.question}</p>
            {page.profiles.map((p) => (
              <p key={p.datasetId}>
                {p.datasetId}：{p.rows} 行，{p.duplicates} 行完全重复；
                {p.columns
                  .map(
                    (c) =>
                      `${c.key} 缺失 ${c.missing} / 类型异常 ${c.invalid} / 离群提示 ${c.outliers}`,
                  )
                  .join('；')}
              </p>
            ))}
            <ol>
              {page.operations.map((op, i) => (
                <li key={i}>{operationText(op)}</li>
              ))}
            </ol>
            <p>输入版本：{page.inputs.map((v) => v.versionId).join('、')}</p>
            <p>纠正字段或统计口径可使用下方“补充与修改”，生成新目标版本。</p>
            <p>离群值按四分位距提示，仅用于检查，不会自动排除数据。</p>
          </details>
          {page.warnings.map((w, i) => (
            <p key={i} role="note">
              {w}
            </p>
          ))}
          <div className="data-toolbar">
            <label>
              数据表
              <select
                aria-label="数据表"
                value={sheetId || page.sheetId}
                onChange={(e) => {
                  setSheet(e.target.value);
                  setOffset(0);
                  setApplied([]);
                  setSortField('');
                }}
              >
                {page.sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              排序字段
              <select
                aria-label="排序字段"
                value={sortField}
                onChange={(e) => {
                  setSortField(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">原始顺序</option>
                {page.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={descending}
                onChange={(e) => {
                  setDescending(e.target.checked);
                  setOffset(0);
                }}
              />
              降序
            </label>
          </div>
          <form
            className="data-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const col = page.columns.find((c) => c.key === filterField);
              if (!col) {
                setApplied([]);
                return;
              }
              const convert = (value: string) =>
                col.type === 'number'
                  ? Number(value)
                  : col.type === 'boolean'
                    ? value === 'true'
                    : value;
              if (
                filterOp === 'between' &&
                (!Number.isFinite(Number(filterValue)) || !Number.isFinite(Number(filterMax)))
              ) {
                setError('请输入有效的数值范围');
                return;
              }
              setOffset(0);
              setApplied([
                filterOp === 'between'
                  ? {
                      field: filterField,
                      op: 'between',
                      min: Number(filterValue),
                      max: Number(filterMax),
                    }
                  : filterOp === 'in'
                    ? {
                        field: filterField,
                        op: 'in',
                        values: filterValue.split(',').map((v) => convert(v.trim())),
                      }
                    : { field: filterField, op: 'eq', value: convert(filterValue) },
              ]);
            }}
          >
            <label>
              筛选字段
              <select
                aria-label="筛选字段"
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
              >
                <option value="">全部数据</option>
                {page.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              条件
              <select
                aria-label="条件"
                value={filterOp}
                onChange={(e) => setFilterOp(e.target.value)}
              >
                <option value="eq">等于</option>
                <option value="in">属于（逗号分隔）</option>
                <option value="between">数值范围</option>
              </select>
            </label>
            <label>
              筛选值
              <input
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                maxLength={1000}
              />
            </label>
            {filterOp === 'between' && (
              <label>
                范围上限
                <input value={filterMax} onChange={(e) => setFilterMax(e.target.value)} />
              </label>
            )}
            <button type="submit">应用筛选</button>
            <button
              type="button"
              onClick={() => {
                setApplied([]);
                setOffset(0);
                setFilterValue('');
              }}
            >
              清除筛选
            </button>
          </form>
          <p className="data-range">
            筛选后 {page.total} 行 · 当前 {page.offset + (page.rows.length ? 1 : 0)}—
            {page.nextOffset} 行。筛选与排序仅影响查看，导出保留生成时的统计口径。
          </p>
          <div className="data-table-scroll" tabIndex={0} aria-label="数据表，可横向滚动">
            <table>
              <thead>
                <tr>
                  {page.columns.map((c) => (
                    <th key={c.key} scope="col">
                      {c.label}
                      {c.unit ? `（${c.unit}）` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, i) => (
                  <tr key={page.offset + i}>
                    {row.map((v, j) => (
                      <td key={j}>{v === null ? '—' : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!page.rows.length && <p>没有符合条件的数据，请调整筛选条件。</p>}
          </div>
          <div className="data-toolbar">
            <button
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              上一页
            </button>
            <button
              disabled={loading || page.nextOffset >= page.total}
              onClick={() => setOffset(page.nextOffset)}
            >
              下一页
            </button>
          </div>
          {page.charts.map((chart) => (
            <DataChart key={chart.spec.id} chart={chart} />
          ))}
          <h3>导出成果</h3>
          <div className="data-export-list">
            {page.exports.map((file) => (
              <div key={file.versionId}>
                <span>{file.name}</span>
                <button
                  onClick={() =>
                    void viewer.open({
                      fileId: file.fileId,
                      versionId: file.versionId,
                      owner: { type: 'task', id: taskId },
                    })
                  }
                >
                  预览
                </button>
                <button
                  onClick={() =>
                    void window.tapkit.saveOriginal({
                      fileId: file.fileId,
                      versionId: file.versionId,
                    })
                  }
                >
                  下载
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
