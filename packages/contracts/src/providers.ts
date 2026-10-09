import { z } from 'zod';
import { IdSchema } from './identity';
import type { ErrorCode } from './foundation';

export const ProviderIdSchema = z.enum([
  'codex-subscription',
  'deepseek',
  'hunyuan',
  'xai',
  'doubao',
  'openai-compatible',
  'anthropic-compatible',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export const ApiFormatSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic-messages']);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;
export const ApiBaseURLSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'HTTPS base URL required');
export const ApiOptionsSchema = z.strictObject({
  apiFormat: ApiFormatSchema.optional(),
  baseURL: ApiBaseURLSchema.optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
});
export const API_PRESETS = {
  deepseek: {
    apiFormat: 'openai-chat',
    baseURL: 'https://api.deepseek.com',
    modelId: 'deepseek-flash',
  },
  hunyuan: {
    apiFormat: 'openai-chat',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    modelId: 'hunyuan-turbos-latest',
  },
  xai: { apiFormat: 'openai-responses', baseURL: 'https://api.x.ai/v1', modelId: 'grok-4.6' },
  doubao: {
    apiFormat: 'openai-chat',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    modelId: '',
  },
  'openai-compatible': {
    apiFormat: 'openai-chat',
    baseURL: 'https://api.openai.com/v1',
    modelId: '',
  },
  'anthropic-compatible': {
    apiFormat: 'anthropic-messages',
    baseURL: 'https://api.anthropic.com/v1',
    modelId: '',
  },
} as const;
export const ApiConfigSchema = z.strictObject({
  providerId: ProviderIdSchema.exclude(['codex-subscription']),
  apiFormat: ApiFormatSchema,
  baseURL: ApiBaseURLSchema,
  modelId: z.string().trim().max(160),
});
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export function resolveApiConfig(
  providerId: ApiConfig['providerId'],
  options: z.infer<typeof ApiOptionsSchema> = {},
): ApiConfig {
  return ApiConfigSchema.parse({ providerId, ...API_PRESETS[providerId], ...options });
}

export const AccountStatusSchema = z.enum(['unconfigured', 'ready', 'expired', 'unavailable']);
export const AccountViewSchema = z.strictObject({
  accountId: IdSchema,
  providerId: ProviderIdSchema,
  label: z.string().max(80),
  status: AccountStatusSchema,
  revision: z.number().int().positive(),
  lastErrorCode: z.string().max(80).nullable(),
  hasCredential: z.boolean().optional(),
  credentialHint: z.string().max(4).optional(),
  apiFormat: ApiFormatSchema.optional(),
  baseURL: ApiBaseURLSchema.optional(),
  modelId: z.string().max(160).optional(),
});
export const ModelViewSchema = z.strictObject({
  accountId: IdSchema.nullable(),
  providerId: ProviderIdSchema,
  modelId: z.string().min(1).max(160),
  displayName: z.string().max(160),
  contextWindow: z.number().int().positive().nullable(),
  maxOutput: z.number().int().positive().nullable(),
  toolCalls: z.enum(['documented', 'unknown']),
  verification: z.enum(['documented', 'probed', 'failed']),
  reasoningLevels: z
    .array(z.enum(['off', 'low', 'medium', 'high']))
    .max(4)
    .optional(),
});
export const LoginViewSchema = z.strictObject({
  loginId: IdSchema,
  status: z.enum(['waiting', 'completed', 'cancelled', 'failed']),
  accountId: IdSchema.optional(),
  promptId: IdSchema.optional(),
  promptKind: z.literal('manual_callback').optional(),
  deviceCode: z.string().max(80).optional(),
  browserOpened: z.boolean(),
  errorCode: z.string().max(80).optional(),
});
export const StartLoginSchema = z.strictObject({
  providerId: z.literal('codex-subscription'),
  method: z.enum(['browser', 'device_code']),
  label: z.string().trim().min(1).max(80).default('Codex'),
});
export const AnswerLoginSchema = z.strictObject({
  loginId: IdSchema,
  promptId: IdSchema,
  value: z.string().min(1).max(4096),
});
export const LoginIdSchema = z.strictObject({ loginId: IdSchema });
export const AccountIdSchema = z.strictObject({ accountId: IdSchema });
export const CheckProviderSchema = AccountIdSchema.extend({
  modelId: z.string().max(160).optional(),
});
export const ProviderListSchema = z.strictObject({
  accounts: z.array(AccountViewSchema),
  models: z.array(ModelViewSchema),
});
export const ProviderDiagnosticCodeSchema = z.enum([
  'request_failed',
  'empty_response',
  'empty_text',
  'output_truncated',
  'reasoning_output_truncated',
  'unexpected_content_type',
  'non_streaming_response',
  'unrecognized_json',
  'invalid_utf8',
  'invalid_json',
  'invalid_tool_arguments',
  'frame_too_large',
  'unterminated_sse',
  'read_failed',
  'upstream_error',
  'provider_setup',
  'provider_decoder',
]);
export const ProviderResponseTypeSchema = z.enum([
  'event-stream',
  'json',
  'html',
  'other',
  'missing',
]);
export const ProbeRequestAuditSchema = z.strictObject({
  outputLimit: z.number().int().min(1).max(1_000_000),
  reasoning: z.enum(['none', 'disabled', 'unspecified']),
  stream: z.boolean(),
});
const ProbeTokenCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
export const ProbeUsageSchema = z.strictObject({
  inputTotal: ProbeTokenCountSchema,
  outputTotal: ProbeTokenCountSchema,
  inputCachedSubset: ProbeTokenCountSchema,
  reasoningSubset: ProbeTokenCountSchema,
  source: z.enum(['actual', 'estimated']),
});
export const ProbeViewSchema = z.strictObject({
  accountId: IdSchema,
  status: AccountStatusSchema,
  modelId: z.string().max(160),
  text: z.boolean(),
  tools: z.boolean(),
  errorCode: z.string().max(80).nullable(),
  diagnostic: z
    .strictObject({
      phase: z.enum(['text', 'tools']),
      reason: ProviderDiagnosticCodeSchema,
      httpStatus: z.number().int().min(100).max(599).optional(),
      responseType: ProviderResponseTypeSchema.optional(),
      request: ProbeRequestAuditSchema.optional(),
      usage: ProbeUsageSchema.optional(),
      upstreamCode: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]{1,80}$/)
        .optional(),
    })
    .optional(),
});
export type LoginView = z.infer<typeof LoginViewSchema>;
export type AccountView = z.infer<typeof AccountViewSchema>;
export type ModelView = z.infer<typeof ModelViewSchema>;
export type ProbeView = z.infer<typeof ProbeViewSchema>;
export type StartLogin = z.infer<typeof StartLoginSchema>;

