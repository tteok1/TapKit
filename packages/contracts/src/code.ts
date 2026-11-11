import { LocatorSchema } from './resources';
import { z } from 'zod';
import { IdSchema } from './identity';

export const CodePathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      !Object.hasOwn(Object.prototype, path) &&
      path
        .split('/')
        .every(
          (part) =>
            part &&
            part !== '.' &&
            part !== '..' &&
            !/[\\:<>"|?*\x00-\x1f~]/u.test(part) &&
            !/[. ]$/.test(part) &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
            !/^(\.git|node_modules|\.pnpm|\.npm|\.venv|venv|__pycache__|\.cache|\.ssh|\.aws|\.codex|\.agents|secrets?)$/i.test(
              part,
            ) &&
            !/^(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials\.json|id_rsa|id_ed25519)$/i.test(
              part,
            ) &&
            !/^\.env(?:\.|$)/i.test(part) &&
            !/^\.tapkit-runtime$/i.test(part) &&
            !/\.(pem|key|pfx|p12)$/i.test(part),
        ),
  );
export const CodeHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable();
const run = z.strictObject({ runId: IdSchema });
const file = run.extend({ path: CodePathSchema });
export const CodePatchSchema = z.strictObject({
  path: CodePathSchema,
  baseHash: CodeHashSchema,
  content: z.string().max(500000).nullable(),
});
export const CodeWorkToolSchema = z.strictObject({
  tool: z.literal('code.applyPatch'),
  patch: CodePatchSchema,
});
export const SiteRegionSchema = z.strictObject({
  page: z.string().max(400),
  selector: z.string().min(1).max(500),
  text: z.string().max(800),
  width: z.number().int().nonnegative().max(100000),
  height: z.number().int().nonnegative().max(100000),
});
export const SiteRevisionSchema = z.strictObject({
  versionId: IdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  region: SiteRegionSchema,
});
export type SiteRevision = z.infer<typeof SiteRevisionSchema>;
export const CodeCommandSchemas = {
  'code.status': run,
  'code.inherit': run.extend({
    sourceRunId: IdSchema,
    siteRevision: SiteRevisionSchema.optional(),
  }),
  'code.prepareWorkspace': run.extend({
    baseRef: z.string().max(160).optional(),
    includeDirty: z.boolean().default(false),
    untracked: z.array(CodePathSchema).max(100).default([]),
  }),
  'code.tree': run,
  'code.read': file.extend({
    startLine: z.number().int().min(1).default(1),
    endLine: z.number().int().min(1).max(100000).optional(),
  }),
  'code.diff': run.extend({ path: CodePathSchema.optional() }),
  'code.applyPatch': run.extend({ patch: CodePatchSchema }),
  'code.accept': file.extend({ expectedHash: CodeHashSchema }),
  'code.revert': file.extend({ expectedHash: CodeHashSchema }),
  'code.restore': file.extend({ expectedHash: CodeHashSchema }),
  'code.comment': file.extend({
    baseHash: CodeHashSchema,
    line: z.number().int().min(1),
    side: z.enum(['left', 'right']),
    body: z.string().trim().min(1).max(4000),
  }),
  'code.revoke': run,
  'code.reference': file.extend({
    baseHash: CodeHashSchema,
    line: z.number().int().min(1),
    side: z.enum(['left', 'right']),
  }),
} as const;
export type CodeCommand = keyof typeof CodeCommandSchemas;
export const CodeFileSchema = z.strictObject({
  path: CodePathSchema,
  hash: CodeHashSchema,
  lines: z.number().int().nonnegative(),
});
export const CodeDiffSchema = z.strictObject({
  path: CodePathSchema,
  kind: z.enum(['added', 'modified', 'deleted']),
  baseHash: CodeHashSchema,
  hash: CodeHashSchema,
  before: z.string().nullable(),
  after: z.string().nullable(),
  accepted: z.boolean(),
  canRestore: z.boolean(),
});
export const CodeCommentSchema = z.strictObject({
  id: IdSchema,
  path: CodePathSchema,
  baseHash: CodeHashSchema,
  line: z.number().int(),
  side: z.enum(['left', 'right']),
  body: z.string(),
  stale: z.boolean(),
});
export const CodeViewSchema = z.strictObject({
  runId: IdSchema,
  name: z.string(),
  git: z.boolean(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  dirty: z.boolean(),
  branches: z.array(z.string()),
  untracked: z.array(CodePathSchema),
  prepared: z.boolean(),
  revoked: z.boolean(),
  githubRepo: z.string().max(141).optional(),
  revision: z.number().int(),
  files: z.array(CodeFileSchema),
  changes: z.array(CodeDiffSchema),
  comments: z.array(CodeCommentSchema),
  reference: z
    .strictObject({
      runId: IdSchema,
      baseVersion: CodeHashSchema,
      locator: LocatorSchema.refine((v) => v.kind === 'code'),
    })
    .optional(),
  read: z
    .strictObject({
      path: CodePathSchema,
      hash: CodeHashSchema,
      startLine: z.number().int(),
      endLine: z.number().int(),
      content: z.string(),
    })
    .optional(),
});
export type CodeView = z.infer<typeof CodeViewSchema>;
export type CodePatch = z.infer<typeof CodePatchSchema>;
