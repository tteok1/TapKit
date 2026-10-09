import { randomUUID } from 'node:crypto';
import type {
  ApiConfig,
  CanonicalMessage,
  ModelRequest,
  NormalizedUsage,
  ProviderAdapter,
  ProviderError,
} from '../../packages/contracts/src';

export const API_LIVE_PHASES = [
  'text',
  'two-turn-native',
  'two-turn-canonical',
  'tool-call',
  'tool-result',
  'cancel',
] as const;
export const API_LIVE_LIMITS = { requests: 6, outputPerRequest: 128, totalMs: 300_000 } as const;
type Phase = (typeof API_LIVE_PHASES)[number];
type PhaseResult = {
  phase: Phase;
  status: 'passed' | 'failed' | 'not_run';
  usage: NormalizedUsage | null;
  error?: ProviderError;
};
export type ApiLiveSelection = { accountId: string; label: string; config: ApiConfig };
export type ApiLiveReport = {
  task: 'P01-02';
  status: 'passed' | 'failed';
  checks: PhaseResult[];
  requests: number;
  limits: { requests: number; outputPerRequest: number; totalMs: number };
  ledgerVerified: false;
};
const emptyChecks = (): PhaseResult[] =>
  API_LIVE_PHASES.map((phase) => ({ phase, status: 'not_run', usage: null }));
