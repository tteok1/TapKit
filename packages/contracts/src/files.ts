import { z } from 'zod';
import { IdSchema } from './identity';
import { LocatorSchema } from './resources';
import { RunStatusSchema } from './chat';
import defaults from '../../../resources/catalogs/defaults.json';

export const FILE_PARSER_VERSION = 'p03-2';
export const FileLimitsSchema = z.strictObject({
  maxFileBytes: z.number().int().positive().max(104857600),
  maxBatchFiles: z.number().int().positive().max(20),
  maxArchiveBytes: z.number().int().positive().max(104857600),
  maxExpandedBytes: z.number().int().positive().max(524288000),
  maxArchiveEntries: z.number().int().positive().max(2000),
  maxArchiveDepth: z.number().int().nonnegative().max(2),
  maxExpansionRatio: z.number().positive().max(100),
  maxRows: z.number().int().positive().max(200000),
  maxColumns: z.number().int().positive().max(200),
  maxCells: z.number().int().positive().max(2000000),
  maxPdfPages: z.number().int().positive().max(500),
  parseTimeoutMs: z.number().int().positive().max(120000),
});
export const FILE_LIMITS = Object.freeze(FileLimitsSchema.parse(defaults.files));
export type FileLimits = z.infer<typeof FileLimitsSchema>;
export const FileParseReasonSchema = z.enum([
  'EMPTY_FILE',
  'ENCRYPTED_FILE',
  'CORRUPT_FILE',
  'MAGIC_MISMATCH',
  'UNSAFE_ARCHIVE',
  'ARCHIVE_LIMIT',
  'TABLE_LIMIT',
  'PAGE_LIMIT',
  'FORMAT_UNSUPPORTED',
  'OCR_REQUIRED',
  'MACRO_FORMAT',
  'EXTERNAL_ENTITY',
  'TEXT_ENCODING',
  'PARSE_TIMEOUT',
  'SANDBOX_UNAVAILABLE',
  'CANCELLED',
  'SOURCE_CHANGED',
  'OUTPUT_LIMIT',
]);
export type FileParseReason = z.infer<typeof FileParseReasonSchema>;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const FileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (name) =>
      !/[\\/:<>"|?*\x00-\x1f]/.test(name) &&
      !/[. ]$/.test(name) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
      name !== '.' &&
      name !== '..',
  );
