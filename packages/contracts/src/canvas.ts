import { z } from 'zod';
import { IdSchema } from './identity';
import { FileGetSchema } from './files';
import { DocumentStyleSchema } from './document';

const revision = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z
  .string()
  .max(100_000)
  .refine(
    (value) =>
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
        value,
      ),
  );
export const CanvasTitleSchema = text.trim().min(1).max(240);
const link = z.strictObject({
  href: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }),
  target: z.literal('_blank').nullable().optional(),
  rel: z.literal('noopener noreferrer nofollow').nullable().optional(),
  class: z.null().optional(),
  title: z.null().optional(),
});
const mark = z.union([
  z.strictObject({ type: z.enum(['bold', 'italic', 'strike', 'underline', 'code']) }),
  z.strictObject({ type: z.literal('link'), attrs: link }),
]);
export type CanvasMark = z.infer<typeof mark>;

const image = z.strictObject({
  blockId: IdSchema,
  fileId: IdSchema,
  versionId: IdSchema,
  src: z.null().optional(),
  alt: text.max(1000).nullable().optional(),
  title: z.null().optional(),
  width: z.null().optional(),
  height: z.null().optional(),
});

const blockAttrs = z.strictObject({ blockId: IdSchema });
const blockTypes = [
  'paragraph',
  'heading',
  'codeBlock',
  'bulletList',
  'orderedList',
  'table',
  'image',
] as const;
const blocks = [...blockTypes];
const inline = ['text', 'hardBreak'];
const cellAttrs = z.strictObject({
  colspan: z.literal(1).optional(),
  rowspan: z.literal(1).optional(),
  colwidth: z.null().optional(),
  align: z.null().optional(),
});
const shapes = {
  doc: [z.undefined(), blocks],
  paragraph: [blockAttrs, inline],
  heading: [blockAttrs.extend({ level: z.number().int().min(1).max(6) }), inline],
  codeBlock: [blockAttrs.extend({ language: text.max(80).nullable().optional() }), ['text']],
  bulletList: [blockAttrs, ['listItem']],
  orderedList: [
    blockAttrs.extend({ start: z.number().int().min(1).max(100000), type: z.null().optional() }),
    ['listItem'],
  ],
  listItem: [z.undefined(), ['paragraph', 'bulletList', 'orderedList', 'codeBlock']],
  table: [blockAttrs, ['tableRow']],
  tableRow: [z.undefined(), ['tableHeader', 'tableCell']],
  tableHeader: [cellAttrs.optional(), ['paragraph']],
  tableCell: [cellAttrs.optional(), ['paragraph']],
  image: [image, []],
  text: [z.undefined(), []],
  hardBreak: [z.undefined(), []],
} as const;

export type CanvasNode = {
  type: keyof typeof shapes;
  attrs?: Record<string, string | number | null>;
  content?: CanvasNode[];
  text?: string;
  marks?: CanvasMark[];
};
export type CanvasContent = CanvasNode & { type: 'doc'; content: CanvasNode[] };
const rawNode = z.strictObject({
  type: z.enum(Object.keys(shapes) as [CanvasNode['type'], ...CanvasNode['type'][]]),
  attrs: z.unknown().optional(),
  content: z.array(z.unknown()).max(1000).optional(),
  text: text.min(1).optional(),
  marks: z.array(mark).max(6).optional(),
});

function validContent(raw: unknown): raw is CanvasContent {
  const ids = new Set<unknown>();
  const pending = [{ raw, children: ['doc'] as readonly string[], depth: 0 }];
  let size = 0;
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > 12000 || entry.depth > 16) return false;
    const result = rawNode.safeParse(entry.raw);
    if (!result.success) return false;
    const node = result.data;
    if (!entry.children.includes(node.type)) return false;
    const [attrs, allowed] = shapes[node.type];
    if (!attrs.safeParse(node.attrs).success) return false;
    if ((node.text !== undefined) !== (node.type === 'text')) return false;
    if (node.marks && !inline.includes(node.type)) return false;
    if (node.attrs && typeof node.attrs === 'object' && 'blockId' in node.attrs) {
      if (ids.has(node.attrs.blockId)) return false;
      ids.add(node.attrs.blockId);
    }
    const children = node.content ?? [];
    if (
      [
        'doc',
        'listItem',
        'bulletList',
        'orderedList',
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
      ].includes(node.type) &&
      children.length === 0
    )
      return false;
    if (node.type === 'listItem' && (children[0] as CanvasNode | null)?.type !== 'paragraph')
      return false;
    if (node.type === 'tableRow' && children.length > 30) return false;
    if (
      node.type === 'table' &&
      (children.length > 201 ||
        new Set(children.map((row) => (row as CanvasNode)?.content?.length)).size !== 1)
    )
      return false;
    size += JSON.stringify([node.type, node.attrs, node.text, node.marks]).length;
    if (size > 400_000) return false;
    for (const child of children)
      pending.push({ raw: child, children: allowed, depth: entry.depth + 1 });
  }
  return true;
}

