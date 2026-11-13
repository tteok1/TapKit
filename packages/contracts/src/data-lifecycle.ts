import { z } from 'zod';
import { IdSchema } from './identity';

export const DataCategorySchema = z.enum(['sessions', 'projects', 'files', 'memories']);
export type DataCategory = z.infer<typeof DataCategorySchema>;
export const DataCategoriesSchema = z
  .array(DataCategorySchema)
  .min(1)
  .max(4)
  .refine((items) => new Set(items).size === items.length);
export const DataDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ClearTargetSchema = z.strictObject({
  type: z.enum(['session', 'project', 'file', 'memory']),
  id: IdSchema,
});
export const ClearJobPayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('data.clear'),
  targets: z.array(ClearTargetSchema).max(100_000),
  includeBackups: z.boolean(),
  impactHash: DataDigestSchema,
});
export const DataClearPreviewSchema = z.strictObject({
  categories: DataCategoriesSchema,
  includeBackups: z.boolean().default(true),
});
export const DataClearSchema = DataClearPreviewSchema.extend({ impactHash: DataDigestSchema });
const Empty = z.strictObject({});
const Job = z.strictObject({ jobId: IdSchema });
export const DataCommandSchemas = {
  'data.status': Empty,
  'data.clearPreview': DataClearPreviewSchema,
  'data.clear': DataClearSchema,
  'data.retryClear': Job,
} as const;
export type DataCommand = keyof typeof DataCommandSchemas;
export const BackupListItemSchema = z.strictObject({
  id: IdSchema,
  createdAt: z.number().int().nonnegative(),
  verified: z.boolean(),
});
export const DataJobViewSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['data.backup', 'data.clear']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown']),
  stage: z.enum(['queued', 'backups', 'garbage', 'completed']),
  attempts: z.number().int().nonnegative(),
});
export const DataStatusSchema = z.strictObject({
  dataRoot: z.string().max(8192),
  backups: z.array(BackupListItemSchema).max(100),
  jobs: z.array(DataJobViewSchema).max(30),
  lastRestore: z.enum(['restored', 'failed']).nullable(),
});
export const DataImpactSchema = z.strictObject({
  impactHash: DataDigestSchema,
  sessions: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  memories: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
  links: z.number().int().nonnegative(),
  indexes: z.number().int().nonnegative(),
  previews: z.number().int().nonnegative(),
  caches: z.number().int().nonnegative(),
  relatedMemories: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
  backups: z.number().int().nonnegative(),
  includeBackups: z.boolean(),
});
export const PortableCountsSchema = z.strictObject({
  sessions: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  memories: z.number().int().nonnegative(),
});
export const LifecycleReplySchema = z.union([
  z.strictObject({ dataStatus: DataStatusSchema }),
  z.strictObject({ dataImpact: DataImpactSchema }),
  z.strictObject({ dataTransfer: PortableCountsSchema }),
]);