export const FileRelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => path.split('/').every((part) => FileNameSchema.safeParse(part).success));
export const IngestInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  fileVersionId: IdSchema,
  relativePath: FileRelativePathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.literal(FILE_PARSER_VERSION),
});
export const FileOwnerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('library') }),
  z.strictObject({ type: z.literal('session'), id: IdSchema }),
  z.strictObject({ type: z.literal('project'), id: IdSchema }),
]);
export const FileStateSchema = z.enum(['importing', 'imported', 'parsing', 'ready', 'failed']);
export const FileParseStateSchema = z.enum([
  'pending',
  'parsing',
  'ready',
  'failed',
  'unsupported',
  'cancelled',
]);
export const FileVersionViewSchema = z.strictObject({
  id: IdSchema,
  version: revision,
  name: FileNameSchema,
  extension: z.string().max(32),
  mime: z.string().max(128),
  sha256: hash,
  sizeBytes: count,
  createdAt: count,
  parserVersion: z.string().max(80).nullable(),
  parseStatus: FileParseStateSchema,
  previewStatus: z.enum(['pending', 'ready', 'failed', 'unsupported']),
  errorCode: z.string().max(80).nullable(),
  errorReason: z.string().max(80).nullable(),
});
export const FileViewSchema = z.strictObject({
  id: IdSchema,
  name: FileNameSchema,
  extension: z.string().max(32),
  mime: z.string().max(128),
  kind: z.enum(['input', 'artifact', 'note']),
  source: z.enum(['import', 'generated', 'url']),
  revision,
  status: FileStateSchema,
  folderId: IdSchema.nullable(),
  currentVersionId: IdSchema,
  version: FileVersionViewSchema,
  favorite: z.boolean(),
  relativePath: FileRelativePathSchema.nullable(),
  createdAt: count,
  updatedAt: count,
  deletedAt: count.nullable(),
  purgeAfter: count.nullable(),
  owners: z.array(FileOwnerSchema).max(2000),
});
export const FileSelectionSchema = z.strictObject({
  token: IdSchema,
  name: FileNameSchema,
  relativePath: FileRelativePathSchema,
  sizeBytes: count,
  extension: z.string().max(32),
});
// Only preload classifies native File objects; no OS paths cross this boundary.
export const ChatFileSelectionSchema = z.strictObject({
  selections: z.array(FileSelectionSchema).max(20),
  virtualIndexes: z.array(z.number().int().min(0).max(19)).max(20),
});
export const FileImportSchema = z
  .strictObject({
    selectionTokens: z.array(IdSchema).min(1).max(20),
    destination: FileOwnerSchema,
    folderId: IdSchema.optional(),
    duplicate: z.enum(['keep', 'replace', 'skip']),
    replacements: z
      .array(z.strictObject({ token: IdSchema, fileId: IdSchema }))
      .max(20)
      .default([]),
  })
  .superRefine((value, context) => {
    if (new Set(value.selectionTokens).size !== value.selectionTokens.length)
      context.addIssue({
        code: 'custom',
        path: ['selectionTokens'],
        message: 'Duplicate selection',
      });
    if (value.duplicate !== 'replace' && value.replacements.length)
      context.addIssue({
        code: 'custom',
        path: ['replacements'],
        message: 'Replacement requires replace',
      });
    if (
      value.duplicate === 'replace' &&
      (value.replacements.length !== value.selectionTokens.length ||
        new Set(value.replacements.map((r) => r.token)).size !== value.replacements.length ||
        new Set(value.replacements.map((r) => r.fileId)).size !== value.replacements.length ||
        value.replacements.some((r) => !value.selectionTokens.includes(r.token)))
    )
      context.addIssue({
        code: 'custom',
        path: ['replacements'],
        message: 'Select each replacement target explicitly',
      });
  });
