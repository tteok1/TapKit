import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema } from './resources';
import { WebOptionsSchema } from './web';

const key = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-zA-Z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const ResearchQuestionSchema = z.strictObject({
  key,
  text: z.string().trim().min(1).max(500),
});
export const ResearchSpecSchema = z
  .strictObject({
    topic: z.string().trim().min(1).max(1000),
    questions: z.array(ResearchQuestionSchema).min(1).max(6),
    scope: z.string().max(4000).default('仅公开网页与明确选择的固定本地资料'),
    purpose: z.string().max(1000).default('形成可核查的研究报告'),
    webEnabled: z.boolean().default(true),
    dates: z
      .strictObject({ from: date.nullable().default(null), to: date.nullable().default(null) })
      .refine((v) => !v.from || !v.to || v.from <= v.to)
      .default({ from: null, to: null }),
    includeDomains: WebOptionsSchema.shape.domains,
    excludeDomains: WebOptionsSchema.shape.excludeDomains,
    seedUrls: z.array(z.string().url().max(4096)).max(20).default([]),
    localVersions: z
      .array(z.strictObject({ fileId: IdSchema, versionId: IdSchema }))
      .max(20)
      .default([]),
    excludedSources: z.array(IdSchema).max(40).default([]),
    outputFormat: z.enum(['md', 'docx', 'pdf']).default('md'),
  })
  .refine((v) => new Set(v.questions.map((q) => q.key)).size === v.questions.length)
  .refine(
    (v) => new TextEncoder().encode(JSON.stringify(v)).byteLength <= 16000,
    'Research specification exceeds 16KB',
  );
export type ResearchSpec = z.infer<typeof ResearchSpecSchema>;
export const ResearchSourceSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['web', 'file']),
  ref: ResourceRefSchema.nullable(),
  questionKeys: z.array(key).max(6),
  title: z.string().max(500),
  url: z.string().url().max(4096).nullable(),
  canonical: z.string().max(4096),
  contentHash: hash.nullable(),
  fetchedAt: z.number().int().nonnegative(),
  publishedAt: z.number().int().nonnegative().nullable(),
  status: z.enum(['ready', 'unavailable']),
  excluded: z.boolean(),
  error: z.string().max(80).nullable(),
  truncated: z.boolean().default(false),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;
