import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema } from './resources';
import { SelectionSchema } from './models';

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_tool',
  'waiting_user',
  'pausing',
  'paused',
  'recovering',
  'completed',
  'partial',
  'failed',
  'budget_stopped',
  'cancelled',
]);
export const ChatRefsSchema = z.array(ResourceRefSchema).max(20);
export const ChatSessionSchema = z.strictObject({ sessionId: IdSchema });
export const ChatSendSchema = ChatSessionSchema.extend({
  clientMessageId: IdSchema,
  text: z.string().max(100_000),
  attachments: ChatRefsSchema,
  mode: z.literal('chat'),
  modelRef: SelectionSchema.optional(),
  delivery: z.enum(['followup', 'steer']).default('followup'),
}).refine((v) => !!v.text.trim() || v.attachments.length > 0);
export const ChatListSchema = ChatSessionSchema.extend({
  cursor: IdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const ChatDraftSchema = ChatSessionSchema.extend({
  windowId: z.string().regex(/^[0-9]{1,8}$/),
});
export const ChatDraftSaveSchema = ChatDraftSchema.extend({
  text: z.string().max(2_000_000),
  attachments: ChatRefsSchema,
});
export const ChatInputSchema = z.strictObject({ inputId: IdSchema });
export const ChatInputUpdateSchema = ChatInputSchema.extend({
  text: z.string().max(100_000),
  attachments: ChatRefsSchema,
});
export const ChatRunSchema = z.strictObject({ runId: IdSchema });
export const ChatReadSchema = ChatSessionSchema.extend({ messageId: IdSchema });
export const ChatAttachmentSchema = ChatSessionSchema.extend({
  name: z.string().trim().min(1).max(240),
  bytes: z
    .string()
    .max(140_000_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
export const ChatMaterialSchema = z.strictObject({
  ref: ResourceRefSchema,
  name: z.string().max(1024),
  source: z.string().max(240),
  state: z.enum(['uploading', 'parsing', 'ready', 'failed', 'unsupported']),
  text: z.string().max(100_000).optional(),
});
export const ChatCallSchema = z.strictObject({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(128),
  arguments: z.record(z.string(), z.unknown()),
});
export const ChatMessageSchema = z.strictObject({
  id: IdSchema,
  role: z.enum(['user', 'assistant', 'tool', 'system_note']),
  text: z.string().max(200_000),
  status: z.enum(['queued', 'streaming', 'final', 'interrupted', 'failed', 'cancelled']),
  createdAt: z.number().int().nonnegative(),
  model: SelectionSchema.nullable(),
  runId: IdSchema.nullable(),
  revision: z.number().int().positive(),
  attachments: ChatRefsSchema,
  calls: z.array(ChatCallSchema).max(12),
  errorCode: z.string().max(80).nullable(),
  sourceProjectId: IdSchema.nullable().default(null),
  sourceProjectName: z.string().max(80).nullable().default(null),
  sourceMessageId: IdSchema.nullable().default(null),
});
export const ChatRunViewSchema = z.strictObject({
  id: IdSchema,
  status: RunStatusSchema,
  taskVersion: z.number().int().positive(),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  calls: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  errorCode: z.string().max(80).nullable(),
  usage: z.strictObject({
    state: z.enum(['pending', 'actual', 'estimated']),
    tokens: z.number().int().nonnegative().nullable(),
  }),
});
export const ChatPendingSchema = z.strictObject({
  id: IdSchema,
  text: z.string().max(100_000),
  attachments: ChatRefsSchema,
  revision: z.number().int().positive(),
});
export const ChatDraftViewSchema = z.strictObject({
  text: z.string().max(2_000_000),
  attachments: ChatRefsSchema,
  revision: z.number().int().nonnegative(),
});
export const ChatSnapshotSchema = z.strictObject({
  sessionId: IdSchema,
  branchId: IdSchema,
  messages: z.array(ChatMessageSchema).max(100),
  nextCursor: IdSchema.nullable(),
  run: ChatRunViewSchema.nullable(),
  pending: z.array(ChatPendingSchema).max(100),
  eventSeq: z.number().int().nonnegative(),
  selection: SelectionSchema.nullable(),
  tools: z.array(z.string().max(128)).max(12),
});
export const ChatSendViewSchema = z.strictObject({
  messageId: IdSchema,
  runId: IdSchema.optional(),
  queuedInputId: IdSchema.optional(),
});
export const ChatMutationViewSchema = z.strictObject({
  updatedId: IdSchema,
  revision: z.number().int().positive(),
});
export const ChatMaterialsViewSchema = z.strictObject({
  materials: z.array(ChatMaterialSchema).max(100),
});
export const ChatRefsGetSchema = ChatSessionSchema.extend({ refs: ChatRefsSchema.optional() });
export const ChatSnippetSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(80),
  text: z.string().min(1).max(8000),
});
export const ChatSnippetsSchema = z.strictObject({ snippets: z.array(ChatSnippetSchema).max(100) });
export const ChatReplyDataSchema = z.union([
  ChatSnapshotSchema,
  ChatDraftViewSchema,
  ChatSendViewSchema,
  ChatMutationViewSchema,
  ChatMaterialsViewSchema,
  ChatMaterialSchema,
  ChatSnippetsSchema,
]);
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRunView = z.infer<typeof ChatRunViewSchema>;
export type ChatSnapshot = z.infer<typeof ChatSnapshotSchema>;
export type ChatMaterial = z.infer<typeof ChatMaterialSchema>;
export type ChatCommand =
  | 'messages.send'
  | 'messages.list'
  | 'messages.read'
  | 'drafts.get'
  | 'drafts.save'
  | 'inputs.list'
  | 'inputs.update'
  | 'inputs.cancel'
  | 'inputs.attach'
  | 'inputs.references'
  | 'runs.cancel'
  | 'chat.snippets.get'
  | 'chat.snippets.set';
