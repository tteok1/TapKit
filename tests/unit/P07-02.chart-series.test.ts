import { test, expect } from 'vitest';
import { ChartSpecSchema, DataColumnSchema } from '../../packages/contracts/src';
import { projectChartTable } from '../../packages/workflows/src/data-chart';
test('P07-02 grouped charts preserve exact values and gaps and refuse implicit aggregation', () => {
  const columns = [
    ['地区', 'string'],
    ['季度', 'string'],
    ['金额', 'number'],
  ].map(([key, type]) => DataColumnSchema.parse({ key, label: key, type }));
  const spec = ChartSpecSchema.parse({
    schemaVersion: 1,
    id: 'chart',
    type: 'line',
    datasetId: 'data',
    xField: '季度',
    groupField: '地区',
    yFields: ['金额'],
    title: '季度销售额',
  });
  const rows = [
    ['华东', 'Q1', 0.7],
    ['华南', 'Q1', 1.05],
    ['华东', 'Q2', 2],
  ];
  const chart = { spec, columns, rows },
    original = JSON.stringify(chart);
  const projected = projectChartTable(chart);
  expect(projected.rows).toEqual([
    ['Q1', 0.7, 1.05],
    ['Q2', 2, null],
  ]);
  expect(projected.columns.slice(1).map((c) => c.label)).toEqual([
    '1: 华东 · 金额',
    '2: 华南 · 金额',
  ]);
  expect(JSON.stringify(chart)).toBe(original);
  expect(() => projectChartTable({ ...chart, rows: [...rows, rows[0]!] })).toThrow(
    'CHART_AGGREGATE_REQUIRED',
  );
});
