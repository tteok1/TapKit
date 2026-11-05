import { codeLineDiff } from './code-diff';
import { useEffect, useState, useMemo } from 'react';
import { CodeViewSchema, type CodeView, type CodeCommand, type WorkView } from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { workCommand } from './work-ui';
import t from '../locales/code.zh-CN.json';
import './code.css';

async function command(name: CodeCommand, payload: unknown) {
  const r = await window.tapkit.codeCommand(requestOptions(), name, payload);
  if (!r.ok) throw Error(r.error.code);
  return CodeViewSchema.parse('code' in r.data ? r.data.code : null);
}
export function CodePanel({
  work,
  onNavigate,
}: {
  work: WorkView;
  onNavigate: (path: string) => void;
}) {
  const [view, setView] = useState<CodeView>(),
    [path, setPath] = useState(''),
    [read, setRead] = useState<CodeView['read']>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [includeDirty, setIncludeDirty] = useState(false),
    [untracked, setUntracked] = useState<string[]>([]),
    [branch, setBranch] = useState(''),
    [line, setLine] = useState(1),
    [side, setSide] = useState<'left' | 'right'>('right'),
    [body, setBody] = useState(''),
    [notice, setNotice] = useState(''),
    [rowOffset, setRowOffset] = useState(0);
  const runId = work.runId;
  function showError(e: unknown) {
    const code = e instanceof Error ? e.message : '';
    setError(
      code === 'CONFLICT'
        ? t.conflict
        : code === 'PERMISSION_DENIED'
          ? t.permission
          : code === 'FEATURE_NOT_AVAILABLE'
            ? t.unsupported
            : t.error,
    );
  }
  async function reload() {
    const next = await command('code.status', { runId });
    setView(next);
  }
  useEffect(() => {
    let active = true;
    void command('code.status', { runId })
      .then((v) => {
        if (active) setView(v);
      })
      .catch((e: Error) => {
        if (active && e.message !== 'NOT_FOUND') showError(e);
      });
    return () => {
      active = false;
    };
  }, [runId, work.status]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  const diff = view?.changes.find((c) => c.path === path),
    current = read?.path === path ? read : undefined;
  const before = diff ? diff.before : (current?.content ?? null),
    after = diff ? diff.after : (current?.content ?? null);
  const aligned = useMemo(() => codeLineDiff(before, after), [before, after]);
  const rows = (_text: string | null, position: 'left' | 'right') => (
    <div
      className="code-lines"
      data-side={position}
      aria-label={position === 'left' ? t.before : t.after}
      tabIndex={0}
    >
      {aligned.slice(rowOffset, rowOffset + 300).map((row, i) => {
        const value = row[position];
        const number = value ? value.number + (!diff ? (current?.startLine ?? 1) - 1 : 0) : null;
        const selected = number !== null && number === line && side === position;
        return (
          <div key={rowOffset + i} data-changed={row.changed} data-selected={selected}>
            {number !== null ? (
              <button
                className="code-line-number"
                type="button"
                aria-pressed={selected}
                aria-label={`${position === 'left' ? t.before : t.after} ${number}`}
                onClick={() => {
                  setLine(number);
                  setSide(position);
                }}
              >
                {number}
              </button>
            ) : (
              <span className="code-line-placeholder" aria-hidden="true" />
            )}
            <code>{value?.text || ' '}</code>
          </div>
        );
      })}
    </div>
  );
  return (
    <section className="code-panel" aria-label={t.title}>
      <div className="code-toolbar">
        <h3>{t.title}</h3>
        {view?.prepared && (
          <button type="button" disabled={busy} onClick={() => void action(reload)}>
            {t.refresh}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">{t.busy}</p>}
      {!view ? (
        <>
          <p>{t.intro}</p>
          <button
            type="button"
            disabled={busy || !['queued', 'paused', 'waiting_user'].includes(work.status)}
            onClick={() =>
              void action(async () => {
                const r = await window.tapkit.chooseCodeProject(runId);
                if (!r) return;
                if (!r.ok) throw Error(r.error.code);
                setView(CodeViewSchema.parse('code' in r.data ? r.data.code : null));
              })
            }
          >
            {t.choose}
          </button>
        </>
      ) : view.revoked ? (
        <p role="status">{t.revoked}</p>
      ) : (
        <>
          <p className="code-summary">
            {view.name} · {view.git ? (view.branch ?? 'HEAD') : t.copy}
            {view.head && (
              <>
                {' '}
                · <code>{view.head.slice(0, 10)}</code>
              </>
            )}
          </p>
          <p className="code-scope">{t.scope}</p>
          {!view.prepared ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  setView(
                    await command('code.prepareWorkspace', {
                      runId,
                      ...(branch ? { baseRef: branch } : {}),
                      includeDirty,
                      untracked,
                    }),
                  );
                });
              }}
            >
              {view.git && (
                <label>
                  {t.base}
                  <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">{view.branch ?? 'HEAD'}</option>
                    {view.branches
                      .filter((b) => b !== view.branch)
                      .map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                  </select>
                </label>
              )}
              {view.dirty && (
                <>
                  <p>{t.dirty}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeDirty}
                      onChange={(e) => {
                        setIncludeDirty(e.target.checked);
                        if (!e.target.checked) setUntracked([]);
                      }}
                    />
                    {t.includeDirty}
                  </label>
                  {includeDirty && view.untracked.length > 0 && (
                    <fieldset>
                      <legend>{t.untracked}</legend>
                      {view.untracked.map((p) => (
                        <label key={p}>
                          <input
                            type="checkbox"
                            checked={untracked.includes(p)}
                            onChange={(e) =>
                              setUntracked(
                                e.target.checked
                                  ? [...untracked, p]
                                  : untracked.filter((v) => v !== p),
                              )
                            }
                          />
                          {p}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
              <button type="submit" disabled={busy}>
                {t.prepare}
              </button>
            </form>
          ) : (
            <>
              <div className="code-workspace">
                <nav aria-label={t.tree}>
                  {[
                    ...new Set([
                      ...view.files.map((f) => f.path),
                      ...view.changes.map((f) => f.path),
                    ]),
                  ]
                    .sort()
                    .map((p) => (
                      <button
                        type="button"
                        key={p}
                        aria-current={p === path ? 'page' : undefined}
                        onClick={() =>
                          void action(async () => {
                            setPath(p);
                            setRowOffset(0);
                            setLine(1);
                            if (view.files.some((f) => f.path === p)) {
                              const v = await command('code.read', { runId, path: p });
                              setRead(v.read);
                            } else setRead(undefined);
                          })
                        }
                      >
                        {p}
                        <small>
                          {view.changes.find((c) => c.path === p)?.kind &&
                            t[view.changes.find((c) => c.path === p)!.kind]}
                        </small>
                      </button>
                    ))}
                </nav>
                <div className="code-review" aria-label={t.diff}>
                  {path ? (
                    <>
                      <h4>{path}</h4>
                      {diff && (
                        <div className="code-toolbar">
                          <span>
                            {t[diff.kind]}
                            {diff.accepted && ` · ${t.accepted}`}
                          </span>
                          {(['accept', 'revert', 'restore'] as const).map((a) => (
                            <button
                              type="button"
                              key={a}
                              disabled={busy || (a === 'restore' && !diff.canRestore)}
                              onClick={() =>
                                void action(async () => {
                                  setView(
                                    await command(`code.${a}`, {
                                      runId,
                                      path,
                                      expectedHash: diff.hash,
                                    }),
                                  );
                                  const updated = await command('code.status', { runId });
                                  if (updated.files.some((f) => f.path === path))
                                    setRead((await command('code.read', { runId, path })).read);
                                  else setRead(undefined);
                                })
                              }
                            >
                              {t[a]}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="code-sides">
                        <div>
                          <h5>{t.before}</h5>
                          {rows(before, 'left')}
                        </div>
                        <div>
                          <h5>{t.after}</h5>
                          {rows(after, 'right')}
                        </div>
                      </div>
                      {diff && aligned.length > 300 && (
                        <div className="code-toolbar">
                          <button
                            type="button"
                            disabled={rowOffset === 0}
                            onClick={() => setRowOffset(Math.max(0, rowOffset - 300))}
                          >
                            {t.previousLines}
                          </button>
                          <span>
                            {rowOffset + 1}–{Math.min(rowOffset + 300, aligned.length)} /{' '}
                            {aligned.length}
                          </span>
                          <button
                            type="button"
                            disabled={rowOffset + 300 >= aligned.length}
                            onClick={() => setRowOffset(rowOffset + 300)}
                          >
                            {t.nextLines}
                          </button>
                        </div>
                      )}
                      {!diff &&
                        current &&
                        (view.files.find((f) => f.path === path)?.lines ?? 0) > 300 && (
                          <div className="code-toolbar">
                            {([-1, 1] as const).map((direction) => (
                              <button
                                type="button"
                                key={direction}
                                disabled={
                                  busy ||
                                  (direction === -1
                                    ? current.startLine === 1
                                    : current.endLine >=
                                      (view.files.find((f) => f.path === path)?.lines ?? 0))
                                }
                                onClick={() =>
                                  void action(async () => {
                                    const startLine = Math.max(
                                        1,
                                        current.startLine + direction * 300,
                                      ),
                                      endLine = Math.min(
                                        startLine + 299,
                                        view.files.find((f) => f.path === path)!.lines,
                                      );
                                    const next = await command('code.read', {
                                      runId,
                                      path,
                                      startLine,
                                      endLine,
                                    });
                                    setRead(next.read);
                                    setLine(startLine);
                                    setSide('right');
                                  })
                                }
                              >
                                {direction === -1 ? t.previousLines : t.nextLines}
                              </button>
                            ))}
                            <span>
                              {current.startLine}–{current.endLine}
                            </span>
                          </div>
                        )}
                      <form
                        aria-label={t.body}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            setView(
                              await command('code.comment', {
                                runId,
                                path,
                                line,
                                side,
                                baseHash:
                                  side === 'left'
                                    ? (diff?.baseHash ?? null)
                                    : (diff?.hash ?? current?.hash ?? null),
                                body,
                              }),
                            );
                            setBody('');
                          });
                        }}
                      >
                        <div className="code-toolbar">
                          <label>
                            {t.side}
                            <select
                              value={side}
                              onChange={(e) => setSide(e.target.value as 'left' | 'right')}
                            >
                              <option value="left">{t.before}</option>
                              <option value="right">{t.after}</option>
                            </select>
                          </label>
                          <label>
                            {t.line}
                            <input
                              type="number"
                              min="1"
                              value={line}
                              onChange={(e) => setLine(Number(e.target.value))}
                            />
                          </label>
                        </div>
                        <label>
                          {t.body}
                          <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            maxLength={4000}
                            required
                          />
                        </label>
                        <div className="code-toolbar">
                          <button type="submit" disabled={busy || !body.trim()}>
                            {t.comment}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                const hash =
                                  side === 'left' ? diff?.baseHash : (diff?.hash ?? current?.hash);
                                if (!hash) throw Error('CONFLICT');
                                const verified = await command('code.reference', {
                                  runId,
                                  path,
                                  line,
                                  side,
                                  baseHash: hash,
                                });
                                await window.tapkit.copyText(JSON.stringify(verified.reference));
                                setNotice(t.copied);
                              })
                            }
                          >
                            {t.reference}
                          </button>
                        </div>
                      </form>
                      {view.comments
                        .filter((c) => c.path === path)
                        .map((c) => (
                          <p key={c.id} className="code-comment">
                            {c.side === 'left' ? t.before : t.after} {c.line} · {c.body}
                            {c.stale && <small>{t.stale}</small>}
                          </p>
                        ))}
                    </>
                  ) : (
                    <p>{view.files.length ? t.chooseFile : t.none}</p>
                  )}
                </div>
              </div>
              {view.comments.length > 0 && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    ![
                      'completed',
                      'partial',
                      'failed',
                      'paused',
                      'waiting_user',
                      'cancelled',
                      'budget_stopped',
                    ].includes(work.status)
                  }
                  onClick={() =>
                    void action(async () => {
                      const r = await workCommand(
                        'runs.steer',
                        {
                          runId,
                          text: work.definition.goal + '\n' + t.feedbackGoal,
                          clientRequestId: requestOptions().requestId,
                        },
                        work.revision,
                      );
                      if (!('work' in r)) throw Error('CONFLICT');
                      await command('code.inherit', { runId: r.work.runId, sourceRunId: runId });
                      onNavigate('/work/' + r.work.runId);
                    })
                  }
                >
                  {t.continue}
                </button>
              )}
            </>
          )}
          <button
            className="code-revoke"
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async () => setView(await command('code.revoke', { runId })))
            }
          >
            {t.revoke}
          </button>
        </>
      )}
    </section>
  );
}
