import { z } from 'zod';
import { IdSchema } from './identity';
import defaults from '../../../resources/catalogs/defaults.json' with { type: 'json' };
export const DataLimitsSchema = z.strictObject({
  maxDatasets: z.number().int().min(1).max(8),
  maxOperations: z.number().int().min(1).max(40),
  maxTables: z.number().int().min(1).max(8),
  maxCharts: z.number().int().min(1).max(8),
  maxChartPoints: z.number().int().min(1).max(1000),
  maxDataBytes: z.number().int().min(1024).max(67108864),
  maxResultBytes: z.number().int().min(1024).max(104857600),
  maxSvgBytes: z.number().int().min(1024).max(4194304),
});
export const DATA_LIMITS = Object.freeze(DataLimitsSchema.parse(defaults.data));

const key = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((v) => !/[\x00-\x1f]/.test(v));
export function safeSpreadsheetFormula(value: string) {
  if (!value || /[\[\]!|@\\\x00-\x1f]/.test(value) || /https?:|file:/i.test(value)) return false;
  const clean = value.replace(/"(?:[^"\r\n]|"")*"/g, '0');
  if (/[^A-Za-z_0-9.+*/^%=<>,:() -]/.test(clean)) return false;
  const allowed = new Set([
    'SUM',
    'AVERAGE',
    'COUNT',
    'COUNTA',
    'MIN',
    'MAX',
    'IF',
    'IFERROR',
    'ROUND',
    'SUMIF',
    'COUNTIF',
    'VLOOKUP',
  ]);
  for (const match of clean.matchAll(/[A-Za-z_][A-Za-z_0-9.]*/g)) {
    const token = match[0],
      next = clean.slice(match.index + token.length).trimStart();
    if (
      next.startsWith('(')
        ? !allowed.has(token.toUpperCase())
        : !/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(token)
    )
      return false;
  }
  return true;
}
export const DataValueSchema = z.union([
  z.string().max(32000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const DataColumnSchema = z.strictObject({
  key,
  label: key,
  type: z.enum(['string', 'number', 'boolean', 'date', 'null']),
  unit: z.string().max(40).default(''),
  scale: z.number().int().min(0).max(8).optional(),
});
export const DatasetSpecSchema = z
  .strictObject({
    id: key,
    fileId: IdSchema,
    versionId: IdSchema,
    sheet: z.string().max(31).optional(),
    columns: z.array(DataColumnSchema).min(1).max(200),
    timezone: z.string().min(1).max(80).default('Asia/Shanghai'),
    missingValues: z.array(z.string().max(80)).max(20).default(['']),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.columns.map((c) => c.key)).size !== v.columns.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate column key' });
  });
export const DataFilterSchema = z.discriminatedUnion('op', [
  z.strictObject({ field: key, op: z.literal('eq'), value: DataValueSchema }),
  z.strictObject({
    field: key,
    op: z.literal('in'),
    values: z.array(DataValueSchema).min(1).max(100),
  }),
  z.strictObject({
    field: key,
    op: z.literal('between'),
    min: z.number().finite(),
    max: z.number().finite(),
  }),
]);
export const ChartSpecSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: key,
  type: z.enum(['bar', 'line', 'scatter', 'area', 'pie']),
  datasetId: key,
  xField: key,
  yFields: z
    .array(key)
    .min(1)
    .max(6)
    .refine((v) => new Set(v).size === v.length),
  groupField: key.optional(),
  title: z.string().min(1).max(120),
  xLabel: z.string().max(80).default(''),
  yLabel: z.string().max(80).default(''),
  filters: z.array(DataFilterSchema).max(12).default([]),
  showLegend: z.boolean().default(true),
});
export const AnalysisOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('select'),
    dataset: key,
    output: key,
    columns: z.array(key).min(1).max(200),
  }),
  z.strictObject({
    op: z.literal('filter'),
    dataset: key,
    output: key,
    filters: z.array(DataFilterSchema).min(1).max(12),
  }),
  z.strictObject({
    op: z.literal('sort'),
    dataset: key,
    output: key,
    field: key,
    descending: z.boolean().default(false),
  }),
  z.strictObject({
    op: z.literal('fill'),
    dataset: key,
    output: key,
    field: key,
    value: DataValueSchema,
  }),
  z.strictObject({
    op: z.literal('deduplicate'),
    dataset: key,
    output: key,
    keys: z.array(key).min(1).max(200),
  }),
  z.strictObject({
    op: z.literal('join'),
    dataset: key,
    output: key,
    right: key,
    leftKey: key,
    rightKey: key,
    how: z.enum(['inner', 'left']),
    duplicateKeys: z.enum(['reject', 'allow']).default('reject'),
  }),
  z.strictObject({
    op: z.literal('split'),
    dataset: key,
    output: key,
    field: key,
    separator: z.string().min(1).max(10),
    columns: z.array(key).min(2).max(10),
  }),
  z.strictObject({
    op: z.literal('classify'),
    dataset: key,
    output: key,
    field: key,
    column: key,
    groups: z
      .array(
        z.strictObject({
          values: z.array(DataValueSchema).min(1).max(100),
          label: z.string().max(100),
        }),
      )
      .min(1)
      .max(20),
    otherwise: z.string().max(100),
  }),
  z.strictObject({
    op: z.literal('calculate'),
    dataset: key,
    output: key,
    column: key,
    left: key,
    operator: z.enum(['add', 'subtract', 'multiply', 'divide']),
    unit: z.string().max(40).optional(),
    right: z.union([key, z.number().finite()]),
    scale: z.number().int().min(0).max(8).default(2),
    formula: z.boolean().default(true),
  }),
  z.strictObject({
    op: z.literal('aggregate'),
    dataset: key,
    output: key,
    groupBy: z.array(key).max(12),
    metrics: z
      .array(
        z.strictObject({
          field: key,
          as: key,
          function: z.enum(['sum', 'mean', 'min', 'max', 'count']),
          scale: z.number().int().min(0).max(8).default(2),
        }),
      )
      .min(1)
      .max(30),
  }),
]);
export const AnalysisSpecSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(120),
    question: z.string().trim().min(1).max(2000),
    methodology: z.string().trim().min(1).max(2000),
    datasets: z.array(DatasetSpecSchema).min(1).max(DATA_LIMITS.maxDatasets),
    operations: z.array(AnalysisOperationSchema).max(DATA_LIMITS.maxOperations),
    outputs: z.array(key).min(1).max(DATA_LIMITS.maxTables),
    charts: z.array(ChartSpecSchema).max(DATA_LIMITS.maxCharts).default([]),
    csvMode: z.enum(['safe', 'preserve_values']).default('safe'),
    includeDetailsInHtml: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const known = new Set(v.datasets.map((d) => d.id));
    if (known.size !== v.datasets.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate dataset' });
    for (const op of v.operations) {
      if (
        !known.has(op.dataset) ||
        (op.op === 'join' && !known.has(op.right)) ||
        known.has(op.output)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid data dependency' });
      known.add(op.output);
    }
    if (
      v.outputs.some((id) => !known.has(id)) ||
      new Set(v.outputs).size !== v.outputs.length ||
      v.charts.some((c) => !v.outputs.includes(c.datasetId)) ||
      new Set(v.charts.map((c) => c.id)).size !== v.charts.length
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid expected output' });
  });
export const SpreadsheetSpecSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sheets: z
      .array(
        z.strictObject({
          id: key,
          name: z
            .string()
            .min(1)
            .max(31)
            .refine((v) => !/[\[\]:*?/\\]/.test(v)),
          columns: z.array(DataColumnSchema).min(1).max(200),
          rows: z.array(z.array(DataValueSchema).max(200)).max(200000),
          formulas: z
            .array(
              z.strictObject({
                cell: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}$/),
                expression: z.string().min(1).max(500).refine(safeSpreadsheetFormula),
              }),
            )
            .max(200000)
            .default([]),
        }),
      )
      .min(1)
      .max(8),
  })
  .superRefine((v, ctx) => {
    let cells = 0;
    for (const s of v.sheets) {
      cells += s.rows.length * s.columns.length;
      if (s.rows.some((r) => r.length !== s.columns.length))
        ctx.addIssue({ code: 'custom', message: 'Ragged rows' });
      if (
        new Set(s.columns.map((c) => c.key)).size !== s.columns.length ||
        new Set(s.formulas.map((f) => f.cell)).size !== s.formulas.length
      )
        ctx.addIssue({ code: 'custom', message: 'Duplicate spreadsheet identity' });
      if (
        s.rows.some((row) =>
          row.some((value, i) => {
            const type = s.columns[i]?.type;
            return (
              value !== null &&
              (type === 'date'
                ? typeof value !== 'string' || !/^\d{4}-\d\d-\d\d/.test(value)
                : typeof value !== type)
            );
          }),
        )
      )
        ctx.addIssue({ code: 'custom', message: 'Spreadsheet value type mismatch' });
    }
    if (
      cells > 2000000 ||
      new Set(v.sheets.map((s) => s.name.toLowerCase())).size !== v.sheets.length
    )
      ctx.addIssue({ code: 'custom', message: 'Spreadsheet limit or duplicate name' });
  });
