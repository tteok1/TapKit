import { z } from 'zod';
import { IdSchema } from './identity';
import { CodePathSchema } from './code';

export const CodeRuntimeSchema = z.enum(['node', 'python']);
export const ExecArgsSchema = z.strictObject({
  runtime: CodeRuntimeSchema,
  argv: z
    .array(
      z
        .string()
        .max(8192)
        .refine((s) => !s.includes('\0') && new TextEncoder().encode(s).length <= 8192),
    )
    .max(32)
    .refine(
      (args) => args.reduce((sum, s) => sum + new TextEncoder().encode(s).length, 0) <= 32768,
    ),
  cwd: z.union([z.literal('.'), CodePathSchema]).default('.'),
  timeoutMs: z.number().int().min(50).max(600000).default(120000),
});
export type ExecArgs = z.infer<typeof ExecArgsSchema>;
export const ExecWorkToolSchema = ExecArgsSchema.extend({ tool: z.literal('exec.run') });
export const RuntimeProfileSchema = z.strictObject({
  id: IdSchema,
  runId: IdSchema,
  runtime: CodeRuntimeSchema,
  version: z.string(),
  cwd: z.literal('.'),
  lockHash: z.string(),
  state: z.enum(['detected', 'preparing', 'ready', 'failed', 'unsupported']),
  message: z.string().max(1000),
  progress: z.array(z.string().max(500)).max(100),
  commands: z.array(z.strictObject({ name: z.string(), argv: ExecArgsSchema.shape.argv })).max(12),
  dependencyCount: z.number().int().nonnegative(),
  licenses: z.array(z.string().max(240)).max(200),
  network: z.literal(false),
});
export type RuntimeProfile = z.infer<typeof RuntimeProfileSchema>;
export const CodeProcessSchema = z.strictObject({
  id: IdSchema,
  runId: IdSchema,
  runtime: CodeRuntimeSchema,
  argv: ExecArgsSchema.shape.argv,
  cwd: z.string(),
  environmentId: IdSchema,
  sourceHash: z.string(),
  head: z.string().nullable(),
  state: z.enum([
    'starting',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'timeout',
    'output_limit',
    'unknown',
  ]),
  terminal: z.boolean(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  exitCode: z.number().int().nullable(),
  reason: z.string().max(1000),
  outputBytes: z.number().int().nonnegative(),
  logRef: IdSchema,
  cols: z.number().int(),
  rows: z.number().int(),
});
export type CodeProcess = z.infer<typeof CodeProcessSchema>;
export const TerminalViewSchema = z.strictObject({
  runId: IdSchema,
  profiles: z.array(RuntimeProfileSchema).max(2),
  processes: z.array(CodeProcessSchema).max(100),
  output: z
    .strictObject({
      processId: IdSchema,
      offset: z.number().int(),
      nextOffset: z.number().int(),
      text: z.string().max(65536),
      truncated: z.boolean(),
    })
    .optional(),
});
export type TerminalView = z.infer<typeof TerminalViewSchema>;
const run = z.strictObject({ runId: IdSchema });
const process = run.extend({ processId: IdSchema });
export const TerminalCommandSchemas = {
  'terminal.status': run,
  'terminal.prepare': run.extend({
    runtime: CodeRuntimeSchema,
    download: z.boolean().default(false),
  }),
  'exec.run': run.extend(ExecArgsSchema.shape),
  'exec.poll': process.extend({
    offset: z
      .number()
      .int()
      .min(0)
      .max(4 * 1024 ** 2)
      .default(0),
  }),
  'exec.cancel': process,
  'terminal.start': run.extend(ExecArgsSchema.shape),
  'terminal.input': process.extend({
    text: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !s.includes('\0') && new TextEncoder().encode(s).length <= 4096),
  }),
  'terminal.resize': process.extend({
    cols: z.number().int().min(20).max(400),
    rows: z.number().int().min(5).max(200),
  }),
  'terminal.stop': process,
} as const;
export type TerminalCommand = keyof typeof TerminalCommandSchemas;
