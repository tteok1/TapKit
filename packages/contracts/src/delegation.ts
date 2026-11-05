import defaults from '../../../resources/catalogs/defaults.json' with { type: 'json' };
import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema } from './resources';

export const DelegateSpecSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
  role: z.enum(['researcher', 'reviewer']),
  goal: z.string().trim().min(1).max(4000),
  inputs: z
    .array(
      ResourceRefSchema.refine(
        (ref) => ref.kind !== 'project',
        'Delegate individual fixed versions, not project-wide context',
      ),
    )
    .max(8),
  forbidden: z.array(z.string().min(1).max(500)).max(8).default([]),
  allowedTools: z
    .array(z.enum(['source.read', 'task.result']))
    .min(1)
    .max(2),
  outputContract: z.literal('research-review-v1'),
  acceptance: z.strictObject({ minEvidence: z.number().int().min(0).max(8) }),
  budget: z.strictObject({
    tokens: z.number().int().min(1024).max(600000),
    activeMs: z.number().int().min(100).max(1800000),
    maxCalls: z.literal(1),
    maxTools: z.number().int().min(1).max(9),
  }),
  deadline: z.number().int().nonnegative().nullable(),
  parentTaskVersion: z.number().int().positive(),
  dependencies: z.array(z.string().max(48)).max(11).default([]),
});
export type DelegateSpec = z.infer<typeof DelegateSpecSchema>;
export const DelegateResultSchema = z.strictObject({
  conclusion: z.string().trim().min(1).max(4000),
  evidence: z
    .array(
      z.strictObject({
        inputIndex: z.number().int().min(0).max(7),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
        quote: z.string().min(1).max(2000),
      }),
    )
    .max(8),
  artifacts: z.array(ResourceRefSchema).max(0),
  actions: z.array(z.string().max(500)).max(8),
  uncertainty: z.array(z.string().min(1).max(500)).max(8),
  incomplete: z.boolean(),
});
export type DelegateResult = z.infer<typeof DelegateResultSchema>;
export const DelegateSourceViewSchema = z.strictObject({
  name: z.string().max(1024),
  text: z.string().max(5000),
  offset: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  quote: z.string().min(1).max(2000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export const DelegationCommandSchemas = {
  'subtasks.summaryMode': z.strictObject({ runId: IdSchema, enabled: z.boolean() }),
  'subtasks.source': z.strictObject({
    runId: IdSchema,
    evidenceIndex: z.number().int().min(0).max(7),
  }),
  'task.delegate': z.strictObject({ runId: IdSchema, spec: DelegateSpecSchema }),
  'subtasks.list': z.strictObject({
    runId: IdSchema,
    offset: z.number().int().min(0).max(1000).default(0),
  }),
  'subtasks.control': z.strictObject({
    runId: IdSchema,
    childRunId: IdSchema,
    action: z.enum(['pause', 'resume', 'retry', 'steer']),
    feedback: z.string().trim().min(1).max(4000).optional(),
  }),
};

export const DELEGATION_LIMITS = z
  .strictObject({
    automatic: z.literal(false),
    maxDepth: z.literal(1),
    maxConcurrentChildren: z.literal(2),
    maxBranches: z.literal(12),
    childCalls: z.literal(1),
  })
  .parse(defaults.delegation);
