// One bounded, user-authorized public search; no private conversation or native state.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { CodexAdapter, AccountCredentialStore, configureProviderNetwork } from '../../../packages/providers/src';
import { WebOptionsSchema, type HostedSearchResult, type NormalizedUsage } from '../../../packages/contracts/src';
import { NetworkPolicyService } from '../../../packages/network/src';
import { WebTools } from '../../../packages/tools/src';

async function run() {
  const output = process.env.TAPKIT_HOSTED_LIVE_OUTPUT;
  if (process.env.TAPKIT_HOSTED_LIVE_AUTHORIZED !== 'additional-2-public-searches-2026-10-27' || !output || !/live-search-0[34]\.json$/.test(output)) throw Error('APPROVAL_REQUIRED');
  // wx claim persists before any model request, so a crash cannot cause accidental replay.
  await writeFile(output, JSON.stringify({ status: 'started', scope: 'one-public-search', noPrivateContext: true }), { flag: 'wx' });
  const report: Record<string, unknown> = { started: new Date().toISOString(), requests: 0, model: 'gpt-6.1-sol', noPrivateContext: true, nativeStateSaved: false };
  let restore: (() => void) | undefined;
  try {
    const auth = JSON.parse(await readFile(join(homedir(), '.codex', 'auth.json'), 'utf8'));
    if (auth.auth_mode !== 'chatgpt') throw Error('AUTH_REQUIRED');
    const tokens = auth.tokens;
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString('utf8'));
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 < Date.now() + 300000) throw Error('AUTH_EXPIRED');
    const credentials = new AccountCredentialStore({
      read: async () => ({ version: 1, credential: { type: 'oauth', access: tokens.access_token, refresh: tokens.refresh_token, expires: claims.exp * 1000, accountId: tokens.account_id } }),
      write: async () => { throw Error('GLOBAL_CREDENTIAL_WRITE_FORBIDDEN'); },
    });
    restore = configureProviderNetwork();
    const channel = new CodexAdapter(randomUUID(), credentials, {
      save: async () => { throw Error('NATIVE_STATE_FORBIDDEN'); },
      load: async () => { throw Error('NATIVE_STATE_FORBIDDEN'); },
    }, async (url, init) => {
      if (++(report.requests as number) > 1) throw Error('BUDGET_EXCEEDED');
      const response = await fetch(url, init);
      report.httpStatus = response.status;
      report.responseType = response.headers.get('content-type')?.split(';')[0] ?? 'missing';
      if (!response.ok) {
        try {
          const raw = await response.clone().json();
          const error = raw.error ?? raw;
          if (typeof error.param === 'string' && /^[a-zA-Z0-9_.\[\]-]{1,120}$/.test(error.param)) report.rejectedParameter = error.param;
          const message = typeof error.message === 'string' ? error.message : '';
          report.reasonFlags = Object.fromEntries(['include', 'web_search', 'model', 'reasoning', 'originator', 'not supported'].map(word => [word, message.includes(word)]));
        } catch { /* Only safe category flags, never raw response text. */ }
      }
      return response;
    });
    const query = '查找 Node.js、TypeScript 和 Electron 各自的官方文档入口，请搜索公开资料并给出三个官方链接。';
    const options = WebOptionsSchema.parse({ mode: 'on' });
    let result: HostedSearchResult | undefined, usage: NormalizedUsage | undefined, finished = false;
    const signal = AbortSignal.timeout(90000);
    for await (const event of channel.stream({
      accountId: channel.accountId, model: { providerId: 'codex-subscription', modelId: 'gpt-6.1-sol' },
      logicalCallId: randomUUID(), attemptId: randomUUID(), branchId: randomUUID(), taskVersion: 1,
      messages: [{ role: 'user', text: query }], systemModules: [], tools: [], outputLimit: 2048,
      reasoning: 'low', hostedSearch: options,
    }, signal)) {
      if (event.type === 'usage') usage = event.usage;
      if (event.type === 'hosted_search') result = event.result;
      if (event.type === 'finish') finished = true;
      if (event.type === 'error') { report.error = event.error; throw Error(event.error.code); }
    }
    report.usage = usage;
    if (!result || !finished) throw Error('MODEL_UNSUPPORTED');
    report.result = result;
    const tools = new WebTools(new NetworkPolicyService());
    const pages: unknown[] = [];
    for (const candidate of result.candidates.slice(0, 8)) {
      if (pages.length >= 3) break;
      try {
        const page = await tools.read({ url: candidate.url }, options, signal);
        pages.push({ url: page.url, title: page.title, characters: page.text.length, contentHash: createHash('sha256').update(page.text).digest('hex') });
      } catch (error) {
        (report.readErrors ??= [] as unknown[] as any);
        (report.readErrors as unknown[]).push({ url: candidate.url, code: error instanceof Error ? error.message.slice(0, 80) : 'WEB_UNAVAILABLE' });
      }
    }
    report.pages = pages;
    report.status = pages.length === 3 ? 'search_and_three_reads_passed' : 'search_passed_reads_incomplete';
  } catch (error) {
    report.status = 'failed';
    report.errorCode = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'UNCLASSIFIED_ERROR';
  } finally {
    restore?.();
    report.finished = new Date().toISOString();
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, requests: report.requests, httpStatus: report.httpStatus, errorCode: report.errorCode }));
    if (report.status === 'failed') process.exitCode = 1;
  }
}
void run().catch(() => { console.error('LIVE_RUNNER_SETUP_FAILED'); process.exitCode = 1; });
