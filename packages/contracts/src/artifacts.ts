import { z } from 'zod';
import { IdSchema } from './identity';
import { LocatorSchema, ResourceRefSchema, type Locator } from './resources';
import { FileGetSchema, FileOwnerSchema, FileViewSchema, ParsedBlockSchema } from './files';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
type PdfRect = NonNullable<Extract<Locator, { kind: 'pdf' }>['rects']>[number];
/** Rectangles use unrotated page-normalized coordinates, as emitted by the parser. */
export function pdfRectsIntersect(a: PdfRect, b: PdfRect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
export const TextRangeSchema = z
  .strictObject({ start: count, end: count })
  .refine((v) => v.end >= v.start);
export const ArtifactAccessSchema = z.strictObject({
  fileId: IdSchema,
  versionId: IdSchema,
  owner: FileOwnerSchema.optional(),
});
export const ReadingPositionSchema = z.strictObject({
  locator: LocatorSchema.optional(),
  scrollTop: z.number().finite().min(0).max(100_000_000).default(0),
  zoom: z.number().finite().min(0.25).max(4).default(1),
  mode: z.enum(['preview', 'source', 'diff']).default('preview'),
});
export const ArtifactOpenSchema = FileGetSchema.extend({
  locator: LocatorSchema.optional(),
  retry: z.boolean().default(false),
});
const annotationAccess = z.strictObject({
  fileVersionId: IdSchema,
  owner: FileOwnerSchema.optional(),
});
export const PdfAnnotationLocatorSchema = z.strictObject({
  kind: z.literal('pdf'),
  pageIndex: count,
  rects: z
    .array(
      z
        .strictObject({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().positive().max(1),
          height: z.number().positive().max(1),
        })
        .refine((v) => v.x + v.width <= 1 && v.y + v.height <= 1),
    )
    .max(1000)
    .default([]),
});
export const AnnotationViewSchema = z.strictObject({
  id: IdSchema,
  fileVersionId: IdSchema,
  locator: PdfAnnotationLocatorSchema,
  textRange: TextRangeSchema.optional(),
  selectedTextHash: hash,
  body: z.string().max(8000),
  color: z.enum(['yellow', 'green', 'blue', 'pink']),
  revision: z.number().int().positive(),
  updatedAt: count,
});
const column = z.number().int().min(1).max(200);
const gridCell = z.strictObject({
  row: z.number().int().positive(),
  column: z.number().int().positive(),
  value: z.union([z.string().max(1_000_000), z.number().finite(), z.boolean(), z.null()]),
  formula: z.string().max(8192).optional(),
  calculated: z.boolean(),
});
export const ArtifactCommandSchemas = {
  'artifacts.open': ArtifactOpenSchema,
  'artifacts.cancel': ArtifactAccessSchema,
  'artifacts.reading': ArtifactAccessSchema.extend({ position: ReadingPositionSchema }),
  'artifacts.blocks': ArtifactAccessSchema.extend({
    pageIndex: count.optional(),
    locator: LocatorSchema.optional(),
    offset: count.default(0),
    limit: z.number().int().min(1).max(100).default(100),
    query: z.string().max(500).default(''),
  }),
  'artifacts.sheet': ArtifactAccessSchema.extend({
    sheetId: z.string().min(1).max(128),
    offset: count.default(0),
    limit: z.number().int().min(1).max(100).default(100),
    sort: z.strictObject({ column, direction: z.enum(['asc', 'desc']) }).optional(),
    filters: z
      .array(z.strictObject({ column, query: z.string().max(500) }))
      .max(20)
      .default([]),
  }),
  'artifacts.locate': ArtifactAccessSchema.extend({ locator: LocatorSchema }),
  'artifacts.diff': ArtifactAccessSchema.extend({
    otherVersionId: IdSchema,
    offset: count.default(0),
    limit: z.number().int().min(1).max(100).default(100),
  }),
  'artifacts.selection': ArtifactAccessSchema.extend({
    locator: LocatorSchema,
    textRange: TextRangeSchema.optional(),
    expectedTextHash: hash.optional(),
  }),
  'annotations.list': annotationAccess,
  'annotations.upsert': annotationAccess.extend({
    id: IdSchema.optional(),
    locator: PdfAnnotationLocatorSchema,
    textRange: TextRangeSchema.optional(),
    selectedTextHash: hash,
    body: z.string().max(8000).default(''),
    color: z.enum(['yellow', 'green', 'blue', 'pink']).default('yellow'),
    expectedRevision: z.number().int().positive().optional(),
  }),
  'annotations.delete': annotationAccess.extend({
    ids: z
      .array(IdSchema)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
} as const;
export type ArtifactCommand = keyof typeof ArtifactCommandSchemas;
export const ArtifactViewSchema = z.strictObject({
  file: FileViewSchema,
  format: z.enum([
    'pdf',
    'docx',
    'pptx',
    'sheet',
    'markdown',
    'code',
    'text',
    'image',
    'zip',
    'unsupported',
  ]),
  status: z.enum(['ready', 'pending', 'failed', 'unsupported']),
  errorCode: z.string().max(80).nullable(),
  pageCount: count,
  blockCount: count,
  outline: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        title: z.string().max(2000),
        locator: LocatorSchema,
      }),
    )
    .max(2000),
  sheets: z
    .array(
      z.strictObject({
        id: z.string().max(128),
        name: z.string().max(128),
        rows: count,
        columns: count,
      }),
    )
    .max(1000),
  slides: z
    .array(
      z.strictObject({
        index: count,
        title: z.string().max(2000),
        notes: z.string().max(1_000_000),
      }),
    )
    .max(10000),
  entries: z
    .array(z.strictObject({ path: z.string().max(1024), sizeBytes: count, directory: z.boolean() }))
    .max(2000),
  position: ReadingPositionSchema,
  asset: z.enum(['original', 'preview', 'none']),
  versionChanged: z.boolean(),
  locator: LocatorSchema.optional(),
});
export const ArtifactAssetSchema = ArtifactAccessSchema.extend({
  kind: z.enum(['original', 'preview']),
});
export const ArtifactReplySchema = z.union([
  z.strictObject({ artifact: ArtifactViewSchema }),
  z.strictObject({
    diff: z
      .array(
        z.strictObject({
          kind: z.enum(['equal', 'removed', 'added']),
          text: z.string().max(1_000_000),
          oldLine: count.nullable(),
          newLine: count.nullable(),
        }),
      )
      .max(100),
    total: count,
    offset: count,
    otherVersionId: IdSchema,
  }),
  z.strictObject({ blocks: z.array(ParsedBlockSchema).max(100), total: count, offset: count }),
  z.strictObject({
    grid: z.strictObject({
      sheetId: z.string().max(128),
      rows: z.array(z.number().int().positive()).max(100),
      totalRows: count,
      columns: count.max(200),
      columnTypes: z
        .array(z.enum(['empty', 'text', 'number', 'boolean', 'mixed']))
        .max(200)
        .default([]),
      cells: z.array(gridCell).max(20000),
      mergedAnchors: z.array(gridCell).max(200).default([]),
      mergedRanges: z.array(z.string().max(64)).max(20000),
    }),
  }),
  z.strictObject({
    selection: z.strictObject({
      ref: ResourceRefSchema,
      selectedText: z.string().max(100_000),
      selectedTextHash: hash,
      textRange: TextRangeSchema.optional(),
    }),
  }),
  z.strictObject({ annotations: z.array(AnnotationViewSchema).max(10000) }),
  z.strictObject({ annotation: AnnotationViewSchema }),
  z.strictObject({ changedIds: z.array(IdSchema).max(100) }),
  // Private Host/Core asset reply. The public command allowlist never exposes raw reads.
  z.strictObject({
    artifactBytes: z.strictObject({
      mime: z.string().max(128),
      base64: z.string().max(139_810_136),
    }),
  }),
]);
export type ArtifactView = z.infer<typeof ArtifactViewSchema>;
export type ArtifactAccess = z.infer<typeof ArtifactAccessSchema>;
export type AnnotationView = z.infer<typeof AnnotationViewSchema>;
