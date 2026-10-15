import { it, expect, vi } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { memoryNative, modelRequest, events, sseFrames } from '../fixtures/P01-02.api';
import { resolveApiConfig, type ModelEvent } from '../../packages/contracts/src';

it('P01-02 adapter refuses a changed canonical prefix before issuing the native replay request', async () => {
  const config = resolveApiConfig('openai-compatible', {
    apiFormat: 'openai-chat',
    baseURL: 'https://fixture.invalid/v1',
    modelId: 'native-prefix-fixture',
  });
  const native = memoryNative();
  const fetcher = vi.fn(async () =>
    sseFrames(events('openai-chat', false, false, undefined, 'OK')),
  );
  const request = modelRequest(config);
  const adapter = new ApiKeyAdapter(
    request.accountId,
    config,
    async () => 'synthetic-only',
    native.store,
    fetcher,
  );
  let ref: string | undefined;
  for await (const event of adapter.stream(request, new AbortController().signal))
    if (event.type === 'finish') ref = event.nativeStateRef;
  expect(ref).toBeTruthy();
  const result: ModelEvent[] = [];
  for await (const event of adapter.stream(
    {
      ...request,
      nativeStateRef: ref!,
      messages: [
        { role: 'user', text: 'edited earlier input' },
        { role: 'assistant', text: 'OK' },
        { role: 'user', text: 'continue' },
      ],
    },
    new AbortController().signal,
  ))
    result.push(event);
  expect(result).toContainEqual({
    type: 'error',
    error: { code: 'PERMISSION_DENIED', retryable: false },
    partial: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