export const DataProfileSchema = z.strictObject({
  datasetId: key,
  rows: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  columns: z
    .array(
      z.strictObject({
        key,
        missing: z.number().int().nonnegative(),
        invalid: z.number().int().nonnegative(),
        outliers: z.number().int().nonnegative().default(0),
      }),
    )
    .max(200),
});
export const AnalysisResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('tapkit.analysis'),
  spec: AnalysisSpecSchema,
  profiles: z.array(DataProfileSchema).min(1).max(8),
  spreadsheet: SpreadsheetSpecSchema,
  scriptHash: z.string().regex(/^[0-9a-f]{64}$/),
  inputs: z
    .array(
      z.strictObject({
        fileId: IdSchema,
        versionId: IdSchema,
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1)
    .max(8),
  warnings: z.array(z.string().max(500)).max(100),
  exports: z
    .array(
      z.strictObject({
        name: z.string().max(180),
        fileId: IdSchema,
        versionId: IdSchema,
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .max(40)
    .default([]),
});
export type AnalysisSpec = z.infer<typeof AnalysisSpecSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type SpreadsheetSpec = z.infer<typeof SpreadsheetSpecSchema>;
export const DataPageSchema = z.strictObject({
  title: z.string(),
  methodology: z.string(),
  question: z.string(),
  sheetId: z.string(),
  sheets: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  columns: z.array(DataColumnSchema),
  rows: z.array(z.array(DataValueSchema)),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative(),
  profiles: z.array(DataProfileSchema),
  charts: z.array(
    z.strictObject({
      spec: ChartSpecSchema,
      columns: z.array(DataColumnSchema),
      rows: z.array(z.array(DataValueSchema)).max(1000),
    }),
  ),
  warnings: z.array(z.string()),
  inputs: AnalysisResultSchema.shape.inputs,
  operations: AnalysisSpecSchema.shape.operations,
  exports: AnalysisResultSchema.shape.exports,
});
export type DataPage = z.infer<typeof DataPageSchema>;