export type ModelRef = { providerId: ProviderId; modelId: string };
export type CanonicalMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      calls?: { id: string; name: string; arguments: Record<string, unknown> }[];
    }
  | { role: 'tool'; callId: string; name: string; text: string; isError: boolean };
export type ModelRequest = {
  logicalCallId: string;
  attemptId: string;
  accountId: string;
  model: ModelRef;
  systemModules: { id: string; text: string }[];
  messages: CanonicalMessage[];
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
  outputLimit: number;
  reasoning: 'off' | 'low' | 'medium' | 'high';
  nativeStateRef?: string;
  taskVersion: number;
  branchId: string;
};
export type NativeBinding = {
  accountId: string;
  modelId: string;
  adapterVersion: string;
  branchId: string;
};
export type NormalizedUsage = {
  inputTotal: number | null;
  inputCachedSubset: number | null;
  outputTotal: number | null;
  reasoningSubset: number | null;
  source: 'actual' | 'estimated';
};
export type ProviderError = {
  code: ErrorCode;
  httpStatus?: number;
  responseType?: z.infer<typeof ProviderResponseTypeSchema>;
  upstreamCode?: string;
  retryable: boolean;
  diagnosticCode?: z.infer<typeof ProviderDiagnosticCodeSchema>;
  retryAfterMs?: number;
};
export type ModelEvent =
  | { type: 'start'; attemptId: string; upstreamId?: string }
  | { type: 'text_delta'; blockId: string; text: string }
  | { type: 'tool_delta'; callId: string; name?: string; argumentsDelta: string }
  | { type: 'tool_end'; callId: string; name: string; arguments: unknown }
  | { type: 'usage'; usage: NormalizedUsage }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length'; nativeStateRef: string }
  | { type: 'error'; error: ProviderError; partial: boolean };
export interface ProviderAdapter {
  readonly id: ProviderId;
  listModels(accountId: string, signal: AbortSignal): Promise<ModelView[]>;
  checkConnection(
    input: { accountId: string; modelId: string },
    signal: AbortSignal,
  ): Promise<ProbeView>;
  stream(input: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
  classifyError(error: unknown): ProviderError;
  refreshAuth?(signal: AbortSignal): Promise<void>;
}
