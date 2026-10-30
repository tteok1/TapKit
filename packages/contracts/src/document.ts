import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema, type ResourceRef } from './resources';

/** A selected static PNG may be embedded, but is never interpreted by the model. */
export function isDocumentImageMaterial(material: {
  ref: ResourceRef;
  name: string;
  state: string;
}) {
  return (
    material.ref.kind === 'file' &&
    !material.ref.locator &&
    !material.ref.selection &&
    material.state === 'unsupported' &&
    /\.png$/i.test(material.name)
  );
}

const text = z
  .string()
  .max(100_000)
  .refine(
    (value) =>
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
        value,
      ),
  );
export const DocumentBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), text }),
  z.strictObject({ type: z.literal('bullets'), items: z.array(text).max(200) }),
  z
    .strictObject({
      type: z.literal('table'),
      columns: z.array(text).min(1).max(30),
      rows: z.array(z.array(text).max(30)).max(200),
    })
    .refine((table) => table.rows.every((row) => row.length === table.columns.length)),
  z.strictObject({ type: z.literal('image'), fileVersionId: IdSchema, alt: text.max(1000) }),
  z.strictObject({ type: z.literal('code'), language: text.max(80), text }),
]);
export const DocumentSectionSchema = z.strictObject({
  blockId: text.min(1).max(128),
  heading: text.max(500),
  blocks: z.array(DocumentBlockSchema).max(1000),
});
export const DocumentStyleSchema = z.strictObject({
  template: z.enum(['report', 'proposal', 'minutes']),
  theme: z.enum(['formal', 'minimal']).default('formal'),
  fields: z.strictObject({ name: text.max(500), date: text.max(100), brand: text.max(500) }),
  tableOfContents: z.boolean(),
  pageNumbers: z.boolean(),
});
export const DocumentFieldsPatchSchema = DocumentStyleSchema.shape.fields
  .partial()
  .refine(
    (fields) => Object.values(fields).some((value) => value !== undefined),
    'At least one field is required',
  );
const defaultStyle = {
  template: 'report' as const,
  theme: 'formal' as const,
  fields: { name: '', date: '', brand: '' },
  tableOfContents: false,
  pageNumbers: false,
};
export const DocumentOptionsSchema = z.strictObject({
  template: z.enum(['report', 'proposal', 'minutes']).optional(),
  theme: z.enum(['formal', 'minimal']).optional(),
  length: z.enum(['concise', 'standard', 'detailed']).optional(),
  fields: z
    .strictObject({
      name: text.max(500).optional(),
      date: text.max(100).optional(),
      brand: text.max(500).optional(),
    })
    .optional(),
  tableOfContents: z.boolean().optional(),
  pageNumbers: z.boolean().optional(),
});
/** References are identifiers, never permission; the gateway must revalidate each reference. */
export const DocumentSpecSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: text.min(1).max(500),
    audience: text.max(500),
    language: text.min(1).max(80),
    sections: z.array(DocumentSectionSchema).max(200),
    citations: z
      .array(z.strictObject({ label: text.min(1).max(500), ref: ResourceRefSchema }))
      .max(200)
      .default([]),
    style: DocumentStyleSchema.default(defaultStyle),
  })
  .superRefine((draft, ctx) => {
    if (JSON.stringify(draft).length > 400_000)
      ctx.addIssue({ code: 'custom', message: 'Document too large' });
    if (new Set(draft.sections.map((section) => section.blockId)).size !== draft.sections.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate section blockId' });
    if (draft.sections.reduce((sum, section) => sum + section.blocks.length, 0) > 1000)
      ctx.addIssue({ code: 'custom', message: 'Too many blocks' });
  });
export type DocumentSpec = z.infer<typeof DocumentSpecSchema>;
