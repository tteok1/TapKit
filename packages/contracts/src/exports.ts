import { z } from 'zod';
import { IdSchema } from './identity';
import { FileGetSchema, FileRelativePathSchema } from './files';
export const ExportTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('session'),
    sessionId: IdSchema,
    messageIds: z.array(IdSchema).min(1).max(1000).optional(),
  }),
  z.strictObject({ kind: z.literal('files'), files: z.array(FileGetSchema).min(1).max(100) }),
  z.strictObject({ kind: z.literal('project'), projectId: IdSchema }),
  z.strictObject({ kind: z.literal('outputs'), sessionId: IdSchema }),
]);
export const ExportOptionsSchema = z.strictObject({
  format: z.enum(['md', 'txt', 'html', 'pdf', 'zip']).default('html'),
  includeAttachments: z.boolean().default(false),
  includeSources: z.boolean().default(true),
  includeProcess: z.boolean().default(false),
});
export type ExportTarget = z.infer<typeof ExportTargetSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
export const ExportMessageSchema = z.strictObject({
  id: IdSchema,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(200000),
  status: z.string().max(32),
});
export const ExportSourceSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string().max(500),
  detail: z.string().max(1000),
  url: z.string().url().max(4096).nullable(),
  excerpt: z.string().max(20000),
  available: z.boolean(),
});
export const ExportFileSchema = FileGetSchema.extend({
  versionId: IdSchema,
  name: z.string().min(1).max(240),
  relativePath: FileRelativePathSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const ExportDocumentSchema = z.strictObject({
  title: z.string().max(500),
  messages: z.array(ExportMessageSchema).max(1000),
  sources: z.array(ExportSourceSchema).max(2000),
  files: z.array(ExportFileSchema).max(2000),
  process: z.array(z.string().max(200)).max(200),
});
export type ExportDocument = z.infer<typeof ExportDocumentSchema>;
export const ExportPreviewSchema = z.strictObject({
  previewId: IdSchema,
  snapshotVersion: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().max(500),
  options: ExportOptionsSchema,
  messages: z.array(ExportMessageSchema).max(1000),
  fileNames: z.array(z.string().max(1024)).max(2000),
  totalBytes: z.number().int().nonnegative(),
  text: z.string().max(3000000),
  html: z.string().max(6000000),
  expiresAt: z.number().int().nonnegative(),
});
export const ExportStatusSchema = z.strictObject({
  exportId: IdSchema,
  jobId: IdSchema,
  state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.number().int().min(0).max(100),
  name: z.string().max(240),
  errorCode: z.string().max(80).nullable(),
});
export const ExportCommandSchemas = {
  'exports.preview': z.strictObject({ target: ExportTargetSchema, options: ExportOptionsSchema }),
  'exports.status': z.strictObject({ exportId: IdSchema }),
  'exports.cancel': z.strictObject({ exportId: IdSchema }),
  'exports.recent': z.strictObject({ target: ExportTargetSchema }),
} as const;
export type ExportCommand = keyof typeof ExportCommandSchemas;
export const ExportReplySchema = z.union([
  z.strictObject({ exportPreview: ExportPreviewSchema }),
  z.strictObject({ exportStatus: ExportStatusSchema }),
  z.strictObject({ exportHistory: z.array(ExportStatusSchema).max(20) }),
  z.strictObject({
    exportDestination: z.strictObject({
      name: z.string().max(240),
      format: ExportOptionsSchema.shape.format,
    }),
  }),
]);
