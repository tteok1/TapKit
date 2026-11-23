import { unavailableExecution, type ExecutionCapabilities } from '@tapkit/contracts';
import { addAbortListener } from 'node:events';

export type RuntimeCapabilities = ExecutionCapabilities | Promise<ExecutionCapabilities>;

export async function waitForRuntimeCapabilities(
  capabilities: RuntimeCapabilities,
  signal?: AbortSignal,
): Promise<ExecutionCapabilities> {
  signal?.throwIfAborted();
  if (!signal || !(capabilities instanceof Promise)) return capabilities;
  let listener: ReturnType<typeof addAbortListener> | undefined;
  try {
    return await Promise.race([
      capabilities,
      new Promise<never>((_, reject) => {
        listener = addAbortListener(signal, () => reject(signal.reason));
      }),
    ]);
  } finally {
    listener?.[Symbol.dispose]();
  }
}

export class RuntimeVerification {
  private capabilities = unavailableExecution('PROBE_IN_PROGRESS');
  readonly result: Promise<ExecutionCapabilities>;

  get current() {
    return this.capabilities;
  }

  constructor(verify: () => Promise<ExecutionCapabilities>) {
    this.result = Promise.resolve()
      .then(verify)
      .catch(() => unavailableExecution('PROBE_REQUIRED'))
      .then((capabilities) => (this.capabilities = capabilities));
  }
}
