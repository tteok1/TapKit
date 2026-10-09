import { compatibility, candidates, rebuildCanonical, answerModules } from './catalog';
import { ROUTING_LIMITS } from '@tapkit/contracts';
import type {
  ModelDescriptor,
  ModelPreferences,
  ModelRequest,
  ModelEvent,
  ProviderAdapter,
  ProviderError,
  NormalizedUsage,
  Selection,
  CanonicalMessage,
} from '@tapkit/contracts';
import type { Compatibility } from './catalog';

export type RoutedEvent =
  | { type: 'attempt'; attemptId: string; model: Selection; attemptNo: number }
  | {
      type: 'provider.switched';
      from: Selection;
      to: Selection;
      oldAttemptId: string;
      newAttemptId: string;
    }
  | { type: 'model.event'; attemptId: string; event: ModelEvent }
  | { type: 'route.error'; error: ProviderError };
export type RoutingInput = {
  logicalCallId: string;
  runId: string;
  rootRunId: string;
  projectId?: string;
  mode: 'chat' | 'work';
  preferences: ModelPreferences;
  request: Omit<ModelRequest, 'logicalCallId' | 'attemptId' | 'accountId' | 'model' | 'reasoning'>;
  need: Compatibility;
  allowedAccounts: ReadonlySet<string>;
  nativeOrigin?: Selection;
  foreground?: boolean;
  singleAttempt?: boolean;
  // Caller must await its tool ledger/checkpoint. It supplies authoritative, closed messages.
  settlePendingTools?: () => Promise<CanonicalMessage[]>;
};
export type RoutingDependencies = {
  catalog(): Promise<ModelDescriptor[]>;
  adapter(accountId: string): ProviderAdapter;
  id(): string;
  now(): number;
  disabled(accountId: string): boolean;
  reserve(request: ModelRequest, model: ModelDescriptor, input: RoutingInput): number;
  settle(
    attemptId: string,
    result: {
      status: 'completed' | 'interrupted' | 'failed' | 'cancelled';
      text: string;
      activeMs: number;
      usage?: NormalizedUsage;
      error?: ProviderError;
      nativeStateRef?: string;
    },
  ): void;
  disable(accountId: string, error: ProviderError, expectedRevision?: number | null): void;
  switched(
    logicalCallId: string,
    oldId: string,
    newId: string,
    from: Selection,
    to: Selection,
  ): void;
  acquire(accountId: string, signal: AbortSignal, foreground?: boolean): Promise<() => void>;
  checkpoint?(attemptId: string, text: string): void;
  wait?(ms: number, signal: AbortSignal): Promise<void>;
  random?(): number;
};
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error('CANCELLED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
export class ModelRouter {
  constructor(readonly deps: RoutingDependencies) {}
  async *stream(input: RoutingInput, signal: AbortSignal): AsyncIterable<RoutedEvent> {
    const deps = this.deps;
    const controller = new AbortController();
    const combined = AbortSignal.any([
      signal,
      controller.signal,
      AbortSignal.timeout(
        input.mode === 'chat' ? ROUTING_LIMITS.chatActiveMs : ROUTING_LIMITS.workActiveMs,
      ),
    ]);
    let previous: { selection: Selection; attemptId: string } | undefined;
    let last: ProviderError = { code: 'PROVIDER_UNAVAILABLE', retryable: false };
    const visited = new Set<string>();
    let count = 0;
    let messages = structuredClone(input.request.messages);
    try {
      // Validate pairing before dispatch. No pending or invented tool result is accepted.
      if (input.settlePendingTools) messages = await input.settlePendingTools();
      rebuildCanonical(messages);
      while (count < ROUTING_LIMITS.fallbackAccounts) {
        combined.throwIfAborted();
        const catalog = await deps.catalog();
        const available = candidates(
          catalog,
          input.preferences,
          input.need,
          input.allowedAccounts,
        ).filter((m) => !visited.has(m.accountId!) && !deps.disabled(m.accountId!));
        const model = available[0];
        if (!model) break;
        if (
          previous &&
          model.providerId !== 'codex-subscription' &&
          !input.preferences.allowPaidFallback
        ) {
          last = { code: 'APPROVAL_REQUIRED', retryable: false };
          break;
        }
        const selection = { accountId: model.accountId!, modelId: model.modelId };
        visited.add(selection.accountId);
        count++;
        const adapter = deps.adapter(selection.accountId);
        let retries = 0,
          refreshed = false;
        let accountRevision = model.accountRevision;
        while (true) {
          combined.throwIfAborted();
          const release = await deps.acquire(
            selection.accountId,
            combined,
            input.foreground ?? true,
          );
          let attemptId: string | undefined;
          let settled = false;
          const start = deps.now();
          let text = '',
            usage: NormalizedUsage | undefined,
            terminal: Extract<ModelEvent, { type: 'finish' }> | undefined;
          let error: ProviderError | undefined,
            bodyStarted = false;
          const tools: Extract<ModelEvent, { type: 'tool_end' }>[] = [];
          try {
            // Recheck account/model immediately before the atomic reservation.
            const fresh = (await deps.catalog()).find(
              (m) => m.accountId === selection.accountId && m.modelId === selection.modelId,
            );
            if (
              !fresh ||
              deps.disabled(selection.accountId) ||
              compatibility(fresh, input.preferences, input.need).length
            )
              throw new Error('PROVIDER_UNAVAILABLE');
            accountRevision = fresh.accountRevision;
            const cross =
              previous !== undefined ||
              (input.nativeOrigin &&
                (input.nativeOrigin.accountId !== selection.accountId ||
                  input.nativeOrigin.modelId !== selection.modelId));
            if (cross && input.settlePendingTools) messages = await input.settlePendingTools();
            const canonical = cross ? rebuildCanonical(messages) : messages;
            const reasoning =
              input.preferences.mode === 'quick'
                ? 'off'
                : input.preferences.reasoning === 'off'
                  ? 'medium'
                  : input.preferences.reasoning;
            const nextId = deps.id();
            const { nativeStateRef, ...base } = input.request;
            const request: ModelRequest = {
              ...base,
              messages: canonical,
              systemModules: [...base.systemModules, ...answerModules(input.preferences)],
              logicalCallId: input.logicalCallId,
              attemptId: nextId,
              accountId: selection.accountId,
              model: { providerId: model.providerId, modelId: model.modelId },
              reasoning,
              ...(!cross && nativeStateRef && input.nativeOrigin ? { nativeStateRef } : {}),
            };
            const attemptNo = deps.reserve(request, model, input);
            attemptId = nextId;
            if (previous && previous.selection.accountId !== selection.accountId) {
              deps.switched(
                input.logicalCallId,
                previous.attemptId,
                nextId,
                previous.selection,
                selection,
              );
              yield {
                type: 'provider.switched',
                from: previous.selection,
                to: selection,
                oldAttemptId: previous.attemptId,
                newAttemptId: nextId,
              };
            }
            yield { type: 'attempt', attemptId, model: selection, attemptNo };
            for await (const event of adapter.stream(request, combined)) {
              combined.throwIfAborted();
              if (event.type === 'error') {
                error = event.error;
                bodyStarted ||= event.partial;
                break;
              }
              if (event.type === 'finish') {
                terminal = event;
                break;
              }
              if (event.type === 'usage') {
                const u = event.usage;
                if (
                  [u.inputTotal, u.outputTotal, u.inputCachedSubset, u.reasoningSubset].some(
                    (n) => n !== null && (!Number.isSafeInteger(n) || n < 0),
                  ) ||
                  (u.inputCachedSubset !== null &&
                    u.inputTotal !== null &&
                    u.inputCachedSubset > u.inputTotal) ||
                  (u.reasoningSubset !== null &&
                    u.outputTotal !== null &&
                    u.reasoningSubset > u.outputTotal)
                ) {
                  usage = undefined;
                  error = { code: 'STREAM_INTERRUPTED', retryable: false };
                  break;
                }
                usage = u;
              }
              if (event.type === 'tool_end') tools.push(event);
              if (event.type === 'text_delta') {
                text += event.text;
                bodyStarted = true;
                deps.checkpoint?.(attemptId, text);
                if (text.length > 200_000) {
                  error = { code: 'STREAM_INTERRUPTED', retryable: false };
                  break;
                }
              }
              if (event.type === 'tool_delta') bodyStarted = true;
              if (event.type !== 'tool_end') yield { type: 'model.event', attemptId, event };
            }
            if (!terminal && !error) error = { code: 'STREAM_INTERRUPTED', retryable: false };
            deps.settle(attemptId, {
              status: terminal
                ? 'completed'
                : error?.code === 'CANCELLED'
                  ? 'cancelled'
                  : bodyStarted
                    ? 'interrupted'
                    : 'failed',
              text,
              activeMs: deps.now() - start,
              ...(usage ? { usage } : {}),
              ...(error ? { error } : {}),
              ...(terminal ? { nativeStateRef: terminal.nativeStateRef } : {}),
            });
            settled = true;
            if (terminal) {
              for (const event of tools) yield { type: 'model.event', attemptId, event };
              yield { type: 'model.event', attemptId, event: terminal };
              return;
            }
            last = error!;
            previous = { selection, attemptId };
            yield {
              type: 'model.event',
              attemptId,
              event: { type: 'error', error: last, partial: bodyStarted },
            };
          } catch (caught) {
            last = combined.aborted
              ? { code: 'CANCELLED', retryable: false }
              : adapter.classifyError(caught);
            const code = caught instanceof Error ? caught.message : '';
            if (
              [
                'BUDGET_EXCEEDED',
                'CONFLICT',
                'SIDE_EFFECT_UNKNOWN',
                'VALIDATION_ERROR',
                'PERMISSION_DENIED',
              ].includes(code)
            )
              last = { code: code as ProviderError['code'], retryable: false };
            if (attemptId && !settled) {
              deps.settle(attemptId, {
                status:
                  last.code === 'CANCELLED' ? 'cancelled' : bodyStarted ? 'interrupted' : 'failed',
                text,
                activeMs: deps.now() - start,
                ...(usage ? { usage } : {}),
                error: last,
              });
              settled = true;
              previous = { selection, attemptId };
            }
          } finally {
            // Consumer cancellation also settles reservations; tools are never executed here.
            if (attemptId && !settled)
              deps.settle(attemptId, {
                status: 'cancelled',
                text,
                activeMs: deps.now() - start,
                ...(usage ? { usage } : {}),
                error: { code: 'CANCELLED', retryable: false },
              });
            release();
          }
          if (
            input.singleAttempt ||
            last.code === 'CANCELLED' ||
            [
              'BUDGET_EXCEEDED',
              'CONFLICT',
              'SIDE_EFFECT_UNKNOWN',
              'PERMISSION_DENIED',
              'VALIDATION_ERROR',
            ].includes(last.code)
          ) {
            yield { type: 'route.error', error: last };
            return;
          }
          if (last.code === 'AUTH_EXPIRED' && !bodyStarted && !refreshed && adapter.refreshAuth) {
            refreshed = true;
            try {
              await adapter.refreshAuth(combined);
              continue;
            } catch (caught) {
              last = adapter.classifyError(caught);
              if (combined.aborted) throw caught;
            }
          }
          if (
            last.code === 'QUOTA_EXHAUSTED' ||
            last.code === 'AUTH_EXPIRED' ||
            last.code === 'AUTH_REQUIRED'
          )
            deps.disable(selection.accountId, last, accountRevision);
          const transient =
            ['RATE_LIMITED', 'NETWORK_ERROR', 'PROVIDER_UNAVAILABLE'].includes(last.code) &&
            last.retryable;
          if (transient && !bodyStarted && retries < ROUTING_LIMITS.retries) {
            const delay =
              last.retryAfterMs ??
              [1000, 3000][retries]! + Math.floor((deps.random?.() ?? Math.random()) * 250);
            if (delay > ROUTING_LIMITS.retryWaitMs || delay < 0) {
              yield { type: 'route.error', error: last };
              return;
            }
            retries++;
            await (deps.wait ?? pause)(delay, combined);
            continue;
          }
          // Only explicit exhaustion/unavailability may switch. Ordinary 429 never becomes exhaustion.
          if (
            ![
              'QUOTA_EXHAUSTED',
              'AUTH_EXPIRED',
              'AUTH_REQUIRED',
              'MODEL_UNSUPPORTED',
              'PROVIDER_UNAVAILABLE',
              'NETWORK_ERROR',
              'STREAM_INTERRUPTED',
            ].includes(last.code)
          ) {
            yield { type: 'route.error', error: last };
            return;
          }
          break;
        }
        if (input.preferences.onlyThisModel) break;
      }
      yield { type: 'route.error', error: last };
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      yield {
        type: 'route.error',
        error: {
          code: combined.aborted
            ? 'CANCELLED'
            : code === 'CONFLICT'
              ? 'CONFLICT'
              : 'PROVIDER_UNAVAILABLE',
          retryable: false,
        },
      };
    } finally {
      controller.abort();
    }
  }
}
