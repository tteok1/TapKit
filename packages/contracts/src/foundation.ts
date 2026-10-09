import { ExecutionCapabilitiesSchema } from './execution';
import { ChatReplyDataSchema } from './chat';
import { HistoryReplySchema } from './history';
import { FileReplySchema } from './files';
export { RunStatusSchema } from './chat';
import {
  CatalogViewSchema,
  PreferencesViewSchema,
  PreviewViewSchema,
  UsageViewSchema,
  DiagnosticViewSchema,
  SelectionSchema,
} from './models';
import {
  ProviderListSchema,
  LoginViewSchema,
  ProbeViewSchema,
  AccountStatusSchema,
  ProviderIdSchema,
  ApiOptionsSchema,
} from './providers';
import defaults from '../../../resources/catalogs/defaults.json';
import {
  DesktopSettingsSchema,
  PersonalSettingsSchema,
  PersonalizationSchema,
  NetworkSettingsSchema,
  DEFAULT_DESKTOP,
  DEFAULT_PERSONAL,
  DEFAULT_PERSONALIZATION,
  DEFAULT_NETWORK,
  WorkspaceViewSchema,
  CreatedEntitySchema,
} from './desktop';
import { z } from 'zod';
import { IdSchema } from './identity';
export { IdSchema } from './identity';
export const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const TimeSchema = z.number().int().min(0).max(8_640_000_000_000_000);
export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FEATURE_NOT_AVAILABLE',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'APPROVAL_STALE',
  'AUTH_REQUIRED',
  'AUTH_EXPIRED',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'MODEL_UNSUPPORTED',
  'OUTPUT_LIMIT_REACHED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK_ERROR',
  'STREAM_INTERRUPTED',
  'TOOL_TIMEOUT',
  'SIDE_EFFECT_UNKNOWN',
  'BUDGET_EXCEEDED',
  'FILE_TOO_LARGE',
  'FORMAT_UNSUPPORTED',
  'PARSE_FAILED',
  'INDEX_NOT_READY',
  'SANDBOX_UNAVAILABLE',
  'DISK_FULL',
  'DATABASE_RECOVERY_REQUIRED',
  'CANCELLED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const RecoveryActionSchema = z.strictObject({
  kind: z.enum([
    'retry',
    'reconnect',
    'choose_model',
    'open_settings',
    'download_original',
    'review_result',
    'resume',
    'export_data',
  ]),
  targetId: IdSchema.optional(),
  label: z.string().min(1).max(120),
});
export const RequestSchema = z.strictObject({
  protocolVersion: z.literal(1),
  requestId: IdSchema,
  command: z.string().min(1).max(80),
  expectedRevision: RevisionSchema.optional(),
  windowId: z
    .string()
    .regex(/^[0-9]{1,8}$/)
    .optional(),
  payload: z.unknown(),
});
export type Request = z.infer<typeof RequestSchema>;
export type RequestOptions = { requestId: string; expectedRevision?: number };
export const SettingsValuesSchema = z.strictObject({
  desktop: DesktopSettingsSchema.default(DEFAULT_DESKTOP),
  personal: PersonalSettingsSchema.default(DEFAULT_PERSONAL),
  personalization: PersonalizationSchema.default(DEFAULT_PERSONALIZATION),
  network: NetworkSettingsSchema.default(DEFAULT_NETWORK),
  locale: z.literal('zh-CN'),
  memoryEnabled: z.boolean(),
  historyEnabled: z.boolean(),
  maxConcurrentRoots: z.number().int().min(1).max(2),
  maxModelRequests: z.number().int().min(1).max(3),
  maxCredentialRequests: z.number().int().min(1).max(2),
  dailyTokenLimit: z.number().int().min(1).max(2_000_000),
});
export const SettingsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  values: SettingsValuesSchema,
});
export type SettingsValues = z.infer<typeof SettingsValuesSchema>;
export const DEFAULT_SETTINGS: SettingsValues = SettingsDocumentSchema.parse({
  schemaVersion: defaults.schemaVersion,
  values: defaults.values,
}).values;
export const ScopeSchema = z.strictObject({ type: z.literal('profile'), id: IdSchema });
export const SettingsGetSchema = z.strictObject({
  scope: ScopeSchema,
  keys: z.array(SettingsValuesSchema.keyof()).max(20).optional(),
});
export const SettingsSetSchema = z.strictObject({
  scope: ScopeSchema,
  patch: SettingsValuesSchema.partial()
    .extend({
      desktop: DesktopSettingsSchema.optional(),
      personal: PersonalSettingsSchema.optional(),
      personalization: PersonalizationSchema.optional(),
      network: NetworkSettingsSchema.optional(),
    })
    .refine((v) => Object.keys(v).length > 0),
});
export const SaveApiKeySchema = ApiOptionsSchema.extend({
  providerId: ProviderIdSchema.exclude(['codex-subscription']),
  label: z.string().trim().min(1).max(80),
  key: z
    .string()
    .trim()
    .min(1)
    .max(8192)
    .refine((value) => !/[\r\n\0]/.test(value)),
});
export const RegisterCredentialSchema = SaveApiKeySchema.omit({ key: true }).extend({
  credentialHint: z.string().max(4).optional(),
  credentialId: IdSchema,
});
export const ReplaySchema = z.strictObject({
  streamId: z.literal('profile'),
  afterSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  limit: z.number().int().min(1).max(100).default(50),
});
export const JobPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('blob.gc') }),
  z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('data.backup') }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('file.parse'),
    fileVersionId: IdSchema,
    parserVersion: z.string().min(1).max(80),
  }),
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'unknown',
]);
export const ProfileViewSchema = z.strictObject({
  id: IdSchema,
  displayName: z.string().max(80),
  locale: z.literal('zh-CN'),
  timezone: z.string().max(80),
  revision: RevisionSchema,
});
export const SettingsViewSchema = z.strictObject({
  values: SettingsValuesSchema,
  revision: RevisionSchema,
});
export const EventPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('chat'),
    sessionId: IdSchema,
    messageId: IdSchema.optional(),
    runId: IdSchema.optional(),
    taskVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({ kind: z.literal('workspace'), entityId: IdSchema }),
  z.strictObject({
    kind: z.literal('model.preferences'),
    scopeId: IdSchema,
    revision: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('provider.switch'),
    logicalCallId: IdSchema,
    oldAttemptId: IdSchema,
    newAttemptId: IdSchema,
    from: SelectionSchema,
    to: SelectionSchema,
  }),
  z.strictObject({
    kind: z.literal('settings'),
    entity: z.union([z.strictObject({ revision: RevisionSchema }), SettingsViewSchema]),
  }),
  z.strictObject({
    kind: z.literal('provider'),
    entity: z.strictObject({ accountId: IdSchema, status: AccountStatusSchema }),
  }),
  z.strictObject({
    kind: z.literal('job'),
    entity: z.strictObject({ id: IdSchema, status: JobStatusSchema }),
  }),
]);
export const EventEnvelopeSchema = z.strictObject({
  eventId: IdSchema,
  streamId: z.literal('profile'),
  seq: RevisionSchema,
  schemaVersion: z.literal(1),
  type: z.enum([
    'settings.updated',
    'provider.updated',
    'job.updated',
    'model.preferences.updated',
    'provider.switched',
    'workspace.updated',
    'message.accepted',
    'message.delta',
    'message.final',
    'run.status',
    'task.steered',
    'tool.finished',
    'draft.updated',
  ]),
  occurredAt: TimeSchema,
  payload: EventPayloadSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export const BootstrapViewSchema = z.strictObject({
  profile: ProfileViewSchema,
  settings: SettingsViewSchema,
  capabilities: z
    .array(z.enum(['storage', 'settings', 'vault', 'jobs', 'events', 'backup']))
    .max(6),
  runtimeCapabilities: ExecutionCapabilitiesSchema.optional(),
  recoveringRuns: z.array(IdSchema).max(0),
  unreadCount: z.number().int().min(0),
});
export const ReplyDataSchema = z.union([
  FileReplySchema,
  HistoryReplySchema,
  ChatReplyDataSchema,
  WorkspaceViewSchema,
  CreatedEntitySchema,
  CatalogViewSchema,
  PreferencesViewSchema,
  PreviewViewSchema,
  UsageViewSchema,
  DiagnosticViewSchema,
  z.strictObject({ logicalCallId: IdSchema, cancelled: z.boolean() }),
  ProviderListSchema,
  LoginViewSchema,
  ProbeViewSchema,
  z.strictObject({ accountId: IdSchema, status: AccountStatusSchema }),
  BootstrapViewSchema,
  SettingsViewSchema,
  z.strictObject({ accountId: IdSchema, status: z.literal('unconfigured') }),
  z.strictObject({ jobId: IdSchema }),
  z.strictObject({
    items: z.array(EventEnvelopeSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
  }),
  z.strictObject({ subscriptionId: IdSchema }),
  z.strictObject({ status: JobStatusSchema }),
]);
export const ReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    requestId: IdSchema,
    data: ReplyDataSchema,
    revision: RevisionSchema.optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    requestId: z.string().max(80),
    error: z.strictObject({
      code: ErrorCodeSchema,
      message: z.string().max(240),
      retryable: z.boolean(),
      recoveryActions: z.array(RecoveryActionSchema).max(8),
      traceId: z.string().max(80),
      currentRevision: RevisionSchema.optional(),
    }),
  }),
]);
export type Reply = z.infer<typeof ReplySchema>;
export const LEASE_MS = 15_000;
export const HEARTBEAT_MS = 5_000;