// No provider messages, response text, arguments, or native references in reports.
function safeError(error: ProviderError): ProviderError {
  return {
    code: error.code,
    retryable: error.retryable,
    ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    ...(error.upstreamCode &&
    /^(?:\d{3,6}|overloaded|overloaded_error|authentication_error|invalid_api_key|permission_error|rate_limit_error|rate_limit_exceeded|invalid_request_error|context_length_exceeded|model_not_found|insufficient_quota|quota_exceeded)$/.test(
      error.upstreamCode,
    )
      ? { upstreamCode: error.upstreamCode }
      : {}),
    ...(error.diagnosticCode ? { diagnosticCode: error.diagnosticCode } : {}),
  };
}
class CheckFailed extends Error {
  constructor(readonly detail: ProviderError) {
    super(detail.code);
  }
}
function requireCheck(condition: unknown, code: ProviderError['code'] = 'VALIDATION_ERROR') {
  if (!condition) throw new CheckFailed({ code, retryable: false });
}
export async function runApiAcceptance(
  adapter: ProviderAdapter,
  selection: ApiLiveSelection,
  signal: AbortSignal = new AbortController().signal,
  options: { textOnly?: boolean } = {},
): Promise<ApiLiveReport> {
  const checks = emptyChecks();
  const limits = {
    ...API_LIVE_LIMITS,
    ...(options.textOnly ? { requests: 1, totalMs: 90_000 } : {}),
  };
  let requests = 0;
  const combined = AbortSignal.any([signal, AbortSignal.timeout(limits.totalMs)]);
  const request: ModelRequest = {
    accountId: selection.accountId,
    model: { providerId: selection.config.providerId, modelId: selection.config.modelId },
    logicalCallId: randomUUID(),
    attemptId: randomUUID(),
    branchId: randomUUID(),
    taskVersion: 1,
    systemModules: [{ id: 'api-live', text: 'Follow these short test instructions exactly.' }],
    messages: [{ role: 'user', text: 'Reply only TAPKIT_OK.' }],
    tools: [],
    outputLimit: API_LIVE_LIMITS.outputPerRequest,
    reasoning: 'off',
  };
  const report = (status: ApiLiveReport['status']): ApiLiveReport => ({
    task: 'P01-02',
    status,
    checks,
    requests,
    limits,
    ledgerVerified: false,
  });
  for (const check of checks) {
    try {
      combined.throwIfAborted();
      if (check.phase === 'two-turn-native') {
        requireCheck(request.nativeStateRef, 'STREAM_INTERRUPTED');
        request.messages.push({
          role: 'user',
          text: 'Repeat the marker from your first answer only.',
        });
      } else if (check.phase === 'two-turn-canonical') {
        delete request.nativeStateRef;
        request.messages.push({
          role: 'user',
          text: 'Repeat the marker from your first answer only.',
        });
      } else if (check.phase === 'tool-call') {
        request.tools = [
          {
            name: 'echo',
            description: 'Echo the text.',
            parameters: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        ];
        request.messages.push({
          role: 'user',
          text: 'Call echo once with text TAPKIT_ECHO. Do not answer in plain text.',
        });
      } else if (check.phase === 'tool-result') {
        const last = request.messages.at(-1);
        requireCheck(last?.role === 'assistant' && last.calls?.length === 1);
        const call = (last as Extract<CanonicalMessage, { role: 'assistant' }>).calls![0]!;
        request.tools = [];
        // A pure echo; this never dispatches any OS tool or external side effect.
        request.messages.push(
          { role: 'tool', callId: call.id, name: 'echo', text: 'TAPKIT_ECHO', isError: false },
          { role: 'user', text: 'Reply with the tool result only.' },
        );
      } else if (check.phase === 'cancel') {
        request.messages.push({
          role: 'user',
          text: 'List numbers 1 through 100, one per line. Begin immediately.',
        });
      }
      request.logicalCallId = randomUUID();
      request.attemptId = randomUUID();
      const controller = new AbortController();
      const phaseSignal = AbortSignal.any([
        combined,
        controller.signal,
        AbortSignal.timeout(90_000),
      ]);
      let text = '',
        finished = false,
        cancelled = false,
        nativeStateRef: string | undefined;
      const calls: NonNullable<Extract<CanonicalMessage, { role: 'assistant' }>['calls']> = [];
      requireCheck(requests < limits.requests);
      requests++;
      for await (const event of adapter.stream(structuredClone(request), phaseSignal)) {
        if (event.type === 'usage') check.usage = structuredClone(event.usage);
        if (event.type === 'error') {
          if (
            check.phase === 'cancel' &&
            controller.signal.aborted &&
            event.error.code === 'CANCELLED'
          )
            cancelled = true;
          else throw new CheckFailed(safeError(event.error));
        }
        if (event.type === 'text_delta') {
          text += event.text;
          if (check.phase === 'cancel' && event.text) controller.abort();
        }
        if (event.type === 'tool_end') {
          requireCheck(check.phase !== 'cancel');
          calls.push({
            id: event.callId,
            name: event.name,
            arguments: event.arguments as Record<string, unknown>,
          });
        }
        if (event.type === 'finish') {
          requireCheck(check.phase !== 'cancel' && !finished, 'STREAM_INTERRUPTED');
          requireCheck(event.reason !== 'length', 'OUTPUT_LIMIT_REACHED');
          finished = true;
          nativeStateRef = event.nativeStateRef;
          requireCheck(event.reason === (check.phase === 'tool-call' ? 'tool_calls' : 'stop'));
        }
      }
      if (check.phase === 'cancel')
        requireCheck(text && cancelled && !finished, 'STREAM_INTERRUPTED');
      else {
        requireCheck(finished && nativeStateRef, 'STREAM_INTERRUPTED');
        if (check.phase === 'tool-call')
          requireCheck(
            calls.length === 1 &&
              calls[0]?.name === 'echo' &&
              calls[0].arguments.text === 'TAPKIT_ECHO',
          );
        else
          requireCheck(
            !calls.length &&
              text.trim() === (check.phase === 'tool-result' ? 'TAPKIT_ECHO' : 'TAPKIT_OK'),
          );
        request.nativeStateRef = nativeStateRef!;
        request.messages.push({ role: 'assistant', text, ...(calls.length ? { calls } : {}) });
      }
      check.status = 'passed';
      if (options.textOnly) return report('passed');
    } catch (error) {
      check.status = 'failed';
      check.error =
        error instanceof CheckFailed
          ? error.detail
          : {
              code: combined.aborted ? 'CANCELLED' : 'STREAM_INTERRUPTED',
              retryable: false,
            };
      return report('failed');
    }
  }
  return report('passed');
}
