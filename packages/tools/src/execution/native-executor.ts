import { HelperRequestSchema, type HelperEvent, type HelperRequest } from '@tapkit/contracts';
import { helperPath, runDiagnostic, SandboxError } from './index';

/** Trusted bridge for fixed native operations. Payloads always run through the AppContainer helper. */
export class NativeSandboxExecutor {
  constructor(
    private readonly root: string,
    private readonly onStarted?: (request: HelperRequest, event: HelperEvent) => void,
  ) {}

  async execute(
    raw: HelperRequest,
    options: NonNullable<Parameters<typeof runDiagnostic>[2]> = {},
  ) {
    const request = HelperRequestSchema.parse(raw);
    const result = await runDiagnostic(helperPath(this.root), request, {
      ...options,
      onStarted: (event, send) => {
        this.onStarted?.(request, event);
        options.onStarted?.(event, send);
      },
    });
    const started = result.events[0];
    const finished = result.events.at(-1);
    const job =
      started?.event === 'started' &&
      typeof started.data.job === 'object' &&
      started.data.job !== null
        ? (started.data.job as Record<string, unknown>)
        : null;
    if (finished?.event === 'failed') {
      const stage =
        typeof finished.data.stage === 'string'
          ? finished.data.stage
          : typeof finished.data.code === 'string'
            ? finished.data.code
            : 'unknown';
      throw new SandboxError(`APP_CONTAINER_HELPER_FAILED:${stage}`);
    }
    if (
      !started ||
      started.event !== 'started' ||
      started.data.appContainer !== true ||
      started.data.identitySid !== started.data.appContainerSid ||
      started.data.networkCapabilities !== 0 ||
      job?.killOnClose !== true ||
      job?.breakaway !== false ||
      !finished ||
      finished.event !== 'finished' ||
      finished.data.activeProcesses !== 0
    ) {
      throw new SandboxError('APP_CONTAINER_IDENTITY_OR_CLEANUP_FAILED');
    }
    return result;
  }
}
