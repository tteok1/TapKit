import { z } from 'zod';
import { IdSchema } from './identity';
export const MemoryScopeSchema = z.strictObject({
  type: z.enum(['profile', 'project']),
  id: IdSchema,
});
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export const MemorySourceSchema = z.strictObject({
  messageId: IdSchema,
  revision: z.number().int().positive(),
});
export const MemoryCandidateSchema = z.strictObject({
  subject: z.literal('user'),
  predicate: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  quote: z.string().min(1).max(4000),
  stable: z.boolean(),
  sensitive: z.boolean(),
  expiry: z.number().int().positive().nullable(),
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export const MemoryViewSchema = z.strictObject({
  id: IdSchema,
  revision: z.number().int().positive(),
  scope: MemoryScopeSchema,
  subject: z.string().max(160),
  predicate: z.string().max(160),
  value: z.string().max(2000),
  explicit: z.boolean(),
  confidence: z.number(),
  updatedAt: z.number().int().nonnegative(),
  expiresAt: z.number().nullable(),
  sources: z.array(MemorySourceSchema).max(100),
  changeEventId: IdSchema.nullable(),
  sensitive: z.boolean(),
});
export type MemoryView = z.infer<typeof MemoryViewSchema>;
export const MemoryPageSchema = z.strictObject({
  memories: z.array(MemoryViewSchema).max(100),
  nextCursor: IdSchema.nullable(),
});
export const MemoryPolicySchema = z.strictObject({
  sessionId: IdSchema,
  revision: z.number().int().positive(),
  temporary: z.boolean(),
  memoryEnabled: z.boolean(),
  historyEnabled: z.boolean(),
  scope: MemoryScopeSchema,
  globalMemory: z.boolean(),
  globalHistory: z.boolean(),
  globalInstructions: z.boolean(),
});
export const MemoryUseSchema = z.strictObject({
  memoryUses: z.array(MemoryViewSchema).max(100),
  historyUses: z
    .array(
      z.strictObject({
        messageId: IdSchema,
        sessionId: IdSchema,
        revision: z.number().int().positive(),
        text: z.string().max(2000),
      }),
    )
    .max(20),
});
export const MemoryChangedSchema = z.strictObject({
  memoryChange: z.strictObject({
    id: IdSchema.nullable(),
    changeEventId: IdSchema.nullable(),
    status: z.enum(['written', 'deleted', 'restored', 'skipped']),
    count: z.number().int().nonnegative(),
  }),
});
export const MemoryImpactSchema = z.strictObject({
  memoryImpact: z.strictObject({
    sessionId: IdSchema,
    onlySource: z.number().int().nonnegative(),
    sharedSource: z.number().int().nonnegative(),
    explicit: z.number().int().nonnegative(),
  }),
});
export const MemoryCommandSchemas = {
  'memory.list': z.strictObject({
    scope: MemoryScopeSchema,
    query: z.string().trim().max(240).default(''),
    cursor: IdSchema.optional(),
  }),
  'memory.write': z.strictObject({
    scope: MemoryScopeSchema,
    predicate: z.string().trim().min(1).max(160),
    value: z.string().trim().min(1).max(2000),
    expiresAt: z.number().int().positive().nullable().default(null),
  }),
  'memory.update': z.strictObject({
    memoryId: IdSchema,
    value: z.string().trim().min(1).max(2000),
    scope: MemoryScopeSchema.optional(),
  }),
  'memory.delete': z.strictObject({ memoryId: IdSchema }),
  'memory.clear': z.strictObject({ scope: MemoryScopeSchema.optional() }),
  'memory.undo': z.strictObject({ changeEventId: IdSchema }),
  'memory.policy': z.strictObject({ sessionId: IdSchema }),
  'memory.policy.set': z.strictObject({
    sessionId: IdSchema,
    memoryEnabled: z.boolean(),
    historyEnabled: z.boolean(),
  }),
  'memory.used': z.strictObject({ sessionId: IdSchema, messageId: IdSchema.optional() }),
  'memory.source': z.strictObject({ memoryId: IdSchema, messageId: IdSchema }),
  'memory.sessionImpact': z.union([
    z.strictObject({ sessionId: IdSchema }),
    z.strictObject({
      sessionIds: z
        .array(IdSchema)
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
  ]),
  'memory.notices': z.strictObject({ sessionId: IdSchema, messageId: IdSchema }),
} as const;
export type MemoryCommand = keyof typeof MemoryCommandSchemas;
export const MemoryReplySchema = z.union([
  z.strictObject({
    memoryNotices: z
      .array(
        z.strictObject({
          memoryId: IdSchema,
          changeEventId: IdSchema,
          status: z.string(),
          sensitive: z.boolean(),
        }),
      )
      .max(100),
  }),
  MemoryPageSchema,
  MemoryChangedSchema,
  MemoryPolicySchema,
  MemoryUseSchema,
  MemoryImpactSchema,
  z.strictObject({
    memorySource: z.strictObject({
      messageId: IdSchema,
      sessionId: IdSchema,
      text: z.string().max(100000),
    }),
  }),
]);
