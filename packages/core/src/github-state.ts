import type { GitHubPull } from '@tapkit/contracts';

export type GitHubTarget = { repo: string; repositoryId: number };
export type GitHubPush = GitHubTarget & { branch: string; sha: string };
export type GitHubDraft = GitHubPush & { base: string; marker: string; pull?: GitHubPull };
export type GitHubJournal = {
  pushed?: GitHubPush;
  pendingPush?: GitHubPush;
  draft?: GitHubDraft;
};
