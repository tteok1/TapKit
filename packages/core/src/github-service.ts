import {
  z,
  ErrorCodeSchema,
  GitHubAccountSchema,
  GitHubCommandSchemas,
  GitHubConnectSchema,
  GitHubPreviewSchema,
  GitHubShaSchema,
  GitHubVaultDocumentSchema,
  GitHubViewSchema,
  ReplySchema,
  type GitHubIntent,
  type GitHubPreview,
  type GitHubVaultDocument,
  type GitHubView,
  type Reply,
  type Request,
} from '@tapkit/contracts';
import { failure, newId, StorageError, type Store, type WorkRun } from '@tapkit/storage';
import { canonicalHash } from '@tapkit/tools';
import type { CodeService, GitHubWorkspace } from './code-service';
import { assertGitHubText, redactGitHubText, type GitHubRemote } from './github-remote';
import type { GitHubDraft, GitHubPush, GitHubTarget } from './github-state';

type Vault = (
  operation: 'github.read' | 'github.write' | 'github.delete',
  profile: string,
  payload: unknown,
) => Promise<unknown>;
type Remote = Pick<
  GitHubRemote,
  | 'identify'
  | 'verifyRepository'
  | 'fetch'
  | 'head'
  | 'push'
  | 'verifyBase'
  | 'lookupDraft'
  | 'createDraft'
  | 'checkPull'
>;
type Plan = {
  view: GitHubPreview;
  windowId: string;
  accountId: string | null;
  version: number;
  expires: number;
};
const sameRepo = (a: GitHubTarget, b: GitHubTarget) =>
  a.repo === b.repo && a.repositoryId === b.repositoryId;
const codeOf = (e: unknown) =>
  e instanceof StorageError
    ? e.code
    : e instanceof z.ZodError
      ? 'VALIDATION_ERROR'
      : (ErrorCodeSchema.safeParse(e instanceof Error ? e.message : '').data ?? 'INTERNAL_ERROR');

