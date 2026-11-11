import { z } from 'zod';
import { CodePathSchema } from './code';
import { IdSchema } from './identity';

export const GitHubRepoSchema = z
  .string()
  .max(141)
  .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]{1,100}$/i)
  .refine((v) => !v.endsWith('.') && !v.toLowerCase().endsWith('.git'))
  .transform((v) => v.toLowerCase());
export const GitHubBranchSchema = z
  .string()
  .max(160)
  .regex(/^[a-z\d_][a-z\d_./-]*$/i)
  .refine(
    (v) =>
      !v.includes('..') &&
      !v.endsWith('.') &&
      v.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock')),
  );
export const GitHubShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const GitHubTokenSchema = z
  .string()
  .trim()
  .regex(/^github_pat_[A-Za-z0-9_]{20,240}$/);
export const GitHubConnectSchema = z.strictObject({
  runId: IdSchema,
  repo: GitHubRepoSchema,
  token: GitHubTokenSchema,
  contentsWrite: z.boolean(),
  pullRequestsWrite: z.boolean(),
});
export const GitHubAccountSchema = GitHubConnectSchema.omit({ token: true }).extend({
  id: IdSchema,
  login: z
    .string()
    .max(100)
    .regex(/^[\w-]+$/),
  repositoryId: z.number().int().positive(),
  defaultBranch: GitHubBranchSchema,
});
export const GitHubVaultDocumentSchema = z.strictObject({
  account: GitHubAccountSchema,
  token: GitHubTokenSchema,
});
export const GitHubIntentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('commit'), message: z.string().trim().min(1).max(500) }),
  z.strictObject({ kind: z.literal('push') }),
  z.strictObject({
    kind: z.literal('draft'),
    base: GitHubBranchSchema,
    title: z.string().trim().min(1).max(240),
    body: z.string().max(12000),
  }),
]);
const run = z.strictObject({ runId: IdSchema });
export const GitHubCommandSchemas = {
  'github.status': run,
  'github.disconnect': run,
  'github.clone': run,
  'github.fetch': run,
  'github.preview': run.extend({ intent: GitHubIntentSchema }),
  'github.approve': run.extend({ previewId: IdSchema }),
  'github.dismiss': run.extend({ previewId: IdSchema }),
  'github.reconcile': run,
  'github.checkPR': run,
} as const;
const GitHubCommitSchema = z.strictObject({ sha: GitHubShaSchema, subject: z.string().max(500) });
export const GitHubPreviewSchema = z.strictObject({
  id: IdSchema,
  intent: GitHubIntentSchema,
  repo: GitHubRepoSchema.nullable(),
  branch: GitHubBranchSchema,
  sha: GitHubShaSchema,
  files: z.array(z.strictObject({ path: CodePathSchema, hash: z.string().nullable() })).max(1000),
  commits: z.array(GitHubCommitSchema).max(100),
});
export const GitHubPullSchema = z.strictObject({
  number: z.number().int().positive(),
  url: z.string().regex(/^https:\/\/github\.com\/[a-z\d_.-]+\/[a-z\d_.-]+\/pull\/\d+$/i),
  sha: GitHubShaSchema,
  title: z.string().max(240),
  draft: z.boolean(),
  state: z.enum(['open', 'closed', 'merged']),
  checks: z
    .array(z.strictObject({ name: z.string().max(160), state: z.string().max(64) }))
    .max(200),
  reviews: z
    .array(
      z.strictObject({
        login: z.string().max(100),
        state: z.string().max(64),
        body: z.string().max(600),
      }),
    )
    .max(100),
  checksAvailable: z.boolean(),
  reviewsAvailable: z.boolean(),
});
export const GitHubViewSchema = z.strictObject({
  account: GitHubAccountSchema.nullable(),
  commit: GitHubCommitSchema.nullable(),
  pushedSha: GitHubShaSchema.nullable(),
  pull: GitHubPullSchema.nullable(),
  pending: z.enum(['push', 'draft']).nullable(),
  preview: GitHubPreviewSchema.optional(),
});
export type GitHubCommand = keyof typeof GitHubCommandSchemas | 'github.connect';
export type GitHubAccount = z.infer<typeof GitHubAccountSchema>;
export type GitHubVaultDocument = z.infer<typeof GitHubVaultDocumentSchema>;
export type GitHubIntent = z.infer<typeof GitHubIntentSchema>;
export type GitHubPreview = z.infer<typeof GitHubPreviewSchema>;
export type GitHubPull = z.infer<typeof GitHubPullSchema>;
export type GitHubView = z.infer<typeof GitHubViewSchema>;
