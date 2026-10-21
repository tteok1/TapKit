import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z, EXECUTION_POLICY, ExecutionCapabilitiesSchema } from '@tapkit/contracts';

const VerificationReport = z.object({
  executionPolicy: z.literal(EXECUTION_POLICY),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  capabilities: ExecutionCapabilitiesSchema,
});

// This is a watchdog allowance, never authorization to execute a payload.
// Core still verifies every runtime byte and the actual account before ready.
export function coreStartupTimeout(report: unknown): 15_000 | 120_000 {
  const parsed = VerificationReport.safeParse(report);
  return parsed.success &&
    Object.values(parsed.data.capabilities).some((c) => c.status === 'available')
    ? 120_000
    : 15_000;
}

export function readCoreStartupTimeout(root: string): 15_000 | 120_000 {
  try {
    return coreStartupTimeout(
      JSON.parse(readFileSync(join(root, 'resources/runtime/capabilities.json'), 'utf8')),
    );
  } catch {
    return 15_000;
  }
}
