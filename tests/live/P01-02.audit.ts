import type { ApiConfig } from '../../packages/contracts/src';
import { secureApiFetch } from '../../packages/providers/src/api/http';

export type ApiRequestAudit = {
  ordinal: number;
  endpointMatchesConfig: boolean;
  modelMatchesConfig: boolean;
  stream: boolean;
  maxOutputTokens: number | null;
  reasoningEffort: string | null;
  thinkingType: string | null;
  inputShape: 'string' | 'message.content.string' | 'mixed' | 'unavailable';
  instructionsPresent: boolean;
  toolCount: number;
  storeFalse: boolean;
  httpStatus: number | null;
};
// Observe only known request settings, never headers, content, arguments or native state.
export function auditedApiFetch(
  config: ApiConfig,
  audit: ApiRequestAudit[],
  fetcher: typeof fetch = secureApiFetch,
): typeof fetch {
  return async (url, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const path =
      config.apiFormat === 'openai-chat'
        ? 'chat/completions'
        : config.apiFormat === 'openai-responses'
          ? 'responses'
          : 'messages';
    const items = body.input ?? body.messages;
    const output = body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens;
    const entry: ApiRequestAudit = {
      ordinal: audit.length + 1,
      endpointMatchesConfig: String(url) === config.baseURL.replace(/\/+$/, '') + '/' + path,
      modelMatchesConfig: body.model === config.modelId,
      stream: body.stream === true,
      maxOutputTokens: Number.isSafeInteger(output) && output > 0 ? output : null,
      reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(
        body.reasoning?.effort,
      )
        ? body.reasoning.effort
        : null,
      thinkingType: ['disabled', 'enabled'].includes(body.thinking?.type)
        ? body.thinking.type
        : null,
      inputShape:
        typeof items === 'string'
          ? 'string'
          : Array.isArray(items)
            ? items.every((item: Record<string, unknown>) => typeof item.content === 'string')
              ? 'message.content.string'
              : 'mixed'
            : 'unavailable',
      instructionsPresent: Boolean(
        body.instructions ||
        body.system ||
        (Array.isArray(body.messages) &&
          body.messages.some((m: { role?: string }) => m.role === 'system')),
      ),
      toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
      storeFalse: body.store === false,
      httpStatus: null,
    };
    audit.push(entry);
    const response = await fetcher(url, init);
    entry.httpStatus = response.status;
    return response;
  };
}
