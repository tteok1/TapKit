import { z } from 'zod';
import { IdSchema } from './identity';
import {
  ProviderIdSchema,
  ModelViewSchema,
  AccountStatusSchema,
  ApiBaseURLSchema,
  ApiFormatSchema,
} from './providers';
import defaults from '../../../resources/catalogs/defaults.json';

export const SelectionSchema = z.strictObject({
  accountId: IdSchema,
  modelId: z.string().min(1).max(160),
});
export type Selection = z.infer<typeof SelectionSchema>;
export const ReasoningSchema = z.enum(['off', 'low', 'medium', 'high']);
export const AnswerPreferencesSchema = z.strictObject({
  language: z.enum(['auto', 'zh-CN', 'en']),
  length: z.enum(['short', 'normal', 'long']),
  tone: z.enum(['natural', 'professional', 'friendly']),
  format: z.enum(['auto', 'plain', 'markdown', 'json']),
});
export const ModelPreferencesSchema = z.strictObject({
  selection: SelectionSchema.nullable(),
  onlyThisModel: z.boolean(),
  mode: z.enum(['quick', 'deep']),
  reasoning: ReasoningSchema,
  answer: AnswerPreferencesSchema,
  favorites: z.array(SelectionSchema).max(200),
  apiOrder: z
    .array(ProviderIdSchema.exclude(['codex-subscription']))
    .max(6)
    .refine((v) => new Set(v).size === v.length),
  allowPaidFallback: z.boolean(),
  rootTokenLimit: z.number().int().min(1).max(600_000),
  workRootTokenLimit: z.number().int().min(1).max(600_000).default(600_000),
  dailyTokenLimit: z.number().int().min(1).max(2_000_000),
  moneyLimits: z
    .array(
      z.strictObject({
        currency: z.string().regex(/^[A-Z]{3}$/),
        dailyMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .max(10),
});
export type ModelPreferences = z.infer<typeof ModelPreferencesSchema>;
export type ModelOverrides = { [K in keyof ModelPreferences]?: ModelPreferences[K] | undefined };
export const DEFAULT_MODEL_PREFERENCES: ModelPreferences = ModelPreferencesSchema.parse(
  defaults.routing.preferences,
);
export const ROUTING_LIMITS = z
  .strictObject({
    chatCalls: z.number().int().min(1).max(8),
    chatTools: z.number().int().min(1).max(12),
    chatActiveMs: z.number().int().min(1).max(300000),
    chatTokens: z.number().int().min(1).max(128000),
    workCalls: z.number().int().min(1).max(40),
    workTools: z.number().int().min(1).max(80),
    workActiveMs: z.number().int().min(1).max(1800000),
    workTokens: z.number().int().min(1).max(600000),
    inputTokens: z.number().int().min(1).max(64000),
    outputTokens: z.number().int().min(1).max(8192),
    fallbackAccounts: z.number().int().min(1).max(5),
    retries: z.number().int().min(0).max(2),
    retryWaitMs: z.number().int().min(1).max(30000),
    foregroundSlots: z.literal(1),
  })
  .parse(defaults.routing.limits);
export const ModelScopeSchema = z.strictObject({
  type: z.enum(['profile', 'session']),
  id: IdSchema,
});
export const PreferencesGetSchema = z.strictObject({ scope: ModelScopeSchema });
export const PreferencesSetSchema = PreferencesGetSchema.extend({ values: ModelPreferencesSchema });
export const PreferencesViewSchema = z.strictObject({
  scope: ModelScopeSchema,
  values: ModelPreferencesSchema,
  revision: z.number().int().positive(),
});
export const PriceSchema = z.strictObject({
  version: z.string().min(1).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  inputMicrosPerMillion: z.number().int().nonnegative(),
  outputMicrosPerMillion: z.number().int().nonnegative(),
  // Only flat, fully known input tiers support a money hard limit. Unknown cache tiers are not zero.
  uniformInputTiers: z.literal(true),
  sourceURL: z
    .string()
    .url()
    .refine((v) => v.startsWith('https://')),
  checkedAt: z.number().int().nonnegative(),
});
export type ModelPrice = z.infer<typeof PriceSchema>;
export const PriceCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().min(1).max(100),
  entries: z
    .array(
      z.strictObject({
        providerId: ProviderIdSchema.exclude(['codex-subscription']),
        modelId: z.string().min(1).max(160),
        baseURL: ApiBaseURLSchema,
        apiFormat: ApiFormatSchema,
        price: PriceSchema,
      }),
    )
    .max(1000),
});
export const DescriptorSchema = ModelViewSchema.extend({
  accountRevision: z.number().int().positive().nullable().default(null),
  availabilityReason: z.string().max(80).nullable().default(null),
  accountLabel: z.string().max(80),
  status: AccountStatusSchema,
  reasoningLevels: z.array(ReasoningSchema).max(4),
  modalities: z.array(z.literal('text')).max(1),
  parallelTools: z.literal('unknown'),
  jsonOutput: z.literal('unknown'),
  scenario: z.string().max(200),
  price: PriceSchema.nullable(),
  quotaRemaining: z.null(),
  quotaResetAt: z.null(),
});
export type ModelDescriptor = z.infer<typeof DescriptorSchema>;
export const CatalogViewSchema = z.strictObject({
  catalog: z.array(DescriptorSchema).max(1000),
  priceVersion: z.string().max(100),
  sessions: z.array(z.strictObject({ id: IdSchema, title: z.string().max(200) })).max(100),
});
export const PreviewSchema = z.strictObject({
  sessionId: IdSchema.optional(),
  current: ModelPreferencesSchema.partial().optional(),
  inputTokens: z.number().int().nonnegative().max(2_000_000).default(0),
  outputTokens: z.number().int().positive().max(8192).default(1024),
  attachments: z.number().int().nonnegative().max(100).default(0),
  needsTools: z.boolean().default(false),
});
export const PreviewViewSchema = z.strictObject({
  effective: ModelPreferencesSchema,
  scope: z.enum(['current', 'session', 'profile']),
  candidates: z.array(SelectionSchema).max(1000),
  issues: z.array(z.string().max(240)).max(20),
  paidNotice: z.string().max(240),
});
export const UsageQuerySchema = z.strictObject({
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
  projectId: IdSchema.optional(),
  modelId: z.string().max(160).optional(),
  runId: IdSchema.optional(),
  groupBy: z.enum(['date', 'project', 'model', 'run']).default('date'),
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
});
export const AttemptViewSchema = z.strictObject({
  attemptId: IdSchema,
  logicalCallId: IdSchema,
  runId: IdSchema,
  accountId: IdSchema,
  providerId: ProviderIdSchema,
  modelId: z.string().max(160),
  attemptNo: z.number().int().positive(),
  status: z.enum(['running', 'completed', 'interrupted', 'failed', 'cancelled', 'unknown']),
  errorCode: z.string().max(80).nullable(),
  activeAnswer: z.boolean(),
  text: z.string().max(200_000),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cachedInputSubset: z.number().int().nonnegative().nullable(),
  reasoningSubset: z.number().int().nonnegative().nullable(),
  chargedTokens: z.number().int().nonnegative(),
  source: z.enum(['actual', 'estimated']),
  currency: z.string().max(3).nullable(),
  amountMicros: z.number().int().nonnegative().nullable(),
  priceVersion: z.string().max(100).nullable(),
  occurredAt: z.number().int().nonnegative(),
});
export type AttemptView = z.infer<typeof AttemptViewSchema>;
export const UsageViewSchema = z.strictObject({
  items: z.array(AttemptViewSchema).max(100),
  nextCursor: z.number().int().nonnegative().nullable(),
  groups: z
    .array(
      z.strictObject({
        key: z.string().max(200),
        tokens: z.number().int().nonnegative(),
        attempts: z.number().int().nonnegative(),
        estimated: z.number().int().nonnegative(),
      }),
    )
    .max(1000),
  day: z.string().max(10),
  timezone: z.string().max(80),
  dailyUsed: z.number().int().nonnegative(),
  dailyReserved: z.number().int().nonnegative(),
  dailyLimit: z.number().int().positive(),
  alert: z.enum(['normal', 'near', 'reached']),
  resetAt: z.number().int().nonnegative(),
  remainingProviderQuota: z.null(),
  limitations: z.array(z.string().max(240)).max(10),
});
export const DiagnosticSchema = z.strictObject({
  logicalCallId: IdSchema,
  sessionId: IdSchema.optional(),
  current: ModelPreferencesSchema.partial().optional(),
});
export const DiagnosticViewSchema = z.strictObject({
  logicalCallId: IdSchema,
  attempts: z.array(AttemptViewSchema).max(20),
  actualModel: SelectionSchema.nullable(),
  errorCode: z.string().max(80).nullable(),
});
