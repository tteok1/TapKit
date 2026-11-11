import {
  z,
  GitHubBranchSchema,
  GitHubRepoSchema,
  GitHubShaSchema,
  type GitHubAccount,
  type GitHubPull,
} from '@tapkit/contracts';
import { NetworkPolicyService } from '@tapkit/network';
import type { CodeGitBroker } from '@tapkit/tools';
import { StorageError } from '@tapkit/storage';
import type { GitHubDraft } from './github-state';

const Repository = z.object({
  id: z.number().int().positive(),
  full_name: GitHubRepoSchema,
  default_branch: GitHubBranchSchema,
});
const Pull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  draft: z.boolean(),
  state: z.enum(['open', 'closed']),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  head: z.object({
    ref: GitHubBranchSchema,
    sha: GitHubShaSchema,
    repo: z.object({ id: z.number() }).nullable(),
  }),
  base: z.object({ ref: GitHubBranchSchema, repo: z.object({ id: z.number() }) }),
});
type PullWire = z.infer<typeof Pull>;
export function redactGitHubText(value: string, token = '') {
  const text = token ? value.replaceAll(token, '[凭据已隐藏]') : value;
  return text.replace(
    /(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    '[凭据已隐藏]',
  );
}
export function assertGitHubText(value: string, token?: string) {
  if (value !== redactGitHubText(value, token) || /\0|<!--\s*tapkit-run-id:/i.test(value))
    throw new StorageError('PERMISSION_DENIED');
}

export class GitHubRemote {
  constructor(readonly network: NetworkPolicyService) {}
  private async request(path: string, token: string, body?: unknown) {
    const reply = await this.network.github('https://api.github.com' + path, token, body);
    if (reply.status === 401) throw new StorageError('AUTH_EXPIRED');
    if (
      reply.status === 429 ||
      (reply.status === 403 && reply.headers['x-ratelimit-remaining'] === '0')
    )
      throw new StorageError('RATE_LIMITED');
    if (reply.status === 403 || reply.status === 404) throw new StorageError('PERMISSION_DENIED');
    if (reply.status === 409 || reply.status === 422) throw new StorageError('CONFLICT');
    if (reply.status < 200 || reply.status >= 300) throw new StorageError('NETWORK_ERROR');
    try {
      return JSON.parse(reply.bytes.toString('utf8')) as unknown;
    } catch {
      throw new StorageError('NETWORK_ERROR');
    }
  }
  async identify(repo: string, token: string) {
    const [identity, repository] = await Promise.all([
      this.request('/user', token),
      this.request('/repos/' + repo, token),
    ]);
    const user = z
      .object({
        login: z
          .string()
          .max(100)
          .regex(/^[\w-]+$/),
      })
      .parse(identity);
    const verified = Repository.parse(repository);
    if (verified.full_name !== repo) throw new StorageError('PERMISSION_DENIED');
    return { login: user.login, repositoryId: verified.id, defaultBranch: verified.default_branch };
  }
  async verifyRepository(account: GitHubAccount, token: string) {
    const repo = Repository.parse(await this.request('/repos/' + account.repo, token));
    if (
      repo.id !== account.repositoryId ||
      repo.full_name !== account.repo ||
      repo.default_branch !== account.defaultBranch
    )
      throw new StorageError('CONFLICT');
  }
  private async transport(account: GitHubAccount, token: string) {
    const signal = AbortSignal.timeout(15_000);
    const target = await this.network.destination(
      'https://github.com/' + account.repo + '.git',
      signal,
    );
    const proxy = (await this.network.deps.proxy?.(target.url, signal)) ?? '';
    signal.throwIfAborted();
    return { repo: account.repo, token, address: target.address.address, proxy };
  }
  async fetch(broker: CodeGitBroker, id: string, account: GitHubAccount, token: string) {
    return broker.fetchGithub(id, account.defaultBranch, await this.transport(account, token));
  }
  async head(broker: CodeGitBroker, branch: string, account: GitHubAccount, token: string) {
    return broker.githubHead(branch, await this.transport(account, token));
  }
  async push(
    broker: CodeGitBroker,
    mirror: string,
    sha: string,
    branch: string,
    previous: string | null,
    account: GitHubAccount,
    token: string,
    guard: () => void,
  ) {
    const transport = await this.transport(account, token);
    guard();
    await broker.pushGithub(mirror, sha, branch, previous, transport, guard);
  }
  async verifyBase(repo: string, base: string, remote: string, token: string) {
    if (base === remote) return;
    const value = z
      .object({ merge_base_commit: z.object({ sha: GitHubShaSchema }) })
      .parse(await this.request(`/repos/${repo}/compare/${base}...${remote}?per_page=1`, token));
    if (value.merge_base_commit.sha !== base) throw new StorageError('CONFLICT');
  }
  private sameBranch(row: PullWire, draft: GitHubDraft) {
    return (
      row.head.ref === draft.branch &&
      row.base.ref === draft.base &&
      row.head.repo?.id === draft.repositoryId &&
      row.base.repo.id === draft.repositoryId
    );
  }
  private matches(row: PullWire, draft: GitHubDraft) {
    return (
      this.sameBranch(row, draft) &&
      row.head.sha === draft.sha &&
      !!row.body?.split(/\r?\n/).includes(draft.marker)
    );
  }
  private pullView(row: PullWire, repo: string, token: string): GitHubPull {
    return {
      number: row.number,
      url: `https://github.com/${repo}/pull/${row.number}`,
      sha: row.head.sha,
      title: redactGitHubText(row.title, token).slice(0, 240),
      draft: row.draft,
      state: row.merged || row.merged_at ? 'merged' : row.state,
      checks: [],
      reviews: [],
      checksAvailable: false,
      reviewsAvailable: false,
    };
  }
  async lookupDraft(draft: GitHubDraft, token: string) {
    const query = new URLSearchParams({
      state: 'all',
      head: `${draft.repo.split('/')[0]}:${draft.branch}`,
      base: draft.base,
      per_page: '100',
    });
    const rows = z
      .array(Pull)
      .max(100)
      .parse(await this.request(`/repos/${draft.repo}/pulls?${query}`, token));
    const matches = rows.filter((row) => this.matches(row, draft));
    if (matches.length > 1) throw new StorageError('SIDE_EFFECT_UNKNOWN');
    if (matches.length === 1) return this.pullView(matches[0]!, draft.repo, token);
    if (rows.length === 100 || rows.some((row) => row.state === 'open'))
      throw new StorageError('CONFLICT');
    return null;
  }
  async createDraft(draft: GitHubDraft, token: string, title: string, body: string) {
    const row = Pull.parse(
      await this.request(`/repos/${draft.repo}/pulls`, token, {
        head: draft.branch,
        base: draft.base,
        title,
        body: body + '\n\n' + draft.marker,
        draft: true,
      }),
    );
    if (!row.draft || !this.matches(row, draft)) throw new StorageError('SIDE_EFFECT_UNKNOWN');
    return this.pullView(row, draft.repo, token);
  }
  async checkPull(draft: GitHubDraft, token: string) {
    if (!draft.pull) throw new StorageError('NOT_FOUND');
    const prefix = `/repos/${draft.repo}`;
    const row = Pull.parse(await this.request(`${prefix}/pulls/${draft.pull.number}`, token));
    if (
      row.number !== draft.pull.number ||
      row.base.repo.id !== draft.repositoryId ||
      row.base.ref !== draft.base ||
      row.head.ref !== draft.branch ||
      (row.head.repo && row.head.repo.id !== draft.repositoryId)
    )
      throw new StorageError('CONFLICT');
    const pull = this.pullView(row, draft.repo, token);
    const [checks, statuses, reviews] = await Promise.allSettled([
      this.request(`${prefix}/commits/${row.head.sha}/check-runs?per_page=100`, token).then(
        (value) =>
          z
            .object({
              total_count: z.number(),
              check_runs: z
                .array(
                  z.object({
                    name: z.string(),
                    status: z.string(),
                    conclusion: z.string().nullable(),
                  }),
                )
                .max(100),
            })
            .parse(value),
      ),
      this.request(`${prefix}/commits/${row.head.sha}/status?per_page=100`, token).then((value) =>
        z
          .object({
            total_count: z.number(),
            statuses: z.array(z.object({ context: z.string(), state: z.string() })).max(100),
          })
          .parse(value),
      ),
      this.request(`${prefix}/pulls/${row.number}/reviews?per_page=100`, token).then((value) =>
        z
          .array(
            z.object({
              user: z.object({ login: z.string() }).nullable(),
              state: z.string(),
              body: z.string().nullable(),
            }),
          )
          .max(100)
          .parse(value),
      ),
    ]);
    const text = (value: string, max: number) => redactGitHubText(value, token).slice(0, max);
    if (checks.status === 'fulfilled')
      pull.checks.push(
        ...checks.value.check_runs.map((r) => ({
          name: text(r.name, 160),
          state: text(r.conclusion ?? r.status, 64),
        })),
      );
    if (statuses.status === 'fulfilled')
      pull.checks.push(
        ...statuses.value.statuses.map((r) => ({
          name: text(r.context, 160),
          state: text(r.state, 64),
        })),
      );
    pull.checksAvailable =
      checks.status === 'fulfilled' &&
      checks.value.total_count <= 100 &&
      statuses.status === 'fulfilled' &&
      statuses.value.total_count <= 100;
    if (reviews.status === 'fulfilled') {
      pull.reviews = reviews.value.map((r) => ({
        login: text(r.user?.login ?? 'GitHub', 100),
        state: text(r.state, 64),
        body: text(r.body ?? '', 600),
      }));
      pull.reviewsAvailable = reviews.value.length < 100;
    }
    return pull;
  }
}