export const CanvasContentSchema = z.custom<CanvasContent>(validContent);
export const CanvasSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('blank') }),
  z.strictObject({
    kind: z.literal('message'),
    sessionId: IdSchema,
    messageId: IdSchema,
    version: revision,
  }),
  FileGetSchema.extend({ kind: z.literal('file'), versionId: IdSchema }),
  z.strictObject({ kind: z.literal('canvas'), documentId: IdSchema, versionId: IdSchema }),
]);
export const CanvasRangeSchema = z
  .strictObject({
    blockId: IdSchema,
    from: z.number().int().min(0).max(100_000),
    to: z.number().int().min(1).max(100_000),
    textHash: hash,
  })
  .refine(({ from, to }) => from < to);
const commentText = text.trim().min(1).max(4000);
const entry = z.strictObject({
  author: z.literal('local'),
  text: commentText,
  createdAt: z.number().int(),
});
export const CanvasThreadSchema = entry.extend({
  id: IdSchema,
  anchor: CanvasRangeSchema,
  quote: text.min(1).max(8000),
  replies: z.array(entry).max(30),
  resolved: z.boolean(),
  stale: z.boolean().default(false),
});
export const CanvasSnapshotSchema = z.strictObject({
  title: CanvasTitleSchema,
  content: CanvasContentSchema,
  style: DocumentStyleSchema.optional(),
  threads: z.array(CanvasThreadSchema).max(100),
});
const id = z.strictObject({ documentId: IdSchema });
const version = id.extend({ versionId: IdSchema });
const base = id.extend({ baseVersion: IdSchema, revision });
const stamp = { createdAt: z.number().int(), revision, versionId: IdSchema };
export const CanvasViewSchema = CanvasSnapshotSchema.extend({
  ...stamp,
  documentId: IdSchema,
  source: CanvasSourceSchema,
});
const versionInfo = z.strictObject({ ...stamp, parentVersionId: IdSchema.nullable() });
export const CanvasEditSchema = z.strictObject({
  blockId: IdSchema,
  from: z.number().int().min(0),
  to: z.number().int().min(1),
  textHash: hash,
  before: text,
  replacement: text,
  explanation: text.max(800),
  order: z.array(IdSchema).min(1).max(1000).optional(),
});
const proposal = z.strictObject({
  proposalId: IdSchema,
  versionId: IdSchema,
  items: z.array(CanvasEditSchema).max(100),
});
export const CanvasCommandSchemas = {
  'canvas.open': z.strictObject({ source: CanvasSourceSchema }),
  'canvas.get': id,
  'canvas.list': z.strictObject({}),
  'canvas.save': base.extend({ title: CanvasTitleSchema, content: CanvasContentSchema }),
  'canvas.history': id.extend({ beforeRevision: revision.optional() }),
  'canvas.version': version,
  'canvas.restore': base.extend({ versionId: IdSchema }),
  'canvas.copy': version,
  'canvas.aiEdit': base.extend({
    selection: CanvasRangeSchema.optional(),
    action: z.enum([
      'rewrite',
      'translate',
      'expand',
      'shorten',
      'proofread',
      'style',
      'structure',
    ]),
    instruction: text.trim().max(2000),
    reference: FileGetSchema.extend({ versionId: IdSchema }).optional(),
  }),
  'canvas.apply': base.extend({ proposalId: IdSchema, blockId: IdSchema, accept: z.boolean() }),
  'canvas.comment': base.extend({
    change: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('add'), anchor: CanvasRangeSchema, text: commentText }),
      z.strictObject({ type: z.literal('reply'), threadId: IdSchema, text: commentText }),
      z.strictObject({ type: z.literal('resolve'), threadId: IdSchema, resolved: z.boolean() }),
    ]),
  }),
  'canvas.referenceStyle': base.extend({
    reference: FileGetSchema.extend({ versionId: IdSchema }),
  }),
  'canvas.image': z.strictObject({ fileId: IdSchema, versionId: IdSchema }),
  'canvas.export': version.extend({ format: z.enum(['md', 'docx', 'pdf']) }),
} as const;
export const CanvasReplySchema = z.union([
  z.strictObject({ canvas: CanvasViewSchema, conflict: z.boolean().optional() }),
  z.strictObject({
    canvases: z
      .array(
        z.strictObject({
          documentId: IdSchema,
          title: CanvasTitleSchema,
          updatedAt: z.number().int(),
        }),
      )
      .max(100),
  }),
  z.strictObject({ canvasVersions: z.array(versionInfo).max(50) }),
  z.strictObject({ canvasProposal: proposal }),
  z.strictObject({ canvas: CanvasViewSchema, canvasProposal: proposal }),
  z.strictObject({ canvasImage: z.string().max(180_000) }),
  z.strictObject({ canvasExport: FileGetSchema.extend({ versionId: IdSchema }) }),
]);
export type CanvasCommand = keyof typeof CanvasCommandSchemas;
export type CanvasReply = z.infer<typeof CanvasReplySchema>;
export type CanvasView = z.infer<typeof CanvasViewSchema>;
export type CanvasRange = z.infer<typeof CanvasRangeSchema>;
export type CanvasSnapshot = z.infer<typeof CanvasSnapshotSchema>;
export type CanvasThread = z.infer<typeof CanvasThreadSchema>;
export type CanvasEdit = z.infer<typeof CanvasEditSchema>;
export type CanvasProposal = z.infer<typeof proposal>;
