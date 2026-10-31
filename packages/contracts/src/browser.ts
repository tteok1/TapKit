import { z } from 'zod';
import { IdSchema } from './identity';

export const BrowserActionSchema = z.strictObject({
  tabId: IdSchema,
  snapshotId: IdSchema,
  action: z.enum(['click', 'fill', 'select', 'press', 'navigate', 'back', 'forward', 'reload']),
  nodeId: z.string().max(80).optional(),
  value: z.string().max(4000).optional(),
  url: z.string().url().max(4096).optional(),
});
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export const BrowserSnapshotSchema = z.strictObject({
  id: IdSchema,
  tabId: IdSchema,
  url: z.string().max(4096),
  title: z.string().max(500),
  navigationEpoch: z.number().int().nonnegative(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().max(24000),
  selection: z.string().max(8000),
  nodes: z
    .array(
      z.strictObject({
        id: z.string().max(80),
        backendNodeId: z.number().int().positive(),
        frameId: z.string().max(120),
        role: z.string().max(80),
        name: z.string().max(240),
        value: z.string().max(4000),
        type: z.string().max(80),
        options: z
          .array(z.strictObject({ value: z.string().max(1000), label: z.string().max(240) }))
          .max(50)
          .default([]),
      }),
    )
    .max(120),
  mode: z.enum(['agent', 'user']),
  blocked: z.string().max(120).nullable(),
  truncated: z.boolean().default(false),
  downloads: z
    .array(z.strictObject({ url: z.string().url().max(4096), name: z.string().max(120) }))
    .max(10)
    .default([]),
});
export type BrowserSnapshot = z.infer<typeof BrowserSnapshotSchema>;
export const BrowserPreparedSchema = z.strictObject({
  snapshot: BrowserSnapshotSchema,
  classification: z.enum(['read', 'submit', 'takeover']),
  binding: z.string().regex(/^[a-f0-9]{64}$/),
  target: z.string().max(4096),
  preview: z.string().max(24000),
});
export type BrowserPrepared = z.infer<typeof BrowserPreparedSchema>;
export const BrowserResultSchema = z.strictObject({
  state: z.enum(['observed', 'acted', 'submitted', 'unknown', 'takeover']),
  snapshot: BrowserSnapshotSchema,
});
export const BrowserTabSchema = z.strictObject({
  id: IdSchema,
  runId: IdSchema,
  url: z.string().max(4096),
  title: z.string().max(500),
  state: z.enum(['open', 'closed', 'interrupted']),
  mode: z.enum(['agent', 'user']),
  snapshot: BrowserSnapshotSchema.nullable(),
});
export type BrowserTab = z.infer<typeof BrowserTabSchema>;
export const BrowserWorkToolArgsSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('browser.open'), url: z.string().url().max(4096) }),
  z.strictObject({ tool: z.literal('browser.observe'), tabId: IdSchema }),
  BrowserActionSchema.extend({ tool: z.literal('browser.act') }),
]);
export type BrowserWorkToolArgs = z.infer<typeof BrowserWorkToolArgsSchema>;
const tab = z.strictObject({ runId: IdSchema, tabId: IdSchema });
export const BrowserCommandSchemas = {
  'browser.tabs': z.strictObject({ runId: IdSchema }),
  'browser.open': z.strictObject({ runId: IdSchema, url: z.string().url().max(4096) }),
  'browser.observe': tab,
  'browser.control': tab.extend({ mode: z.enum(['agent', 'user']) }),
  'browser.close': tab,
  'browser.action': tab.extend({
    action: z.enum(['navigate', 'back', 'forward', 'reload']),
    url: z.string().url().max(4096).optional(),
  }),
  'browser.material': tab.extend({ selection: z.boolean().default(false) }),
  'browser.download': tab.extend({ url: z.string().url().max(4096) }),
  'browser.resolve': z.strictObject({
    runId: IdSchema,
    callId: IdSchema,
    outcome: z.enum(['submitted', 'not_submitted']),
  }),
  'browser.external': tab,
  'browser.present': tab.extend({
    visible: z.boolean(),
    bounds: z.strictObject({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().min(1).max(10000),
      height: z.number().int().min(1).max(10000),
    }),
  }),
} as const;
export type BrowserCommand = keyof typeof BrowserCommandSchemas;
export const BrowserReplySchema = z.union([
  z.strictObject({ tabs: z.array(BrowserTabSchema).max(20) }),
  z.strictObject({ tab: BrowserTabSchema }),
  z.strictObject({ snapshot: BrowserSnapshotSchema }),
  z.strictObject({ browserAck: z.literal(true) }),
  z.strictObject({
    browserMaterial: z.strictObject({
      kind: z.literal('file'),
      fileId: IdSchema,
      versionId: IdSchema,
    }),
  }),
]);

// Host/Core only. The public renderer cannot submit scripts, CDP calls, partitions or proxies.
export const BrowserHostRequestSchema = z.strictObject({
  runId: IdSchema,
  rootRunId: IdSchema,
  op: z.enum([
    'open',
    'observe',
    'prepare',
    'act',
    'control',
    'close',
    'dispose',
    'present',
    'external',
  ]),
  tabId: IdSchema.optional(),
  url: z.string().url().max(4096).optional(),
  proxyURL: z.string().max(2048).optional(),
  action: BrowserActionSchema.optional(),
  binding: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  approved: z.boolean().optional(),
  mode: z.enum(['agent', 'user']).optional(),
  windowId: z
    .string()
    .regex(/^[0-9]{1,8}$/)
    .optional(),
  visible: z.boolean().optional(),
  bounds: z
    .strictObject({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive().max(10000),
      height: z.number().int().positive().max(10000),
    })
    .optional(),
});
export type BrowserHostRequest = z.infer<typeof BrowserHostRequestSchema>;
