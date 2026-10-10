import { z } from 'zod';
import { IdSchema } from './identity';
import { AnswerPreferencesSchema, SelectionSchema } from './models';
import { ResourceRefSchema } from './resources';
import { FileViewSchema } from './files';

export const ProjectDefaultsSchema = z.strictObject({
  schemaVersion: z.literal(1).default(1),
  model: SelectionSchema.nullable().default(null),
  answer: AnswerPreferencesSchema,
  tools: z.array(z.enum(['files.read', 'knowledge.query', 'history.search'])).max(3),
});
export const ProjectPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    icon: z.enum(['folder', 'book', 'code', 'research']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    description: z.string().max(2000),
    instructions: z.string().max(8000),
    allowGlobalMemory: z.boolean(),
    allowGlobalHistory: z.boolean(),
    allowGlobalInstructions: z.boolean(),
    independentMemory: z.boolean(),
    defaults: ProjectDefaultsSchema,
  })
  .partial();
export const ProjectViewSchema = ProjectPatchSchema.required().extend({
  id: IdSchema,
  revision: z.number().int().positive(),
  pinned: z.boolean(),
  archivedAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
});
export type ProjectView = z.infer<typeof ProjectViewSchema>;
const target = z.strictObject({ projectId: IdSchema });
const selected = z.array(IdSchema).max(20);
export const ProjectScopeSchema = z.strictObject({
  selectedVersionIds: selected.nullable().default(null),
  projectOnly: z.boolean().default(false),
});
export const ProjectCommandSchemas = {
  'projects.get': target,
  'projects.list': z.strictObject({
    query: z.string().max(500).default(''),
    archived: z.boolean().default(false),
    favorite: z.boolean().default(false),
    sort: z.enum(['updated', 'name']).default('updated'),
    offset: z.number().int().min(0).default(0),
  }),
  'projects.update': target.extend({
    patch: ProjectPatchSchema.refine((v) => Object.keys(v).length > 0),
  }),
  'projects.copy': target.extend({
    includeFiles: z.boolean().default(true),
    includeSessions: z.boolean().default(true),
  }),
  'projects.archive': target.extend({ archived: z.boolean() }),
  'projects.deletePreview': target,
  'projects.trash': target.extend({
    sessionDisposition: z.enum(['detach', 'trash']).default('detach'),
    trashExclusiveFiles: z.boolean().default(false),
  }),
  'projects.overview': target,
  'projects.materials': target,
  'projects.addText': target.extend({
    name: z.string().trim().min(1).max(200),
    text: z.string().max(100000),
    url: z.string().url().max(4096).optional(),
  }),
  'projects.linkMaterial': target.extend({ fileId: IdSchema, versionId: IdSchema }),
  'projects.updateMaterial': target.extend({ fileId: IdSchema, versionId: IdSchema }),
  'projects.classifyMaterial': target.extend({
    fileId: IdSchema,
    folderId: IdSchema.nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    expiresAt: z.number().int().min(0).nullable(),
  }),
  'projects.removeMaterialPreview': target.extend({ fileId: IdSchema }),
  'projects.removeMaterial': target.extend({ fileId: IdSchema }),
  'projects.sessionScope': z.strictObject({
    sessionId: IdSchema,
    scope: ProjectScopeSchema.optional(),
  }),
  'knowledge.query': target.extend({
    query: z.string().trim().min(1).max(500),
    selectedVersionIds: selected.optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  'projects.exportPreview': target,
} as const;
export type ProjectCommand = keyof typeof ProjectCommandSchemas;
export const KnowledgeViewSchema = z.strictObject({
  hits: z
    .array(
      z.strictObject({
        ref: ResourceRefSchema,
        text: z.string().max(16000),
        indexVersion: z.number().int().positive(),
      }),
    )
    .max(20),
  diagnostics: z.array(z.string().max(1000)).max(100),
});
export type KnowledgeView = z.infer<typeof KnowledgeViewSchema>;
export const ProjectMaterialSchema = z.strictObject({
  file: FileViewSchema,
  pendingVersionId: IdSchema.nullable(),
  pendingStatus: z.string().nullable(),
  indexVersion: z.number().int().min(0),
  folderId: IdSchema.nullable(),
  tags: z.array(z.string()).max(20),
  expiresAt: z.number().int().nullable(),
  state: z.enum(['preparing', 'ready', 'failed', 'expired']),
  source: z.string().max(4096),
});
const entity = z.strictObject({ id: IdSchema, title: z.string(), status: z.string() });
export const ProjectImpactSchema = z.strictObject({
  sessionIds: z.array(IdSchema),
  fileIds: z.array(IdSchema),
  exclusiveFileIds: z.array(IdSchema),
  sharedFileIds: z.array(IdSchema),
  taskIds: z.array(IdSchema),
});
export const ProjectReplySchema = z.union([
  z.strictObject({ project: ProjectViewSchema }),
  z.strictObject({
    projects: z.array(ProjectViewSchema).max(100),
    nextOffset: z.number().int().nullable(),
  }),
  z.strictObject({ materials: z.array(ProjectMaterialSchema).max(2000) }),
  z.strictObject({
    overview: z.strictObject({
      sessions: z.array(entity),
      tasks: z.array(entity),
      sources: z.array(entity),
      outputs: z.array(entity),
    }),
  }),
  z.strictObject({ impact: ProjectImpactSchema }),
  z.strictObject({ scope: ProjectScopeSchema, revision: z.number().int().positive() }),
  KnowledgeViewSchema,
  z.strictObject({
    exportPreview: z.strictObject({
      project: ProjectViewSchema,
      files: z.array(
        z.strictObject({
          fileId: IdSchema,
          versionId: IdSchema,
          name: z.string(),
          sizeBytes: z.number(),
        }),
      ),
      totalBytes: z.number(),
    }),
  }),
]);
