import type { ProviderError } from '@tapkit/contracts';
import { ModelsError } from '@earendil-works/pi-ai';
export class CodexFailure extends Error {
  constructor(readonly detail: ProviderError) {
    super(detail.code);
  }
}
export function classifyCodexError(error: unknown, signal?: AbortSignal): ProviderError {
  if (signal?.aborted) return { code: 'CANCELLED', retryable: false };
  if (error instanceof CodexFailure) return error.detail;
  // pi wraps credential/refresh errors; inspect typed causes, never upstream text.
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof ModelsError; depth++) {
    cause = cause.cause;
    if (cause instanceof CodexFailure) return cause.detail;
  }
  const code = error instanceof Error ? error.message : '';
  if (
    [
      'AUTH_REQUIRED',
      'AUTH_EXPIRED',
      'MODEL_UNSUPPORTED',
      'CONFLICT',
      'STREAM_INTERRUPTED',
      'VALIDATION_ERROR',
      'CANCELLED',
      'PERMISSION_DENIED',
    ].includes(code)
  )
    return { code: code as ProviderError['code'], retryable: false };
  return { code: 'PROVIDER_UNAVAILABLE', retryable: false };
}
export function httpFailure(status: number, rawCode?: string): ProviderError {
  const upstreamCode = rawCode && /^[a-zA-Z0-9_.-]{1,80}$/.test(rawCode) ? rawCode : undefined;
  const quota = new Set(['usage_limit_reached', 'insufficient_quota', 'quota_exceeded']);
  const code: ProviderError['code'] =
    upstreamCode && quota.has(upstreamCode)
      ? 'QUOTA_EXHAUSTED'
      : status === 401
        ? 'AUTH_EXPIRED'
        : status === 403
          ? 'PERMISSION_DENIED'
          : status === 429
            ? 'RATE_LIMITED'
            : status === 404
              ? 'MODEL_UNSUPPORTED'
              : 'PROVIDER_UNAVAILABLE';
  return {
    code,
    httpStatus: status,
    ...(upstreamCode ? { upstreamCode } : {}),
    retryable: code === 'RATE_LIMITED' || status >= 500,
  };
}
