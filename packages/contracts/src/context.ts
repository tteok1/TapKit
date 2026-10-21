import { z } from 'zod';
import { IdSchema } from './identity';
import defaults from '../../../resources/catalogs/defaults.json' with { type: 'json' };
export const CONTEXT_LIMITS = z
  .strictObject({
    evaluateRatio: z.literal(0.65),
    stopLargeRatio: z.literal(0.8),
    targetRatio: z.literal(0.5),
    memoryTokens: z.number().int().positive().max(1000),
    checkpointTokens: z.number().int().positive().max(3000),
    nextToolTokens: z.number().int().positive().max(16000),
    safetyTokens: z.number().int().positive().max(8192),
  })
  .parse(defaults.context);

export const ContextSourceSchema = z.strictObject({
  id: IdSchema,
  revision: z.number().int().positive(),
});
export const ContextFactSchema = z.strictObject({
  text: z.string().max(100_000),
  sources: z.array(ContextSourceSchema).min(1).max(1000),
});
export const ContextFields = [
  'goal',
  'constraints',
  'decisions',
  'completed',
  'active',
  'next',
  'artifacts',
  'evidence',
  'open_questions',
] as const;
export const CheckpointStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  goal: z.array(ContextFactSchema).max(1000),
  constraints: z.array(ContextFactSchema).max(1000),
  decisions: z.array(ContextFactSchema).max(1000),
  completed: z.array(ContextFactSchema).max(1000),
  active: z.array(ContextFactSchema).max(1000),
  next: z.array(ContextFactSchema).max(1000),
  artifacts: z.array(ContextFactSchema).max(1000),
  evidence: z.array(ContextFactSchema).max(1000),
  open_questions: z.array(ContextFactSchema).max(1000),
  execution_refs: z
    .array(
      z.strictObject({
        id: IdSchema,
        callId: z.string().min(1).max(240),
        name: z.string().min(1).max(128),
        status: z.enum(['proposed', 'approved', 'dispatched', 'pending', 'unknown']),
        argsHash: z.string().regex(/^[a-f0-9]{64}$/),
        approvalId: IdSchema.nullable(),
        arguments: z.record(z.string(), z.unknown()),
      }),
    )
    .max(80),
  literals: z.array(z.string().min(1).max(100_000)).max(2000),
});
export type CheckpointState = z.infer<typeof CheckpointStateSchema>;
export type ContextSource = z.infer<typeof ContextSourceSchema>;
export const ContextGetSchema = z.strictObject({ sessionId: IdSchema });
export const ContextCorrectSchema = ContextGetSchema.extend({
  checkpointId: IdSchema,
  text: z.string().trim().min(1).max(8000),
});
export const ContextContinueSchema = z.strictObject({
  sessionId: IdSchema,
  checkpointId: IdSchema,
  fields: z
    .array(z.enum(ContextFields))
    .min(1)
    .max(9)
    .refine((v) => new Set(v).size === v.length),
});
export const ContextViewSchema = z.strictObject({
  checkpoint: z
    .strictObject({
      id: IdSchema,
      revision: z.number().int().positive(),
      sessionId: IdSchema,
      state: CheckpointStateSchema,
      createdAt: z.number().int().nonnegative(),
      corrected: z.boolean(),
      projectId: IdSchema.nullable(),
    })
    .nullable(),
  cache: z.strictObject({
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  }),
  providerCachedTokens: z.number().int().nonnegative().nullable(),
});
export type ContextView = z.infer<typeof ContextViewSchema>;
