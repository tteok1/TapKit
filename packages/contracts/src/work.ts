import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema, AcceptanceRuleSchema, PlanStepInputSchema } from './resources';
import { RunStatusSchema } from './chat';
import { BrowserWorkToolArgsSchema } from './browser';
import { SelectionSchema } from './models';
import { AnalysisSpecSchema, DataFilterSchema, DataPageSchema } from './data';
import {
  SlideDeckSpecSchema,
  SlideOptionsSchema,
  SlideActionSchema,
  SlidePageSchema,
} from './slides';
import {
  DocumentFieldsPatchSchema,
  DocumentOptionsSchema,
  DocumentSectionSchema,
  DocumentSpecSchema,
} from './document';

export const LEGACY_WORK_TOOL_CATALOG_VERSION = 'p06-tools-1';
export const DOCUMENT_WORK_TOOL_CATALOG_VERSION = 'p07-tools-1';
export const DATA_WORK_TOOL_CATALOG_VERSION = 'p07-tools-2';
export const SLIDES_WORK_TOOL_CATALOG_VERSION = 'p07-tools-3';
export const WORK_TOOL_CATALOG_VERSION = 'p08-tools-1';

export const WorkDefinitionSchema = z.strictObject({
  browserEnabled: z.boolean().default(false),
  goal: z.string().trim().min(1).max(20000),
  audience: z.string().max(500).default('用户本人'),
  language: z.string().min(1).max(80).default('简体中文'),
  format: z.enum(['md', 'txt', 'json', 'csv', 'pdf', 'docx', 'xlsx', 'pptx']).default('md'),
  documentOptions: DocumentOptionsSchema.optional(),
  slideOptions: SlideOptionsSchema.optional(),
  dataOptions: z
    .strictObject({
      csvMode: z.enum(['safe', 'preserve_values']).default('safe'),
      includeDetailsInHtml: z.boolean().default(false),
    })
    .optional(),
  quantity: z.number().int().min(1).max(12).default(1),
  scope: z.string().max(4000).default('仅当前任务与明确提供的材料'),
  acceptance: z.array(AcceptanceRuleSchema).max(12).default([]),
  deadlineAt: z.number().int().nonnegative().nullable().default(null),
  refs: z.array(ResourceRefSchema).max(20).default([]),
  planFirst: z.boolean().default(false),
  budgetOverrides: z
    .strictObject({
      tokens: z.number().int().min(1024).max(600000).default(600000),
      activeMs: z.number().int().min(100).max(1800000).default(1800000),
      maxCalls: z.number().int().min(1).max(40).default(40),
      maxTools: z.number().int().min(1).max(80).default(80),
    })
    .default({ tokens: 600000, activeMs: 1800000, maxCalls: 40, maxTools: 80 }),
  modelRef: SelectionSchema.optional(),
});
export type WorkDefinition = z.infer<typeof WorkDefinitionSchema>;
const run = z.strictObject({ runId: IdSchema });
const question = z.strictObject({
  id: IdSchema,
  title: z.string().max(2000),
  options: z.array(z.string().max(240)).max(5),
  required: z.boolean(),
  answer: z.string().max(4000).nullable(),
  stepKey: z.string().max(128).optional(),
  review: z.boolean().optional(),
});
export const WorkStepViewSchema = PlanStepInputSchema.extend({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  attempts: z.number().int().nonnegative(),
  result: z.string().max(64000).nullable(),
  artifacts: z.array(ResourceRefSchema).max(20),
  artifactFormats: z.array(z.string().max(16)).max(20).default([]),
  errorCode: z.string().nullable(),
});
export const WorkViewSchema = z.strictObject({
  taskId: IdSchema,
  runId: IdSchema,
  sessionId: IdSchema,
  projectId: IdSchema.nullable(),
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: RunStatusSchema,
  reason: z.string().nullable(),
  definition: WorkDefinitionSchema,
  steps: z.array(WorkStepViewSchema).max(12),
  selectedSteps: z.array(z.string()).max(12),
  questions: z.array(question).max(12),
  priority: z.number().int().min(0).max(9),
  pinned: z.boolean(),
  archived: z.boolean(),
  muted: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  activeMs: z.number().nonnegative(),
  calls: z.number().nonnegative(),
  tools: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  overdue: z.boolean(),
  acceptanceStatus: z.enum(['unreviewed', 'accepted', 'changes_requested']),
  unresolvedCalls: z
    .array(
      z.strictObject({
        id: IdSchema,
        tool: z.string(),
        resultAvailable: z.boolean(),
        helperState: z.string().nullable(),
      }),
    )
    .max(80),
  activity: z
    .array(
      z.strictObject({
        id: IdSchema,
        at: z.number(),
        type: z.string(),
        summary: z.string().max(1000),
      }),
    )
    .max(100),
});
export type WorkView = z.infer<typeof WorkViewSchema>;
export const ArtifactWorkToolArgsSchema = z.discriminatedUnion('tool', [
  z.strictObject({
    tool: z.literal('slides.create'),
    name: z.string().regex(/^[^\\/:*?"<>|\x00-\x1f]{1,120}\.pptx$/),
    spec: SlideDeckSpecSchema,
  }),
  z.strictObject({
    tool: z.literal('slides.revise'),
    fileId: IdSchema,
    versionId: IdSchema,
    revision: z.number().int().positive(),
    actions: z.array(SlideActionSchema).min(1).max(50),
  }),
  z.strictObject({
    tool: z.literal('data.analyze'),
    fileId: IdSchema,
    versionId: IdSchema,
    spec: AnalysisSpecSchema,
  }),
  z.strictObject({
    tool: z.literal('document.create'),
    name: z.string().regex(/^[^\\/:*?"<>|\x00-\x1f]{1,120}\.(docx|md)$/),
    spec: DocumentSpecSchema,
  }),
  z.strictObject({
    tool: z.literal('document.revise'),
    fileId: IdSchema,
    versionId: IdSchema,
    revision: z.number().int().positive(),
    blockId: z.string().min(1).max(128),
    replacement: DocumentSectionSchema,
  }),
  z.strictObject({
    tool: z.literal('document.fields'),
    fileId: IdSchema,
    versionId: IdSchema,
    revision: z.number().int().positive(),
    fields: DocumentFieldsPatchSchema,
  }),
  z.strictObject({
    tool: z.literal('artifact.write'),
    name: z.string().regex(/^[^\\/:*?"<>|\x00-\x1f]{1,120}\.(md|txt|json|csv)$/),
    content: z.string().min(1).max(500000),
  }),
  z.strictObject({
    tool: z.literal('workspace.patch'),
    fileId: IdSchema,
    versionId: IdSchema,
    content: z.string().min(1).max(500000),
  }),
  z.strictObject({ tool: z.literal('python.analyze'), fileId: IdSchema, versionId: IdSchema }),
  z.strictObject({ tool: z.literal('office.convert'), fileId: IdSchema, versionId: IdSchema }),
]);
export type ArtifactWorkToolArgs = z.infer<typeof ArtifactWorkToolArgsSchema>;
export const WorkToolArgsSchema = z.union([ArtifactWorkToolArgsSchema, BrowserWorkToolArgsSchema]);
export type WorkToolArgs = z.infer<typeof WorkToolArgsSchema>;
export const NativeWorkIdentitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  helperInstanceId: IdSchema,
  nativeRunId: IdSchema,
  directoryId: IdSchema,
  leaseEpoch: z.number().int().positive(),
  fileVersionId: IdSchema,
  state: z.enum(['prepared', 'running', 'finished', 'unknown']),
  pid: z.number().int().positive().nullable(),
  appContainerSid: z.string().max(200).nullable(),
});
export const ApprovalViewSchema = z.strictObject({
  id: IdSchema,
  runId: IdSchema,
  callId: IdSchema,
  taskVersion: z.number().int().positive(),
  decision: z.enum(['pending', 'approved', 'rejected', 'expired', 'revoked']),
  argsHash: z.string(),
  resourceHash: z.string(),
  contentVersionHash: z.string(),
  expiresAt: z.number(),
  businessArgs: WorkToolArgsSchema,
  preview: z.strictObject({
    tool: z.string(),
    target: z.string(),
    before: z.string().max(500000),
    after: z.string().max(500000),
  }),
});
export const GrantViewSchema = z.strictObject({
  id: IdSchema,
  scope: z.enum(['once', 'session', 'persistent']),
  scopeId: IdSchema,
  tool: z.string(),
  resourceId: IdSchema,
  revision: z.number().int().positive(),
  revoked: z.boolean(),
});
export const NotificationPrefsSchema = z.strictObject({
  desktop: z.boolean().default(true),
  kinds: z
    .array(z.enum(['completed', 'failed', 'waiting_user', 'budget_stopped', 'permission']))
    .max(5)
    .default(['completed', 'failed', 'waiting_user', 'budget_stopped', 'permission']),
  quietStart: z.number().int().min(0).max(23).default(22),
  quietEnd: z.number().int().min(0).max(23).default(8),
});
export const WorkNotificationSchema = z.strictObject({
  id: IdSchema,
  runId: IdSchema,
  sessionId: IdSchema,
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  read: z.boolean(),
  createdAt: z.number(),
});
export const WorkCommandSchemas = {
  'runs.create': WorkDefinitionSchema.extend({ sessionId: IdSchema }),
  'runs.list': z.strictObject({
    projectId: IdSchema.optional(),
    status: RunStatusSchema.optional(),
    query: z.string().max(500).optional(),
    archived: z.boolean().default(false),
    sort: z.enum(['updated', 'created', 'priority']).default('updated'),
    modelId: z.string().max(240).optional(),
    since: z.number().nonnegative().optional(),
    limit: z.number().int().min(1).max(100).default(100),
  }),
  'runs.get': run,
  'runs.data': run.extend({
    fileId: IdSchema,
    versionId: IdSchema,
    sheetId: z.string().max(80).optional(),
    offset: z.number().int().min(0).max(200000).default(0),
    filters: z.array(DataFilterSchema).max(12).default([]),
    sort: z.strictObject({ field: z.string().max(80), descending: z.boolean() }).optional(),
  }),
  'runs.slides': run.extend({
    fileId: IdSchema,
    versionId: IdSchema,
    slideId: z.string().max(80).optional(),
  }),
  'runs.setPlan': run.extend({
    steps: z.array(PlanStepInputSchema).min(1).max(12),
    executeStepIds: z.array(z.string().max(64)).max(12).optional(),
  }),
  'runs.steer': run.extend({
    text: z.string().trim().min(1).max(20000),
    refs: z.array(ResourceRefSchema).max(20).default([]),
    clientRequestId: IdSchema,
  }),
  'runs.pause': run,
  'runs.resume': run,
  'runs.cancel': run,
  'runs.retry': run.extend({ reuseVerifiedArtifacts: z.literal(true) }),
  'runs.skip': run.extend({
    stepKey: z.string().max(64),
    reason: z.string().trim().min(1).max(1000),
  }),
  'runs.answer': run.extend({
    questionId: IdSchema,
    taskVersion: z.number().int().positive(),
    answer: z.string().trim().min(1).max(4000),
  }),
  'runs.accept': z.strictObject({
    taskId: IdSchema,
    decision: z.enum(['accepted', 'changes_requested']),
    feedback: z.string().max(4000).optional(),
  }),
  'runs.organize': run.extend({
    priority: z.number().int().min(0).max(9).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    muted: z.boolean().optional(),
  }),
  'runs.copy': run,
  'runs.batch': z.strictObject({
    runIds: z.array(IdSchema).min(1).max(100),
    action: z.enum(['pause', 'cancel', 'archive']),
  }),
  'runs.reconcile': run.extend({
    callId: IdSchema,
    decision: z.enum(['not_committed', 'accept_verified']),
  }),
  'approvals.list': z.strictObject({ runId: IdSchema.optional() }),
  'approvals.decide': z.strictObject({
    approvalId: IdSchema,
    decision: z.enum(['approved', 'rejected']),
    argsHash: z.string(),
    contentVersionHash: z.string(),
    scope: z.enum(['once', 'session', 'persistent']).default('once'),
  }),
  'approvals.editDraft': z.strictObject({
    approvalId: IdSchema,
    newBusinessArgs: WorkToolArgsSchema,
  }),
  'approvals.refresh': z.strictObject({ approvalId: IdSchema }),
  'grants.list': z.strictObject({}),
  'grants.revoke': z.strictObject({ grantIds: z.array(IdSchema).min(1).max(100) }),
  'notifications.list': z.strictObject({
    kind: z.string().max(80).optional(),
    unread: z.boolean().optional(),
  }),
  'notifications.read': z.strictObject({
    ids: z.array(IdSchema).max(100).optional(),
    all: z.boolean().default(false),
  }),
  'notifications.delete': z.strictObject({
    ids: z.array(IdSchema).max(100).optional(),
    all: z.boolean().default(false),
  }),
  'notifications.preferences': z.strictObject({ values: NotificationPrefsSchema.optional() }),
} as const;
export type WorkCommand = keyof typeof WorkCommandSchemas;
export const WorkReplySchema = z.union([
  z.strictObject({ slidePage: SlidePageSchema }),
  z.strictObject({ dataPage: DataPageSchema }),
  z.strictObject({ work: WorkViewSchema }),
  z.strictObject({
    workItems: z.array(WorkViewSchema).max(100),
    capacity: z.number(),
    running: z.number(),
  }),
  z.strictObject({ approvals: z.array(ApprovalViewSchema).max(100) }),
  z.strictObject({
    grants: z.array(GrantViewSchema).max(100),
    affectedRuns: z.array(IdSchema).max(100).optional(),
  }),
  z.strictObject({
    notifications: z.array(WorkNotificationSchema).max(100),
    unreadCount: z.number().nonnegative(),
  }),
  z.strictObject({
    notificationPreferences: NotificationPrefsSchema,
    revision: z.number().int().positive(),
  }),
  z.strictObject({
    workResults: z
      .array(z.strictObject({ runId: IdSchema, ok: z.boolean(), code: z.string().optional() }))
      .max(100),
  }),
]);
