import type { ProviderError } from '@tapkit/contracts';
import { httpFailure } from '../codex/errors';
const zhipuErrors: Record<string, Pick<ProviderError, 'code' | 'retryable'>> = {
  overloaded: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
  '1000': { code: 'AUTH_EXPIRED', retryable: false },
  '1001': { code: 'AUTH_EXPIRED', retryable: false },
  '1003': { code: 'AUTH_EXPIRED', retryable: false },
  '1005': { code: 'PERMISSION_DENIED', retryable: false },
  '1113': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1210': { code: 'VALIDATION_ERROR', retryable: false },
  '1211': { code: 'MODEL_UNSUPPORTED', retryable: false },
  '1212': { code: 'MODEL_UNSUPPORTED', retryable: false },
  '1213': { code: 'VALIDATION_ERROR', retryable: false },
  '1214': { code: 'VALIDATION_ERROR', retryable: false },
  '1215': { code: 'VALIDATION_ERROR', retryable: false },
  '1220': { code: 'PERMISSION_DENIED', retryable: false },
  '1261': { code: 'VALIDATION_ERROR', retryable: false },
  '1302': { code: 'RATE_LIMITED', retryable: true },
  '1305': { code: 'PROVIDER_UNAVAILABLE', retryable: true },
  '1308': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1309': { code: 'PERMISSION_DENIED', retryable: false },
  '1310': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1311': { code: 'PERMISSION_DENIED', retryable: false },
  '1313': { code: 'RATE_LIMITED', retryable: false },
  '1314': { code: 'PERMISSION_DENIED', retryable: false },
  '1315': { code: 'PERMISSION_DENIED', retryable: false },
  '1316': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1317': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1318': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1319': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1320': { code: 'QUOTA_EXHAUSTED', retryable: false },
  '1321': { code: 'QUOTA_EXHAUSTED', retryable: false },
};
const zhipuResponseErrors: Record<string, Pick<ProviderError, 'code' | 'retryable'>> = {
  invalid_request: { code: 'VALIDATION_ERROR', retryable: false },
  model_not_found: { code: 'MODEL_UNSUPPORTED', retryable: false },
  not_implemented: { code: 'MODEL_UNSUPPORTED', retryable: false },
  request_too_large: { code: 'VALIDATION_ERROR', retryable: false },
  authentication_error: { code: 'AUTH_EXPIRED', retryable: false },
  invalid_api_key: { code: 'AUTH_EXPIRED', retryable: false },
  expired: { code: 'AUTH_EXPIRED', retryable: false },
  permission_denied: { code: 'PERMISSION_DENIED', retryable: false },
  context_length_exceeded: { code: 'VALIDATION_ERROR', retryable: false },
  rate_limit_exceeded: { code: 'RATE_LIMITED', retryable: true },
  insufficient_quota: { code: 'QUOTA_EXHAUSTED', retryable: false },
  quota_exceeded: { code: 'QUOTA_EXHAUSTED', retryable: false },
  usage_limit_reached: { code: 'QUOTA_EXHAUSTED', retryable: false },
  usage_not_included: { code: 'QUOTA_EXHAUSTED', retryable: false },
  server_error: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
  server_is_overloaded: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
  overloaded: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
  slow_down: { code: 'RATE_LIMITED', retryable: true },
  content_filter: { code: 'PERMISSION_DENIED', retryable: false },
  cyber_policy: { code: 'PERMISSION_DENIED', retryable: false },
};
export function apiHttpFailure(
  status: number,
  rawCode: unknown,
  zhipu = false,
  zhipuResponses = false,
): ProviderError {
  const code =
    typeof rawCode === 'string'
      ? rawCode
      : typeof rawCode === 'number' && Number.isSafeInteger(rawCode) && rawCode >= 0
        ? String(rawCode)
        : undefined;
  const result = httpFailure(status, code);
  if (zhipuResponses && (status === 401 || status === 403))
    return {
      ...result,
      code: status === 401 ? 'AUTH_EXPIRED' : 'PERMISSION_DENIED',
      retryable: false,
    };
  if (zhipuResponses && code && Object.hasOwn(zhipuResponseErrors, code)) {
    return { ...result, ...zhipuResponseErrors[code] };
  }
  // A busy code must not turn an authentication/permission failure into a retry.
  if (zhipu && code === 'overloaded' && status !== 200 && status !== 429 && status < 500)
    return result;
  if (zhipu && code && Object.hasOwn(zhipuErrors, code)) return { ...result, ...zhipuErrors[code] };
  if (result.code === 'QUOTA_EXHAUSTED') return result;
  const structured: Record<string, Pick<ProviderError, 'code' | 'retryable'>> = {
    authentication_error: { code: 'AUTH_EXPIRED', retryable: false },
    invalid_api_key: { code: 'AUTH_EXPIRED', retryable: false },
    permission_error: { code: 'PERMISSION_DENIED', retryable: false },
    rate_limit_error: { code: 'RATE_LIMITED', retryable: true },
    rate_limit_exceeded: { code: 'RATE_LIMITED', retryable: true },
    overloaded_error: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
    invalid_request_error: { code: 'VALIDATION_ERROR', retryable: false },
    context_length_exceeded: { code: 'VALIDATION_ERROR', retryable: false },
    model_not_found: { code: 'MODEL_UNSUPPORTED', retryable: false },
  };
  // Preserve HTTP status even for an error event inside an HTTP 200 SSE stream.
  return code && Object.hasOwn(structured, code) ? { ...result, ...structured[code] } : result;
}
