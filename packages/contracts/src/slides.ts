import { z } from 'zod';
import { IdSchema } from './identity';
const slideId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N}_-]+$/u);
const text = z.string().max(4000);
export const SlideSpecSchema = z
  .strictObject({
    id: slideId,
    layout: z.enum(['title', 'body', 'two_columns', 'table', 'chart']),
    title: z.string().trim().min(1).max(300),
    bullets: z.array(text).max(40).default([]),
    rightBullets: z.array(text).max(40).default([]),
    table: z
      .strictObject({
        headers: z.array(z.string().max(80)).min(1).max(5),
        rows: z.array(z.array(z.string().max(300)).min(1).max(5)).max(40),
      })
      .optional(),
    chartRef: z
      .strictObject({ fileId: IdSchema, versionId: IdSchema, chartId: z.string().min(1).max(80) })
      .optional(),
    imageVersionId: IdSchema.optional(),
    notes: z.string().max(3000).default(''),
  })
  .superRefine((s, ctx) => {
    if (
      (s.layout === 'table' && !s.table) ||
      (s.layout === 'chart' && !s.chartRef) ||
      s.table?.rows.some((row) => row.length !== s.table!.headers.length)
    )
      ctx.addIssue({ code: 'custom', message: 'Layout content missing or table shape invalid' });
    if ((s.table && s.layout !== 'table') || (s.chartRef && s.layout !== 'chart'))
      ctx.addIssue({ code: 'custom', message: 'Content does not match layout' });
    if (
      (s.rightBullets.length && s.layout !== 'two_columns') ||
      (s.bullets.length && ['table', 'chart'].includes(s.layout)) ||
      (s.imageVersionId && !['title', 'body'].includes(s.layout))
    )
      ctx.addIssue({ code: 'custom', message: 'Layout would hide supplied content' });
  });
export const SlideOptionsSchema = z.strictObject({
  aspectRatio: z.enum(['16:9', '4:3']).default('16:9'),
  theme: z.enum(['light_business', 'dark_presentation']).default('light_business'),
  pageCount: z.number().int().min(1).max(50).default(10),
});
export const SlideDeckSpecSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(200),
    aspectRatio: SlideOptionsSchema.shape.aspectRatio,
    theme: SlideOptionsSchema.shape.theme,
    slides: z.array(SlideSpecSchema).min(1).max(50),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.slides.map((s) => s.id)).size !== d.slides.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate slide id' });
  });
export const SlideActionSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('replace'), slideId, slide: SlideSpecSchema }),
  z.strictObject({
    op: z.literal('insert'),
    index: z.number().int().min(0).max(50),
    slide: SlideSpecSchema,
  }),
  z.strictObject({ op: z.literal('delete'), slideId }),
  z.strictObject({ op: z.literal('duplicate'), slideId, newId: slideId }),
  z.strictObject({ op: z.literal('move'), slideId, index: z.number().int().min(0).max(49) }),
]);
export type SlideDeckSpec = z.infer<typeof SlideDeckSpecSchema>;
export type SlideSpec = z.infer<typeof SlideSpecSchema>;
export type SlideAction = z.infer<typeof SlideActionSchema>;
export const SlideRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('tapkit.slides'),
  spec: SlideDeckSpecSchema,
  preview: z.strictObject({ kind: z.literal('file'), fileId: IdSchema, versionId: IdSchema }),
  quality: z.strictObject({
    pages: z.number().int().min(1).max(50),
    layoutVerified: z.literal(true),
  }),
});
export const SlidePageSchema = z.strictObject({
  title: z.string(),
  aspectRatio: SlideOptionsSchema.shape.aspectRatio,
  theme: SlideOptionsSchema.shape.theme,
  revision: z.number().int().positive(),
  versionId: IdSchema,
  current: z.boolean(),
  preview: SlideRecordSchema.shape.preview,
  slides: z
    .array(
      z.strictObject({
        id: slideId,
        title: z.string(),
        layout: SlideSpecSchema.shape.layout,
        hash: z.string().length(64),
      }),
    )
    .max(50),
  slide: SlideSpecSchema,
});
