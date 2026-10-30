import type { DataPage } from '@tapkit/contracts';
type ChartTable = DataPage['charts'][number];
/** Display pivot only: no sums, implicit deduplication or changes to source rows. */
export function projectChartTable(input: ChartTable): ChartTable {
  const field = input.spec.groupField;
  if (!field) {
    const keys = [...new Set([input.spec.xField, ...input.spec.yFields])];
    const indexes = keys.map((key) => input.columns.findIndex((c) => c.key === key));
    if (indexes.some((i) => i < 0)) throw Error('UNKNOWN_FIELD');
    return {
      ...input,
      columns: indexes.map((i) => input.columns[i]!),
      rows: input.rows.map((row) => indexes.map((i) => row[i]!)),
    };
  }
  const gi = input.columns.findIndex((c) => c.key === field),
    xi = input.columns.findIndex((c) => c.key === input.spec.xField);
  if (gi < 0 || xi < 0 || input.spec.type === 'pie') throw Error('CHART_GROUP_INVALID');
  const groups = [...new Map(input.rows.map((r) => [JSON.stringify(r[gi]), r[gi]])).values()];
  const xs = [...new Map(input.rows.map((r) => [JSON.stringify(r[xi]), r[xi]])).values()];
  if (groups.length * input.spec.yFields.length > 6) throw Error('CHART_SERIES_LIMIT');
  const series = groups.flatMap((group, groupIndex) =>
    input.spec.yFields.map((key, index) => {
      const col = input.columns.find((c) => c.key === key);
      if (!col) throw Error('UNKNOWN_FIELD');
      let id = '__series_' + groupIndex + '_' + index;
      if (id === input.spec.xField) id += '_';
      return {
        group,
        source: input.columns.indexOf(col),
        column: {
          ...col,
          key: id,
          label: `${groupIndex + 1}: ${group ?? '缺失'} · ${col.label}`
            .replace(/[\x00-\x1f]/g, ' ')
            .slice(0, 80),
        },
      };
    }),
  );
  const values = new Map<string, ChartTable['rows'][number]>();
  for (const row of input.rows) {
    const key = JSON.stringify([row[gi], row[xi]]);
    if (values.has(key)) throw Error('CHART_AGGREGATE_REQUIRED');
    values.set(key, row);
  }
  const { groupField: _, ...spec } = input.spec;
  return {
    spec: { ...spec, yFields: series.map((s) => s.column.key) },
    columns: [input.columns[xi]!, ...series.map((s) => s.column)],
    rows: xs.map((x) => [
      x!,
      ...series.map((s) => values.get(JSON.stringify([s.group, x]))?.[s.source] ?? null),
    ]),
  };
}
