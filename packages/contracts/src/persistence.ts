import { z } from 'zod';
import {
  IdSchema,
  RevisionSchema,
  TimeSchema,
  ReplySchema,
  SettingsValuesSchema,
} from './foundation';
import { ResourceRefSchema } from './resources';
export const ReplyDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  reply: ReplySchema,
});
export const ResourceRefsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  refs: z.array(ResourceRefSchema).max(100),
});
export const SessionSettingsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  values: SettingsValuesSchema.partial(),
});
export const MessageContentDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  blocks: z
    .array(z.strictObject({ kind: z.literal('text'), text: z.string().max(1_000_000) }))
    .max(100),
});
export const BudgetLimitsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tokens: z.number().int().min(1).max(2_000_000),
  activeMs: z.number().int().min(1).max(1_800_000),
  maxCalls: z.number().int().positive().optional(),
  usedCalls: z.number().int().nonnegative().optional(),
  reservedMoney: z
    .record(z.string().regex(/^[A-Z]{3}$/), z.number().int().nonnegative())
    .optional(),
  moneyLimits: z
    .array(
      z.strictObject({
        currency: z.string().regex(/^[A-Z]{3}$/),
        dailyMicros: z.number().int().positive(),
      }),
    )
    .optional(),
});
export const MoneyDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  amounts: z
    .array(
      z.strictObject({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amount: z
          .string()
          .max(64)
          .regex(/^\d+(\.\d+)?$/),
      }),
    )
    .max(20),
});
export const ToolNamesDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  names: z.array(z.string().min(1).max(128)).max(100),
});
export const ResourceRulesDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rules: z
    .array(
      z.strictObject({
        resourceId: IdSchema,
        revision: RevisionSchema,
        actions: z
          .array(z.enum(['read', 'artifact_write', 'workspace_write', 'external_write', 'execute']))
          .max(5),
      }),
    )
    .max(100),
});
export const ActionClassesDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  actions: z
    .array(z.enum(['read', 'artifact_write', 'workspace_write', 'external_write', 'execute']))
    .max(5),
});
export const DeletedIdsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ids: z.array(IdSchema).max(100_000),
});
export const BackupManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  createdAt: TimeSchema,
  blobs: z
    .array(
      z.strictObject({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        relative_key: z.string().regex(/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/),
        size_bytes: z
          .number()
          .int()
          .min(0)
          .max(100 * 1024 * 1024),
      }),
    )
    .max(100_000),
  deletedResourceIds: z.array(IdSchema).max(100_000),
});

export const DeletionJournalEntrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  profileId: IdSchema,
  entityType: z.enum(['file', 'session', 'message']),
  keepAsNote: z.boolean().optional(),
  entityId: IdSchema,
  deletedAt: TimeSchema,
});
