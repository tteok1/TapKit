import { z } from 'zod';
import { IdSchema } from './identity';
import { SelectionSchema } from './models';
export const HISTORY_COMMANDS = [
  'sessions.list',
  'sessions.get',
  'sessions.update',
  'sessions.archive',
  'sessions.move',
  'sessions.trash',
  'sessions.restore',
  'sessions.purge',
  'sessions.copy',
  'sessions.fork',
  'sessions.title',
  'sessions.temporary',
  'sessions.closeTemporary',
  'sessions.read',
  'projects.pin',
  'sidebar.list',
  'sidebar.create',
  'sidebar.update',
  'sidebar.remove',
  'sidebar.move',
  'sidebar.reorder',
  'search.query',
  'search.locate',
  'search.history',
  'search.clear',
  'messages.edit',
  'messages.regenerate',
  'messages.switchBranch',
  'messages.deletePreview',
  'messages.delete',
  'messages.mark',
  'messages.transform',
  'messages.saveNote',
] as const;
export type HistoryCommand = (typeof HISTORY_COMMANDS)[number];
export const HistorySessionSchema = z.strictObject({ sessionId: IdSchema });
export const HistoryLocationInputSchema = z.strictObject({
  type: z.enum(['project', 'file']),
  id: IdSchema,
});
export const HistoryLocationSchema = z.strictObject({
  type: z.enum(['project', 'file']),
  id: IdSchema,
  name: z.string().max(1024),
  status: z.string().max(80),
  revision: z.number().int().positive(),
  pinned: z.boolean(),
});
export const SessionPageInputSchema = z.strictObject({
  state: z.enum(['active', 'archived', 'trash', 'all']).default('active'),
  projectId: IdSchema.optional(),
  mode: z.enum(['chat', 'work']).optional(),
  sectionId: IdSchema.optional(),
  pinned: z.boolean().optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const SessionUpdateSchema = HistorySessionSchema.extend({
  patch: z
    .strictObject({
      title: z.string().trim().min(1).max(240).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      note: z.string().max(8000).optional(),
      projectId: IdSchema.nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0),
});
export const SessionBatchSchema = z.strictObject({
  sessionIds: z
    .array(IdSchema)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  archived: z.boolean().optional(),
  projectId: IdSchema.nullable().optional(),
  sectionId: IdSchema.nullable().optional(),
});
export const SessionCopySchema = HistorySessionSchema.extend({
  fromMessageId: IdSchema.optional(),
  includeAttachments: z.boolean().default(false),
});
export const MessageEditSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  text: z.string().trim().min(1).max(100_000),
  modelRef: SelectionSchema.optional(),
});
export const MessageRegenerateSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  modelRef: SelectionSchema.optional(),
});
export const BranchSwitchSchema = HistorySessionSchema.extend({ branchId: IdSchema });
export const MessageDeleteSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  descendants: z.enum(['branch', 'keep-as-note']).optional(),
});
export const MessageMarkSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  bookmark: z.boolean().optional(),
  rating: z.enum(['up', 'down']).nullable().optional(),
  note: z.string().max(2000).optional(),
  report: z.boolean().optional(),
});
export const MessageTransformSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  version: z.number().int().positive(),
  range: z.strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  }),
  action: z.enum(['translate', 'explain', 'expand', 'shorten', 'rewrite']),
  modelRef: SelectionSchema.optional(),
});
export const MessageNoteSchema = HistorySessionSchema.extend({
  messageId: IdSchema,
  projectId: IdSchema.optional(),
});
export const EntitySchema = z.strictObject({ type: z.enum(['session', 'project']), id: IdSchema });
export const SectionCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
export const SectionUpdateSchema = z.strictObject({
  sectionId: IdSchema,
  name: z.string().trim().min(1).max(80).optional(),
  collapsed: z.boolean().optional(),
});
export const SectionRemoveSchema = z.strictObject({ sectionId: IdSchema });
export const SidebarMoveSchema = z.strictObject({
  entity: EntitySchema,
  sectionId: IdSchema.nullable(),
});
export const SidebarReorderSchema = z.strictObject({
  sectionId: IdSchema.nullable(),
  ordered: z.array(EntitySchema).max(1000),
  sectionIds: z.array(IdSchema).max(100).optional(),
});
export const SearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(500),
  scope: z
    .strictObject({ type: z.enum(['all', 'project', 'session', 'file']), id: IdSchema.optional() })
    .refine((v) => v.type === 'all' || !!v.id),
  types: z
    .array(z.enum(['session', 'message', 'project', 'task', 'file']))
    .min(1)
    .max(5)
    .default(['session', 'message', 'project', 'task', 'file']),
  sort: z.enum(['relevance', 'updated']).default('relevance'),
  archived: z.boolean().default(true),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export const SearchClearSchema = z.strictObject({
  ids: z.array(IdSchema).max(20).optional(),
  clearAll: z.boolean().default(false),
});
export const SessionRecordSchema = z.strictObject({
  id: IdSchema,
  title: z.string().max(240),
  mode: z.enum(['chat', 'work']),
  revision: z.number().int().positive(),
  branchId: IdSchema,
  projectId: IdSchema.nullable(),
  pinned: z.boolean(),
  unread: z.boolean(),
  running: z.boolean(),
  temporary: z.boolean(),
  updatedAt: z.number().int(),
  archivedAt: z.number().int().nullable(),
  deletedAt: z.number().int().nullable(),
  tags: z.array(z.string()).max(20),
  note: z.string().max(8000),
});
export const SessionPageSchema = z.strictObject({
  sessions: z.array(SessionRecordSchema).max(100),
  nextCursor: z.string().max(512).nullable(),
});
export const SessionDetailsSchema = z.strictObject({
  session: SessionRecordSchema,
  branches: z
    .array(
      z.strictObject({
        id: IdSchema,
        label: z.string().max(240),
        parentId: IdSchema.nullable(),
        candidateFor: IdSchema.nullable(),
      }),
    )
    .max(1000),
  marks: z
    .array(
      z.strictObject({
        messageId: IdSchema,
        bookmark: z.boolean(),
        rating: z.enum(['up', 'down']).nullable(),
        note: z.string().max(2000),
        report: z.boolean(),
      }),
    )
    .max(1000),
  projectRules: z.string().max(8000),
});
export const SidebarViewSchema = z.strictObject({
  sections: z
    .array(
      z.strictObject({
        id: IdSchema,
        name: z.string().max(80),
        revision: z.number().int().positive(),
        collapsed: z.boolean(),
        count: z.number().int(),
        unread: z.number().int(),
        running: z.number().int(),
        projects: z
          .array(
            z.strictObject({
              id: IdSchema,
              name: z.string(),
              pinned: z.boolean(),
              revision: z.number().int(),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});
export const SearchPageSchema = z.strictObject({
  hits: z
    .array(
      z.strictObject({
        id: IdSchema,
        type: z.enum(['session', 'message', 'project', 'task', 'file']),
        title: z.string(),
        snippet: z.string().max(500),
        ranges: z
          .array(z.strictObject({ start: z.number().int(), end: z.number().int() }))
          .max(100),
        sessionId: IdSchema.nullable(),
        messageId: IdSchema.nullable(),
        branchId: IdSchema.nullable(),
        updatedAt: z.number().int(),
      }),
    )
    .max(100),
  nextCursor: z.string().max(512).nullable(),
});
export const SearchHistorySchema = z.strictObject({
  queries: z.array(z.strictObject({ id: IdSchema, query: z.string().max(500) })).max(20),
});
export const HistoryMutationSchema = z.strictObject({
  updatedIds: z.array(IdSchema).max(100),
  failed: z.array(z.strictObject({ id: IdSchema, code: z.string().max(80) })).max(100),
});
export const BranchChangeSchema = z.strictObject({
  sessionId: IdSchema,
  branchId: IdSchema,
  runId: IdSchema.optional(),
});
export const DeletePreviewSchema = z.strictObject({
  affectedIds: z.array(IdSchema).max(1000),
  laterCount: z.number().int(),
  running: z.boolean(),
});
export const HistoryReplySchema = z.union([
  SessionPageSchema,
  SessionDetailsSchema,
  SidebarViewSchema,
  SearchPageSchema,
  SearchHistorySchema,
  HistoryMutationSchema,
  BranchChangeSchema,
  DeletePreviewSchema,
  HistoryLocationSchema,
]);
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type SessionPage = z.infer<typeof SessionPageSchema>;
export type SessionDetails = z.infer<typeof SessionDetailsSchema>;
export type SearchPage = z.infer<typeof SearchPageSchema>;
export type SidebarView = z.infer<typeof SidebarViewSchema>;
