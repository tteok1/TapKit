import type { OAuthCredential } from '@earendil-works/pi-ai';
import { CodexCredentialSchema } from './credentials';
import { CodexFailure, httpFailure } from './errors';

// Public client and endpoint from the locked pi-ai 0.85.1 OAuth implementation.
// Login/PKCE remain upstream-owned; this seam preserves structured refresh failures.
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
export async function refreshCodexCredential(
  credential: OAuthCredential,
  signal: AbortSignal,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<OAuthCredential> {
  const old = CodexCredentialSchema.parse(credential);
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: old.refresh,
      }),
      signal,
    });
  } catch {
    throw new CodexFailure({
      code: signal.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
      retryable: !signal.aborted,
    });
  }
  signal.throwIfAborted();
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    raw = undefined;
  }
  signal.throwIfAborted();
  if (!response.ok) {
    const error = raw && typeof raw === 'object' && 'error' in raw ? raw.error : undefined;
    const code =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined;
    const detail = httpFailure(response.status, code);
    if (response.status === 401 || code === 'invalid_grant' || code === 'invalid_token') {
      detail.code = 'AUTH_EXPIRED';
      detail.retryable = false;
    }
    throw new CodexFailure(detail);
  }
  // Do not return or log the raw token response when validation fails.
  try {
    if (!raw || typeof raw !== 'object') throw new Error();
    const value = raw as Record<string, unknown>;
    if (
      typeof value.access_token !== 'string' ||
      typeof value.refresh_token !== 'string' ||
      typeof value.expires_in !== 'number' ||
      !Number.isFinite(value.expires_in) ||
      value.expires_in <= 0
    )
      throw new Error();
    const claim = JSON.parse(
      Buffer.from(value.access_token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { 'https://api.openai.com/auth'?: { chatgpt_account_id?: unknown } };
    const accountId = claim['https://api.openai.com/auth']?.chatgpt_account_id;
    if (accountId !== old.accountId) throw new Error();
    return CodexCredentialSchema.parse({
      type: 'oauth',
      access: value.access_token,
      refresh: value.refresh_token,
      expires: Date.now() + value.expires_in * 1000,
      accountId,
    });
  } catch {
    throw new CodexFailure({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
  }
}
