import { useEffect, useId, useRef, useState } from 'react';
import {
  GitHubViewSchema,
  type CodeView,
  type GitHubCommand,
  type GitHubIntent,
  type GitHubView,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import t from '../locales/github.zh-CN.json';

async function call(command: GitHubCommand, payload: unknown) {
  const reply = await window.tapkit.githubCommand(requestOptions(), command, payload);
  if (!reply.ok) throw Error(reply.error.code);
  return GitHubViewSchema.parse('github' in reply.data ? reply.data.github : null);
}
const stateLabel = (state: string) => (t.states as Record<string, string>)[state] ?? state;
const errorLabel = (error: unknown) =>
  (t.errors as Record<string, string>)[error instanceof Error ? error.message : ''] ?? t.error;

export function GitHubPanel({
  runId,
  project,
  onProjectChanged,
}: {
  runId: string;
  project: CodeView | undefined;
  onProjectChanged(): Promise<void>;
}) {
  const [view, setView] = useState<GitHubView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [repo, setRepo] = useState('');
  const [contentsWrite, setContentsWrite] = useState(false);
  const [pullRequestsWrite, setPullRequestsWrite] = useState(false);
  const [message, setMessage] = useState<string>();
  const [base, setBase] = useState<string>();
  const [title, setTitle] = useState<string>();
  const [body, setBody] = useState('');
  const reviewId = useId();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const commitButton = useRef<HTMLButtonElement>(null);
  const pushButton = useRef<HTMLButtonElement>(null);
  const draftButton = useRef<HTMLButtonElement>(null);
  const receipt = useRef<HTMLParagraphElement>(null);
  const pullLink = useRef<HTMLAnchorElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<
    GitHubIntent['kind'] | 'review' | 'receipt' | 'pull' | 'error' | 'panel' | null
  >(null);

  useEffect(() => {
    let active = true;
    void call('github.status', { runId }).then(
      (value) => {
        if (active) setView(value);
      },
      (e) => {
        if (active) setError(errorLabel(e));
      },
    );
    return () => {
      active = false;
    };
  }, [runId]);
  useEffect(() => {
    if (busy || !focusAfter.current) return;
    const target = {
      review: reviewHeading.current,
      commit: commitButton.current,
      push: pushButton.current,
      draft: draftButton.current,
      receipt: receipt.current,
      pull: pullLink.current,
      error: alert.current,
      panel: panelHeading.current,
    }[focusAfter.current];
    focusAfter.current = null;
    (target ?? panelHeading.current)?.focus();
  }, [busy, view, error]);
  async function action(command: GitHubCommand, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      const value = await call(command, { runId, ...payload });
      const kind = view?.preview?.intent.kind;
      if (command === 'github.status') focusAfter.current = 'panel';
      if (command === 'github.preview') focusAfter.current = 'review';
      if (command === 'github.dismiss') focusAfter.current = kind ?? null;
      if (command === 'github.approve' || command === 'github.reconcile')
        focusAfter.current = kind === 'draft' || view?.pending === 'draft' ? 'pull' : 'receipt';
      setView(value);
      if (command === 'github.clone' || command === 'github.fetch') await onProjectChanged();
    } catch (e) {
      focusAfter.current = 'error';
      setError(errorLabel(e));
      if (command === 'github.approve' || command === 'github.reconcile') {
        try {
          setView(await call('github.status', { runId }));
        } catch {
          /* Keep the current notice. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function preview(intent: GitHubIntent) {
    return action('github.preview', { intent });
  }
  const account = view?.account;
  const draftBase = base ?? account?.defaultBranch ?? '';
  const suggestion = project?.changes.length
    ? `更新 ${project.changes[0]!.path}${project.changes.length > 1 ? ` 等 ${project.changes.length} 个文件` : ''}`
    : '';
  const commitMessage = message ?? suggestion;
  const draftTitle = title ?? view?.commit?.subject.slice(0, 240) ?? '';
  const pending = view?.pending;
  const review = view?.preview;
  const reviewKind = review?.intent.kind;
  const reviewTitle =
    reviewKind === 'commit'
      ? t.commitPreview
      : reviewKind === 'push'
        ? t.pushPreview
        : t.draftPreview;
  const pull = view?.pull;
  if (project?.revoked)
    return account ? (
      <section className="github-panel" aria-label={t.title}>
        <div className="code-toolbar">
          <h4>{t.title}</h4>
          <button type="button" disabled={busy} onClick={() => void action('github.disconnect')}>
            {t.disconnect}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    ) : null;

  return (
    <section className="github-panel" aria-label={t.title}>
      <div className="code-toolbar">
        <h4 ref={panelHeading} tabIndex={-1}>
          {t.title}
        </h4>
        {account && (
          <button type="button" disabled={busy} onClick={() => void action('github.disconnect')}>
            {t.disconnect}
          </button>
        )}
      </div>
      {error && (
        <p ref={alert} tabIndex={-1} role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">{t.working}</p>}
      {!view && !busy && !error && <p role="status">{t.loading}</p>}
      {!view && error && (
        <button type="button" disabled={busy} onClick={() => void action('github.status')}>
          {t.retryStatus}
        </button>
      )}
      {account ? (
        <>
          <p className="github-target">
            <strong>{account.repo}</strong>
            <span>
              {account.login} ·{' '}
              {[account.contentsWrite && t.contents, account.pullRequestsWrite && t.pulls]
                .filter(Boolean)
                .join(' · ') || t.read}
            </span>
          </p>
          {!project && (
            <button type="button" disabled={busy} onClick={() => void action('github.clone')}>
              {t.clone}
            </button>
          )}
          {project?.githubRepo === account.repo && !project.prepared && (
            <button type="button" disabled={busy} onClick={() => void action('github.fetch')}>
              {t.fetch}
            </button>
          )}
        </>
      ) : (
        view &&
        !review && (
          <form
            aria-label={t.connect}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const input = form.elements.namedItem('githubToken') as HTMLInputElement;
              const token = input.value;
              input.value = '';
              void action('github.connect', { repo, token, contentsWrite, pullRequestsWrite });
            }}
          >
            <label>
              {t.repo}
              <input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder={t.repoExample}
                required
                maxLength={141}
                disabled={busy}
              />
            </label>
            <label>
              {t.token}
              <input
                name="githubToken"
                type="password"
                autoComplete="off"
                required
                maxLength={255}
                disabled={busy}
              />
            </label>
            <div className="github-options">
              <label>
                <input
                  type="checkbox"
                  checked={contentsWrite}
                  onChange={(event) => setContentsWrite(event.target.checked)}
                  disabled={busy}
                />
                {t.contents}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={pullRequestsWrite}
                  onChange={(event) => setPullRequestsWrite(event.target.checked)}
                  disabled={busy}
                />
                {t.pulls}
              </label>
            </div>
            <button type="submit" disabled={busy}>
              {t.connect}
            </button>
          </form>
        )
      )}
      {pending && (
        <div className="github-result">
          <p role="status">{t.pending}</p>
          <button
            type="button"
            disabled={busy || !account}
            onClick={() => void action('github.reconcile')}
          >
            {t.reconcile}
          </button>
        </div>
      )}
      {view?.commit && (
        <p className="github-target" ref={receipt} tabIndex={-1}>
          <span>
            {t.commit} <code>{view.commit.sha.slice(0, 12)}</code> {view.commit.subject}
          </span>
          {view.pushedSha && (
            <span>
              {t.pushed} <code>{view.pushedSha.slice(0, 12)}</code>
            </span>
          )}
        </p>
      )}
      {project?.prepared && project.git && !pending && !review && (
        <>
          {!!project.changes.length && (
            <form
              aria-label={t.commitPreview}
              onSubmit={(event) => {
                event.preventDefault();
                void preview({ kind: 'commit', message: commitMessage });
              }}
            >
              <label>
                {t.commitMessage}
                <textarea
                  value={commitMessage}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={500}
                  required
                  disabled={busy}
                />
              </label>
              <small>{t.reviewFiles}</small>
              <button ref={commitButton} type="submit" disabled={busy}>
                {t.commitPreview}
              </button>
            </form>
          )}
          {account?.contentsWrite && view?.commit && view.commit.sha !== view.pushedSha && (
            <button
              ref={pushButton}
              type="button"
              disabled={busy}
              onClick={() => void preview({ kind: 'push' })}
            >
              {t.pushPreview}
            </button>
          )}
          {account?.pullRequestsWrite &&
            view?.commit &&
            view.commit.sha === view.pushedSha &&
            !pull && (
              <form
                aria-label={t.draftPreview}
                onSubmit={(event) => {
                  event.preventDefault();
                  void preview({ kind: 'draft', base: draftBase, title: draftTitle, body });
                }}
              >
                <label>
                  {t.base}
                  <input
                    value={draftBase}
                    onChange={(event) => setBase(event.target.value)}
                    required
                    maxLength={160}
                    disabled={busy}
                  />
                </label>
                <label>
                  {t.prTitle}
                  <input
                    value={draftTitle}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={240}
                    disabled={busy}
                  />
                </label>
                <label>
                  {t.body}
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={12000}
                    disabled={busy}
                  />
                </label>
                <button ref={draftButton} type="submit" disabled={busy}>
                  {t.draftPreview}
                </button>
              </form>
            )}
        </>
      )}
      {review && (
        <section className="github-review" aria-labelledby={reviewId}>
          <h4 id={reviewId} ref={reviewHeading} tabIndex={-1}>
            {reviewTitle}
          </h4>
          <dl>
            <dt>{reviewKind === 'commit' ? t.localScope : t.repo}</dt>
            <dd>{reviewKind === 'commit' ? t.local : review.repo}</dd>
            <dt>{t.branch}</dt>
            <dd>
              <code>{review.branch}</code>
            </dd>
            <dt>{reviewKind === 'commit' ? t.currentHead : t.commitSha}</dt>
            <dd>
              <code>{review.sha}</code>
            </dd>
            {review.intent.kind === 'draft' && (
              <>
                <dt>{t.base}</dt>
                <dd>
                  <code>{review.intent.base}</code>
                </dd>
                <dt>{t.prTitle}</dt>
                <dd>{review.intent.title}</dd>
              </>
            )}
          </dl>
          {review.intent.kind === 'commit' && (
            <p className="github-text">{review.intent.message}</p>
          )}
          {review.intent.kind === 'draft' && <p className="github-text">{review.intent.body}</p>}
          {!!review.files.length && (
            <ul aria-label={t.files}>
              {review.files.map(({ path }) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          )}
          {!!review.commits.length && (
            <ul aria-label={t.commits}>
              {review.commits.map(({ sha, subject }) => (
                <li key={sha}>
                  <code>{sha.slice(0, 12)}</code> {subject}
                </li>
              ))}
            </ul>
          )}
          <div className="github-options">
            <button
              className="github-confirm"
              type="button"
              disabled={busy}
              onClick={() => void action('github.approve', { previewId: review.id })}
            >
              {review.intent.kind === 'commit'
                ? t.confirmCommit
                : review.intent.kind === 'push'
                  ? t.confirmPush
                  : t.confirmDraft}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void action('github.dismiss', { previewId: review.id })}
            >
              {t.cancel}
            </button>
          </div>
        </section>
      )}
      {pull && (
        <div className="github-result">
          <div className="code-toolbar">
            <a
              ref={pullLink}
              href={pull.url}
              onClick={(event) => {
                event.preventDefault();
                void window.tapkit.openPublicLink(pull.url).catch((e) => setError(errorLabel(e)));
              }}
            >
              #{pull.number} {pull.title}
            </a>
            <span>
              {pull.draft ? 'Draft · ' : ''}
              {stateLabel(pull.state)}
            </span>
            <button
              type="button"
              disabled={busy || !account}
              onClick={() => void action('github.checkPR')}
            >
              {t.refresh}
            </button>
          </div>
          <details>
            <summary>{t.checks}</summary>
            {pull.checks.length ? (
              <ul>
                {pull.checks.map((check, i) => (
                  <li key={`${check.name}-${i}`}>
                    {check.name} · {stateLabel(check.state)}
                  </li>
                ))}
              </ul>
            ) : (
              pull.checksAvailable && <p>{t.noChecks}</p>
            )}
            {!pull.checksAvailable && <small>{t.partialChecks}</small>}
          </details>
          <details>
            <summary>{t.reviews}</summary>
            {pull.reviews.length ? (
              <ul>
                {pull.reviews.map((entry, i) => (
                  <li key={`${entry.login}-${i}`}>
                    <strong>{entry.login}</strong> · {stateLabel(entry.state)}
                    {entry.body && <p className="github-text">{entry.body}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              pull.reviewsAvailable && <p>{t.noReviews}</p>
            )}
            {!pull.reviewsAvailable && <small>{t.partialReviews}</small>}
          </details>
        </div>
      )}
    </section>
  );
}