export class GitHubService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly plans = new Map<string, Plan>();
  private readonly disconnecting = new Map<string, symbol>();
  constructor(
    readonly store: Store,
    readonly code: CodeService,
    readonly remote: Remote,
    readonly vault: Vault,
    readonly verified: (id: string, hash: string) => Promise<boolean>,
    readonly canNetwork: (run: WorkRun) => boolean,
  ) {}
  private serial<T>(work: () => Promise<T>) {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  closeWindow(id: string) {
    for (const [runId, plan] of this.plans) if (plan.windowId === id) this.plans.delete(runId);
  }
  private async connection(id: string) {
    const raw = await this.vault('github.read', this.store.profileId, { runId: id });
    const document = raw === null ? null : GitHubVaultDocumentSchema.parse(raw);
    if (document && document.account.runId !== id) throw new StorageError('PERMISSION_DENIED');
    return document;
  }
  private requireConnection(id: string, document: GitHubVaultDocument | null) {
    const run = this.code.githubRun(id);
    if (this.disconnecting.has(id) || !this.canNetwork(run) || this.code.githubProject(id)?.revoked)
      throw new StorageError('PERMISSION_DENIED');
    if (!document) throw new StorageError('AUTH_REQUIRED');
    return document;
  }
  private reply(requestId: string, view: GitHubView): Reply {
    return ReplySchema.parse({
      ok: true,
      requestId,
      data: { github: GitHubViewSchema.parse(view) },
    });
  }
  connect(requestId: string, raw: unknown) {
    return this.serial(async () => {
      try {
        const { token, ...input } = GitHubConnectSchema.parse(raw);
        const run = this.code.githubRun(input.runId);
        const project = this.code.githubProject(input.runId);
        if (this.disconnecting.has(input.runId) || !this.canNetwork(run) || project?.revoked)
          throw new StorageError('PERMISSION_DENIED');
        const identity = await this.remote.identify(input.repo, token);
        const account = GitHubAccountSchema.parse({ ...input, ...identity, id: newId() });
        const journal = this.code.githubJournal(input.runId);
        for (const target of [project?.origin, journal.pendingPush, journal.pushed, journal.draft])
          if (target && !sameRepo(target, account)) throw new StorageError('CONFLICT');
        if (
          this.disconnecting.has(input.runId) ||
          !this.canNetwork(this.code.githubRun(input.runId)) ||
          this.code.githubProject(input.runId)?.revoked
        )
          throw new StorageError('PERMISSION_DENIED');
        const document = { account, token };
        await this.vault('github.write', this.store.profileId, document);
        this.plans.delete(input.runId);
        return this.reply(requestId, await this.view(input.runId, document));
      } catch (e) {
        return failure(requestId, codeOf(e));
      }
    });
  }
  private async commits(ctx: GitHubWorkspace, token?: string) {
    const output = (
      await ctx.broker.run([
        '--git-dir=' + ctx.mirror,
        'log',
        '--max-count=101',
        '--format=%H%x09%s',
        `${ctx.base}..${ctx.head}`,
      ])
    ).toString();
    const commits = output
      .trimEnd()
      .split('\n')
      .filter(Boolean)
      .map((row) => {
        const tab = row.indexOf('\t');
        return {
          sha: GitHubShaSchema.parse(row.slice(0, tab)),
          subject: redactGitHubText(row.slice(tab + 1), token).slice(0, 500),
        };
      });
    if (commits.length > 100) throw new StorageError('OUTPUT_LIMIT_REACHED');
    return commits;
  }
  private async view(
    id: string,
    document: GitHubVaultDocument | null,
    preview?: GitHubPreview,
  ): Promise<GitHubView> {
    const journal = this.code.githubJournal(id);
    const result: GitHubView = {
      account: document?.account ?? null,
      commit: null,
      pushedSha: journal.pushed?.sha ?? null,
      pull: journal.draft?.pull ?? null,
      pending: journal.pendingPush ? 'push' : journal.draft && !journal.draft.pull ? 'draft' : null,
      ...(preview ? { preview } : {}),
    };
    try {
      result.commit = await this.code.githubWorkspace(
        id,
        async (ctx) => (await this.commits(ctx, document?.token))[0] ?? null,
      );
    } catch (e) {
      if (
        !['NOT_FOUND', 'CONFLICT', 'FEATURE_NOT_AVAILABLE', 'PERMISSION_DENIED'].includes(codeOf(e))
      )
        throw e;
    }
    return result;
  }
  private async prepare(
    id: string,
    ctx: GitHubWorkspace,
    document: GitHubVaultDocument | null,
    intent: GitHubIntent,
    previewId: string,
  ) {
    ctx.guard();
    const commit = intent.kind === 'commit';
    const account = document?.account;
    if (ctx.journal.pendingPush || (ctx.journal.draft && !ctx.journal.draft.pull))
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    if (!commit) {
      this.requireConnection(id, document);
      if (ctx.origin && !sameRepo(ctx.origin, account!))
        throw new StorageError('PERMISSION_DENIED');
      if (ctx.base === ctx.head) throw new StorageError('CONFLICT');
      if (
        intent.kind === 'push' &&
        (!account!.contentsWrite || ctx.branch === account!.defaultBranch)
      )
        throw new StorageError('PERMISSION_DENIED');
      if (intent.kind === 'draft') {
        if (!account!.pullRequestsWrite) throw new StorageError('PERMISSION_DENIED');
        if (
          !ctx.journal.pushed ||
          !sameRepo(ctx.journal.pushed, account!) ||
          ctx.journal.pushed.sha !== ctx.head ||
          intent.base === ctx.branch ||
          ctx.journal.draft
        )
          throw new StorageError('CONFLICT');
        assertGitHubText(intent.title, document?.token);
        assertGitHubText(intent.body, document?.token);
      }
    }
    const reviewed = commit ? await ctx.reviewed() : undefined;
    if (intent.kind === 'commit') {
      assertGitHubText(intent.message, document?.token);
      if (!reviewed?.changes.length) throw new StorageError('CONFLICT');
      for (const change of reviewed.changes) {
        assertGitHubText(change.path, document?.token);
        if (change.content !== null) assertGitHubText(change.content, document?.token);
      }
      if (!(await this.verified(id, reviewed.sourceHash))) throw new StorageError('APPROVAL_STALE');
    }
    const preview = GitHubPreviewSchema.parse({
      id: previewId,
      intent,
      repo: account?.repo ?? null,
      branch: ctx.branch,
      sha: ctx.head,
      files: reviewed?.changes.map(({ path, hash }) => ({ path, hash })) ?? [],
      commits: commit ? [] : await this.commits(ctx, document?.token),
    });
    return { preview, reviewed };
  }
  private async reconcile(ctx: GitHubWorkspace, document: GitHubVaultDocument) {
    const { account, token } = document;
    if (ctx.journal.pendingPush) {
      const pending = ctx.journal.pendingPush;
      if (!sameRepo(account, pending)) throw new StorageError('PERMISSION_DENIED');
      if ((await this.remote.head(ctx.broker, pending.branch, account, token)) !== pending.sha)
        throw new StorageError('SIDE_EFFECT_UNKNOWN');
      const { pendingPush: _, ...journal } = ctx.journal;
      ctx.save({ ...journal, pushed: pending });
    } else if (ctx.journal.draft && !ctx.journal.draft.pull) {
      const draft = ctx.journal.draft;
      if (!sameRepo(account, draft)) throw new StorageError('PERMISSION_DENIED');
      const pull = await this.remote.lookupDraft(draft, token);
      if (!pull) throw new StorageError('SIDE_EFFECT_UNKNOWN');
      ctx.save({ ...ctx.journal, draft: { ...draft, pull } });
    }
  }
  private async push(
    id: string,
    ctx: GitHubWorkspace,
    document: GitHubVaultDocument,
    guard: () => void,
  ) {
    const { account, token } = document;
    const destination: GitHubPush = {
      repo: account.repo,
      repositoryId: account.repositoryId,
      branch: ctx.branch,
      sha: ctx.head,
    };
    const base = await this.remote.head(ctx.broker, account.defaultBranch, account, token);
    if (!base) throw new StorageError('CONFLICT');
    await this.remote.verifyBase(account.repo, ctx.base, base, token);
    const current = await this.remote.head(ctx.broker, ctx.branch, account, token);
    const known = ctx.journal.pushed;
    if (
      current !== null &&
      (!known || !sameRepo(known, account) || known.branch !== ctx.branch || known.sha !== current)
    )
      throw new StorageError('CONFLICT');
    if (current === destination.sha) return;
    this.requireConnection(id, document);
    guard();
    ctx.save({ ...ctx.journal, pendingPush: destination });
    let rejected: ReturnType<typeof codeOf> | undefined;
    try {
      await this.remote.push(
        ctx.broker,
        ctx.mirror,
        ctx.head,
        ctx.branch,
        current,
        account,
        token,
        () => {
          this.requireConnection(id, document);
          guard();
        },
      );
    } catch (e) {
      rejected = codeOf(e);
    }
    try {
      if ((await this.remote.head(ctx.broker, ctx.branch, account, token)) === destination.sha) {
        ctx.save({ ...ctx.journal, pushed: destination });
        return;
      }
    } catch {
      /* A missing reply cannot settle a write. */
    }
    if (
      rejected &&
      ['AUTH_EXPIRED', 'PERMISSION_DENIED', 'CONFLICT', 'APPROVAL_STALE'].includes(rejected)
    ) {
      ctx.save(ctx.journal);
      throw new StorageError(rejected);
    }
    throw new StorageError('SIDE_EFFECT_UNKNOWN');
  }
  private async create(
    id: string,
    ctx: GitHubWorkspace,
    document: GitHubVaultDocument,
    plan: GitHubPreview,
    intent: Extract<GitHubIntent, { kind: 'draft' }>,
    guard: () => void,
  ) {
    const { account, token } = document;
    const draft: GitHubDraft = {
      repo: account.repo,
      repositoryId: account.repositoryId,
      branch: ctx.branch,
      sha: ctx.head,
      base: intent.base,
      marker: `<!-- tapkit-run-id:${id}:${plan.id} -->`,
    };
    const existing = await this.remote.lookupDraft(draft, token);
    if (existing) {
      ctx.save({ ...ctx.journal, draft: { ...draft, pull: existing } });
      return;
    }
    const base = await this.remote.head(ctx.broker, intent.base, account, token);
    if (!base || (await this.remote.head(ctx.broker, ctx.branch, account, token)) !== ctx.head)
      throw new StorageError('APPROVAL_STALE');
    this.requireConnection(id, document);
    guard();
    ctx.save({ ...ctx.journal, draft });
    let rejected: ReturnType<typeof codeOf> | undefined;
    try {
      const pull = await this.remote.createDraft(draft, token, intent.title, intent.body);
      ctx.save({ ...ctx.journal, draft: { ...draft, pull } });
      return;
    } catch (e) {
      rejected = codeOf(e);
    }
    try {
      const pull = await this.remote.lookupDraft(draft, token);
      if (pull) {
        ctx.save({ ...ctx.journal, draft: { ...draft, pull } });
        return;
      }
    } catch {
      /* Keep the journal when the verification also fails. */
    }
    if (
      rejected &&
      ['AUTH_EXPIRED', 'PERMISSION_DENIED', 'RATE_LIMITED', 'CONFLICT'].includes(rejected)
    ) {
      ctx.save(ctx.journal);
      throw new StorageError(rejected);
    }
    throw new StorageError('SIDE_EFFECT_UNKNOWN');
  }
  dispatch(request: Request): Promise<Reply> {
    const disconnect =
      request.command === 'github.disconnect'
        ? GitHubCommandSchemas['github.disconnect'].safeParse(request.payload)
        : undefined;
    const disconnectId = disconnect?.success ? disconnect.data.runId : undefined;
    const disconnectToken = Symbol();
    if (disconnectId) {
      try {
        this.code.githubRun(disconnectId);
      } catch (e) {
        return Promise.resolve(failure(request.requestId, codeOf(e)));
      }
      this.disconnecting.set(disconnectId, disconnectToken);
      this.plans.delete(disconnectId);
    }
    return this.serial(async () => {
      try {
        const command = request.command as keyof typeof GitHubCommandSchemas;
        if (!Object.hasOwn(GitHubCommandSchemas, command))
          throw new StorageError('VALIDATION_ERROR');
        const { runId: id } = GitHubCommandSchemas[command].parse(request.payload);
        const run = this.code.githubRun(id);
        if (command === 'github.disconnect') {
          this.plans.delete(id);
          await this.vault('github.delete', this.store.profileId, { runId: id });
          return this.reply(request.requestId, await this.view(id, null));
        }
        const document = await this.connection(id);
        let preview: GitHubPreview | undefined;
        if (command === 'github.clone' || command === 'github.fetch') {
          const d = this.requireConnection(id, document);
          await this.remote.verifyRepository(d.account, d.token);
          await this.code.githubClone(
            id,
            d.account,
            (broker, projectId) => this.remote.fetch(broker, projectId, d.account, d.token),
            command === 'github.fetch',
          );
          this.plans.delete(id);
        } else if (command === 'github.preview') {
          if (!request.windowId) throw new StorageError('PERMISSION_DENIED');
          const { intent } = GitHubCommandSchemas[command].parse(request.payload);
          this.plans.delete(id);
          for (const [key, value] of this.plans)
            if (value.expires <= this.store.now()) this.plans.delete(key);
          if (this.plans.size >= 100) throw new StorageError('BUDGET_EXCEEDED');
          preview = await this.code.githubWorkspace(
            id,
            async (ctx) => (await this.prepare(id, ctx, document, intent, newId())).preview,
            true,
          );
          this.plans.set(id, {
            view: preview,
            windowId: request.windowId,
            accountId: document?.account.id ?? null,
            version: run.task_version,
            expires: this.store.now() + 600_000,
          });
        } else if (command === 'github.dismiss') {
          const { previewId } = GitHubCommandSchemas[command].parse(request.payload);
          const plan = this.plans.get(id);
          if (plan?.view.id === previewId && plan.windowId === request.windowId)
            this.plans.delete(id);
        } else if (command === 'github.approve') {
          const { previewId } = GitHubCommandSchemas[command].parse(request.payload);
          const plan = this.plans.get(id);
          if (
            !plan ||
            plan.view.id !== previewId ||
            plan.windowId !== request.windowId ||
            plan.version !== run.task_version ||
            plan.expires <= this.store.now() ||
            plan.accountId !== (document?.account.id ?? null)
          )
            throw new StorageError('APPROVAL_STALE');
          this.plans.delete(id);
          await this.code.githubWorkspace(
            id,
            async (ctx) => {
              const intent = plan.view.intent;
              const prepared = await this.prepare(id, ctx, document, intent, plan.view.id);
              if (canonicalHash(plan.view) !== canonicalHash(prepared.preview))
                throw new StorageError('APPROVAL_STALE');
              const guard = () => {
                if (plan.expires <= this.store.now()) throw new StorageError('APPROVAL_STALE');
                ctx.guard();
              };
              guard();
              if (intent.kind === 'commit') {
                await ctx.broker.commitReview(
                  ctx.mirror,
                  ctx.branch,
                  ctx.head,
                  intent.message,
                  prepared.reviewed!.changes,
                  guard,
                );
              } else {
                const d = this.requireConnection(id, document);
                await this.remote.verifyRepository(d.account, d.token);
                guard();
                if (intent.kind === 'push') await this.push(id, ctx, d, guard);
                else await this.create(id, ctx, d, plan.view, intent, guard);
              }
            },
            true,
          );
        } else if (command === 'github.reconcile' || command === 'github.checkPR') {
          const d = this.requireConnection(id, document);
          await this.remote.verifyRepository(d.account, d.token);
          await this.code.githubWorkspace(id, async (ctx) => {
            if (command === 'github.reconcile') await this.reconcile(ctx, d);
            else {
              const draft = ctx.journal.draft;
              if (!draft?.pull) throw new StorageError('NOT_FOUND');
              if (!sameRepo(draft, d.account)) throw new StorageError('PERMISSION_DENIED');
              const pull = await this.remote.checkPull(draft, d.token);
              ctx.save({ ...ctx.journal, draft: { ...draft, pull } });
            }
          });
        }
        return this.reply(request.requestId, await this.view(id, document, preview));
      } catch (e) {
        return failure(request.requestId, codeOf(e));
      }
    }).finally(() => {
      if (disconnectId && this.disconnecting.get(disconnectId) === disconnectToken)
        this.disconnecting.delete(disconnectId);
    });
  }
}
