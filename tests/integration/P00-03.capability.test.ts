import { test, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { unavailableExecution } from '../../packages/contracts/src';
test('P00-03 Core reports isolated capabilities failed while storage remains usable', async () => {
  const store = await openStore(await mkdtemp(resolve('.test-data/P00-03 capability ')));
  try {
    const core = new CoreService(store, unavailableExecution('APP_CONTROL_POLICY_BLOCKED'));
    const reply = core.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'app.bootstrap',
      payload: {},
    });
    expect(reply).toMatchObject({
      ok: true,
      data: {
        capabilities: expect.arrayContaining(['storage']),
        runtimeCapabilities: {
          nativeExecution: {
            status: 'failed',
            code: 'SANDBOX_UNAVAILABLE',
            reason: 'APP_CONTROL_POLICY_BLOCKED',
          },
          officeRender: { status: 'failed' },
          terminal: { status: 'failed' },
        },
      },
    });
    expect(
      core.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'diagnostic.execute',
        payload: {},
      }),
    ).toMatchObject({ ok: false, error: { code: 'FEATURE_NOT_AVAILABLE' } });
  } finally {
    store.close();
  }
});
