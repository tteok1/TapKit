import { z } from 'zod';
import { IdSchema } from './identity';

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/);
export const WebOptionsSchema = z.strictObject({
  mode: z.enum(['off', 'on', 'auto']).default('auto'),
  days: z.number().int().min(1).max(3650).optional(),
  language: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .optional(),
  country: z.string().trim().min(2).max(64).optional(),
  domains: z.array(domain).max(20).default([]),
  excludeDomains: z.array(domain).max(20).default([]),
});
export type WebOptions = z.infer<typeof WebOptionsSchema>;
export type SearchCandidate = { title: string; url: string; snippet: string; fetchedAt: number };
export type HostedSearchResult = { candidates: SearchCandidate[]; searches: number };
export const WebReadSchema = z.strictObject({
  url: z.string().url().max(4096),
  maxChars: z.number().int().min(1).max(20000).default(20000),
});
export const WebSearchSchema = z.strictObject({ query: z.string().trim().min(1).max(500) });
export const WebSourceSchema = z.strictObject({
  sourceId: IdSchema,
  revision: z.number().int().positive(),
  url: z.string().url().max(4096),
  title: z.string().max(500),
  fetchedAt: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().max(5_000_000),
  links: z.array(z.string().url().max(4096)).max(200),
});
export type WebSource = z.infer<typeof WebSourceSchema>;
export const WebSourceInfoSchema = WebSourceSchema.omit({ text: true, links: true });
export const WebActivitySchema = z.strictObject({
  searches: z.number().int().min(0).max(1).nullable().default(null),
  extraCostUnknown: z.boolean().default(false),
  tool: z.enum(['web.search', 'web.read']),
  state: z.enum(['pending', 'succeeded', 'failed']),
  errorCode: z.string().max(80).nullable(),
  candidates: z
    .array(
      z.strictObject({
        title: z.string().max(500),
        url: z.string().url().max(4096),
        snippet: z.string().max(2000),
        fetchedAt: z.number(),
      }),
    )
    .max(8),
});
export const WebCommandSchemas = {
  'web.settings': z.strictObject({ sessionId: IdSchema }),
  'web.configure': z.strictObject({ sessionId: IdSchema, options: WebOptionsSchema }),
  'web.sources': z.strictObject({ sessionId: IdSchema }),
  'web.activity': z.strictObject({ sessionId: IdSchema }),
  'web.source': z.strictObject({ sessionId: IdSchema, sourceId: IdSchema }),
  'web.sourceInfo': z.strictObject({ sessionId: IdSchema, sourceId: IdSchema }),
  'web.saveProject': z.strictObject({
    sessionId: IdSchema,
    sourceId: IdSchema,
    projectId: IdSchema,
  }),
} as const;
export type WebCommand = keyof typeof WebCommandSchemas;
export const WebReplySchema = z.union([
  z.strictObject({ webActivity: z.array(WebActivitySchema).max(40) }),
  z.strictObject({
    webOptions: WebOptionsSchema,
    searchConfigured: z.boolean(),
    projectOnly: z.boolean(),
  }),
  z.strictObject({
    webSources: z.array(WebSourceSchema.omit({ text: true, links: true })).max(200),
  }),
  z.strictObject({ webSource: WebSourceSchema }),
  z.strictObject({ webSourceInfo: WebSourceInfoSchema }),
]);
