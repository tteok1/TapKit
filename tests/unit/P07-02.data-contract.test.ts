import { expect, test } from 'vitest';
import {
  AnalysisSpecSchema,
  SpreadsheetSpecSchema,
  WorkToolArgsSchema,
  AnalysisResultSchema,
  safeSpreadsheetFormula,
} from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { salesAnalysis } from '../fixtures/P07-02.data';
import { analysisPage, DATA_SCRIPT_HASH } from '../../packages/core/src/work-data';
import { catalogAllowsTool } from '../../packages/tools/src/registry';

test('P07-02 rejects executable fields, unresolved operations and malformed spreadsheet shapes', () => {
  const spec = salesAnalysis(newId(), newId());
  expect(AnalysisSpecSchema.safeParse({ ...spec, script: 'import os' }).success).toBe(false);
  expect(
    AnalysisSpecSchema.safeParse({ ...spec, datasets: [...spec.datasets, spec.datasets[0]] })
      .success,
  ).toBe(false);
  expect(
    AnalysisSpecSchema.safeParse({
      ...spec,
      operations: [{ op: 'select', dataset: 'missing', output: 'x', columns: ['a'] }],
    }).success,
  ).toBe(false);
  expect(
    SpreadsheetSpecSchema.safeParse({
      schemaVersion: 1,
      sheets: [
        {
          id: 's',
          name: 'x',
          columns: [{ key: 'a', label: 'a', type: 'string' }],
          rows: [['a', 'b']],
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    WorkToolArgsSchema.safeParse({
      tool: 'data.analyze',
      fileId: spec.datasets[0]!.fileId,
      versionId: spec.datasets[0]!.versionId,
      spec,
    }).success,
  ).toBe(true);
  expect(catalogAllowsTool('p06-tools-1', 'data.analyze')).toBe(false);
  expect(catalogAllowsTool('p07-tools-1', 'document.create')).toBe(true);
  expect(catalogAllowsTool('p07-tools-1', 'data.analyze')).toBe(false);
});
test('P07-02 formula grammar rejects DDE, paths, external references and unlisted functions', () => {
  expect(safeSpreadsheetFormula('SUM(A2:A20)')).toBe(true);
  expect(safeSpreadsheetFormula('IF(A2>0,ROUND(A2*B2,2),0)')).toBe(true);
  for (const formula of [
    'WEBSERVICE("https://example.com")',
    "cmd|' /C calc'!A0",
    '[other.xlsx]A1',
    'Sheet2!A1',
    'INDIRECT("A1")',
    'HYPERLINK("file:///C:/private")',
  ])
    expect(safeSpreadsheetFormula(formula)).toBe(false);
});
test('P07-02 paging filters and sorts the complete immutable dataset without altering raw values', () => {
  const spec = salesAnalysis(newId(), newId());
  spec.charts = [];
  const result = AnalysisResultSchema.parse({
    schemaVersion: 1,
    kind: 'tapkit.analysis',
    spec,
    scriptHash: DATA_SCRIPT_HASH,
    inputs: spec.datasets.map(({ fileId, versionId }) => ({
      fileId,
      versionId,
      sha256: '0'.repeat(64),
    })),
    profiles: [{ datasetId: 'sales', rows: 100, duplicates: 0, columns: [] }],
    warnings: [],
    spreadsheet: {
      schemaVersion: 1,
      sheets: [
        {
          id: 'detail',
          name: '数据1',
          columns: [{ key: '金额', label: '金额', type: 'number' }],
          rows: Array.from({ length: 100 }, (_, i) => [i]),
        },
      ],
    },
  });
  const original = JSON.stringify(result);
  const page = analysisPage(result, {
    offset: 0,
    filters: [{ field: '金额', op: 'between', min: 75, max: 90 }],
    sort: { field: '金额', descending: true },
  });
  expect(page.total).toBe(16);
  expect(page.rows[0]).toEqual([90]);
  expect(page.rows.at(-1)).toEqual([75]);
  expect(JSON.stringify(result)).toBe(original);
  expect(() =>
    analysisPage(result, { offset: 0, filters: [{ field: 'unknown', op: 'eq', value: 1 }] }),
  ).toThrow();
});
