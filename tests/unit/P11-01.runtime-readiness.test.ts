import { expect, test } from 'vitest';
import { unavailableExecution, type ExecutionCapabilities } from '../../packages/contracts/src';
import {
  RuntimeVerification,
  waitForRuntimeCapabilities,
} from '../../packages/core/src/runtime-capabilities';

test('P11-01 native operations wait for verification and can cancel without cancelling the shared check', async () => {
  const probe = Promise.withResolvers<ExecutionCapabilities>();
  const verification = new RuntimeVerification(() => probe.promise);
  const abort = new AbortController();
  const cancelled = waitForRuntimeCapabilities(verification.result, abort.signal);
  const waiting = waitForRuntimeCapabilities(verification.result);
  expect(verification.current).toEqual(unavailableExecution('PROBE_IN_PROGRESS'));
  abort.abort();
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  const available = {
    nativeExecution: { status: 'available' },
    officeRender: { status: 'available' },
    terminal: { status: 'available' },
  } as const;
  probe.resolve(available);
  await expect(waiting).resolves.toEqual(available);
  expect(verification.current).toEqual(available);
});

test('P11-01 a failed verifier leaves native operations disabled', async () => {
  const verification = new RuntimeVerification(() => Promise.reject(Error('probe failed')));
  await expect(waitForRuntimeCapabilities(verification.result)).resolves.toEqual(
    unavailableExecution('PROBE_REQUIRED'),
  );
  expect(verification.current).toEqual(unavailableExecution('PROBE_REQUIRED'));
});
