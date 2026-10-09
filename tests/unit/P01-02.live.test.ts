import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { apiHttpFailure } from '../../packages/providers/src/api/errors';
import { runApiAcceptance, API_LIVE_PHASES } from '../live/P01-02.acceptance';
import { selectApiLiveAccount } from '../live/P01-02.profile';
import { auditedApiFetch } from '../live/P01-02.audit';
import type { ApiRequestAudit } from '../live/P01-02.audit';
import { accountId } from '../fixtures/P01-02.api';
import {
  resolveApiConfig,
  type ModelEvent,
  type ModelRequest,
  type ProviderAdapter,
} from '../../packages/contracts/src';

const config = resolveApiConfig('openai-compatible', { modelId: 'mock-model' });
const selection = { accountId, label: 'fixture', config };
const usage = {
  inputTotal: 10,
  outputTotal: 4,
  inputCachedSubset: null,
  reasoningSubset: null,
  source: 'actual' as const,
};
function harness(failureAt = -1, failure: ModelEvent | undefined = undefined) {
  const requests: ModelRequest[] = [];
  const adapter: ProviderAdapter = {
    id: config.providerId,
    listModels: async () => [],
    checkConnection: async () => {
      throw new Error('not used');
    },
    classifyError: () => ({ code: 'STREAM_INTERRUPTED', retryable: false }),
    async *stream(request, signal) {
      requests.push(structuredClone(request));
      if (requests.length === failureAt) {
        yield failure ?? {
          type: 'error',
          error: {
            code: 'PROVIDER_UNAVAILABLE',
            retryable: true,
            httpStatus: 200,
            upstreamCode: 'overloaded',
          },
          partial: false,
        };
        return;
      }
      if (requests.length === 4)
        yield {
          type: 'tool_end',
          callId: 'echo-1',
          name: 'echo',
          arguments: { text: 'TAPKIT_ECHO' },
        };
      else
        yield {
          type: 'text_delta',
          blockId: '0',
          text: requests.length === 5 ? 'TAPKIT_ECHO' : 'TAPKIT_OK',
        };
      if (signal.aborted) {
        yield { type: 'error', error: { code: 'CANCELLED', retryable: false }, partial: true };
        return;
      }
      yield { type: 'usage', usage };
      yield {
        type: 'finish',
        reason: requests.length === 4 ? 'tool_calls' : 'stop',
        nativeStateRef: 'native-' + requests.length,
      };
    },
  };
  return { adapter, requests };
}
describe('P01-02 bounded API live acceptance', () => {
  it('text-only mode makes exactly one request and leaves the other five phases not_run', async () => {
    const h = harness();
    const result = await runApiAcceptance(h.adapter, selection, new AbortController().signal, {
      textOnly: true,
    });
    expect(result.status).toBe('passed');
    expect(result.requests).toBe(1);
    expect(result.limits).toMatchObject({ requests: 1, outputPerRequest: 128 });
    expect(result.checks.slice(1).every((x) => x.status === 'not_run')).toBe(true);
  });
  it('records only settings at the fetch boundary, never credentials, prompts or native state', async () => {
    const config = resolveApiConfig('openai-compatible', {
      apiFormat: 'openai-responses',
      baseURL: 'https://open.bigmodel.cn/api/v1',
      modelId: 'glm-4.7-flashx',
    });
    const records: ApiRequestAudit[] = [];
    const body = JSON.stringify({
      model: config.modelId,
      stream: true,
      max_output_tokens: 128,
      reasoning: { effort: 'none' },
      store: false,
      instructions: 'private-instructions',
      input: [
        { role: 'user', content: 'private-prompt' },
        { type: 'reasoning', encrypted_content: 'private-native' },
      ],
    });
    const init = { method: 'POST', body, headers: { authorization: 'Bearer private-key' } };
    let received: RequestInit | undefined;
    const fetcher = auditedApiFetch(config, records, async (_url, request) => {
      received = request;
      return new Response(null, { status: 200 });
    });
    await fetcher(config.baseURL + '/responses', init);
    expect(received).toBe(init);
    expect(records[0]).toMatchObject({
      reasoningEffort: 'none',
      maxOutputTokens: 128,
      endpointMatchesConfig: true,
      modelMatchesConfig: true,
      inputShape: 'mixed',
      httpStatus: 200,
    });
    expect(JSON.stringify(records)).not.toMatch(/private-|Bearer|encrypted_content|instructions"/);
  });
  it('keeps transport failures visible and records no invented HTTP status or unsupported settings', async () => {
    const records: ApiRequestAudit[] = [];
    const fetcher = auditedApiFetch(config, records, async () => {
      throw new Error('private-transport-message');
    });
    await expect(
      fetcher('https://example.com/other', {
        body: JSON.stringify({
          model: 'other',
          reasoning: { effort: 'private-reasoning' },
          max_tokens: -1,
        }),
      }),
    ).rejects.toThrow();
    expect(records[0]).toMatchObject({
      modelMatchesConfig: false,
      endpointMatchesConfig: false,
      reasoningEffort: null,
      maxOutputTokens: null,
      httpStatus: null,
    });
    expect(JSON.stringify(records)).not.toContain('private-');
  });
  it('checks native and canonical history, closes tool results and cancels, without retry or provider text in the report', async () => {
    const h = harness();
    const result = await runApiAcceptance(h.adapter, selection);
    expect(result.status).toBe('passed');
    expect(result.checks.map((x) => x.phase)).toEqual(API_LIVE_PHASES);
    expect(result.requests).toBe(6);
    expect(h.requests[1]?.nativeStateRef).toBe('native-1');
    expect(h.requests[2]?.nativeStateRef).toBeUndefined();
    expect(h.requests[4]?.messages.filter((m) => m.role === 'tool')).toHaveLength(1);
    expect(h.requests.every((r) => r.outputLimit === 128 && r.reasoning === 'off')).toBe(true);
    expect(result.checks[5]?.usage).toBeNull();
    expect(result.ledgerVerified).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/TAPKIT_OK|TAPKIT_ECHO|native-/);
  });
  it('stops at the first transient failure, leaving later phases not_run', async () => {
    const h = harness(2);
    const result = await runApiAcceptance(h.adapter, selection);
    expect(result.status).toBe('failed');
    expect(h.requests).toHaveLength(2);
    expect(result.checks[1]?.error).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
    expect(result.checks.slice(2).every((x) => x.status === 'not_run')).toBe(true);
  });
  it('treats a length finish as an incomplete test and never increases the budget', async () => {
    const h = harness(1, { type: 'finish', reason: 'length', nativeStateRef: 'private-ref' });
    const result = await runApiAcceptance(h.adapter, selection);
    expect(result.checks[0]?.error?.code).toBe('OUTPUT_LIMIT_REACHED');
    expect(h.requests).toHaveLength(1);
    expect(result.checks[0]?.usage).toBeNull();
  });
  it('pre-abort dispatches no requests', async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    expect((await runApiAcceptance(h.adapter, selection, controller.signal)).requests).toBe(0);
  });
  it('does not copy arbitrary provider error strings into the report', async () => {
    const h = harness(1, {
      type: 'error',
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        retryable: false,
        upstreamCode: 'private-error-value',
      },
      partial: false,
    });
    expect(JSON.stringify(await runApiAcceptance(h.adapter, selection))).not.toContain(
      'private-error-value',
    );
  });
  it('rejects an early successful finish during cancellation', async () => {
    const h = harness(6, { type: 'finish', reason: 'stop', nativeStateRef: 'private-ref' });
    expect((await runApiAcceptance(h.adapter, selection)).status).toBe('failed');
  });
});
describe('P01-02 API live safety and retry classification', () => {
  it('maps only the official Zhipu overloaded spelling to retryable and preserves the HTTP 200 error', () => {
    expect(apiHttpFailure(200, 'overloaded', true)).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      httpStatus: 200,
      upstreamCode: 'overloaded',
    });
    expect(apiHttpFailure(200, 'overloaded')).toMatchObject({ retryable: false });
    expect(apiHttpFailure(200, 'other', true)).toMatchObject({ retryable: false });
    expect(apiHttpFailure(529, 1305, true)).toMatchObject({ retryable: true });
    expect(apiHttpFailure(401, 'overloaded', true)).toMatchObject({
      code: 'AUTH_EXPIRED',
      retryable: false,
    });
    expect(apiHttpFailure(403, 'overloaded', true)).toMatchObject({
      code: 'PERMISSION_DENIED',
      retryable: false,
    });
  });
  it('rejects API live without explicit opt-in before profile access or Key input', () => {
    const env = { ...process.env };
    delete env.TAPKIT_API_LIVE;
    const result = spawnSync(
      process.execPath,
      ['scripts/live.mjs', '--provider', 'openai-compatible', '--account', 'fixture'],
      { cwd: resolve('.'), env, encoding: 'utf8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('NOT RUN');
    expect(result.stdout).toBe('');
  });
  it('selects one public account from an isolated profile and leaves the database unchanged', () => {
    const root = resolve('.');
    mkdirSync(join(root, '.test-data'), { recursive: true });
    const directory = mkdtempSync(join(root, '.test-data/P01-02-live-fixture-'));
    mkdirSync(join(directory, 'db'));
    const db = new DatabaseSync(join(directory, 'db/app.sqlite'));
    db.exec(
      'CREATE TABLE provider_accounts(id TEXT, label TEXT, provider_id TEXT, auth_type TEXT, api_format TEXT, base_url TEXT, model_id TEXT, deleted_at TEXT)',
    );
    db.prepare(
      "INSERT INTO provider_accounts VALUES (?,?,'openai-compatible','api_key',?,?,?,NULL)",
    ).run(accountId, 'fixture', config.apiFormat, config.baseURL, config.modelId);
    db.close();
    expect(selectApiLiveAccount(root, directory, config.providerId, 'fixture')).toEqual(selection);
    expect(selectApiLiveAccount(root, directory, config.providerId, accountId)).toEqual(selection);
    expect(() =>
      selectApiLiveAccount(root, directory, 'anthropic-compatible', 'fixture'),
    ).toThrow();
    const same = new DatabaseSync(join(directory, 'db/app.sqlite'));
    same.prepare('INSERT INTO provider_accounts SELECT * FROM provider_accounts').run();
    same.close();
    expect(() => selectApiLiveAccount(root, directory, config.providerId, 'fixture')).toThrow(
      'CONFLICT',
    );
    expect(() => selectApiLiveAccount(root, root, config.providerId, 'fixture')).toThrow(
      'PERMISSION_DENIED',
    );
  });
});