export const ResearchQuoteInputSchema = z.strictObject({
  sourceId: IdSchema,
  quote: z.string().trim().min(4).max(1600),
});
export const ResearchFindingInputSchema = z.strictObject({
  questionKey: key,
  kind: z.enum(['fact', 'inference', 'gap', 'conflict']),
  text: z.string().trim().min(1).max(2000),
  supports: z.array(ResearchQuoteInputSchema).max(6).default([]),
  opposes: z.array(ResearchQuoteInputSchema).max(6).default([]),
});
export const ResearchQuoteSchema = ResearchQuoteInputSchema.extend({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quoteHash: hash,
}).refine((v) => v.end > v.start);
export const ResearchFindingSchema = ResearchFindingInputSchema.omit({
  supports: true,
  opposes: true,
}).extend({
  id: IdSchema,
  supports: z.array(ResearchQuoteSchema).max(6),
  opposes: z.array(ResearchQuoteSchema).max(6),
  distinctSourceGroups: z.number().int().nonnegative(),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;
export const ResearchQuerySchema = z.strictObject({
  questionKey: key,
  round: z.number().int().min(1).max(3),
  query: z.string().max(1000),
  at: z.number().int().nonnegative(),
  status: z.enum(['running', 'ready', 'unavailable']),
  candidates: z
    .array(z.strictObject({ url: z.string().url().max(4096), title: z.string().max(500) }))
    .max(8),
  error: z.string().max(80).nullable(),
});
export const ResearchProgressSchema = z.strictObject({
  stagnation: z
    .strictObject({ hash, repeats: z.number().int().min(0).max(4), replanned: z.boolean() })
    .optional(),
  searches: z.number().int().min(0).max(8).default(0),
  reads: z.number().int().min(0).max(40).default(0),
  queries: z.array(ResearchQuerySchema).max(8).default([]),
  sources: z.array(ResearchSourceSchema).max(40).default([]),
  findings: z.array(ResearchFindingSchema).max(60).default([]),
  parameterErrors: z.number().int().min(0).max(3).default(0),
  lastIssue: z.string().max(1000).nullable().default(null),
  revision: z.number().int().positive().default(1),
  earlyFinish: z.boolean().default(false),
  lastRead: z
    .strictObject({ sourceId: IdSchema, offset: z.number().int().min(0).max(60000) })
    .optional(),
  report: z
    .strictObject({
      primary: ResourceRefSchema,
      refs: z.array(ResourceRefSchema).min(1).max(6),
      sourceHash: hash,
      contentHash: hash,
      quality: z.enum(['complete', 'partial']),
      generatedAt: z.number().int().nonnegative(),
      ready: z.boolean(),
    })
    .optional(),
});
export type ResearchProgress = z.infer<typeof ResearchProgressSchema>;
export const ResearchWorkToolArgsSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('research.search'), questionKey: key }),
  z.strictObject({
    tool: z.literal('research.read'),
    questionKey: key,
    refresh: z.boolean().default(false),
    offset: z.number().int().min(0).max(60000).default(0),
    source: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('url'), url: z.string().url().max(4096) }),
      z.strictObject({ kind: z.literal('file'), fileId: IdSchema, versionId: IdSchema }),
      z.strictObject({
        kind: z.literal('candidate'),
        queryIndex: z.number().int().min(0).max(7),
        candidateIndex: z.number().int().min(0).max(7),
      }),
      z.strictObject({ kind: z.literal('source'), sourceId: IdSchema }),
    ]),
  }),
  z.strictObject({
    tool: z.literal('research.record'),
    findings: z.array(ResearchFindingInputSchema).min(1).max(12),
  }),
  z.strictObject({ tool: z.literal('research.report') }),
]);
export type ResearchWorkToolArgs = z.infer<typeof ResearchWorkToolArgsSchema>;
export const ResearchCommandSchemas = {
  'research.get': z.strictObject({
    runId: IdSchema,
    sourceOffset: z.number().int().min(0).max(40).default(0),
    findingOffset: z.number().int().min(0).max(60).default(0),
  }),
  'research.source': z.strictObject({
    runId: IdSchema,
    sourceId: IdSchema,
    findingId: IdSchema.optional(),
    quoteIndex: z.number().int().min(0).max(11).default(0),
  }),
  'research.finish': z.strictObject({ runId: IdSchema }),
} as const;
export const ResearchViewSchema = z.strictObject({
  spec: ResearchSpecSchema,
  progress: ResearchProgressSchema.extend({
    findings: z
      .array(
        ResearchFindingSchema.omit({ supports: true, opposes: true }).extend({
          supports: z
            .array(
              z.strictObject({
                sourceId: IdSchema,
                start: z.number().int().nonnegative(),
                end: z.number().int().nonnegative(),
                quoteHash: hash,
              }),
            )
            .max(6),
          opposes: z
            .array(
              z.strictObject({
                sourceId: IdSchema,
                start: z.number().int().nonnegative(),
                end: z.number().int().nonnegative(),
                quoteHash: hash,
              }),
            )
            .max(6),
        }),
      )
      .max(60),
  }),
  rootSearches: z.number().int().nonnegative(),
  rootReads: z.number().int().nonnegative(),
  totalSources: z.number().int().nonnegative(),
  totalFindings: z.number().int().nonnegative(),
  nextSourceOffset: z.number().int().nonnegative().nullable(),
  nextFindingOffset: z.number().int().nonnegative().nullable(),
});
export const ResearchReplySchema = z.union([
  z.strictObject({ research: ResearchViewSchema }),
  z.strictObject({
    researchSource: ResearchSourceSchema,
    text: z.string().max(12000),
    offset: z.number().int().nonnegative(),
    highlights: z.array(ResearchQuoteSchema).max(1),
  }),
]);
