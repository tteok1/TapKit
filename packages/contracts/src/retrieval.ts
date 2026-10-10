import { z } from 'zod';
import { IdSchema } from './identity';
import { ResourceRefSchema } from './resources';
export const EvidenceRefSchema = z.strictObject({
  id: IdSchema,
  ref: ResourceRefSchema,
  sourceVersion: IdSchema,
  chunkId: IdSchema,
  indexVersion: z.number().int().positive(),
  modelRevision: z.string().min(1).max(160),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().min(1).max(16000),
  context: z
    .array(
      z.strictObject({
        ref: ResourceRefSchema,
        text: z.string().max(16000),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(8),
  score: z.number().finite(),
  status: z.enum(['supported', 'conflicting']),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
