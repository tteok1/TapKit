import { z } from 'zod';
import { IdSchema } from './identity';
const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const offset = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const range = z.strictObject({ start: offset, end: offset }).refine((v) => v.end >= v.start);
const relativePath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (v) =>
      !/^[\\/]|^[A-Za-z]:|\\|[\x00-\x1f]/.test(v) &&
      !v.split('/').some((s) => s === '..' || s === '.' || !s),
  );
const rect = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .refine((v) => v.x + v.width <= 1 && v.y + v.height <= 1);
export const LocatorSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pdf'),
    pageIndex: offset,
    rects: z.array(rect).max(1000).optional(),
  }),
  z
    .strictObject({
      kind: z.literal('text'),
      start: offset,
      end: offset,
      paragraphId: z.string().max(128).optional(),
    })
    .refine((v) => v.end >= v.start),
  z.strictObject({
    kind: z.literal('sheet'),
    sheetId: z.string().min(1).max(128),
    range: z
      .string()
      .max(64)
      .regex(/^[A-Z]{1,3}[1-9]\d{0,6}(:[A-Z]{1,3}[1-9]\d{0,6})?$/),
  }),
  z.strictObject({
    kind: z.literal('slide'),
    slideIndex: offset,
    shapeId: z.string().max(128).optional(),
  }),
  z
    .strictObject({
      kind: z.literal('code'),
      path: relativePath,
      lineStart: RevisionSchema,
      lineEnd: RevisionSchema,
      side: z.enum(['old', 'new']).optional(),
    })
    .refine((v) => v.lineEnd >= v.lineStart),
  z
    .strictObject({
      kind: z.literal('web'),
      blockId: z.string().min(1).max(128),
      start: offset.optional(),
      end: offset.optional(),
    })
    .refine(
      (v) =>
        (v.start === undefined && v.end === undefined) ||
        (v.start !== undefined && v.end !== undefined && v.end >= v.start),
    ),
]);
export const ResourceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('file'),
    fileId: IdSchema,
    versionId: IdSchema,
    locator: LocatorSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('message'),
    sessionId: IdSchema,
    messageId: IdSchema,
    version: RevisionSchema,
    range: range.optional(),
  }),
  z.strictObject({
    kind: z.literal('project'),
    projectId: IdSchema,
    selectedVersionIds: z.array(IdSchema).max(2000).optional(),
  }),
  z.strictObject({
    kind: z.literal('web'),
    sourceId: IdSchema,
    revision: RevisionSchema,
    locator: LocatorSchema.optional(),
  }),
]);
export const AcceptanceRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('file_exists'),
    format: z.string().min(1).max(32),
    minCount: RevisionSchema,
  }),
  z.strictObject({ kind: z.literal('schema'), schemaId: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal('citation_coverage'), minRatio: z.number().min(0).max(1) }),
  z.strictObject({
    kind: z.literal('test_exit'),
    commandRef: z.string().min(1).max(128),
    expectedCode: z.literal(0),
  }),
  z.strictObject({ kind: z.literal('human_review'), description: z.string().min(1).max(2000) }),
]);
export const PlanStepInputSchema = z.strictObject({
  stepKey: z.string().min(1).max(128),
  title: z.string().min(1).max(240),
  dependencies: z.array(z.string().min(1).max(128)).max(80),
  inputRefs: z.array(ResourceRefSchema).max(100),
  outputContract: z.strictObject({
    kind: z.enum(['text', 'files', 'code', 'research']),
    formats: z.array(z.string().max(32)).max(20),
  }),
  acceptance: z.array(AcceptanceRuleSchema).max(40),
  optional: z.boolean(),
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type Locator = z.infer<typeof LocatorSchema>;
export type AcceptanceRule = z.infer<typeof AcceptanceRuleSchema>;
export type PlanStepInput = z.infer<typeof PlanStepInputSchema>;
