import { z } from 'zod';
import { IdSchema } from './identity';
import { CodePathSchema, SiteRegionSchema } from './code';

const run = z.strictObject({ runId: IdSchema });
const version = run.extend({ versionId: IdSchema });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const SiteBriefSchema = z.strictObject({
  goal: z.string().trim().min(1).max(160),
  audience: z.string().trim().max(240),
  pages: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  style: z.enum(['paper', 'studio']),
  template: z.enum(['html', 'react']),
});
export const SiteVersionSchema = z.strictObject({
  id: IdSchema,
  sourceHash: hash,
  createdAt: z.number().int(),
  processId: IdSchema,
});
export const SiteViewSchema = z.strictObject({
  runId: IdSchema,
  brief: SiteBriefSchema,
  versions: z.array(SiteVersionSchema).max(16),
  sourceHash: hash,
  build: z
    .strictObject({
      processId: IdSchema,
      state: z.enum(['succeeded', 'failed']),
      exitCode: z.number().int().nullable(),
    })
    .optional(),
});
export const SiteCommandSchemas = {
  'site.status': run,
  'site.create': run.extend({ brief: SiteBriefSchema }),
  'site.build': run.extend({ prepareDependencies: z.boolean().default(false) }),
  'site.restore': version.extend({ expectedSourceHash: hash }),
  'site.copy': version.extend({ targetRunId: IdSchema }),
} as const;
const preview = z.strictObject({ previewId: z.string().uuid() });
export const SiteHostCommandSchemas = {
  'previews.start': version,
  'previews.stop': preview,
  'previews.resize': preview.extend({
    viewport: z.union([z.literal(900), z.literal(768), z.literal(390)]),
    bounds: z.strictObject({
      x: z.number().int().min(-10000).max(10000),
      y: z.number().int().min(-10000).max(10000),
      width: z.number().int().min(0).max(10000),
      height: z.number().int().min(0).max(10000),
    }),
  }),
  'previews.select': preview,
  'previews.focus': preview,
  'previews.refresh': preview,
  'site.download': version,
} as const;
export const SiteTransferSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('assets'),
    lease: z.string().max(64),
    entries: z
      .array(z.strictObject({ path: CodePathSchema, base64: z.string().max(2800000) }))
      .max(200),
  }),
  z.strictObject({ kind: z.literal('check'), lease: z.string().max(64) }),
  z.strictObject({ kind: z.literal('archive'), base64: z.string().max(24000000) }),
]);
export const SitePreviewReplySchema = z.strictObject({
  previewId: z.string().uuid(),
  region: SiteRegionSchema.optional(),
});
export type SiteBrief = z.infer<typeof SiteBriefSchema>;
export type SiteVersion = z.infer<typeof SiteVersionSchema>;
export type SiteView = z.infer<typeof SiteViewSchema>;
export type SiteRegion = z.infer<typeof SiteRegionSchema>;
export type SiteCommand = keyof typeof SiteCommandSchemas | keyof typeof SiteHostCommandSchemas;
