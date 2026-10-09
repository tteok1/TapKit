import { z } from 'zod';
import { IdSchema } from './identity';
export const GitInspectSchema = z.strictObject({ kind: z.enum(['status', 'diff']) });
export const EXECUTION_POLICY = 'appcontainer-lok-v1' as const;
export const OfficeRenderSchema = z.strictObject({
  fileVersionId: IdSchema,
  format: z.literal('pdf'),
});
export const OfficeHelperPayloadSchema = z.strictObject({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\:<>"|?*\x00-\x1f~]+\.(docx|xlsx|pptx)$/i)
    .refine((value) => !/[. ]$/.test(value))
    .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value)),
});
export const ExecutionLimitsSchema = z.strictObject({
  timeoutMs: z.number().int().min(50).max(120_000).default(120_000),
  memoryBytes: z
    .number()
    .int()
    .min(64 * 1024 * 1024)
    .max(2 * 1024 ** 3)
    .default(2 * 1024 ** 3),
  processLimit: z.number().int().min(1).max(32).default(32),
  outputBytes: z
    .number()
    .int()
    .min(1024)
    .max(4 * 1024 ** 2)
    .default(1024 ** 2),
});
export const HelperRequestSchema = z
  .strictObject({
    protocolVersion: z.literal(1),
    requestId: IdSchema,
    runId: IdSchema,
    leaseEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    operation: z.enum(['diagnostic.execute', 'office.render']),
    payload: z.strictObject({
      runtimeRoot: z.string().min(4).max(4096),
      executable: z.string().min(4).max(4096),
      inputRoot: z.string().min(4).max(4096),
      workspace: z.string().min(4).max(4096),
      args: z
        .array(
          z
            .string()
            .max(8192)
            .refine((s) => !s.includes('\0')),
        )
        .max(32),
      ...ExecutionLimitsSchema.shape,
      terminal: z.boolean().default(false),
      office: OfficeHelperPayloadSchema.optional(),
    }),
  })
  .superRefine((request, context) => {
    if (request.operation === 'office.render') {
      if (!request.payload.office) {
        context.addIssue({ code: 'custom', path: ['payload', 'office'], message: 'Required' });
      }
      if (request.payload.args.length !== 0 || request.payload.terminal) {
        context.addIssue({
          code: 'custom',
          path: ['payload'],
          message: 'Office requests use the fixed LibreOfficeKit adapter',
        });
      }
    } else if (request.payload.office) {
      context.addIssue({ code: 'custom', path: ['payload', 'office'], message: 'Unexpected' });
    }
  });
export type HelperRequest = z.infer<typeof HelperRequestSchema>;
export const HelperEventSchema = z.strictObject({
  protocolVersion: z.literal(1),
  requestId: IdSchema,
  runId: IdSchema,
  leaseEpoch: z.number().int().positive(),
  event: z.enum(['started', 'finished', 'failed']),
  data: z.record(z.string(), z.unknown()),
});
export type HelperEvent = z.infer<typeof HelperEventSchema>;
export const CapabilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available') }),
  z.strictObject({
    status: z.literal('failed'),
    code: z.literal('SANDBOX_UNAVAILABLE'),
    reason: z.string().min(1).max(240),
  }),
]);
export const ExecutionCapabilitiesSchema = z.strictObject({
  nativeExecution: CapabilitySchema,
  officeRender: CapabilitySchema,
  terminal: CapabilitySchema,
});
export type ExecutionCapabilities = z.infer<typeof ExecutionCapabilitiesSchema>;
export function unavailableExecution(reason: string): ExecutionCapabilities {
  const failed = { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason } as const;
  return { nativeExecution: failed, officeRender: failed, terminal: failed };
}