export const FileListSchema = z
  .strictObject({
    owner: FileOwnerSchema.optional(),
    folderId: IdSchema.nullable().optional(),
    type: z.string().max(32).optional(),
    source: z.enum(['import', 'generated', 'url']).optional(),
    updatedAfter: count.optional(),
    updatedBefore: count.optional(),
    query: z.string().trim().max(500).default(''),
    favorite: z.boolean().default(false),
    trash: z.boolean().default(false),
    sort: z.enum(['updated', 'size', 'name']).default('updated'),
    cursor: z.string().max(2048).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .refine(
    (p) =>
      p.updatedAfter === undefined ||
      p.updatedBefore === undefined ||
      p.updatedAfter <= p.updatedBefore,
    { message: 'Invalid date range' },
  );
export const FileGetSchema = z.strictObject({
  fileId: IdSchema,
  versionId: IdSchema.optional(),
  owner: FileOwnerSchema.optional(),
});
export const FileBatchSchema = z.strictObject({
  fileIds: z
    .array(IdSchema)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  owner: FileOwnerSchema.optional(),
});
export const FileRenameSchema = z.strictObject({ fileId: IdSchema, name: FileNameSchema });
export const FileMoveSchema = z.strictObject({ fileId: IdSchema, folderId: IdSchema.nullable() });
export const FileLinkSchema = z.strictObject({
  fileId: IdSchema,
  versionId: IdSchema.optional(),
  owner: FileOwnerSchema,
});
export const FileCopySchema = z.strictObject({
  fileId: IdSchema,
  versionId: IdSchema.optional(),
  name: FileNameSchema,
  folderId: IdSchema.nullable().optional(),
  owner: FileOwnerSchema.optional(),
});
export const FileRestoreVersionSchema = z.strictObject({ fileId: IdSchema, versionId: IdSchema });
export const FileFavoriteSchema = z.strictObject({ fileId: IdSchema, favorite: z.boolean() });
export const FileRetrySchema = z.strictObject({ fileVersionId: IdSchema });
export const FileImportControlSchema = z.strictObject({ importRequestId: IdSchema });
export const FileCancelImportSchema = FileImportControlSchema.extend({
  selectionToken: IdSchema.optional(),
});
export const FileImportItemSchema = z.strictObject({
  token: IdSchema,
  name: FileNameSchema.optional(),
  status: z.enum(['waiting', 'reading', 'imported', 'skipped', 'failed', 'cancelled']),
  readBytes: count,
  totalBytes: count,
  fileId: IdSchema.nullable(),
  versionId: IdSchema.nullable(),
  errorCode: z.string().max(80).nullable(),
});
export const FileImportViewSchema = z.strictObject({
  requestId: IdSchema,
  status: z.enum(['running', 'completed', 'cancelled', 'interrupted']),
  items: z.array(FileImportItemSchema).min(1).max(20),
});
export const FolderCreateSchema = z.strictObject({
  name: FileNameSchema,
  parentId: IdSchema.nullable().default(null),
  owner: FileOwnerSchema,
});
export const FolderChangeSchema = z
  .strictObject({
    folderId: IdSchema,
    name: FileNameSchema.optional(),
    parentId: IdSchema.nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined);
export const FileCommandSchemas = {
  'files.import': FileImportSchema,
  'files.importStatus': FileImportControlSchema,
  'files.importHistory': z.strictObject({}),
  'files.dismissImport': FileImportControlSchema,
  'files.cancelImport': FileCancelImportSchema,
  'files.releaseSelection': z.strictObject({
    selectionTokens: z
      .array(IdSchema)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
  'files.list': FileListSchema,
  'files.get': FileGetSchema,
  'files.rename': FileRenameSchema,
  'files.move': FileMoveSchema,
  'files.copy': FileCopySchema,
  'files.link': FileLinkSchema,
  'files.unlink': FileBatchSchema,
  'files.trash': FileBatchSchema,
  'files.restore': FileBatchSchema,
  'files.purge': FileBatchSchema,
  'files.restoreVersion': FileRestoreVersionSchema,
  'files.favorite': FileFavoriteSchema,
  'files.retryParse': FileRetrySchema,
  'files.cancelParse': FileRetrySchema,
  'files.deletePreview': FileBatchSchema,
  'files.versions': z.strictObject({ fileId: IdSchema, trash: z.boolean().default(false) }),
  'files.usage': z.strictObject({ fileId: IdSchema, trash: z.boolean().default(false) }),
  'files.impact': FileBatchSchema,
  'files.storage': z.strictObject({}),
  'files.importInfo': z.strictObject({}),
  'folders.create': FolderCreateSchema,
  'folders.change': FolderChangeSchema,
  'folders.list': z.strictObject({ owner: FileOwnerSchema }),
} as const;
export type FileCommand = keyof typeof FileCommandSchemas;
export type FileView = z.infer<typeof FileViewSchema>;
export type FileOwner = z.infer<typeof FileOwnerSchema>;
export type FileSelection = z.infer<typeof FileSelectionSchema>;

export const FolderViewSchema = z.strictObject({
  id: IdSchema,
  name: FileNameSchema,
  parentId: IdSchema.nullable(),
  owner: FileOwnerSchema,
  revision,
});
export const FileUsageSchema = z.strictObject({
  fileId: IdSchema,
  links: z
    .array(
      z.strictObject({
        id: IdSchema,
        owner: FileOwnerSchema,
        ownerName: z.string().max(240),
        versionId: IdSchema.nullable(),
        role: z.enum(['input', 'output', 'source']),
      }),
    )
    .max(2000),
  records: z
    .array(
      z.strictObject({
        runId: IdSchema,
        taskId: IdSchema,
        taskVersion: revision,
        sessionId: IdSchema,
        sessionTitle: z.string().max(240),
        taskTitle: z.string().max(160),
        versionId: IdSchema,
        createdAt: count,
        status: RunStatusSchema,
      }),
    )
    .max(100),
  recordsTruncated: z.boolean(),
  versionCount: count,
  retainedBytes: count,
});
export const FileStorageSchema = z.strictObject({
  originalBytes: count,
  derivedBytes: count,
  backupRetainedBytes: count,
  fileCount: count,
  trashCount: count,
});
export const FileReplySchema = z.union([
  z.strictObject({ selections: z.array(FileSelectionSchema).max(20) }),
  z.strictObject({ import: FileImportViewSchema }),
  z.strictObject({ imports: z.array(FileImportViewSchema).max(100) }),
  z.strictObject({
    importInfo: z.strictObject({ limits: FileLimitsSchema, availableBytes: count }),
  }),
  z.strictObject({ file: FileViewSchema }),
  z.strictObject({
    files: z.array(FileViewSchema).max(100),
    nextCursor: z.string().max(2048).nullable(),
  }),
  z.strictObject({ versions: z.array(FileVersionViewSchema).max(1000) }),
  z.strictObject({ folders: z.array(FolderViewSchema).max(2000) }),
  z.strictObject({ folder: FolderViewSchema }),
  z.strictObject({ usage: FileUsageSchema }),
  z.strictObject({ impact: z.array(FileViewSchema).max(100) }),
  z.strictObject({ changedIds: z.array(IdSchema).max(100) }),
  z.strictObject({
    storage: FileStorageSchema,
  }),
]);

export const ParsedBlockSchema = z.strictObject({
  id: z.string().min(1).max(128),
  kind: z.enum(['paragraph', 'heading', 'table', 'code', 'text', 'notes']),
  text: z.string().max(1_000_000),
  locator: LocatorSchema,
  level: z.number().int().min(1).max(6).optional(),
});
const cell = z.strictObject({
  row: z.number().int().min(1).max(200000),
  column: z.number().int().min(1).max(200),
  value: z.union([z.string().max(1_000_000), z.number().finite(), z.boolean(), z.null()]),
  formula: z.string().max(8192).optional(),
  calculated: z.boolean(),
});
export const ParsedDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    parserVersion: z.string().min(1).max(80),
    format: z.enum(['text', 'code', 'markdown', 'docx', 'pdf', 'sheet', 'pptx', 'zip', 'image']),
    blocks: z.array(ParsedBlockSchema).max(200000),
    pages: z
      .array(z.strictObject({ width: z.number().positive(), height: z.number().positive() }))
      .max(500),
    sheets: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          name: z.string().max(128),
          rows: z.number().int().min(0).max(200000),
          columns: z.number().int().min(0).max(200),
          cells: z.array(cell).max(2000000),
          mergedRanges: z
            .array(
              z
                .string()
                .max(64)
                .regex(/^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/),
            )
            .max(20000)
            .optional(),
        }),
      )
      .max(1000),
    slides: z
      .array(
        z.strictObject({
          index: z.number().int().min(0).max(9999),
          title: z.string().max(2000),
          notes: z.string().max(1_000_000),
        }),
      )
      .max(10000),
    entries: z
      .array(
        z.strictObject({ path: FileRelativePathSchema, sizeBytes: count, directory: z.boolean() }),
      )
      .max(2000),
    quality: z.strictObject({
      needsOcr: z.boolean(),
      warnings: z.array(z.string().max(80)).max(100),
    }),
  })
  .superRefine((doc, context) => {
    if (doc.sheets.reduce((n, s) => n + s.cells.length, 0) > 2000000)
      context.addIssue({ code: 'custom', path: ['sheets'], message: 'Cell limit exceeded' });
    for (const sheet of doc.sheets)
      if (sheet.cells.some((c) => c.row > sheet.rows || c.column > sheet.columns))
        context.addIssue({ code: 'custom', path: ['sheets'], message: 'Cell outside sheet' });
    if (
      new Set(doc.blocks.map((b) => b.id)).size !== doc.blocks.length ||
      new Set(doc.sheets.map((s) => s.id)).size !== doc.sheets.length
    )
      context.addIssue({ code: 'custom', message: 'Duplicate structure identity' });
  });
export type ParsedDocument = z.infer<typeof ParsedDocumentSchema>;
