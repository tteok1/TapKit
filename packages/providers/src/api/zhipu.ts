import type { ApiConfig } from '@tapkit/contracts';

// Vendor extensions are bound to the official standard Chat endpoint, never
// inferred from a key, a model name alone, or a lookalike hostname.
export function isZhipuChat(config: ApiConfig): boolean {
  const url = new URL(config.baseURL);
  return (
    config.providerId === 'openai-compatible' &&
    config.apiFormat === 'openai-chat' &&
    url.origin === 'https://open.bigmodel.cn' &&
    url.pathname.replace(/\/+$/, '') === '/api/paas/v4'
  );
}

export function isZhipuResponses(config: ApiConfig): boolean {
  const url = new URL(config.baseURL);
  return (
    config.providerId === 'openai-compatible' &&
    config.apiFormat === 'openai-responses' &&
    url.origin === 'https://open.bigmodel.cn' &&
    url.pathname.replace(/\/+$/, '') === '/api/v1'
  );
}

export function apiHeaderDeadlineMs(config: ApiConfig): number {
  return isZhipuChat(config) && config.modelId.toLowerCase() === 'glm-4.7-flashx' ? 90_000 : 20_000;
}
