import { useEffect, useState } from 'react';
import { ApprovalViewSchema, GrantViewSchema, type z } from '@tapkit/contracts';
import { workCommand } from './work-ui';
import t from '../locales/permissions.zh-CN.json';
type Approval = z.infer<typeof ApprovalViewSchema>;
export function PermissionsCenter({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [approvals, setApprovals] = useState<Approval[]>([]),
    [grants, setGrants] = useState<z.infer<typeof GrantViewSchema>[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function reload() {
    const a = await workCommand('approvals.list');
    const g = await workCommand('grants.list');
    if ('approvals' in a) setApprovals(a.approvals);
    if ('grants' in g) setGrants(g.grants);
  }
  useEffect(() => {
    let cancelled = false;
    const read = () =>
      !cancelled && void reload().catch((e: Error) => !cancelled && setError(e.message));
    read();
    const timer = setInterval(read, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = approvals.filter((a) => a.decision === 'pending');
  return (
    <section className="work-center" aria-label={t.title}>
      <h2>{t.title}</h2>
      <p>{t.boundary}</p>
      {error && (
        <p role="alert">
          {t.error}
          {error}
        </p>
      )}
      <h3>{t.approvals}</h3>
      {!pending.length && <p>{t.empty}</p>}
      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={a} busy={busy} act={act} onNavigate={onNavigate} />
      ))}
      <h3>{t.grants}</h3>
      <p>{t.impact}</p>
      {!grants.length && <p>{t.noGrant}</p>}
      {grants.map((g) => (
        <article key={g.id} className="work-row">
          <span>
            {t.workspace} · {t[g.scope]} {g.revoked ? ' · ' + t.revoked : ''}
          </span>
          <button
            disabled={g.revoked || busy}
            onClick={() => void act(() => workCommand('grants.revoke', { grantIds: [g.id] }))}
          >
            {t.revoke}
          </button>
        </article>
      ))}
      <details>
        <summary>{t.history}</summary>
        {approvals
          .filter((a) => a.decision !== 'pending')
          .map((a) => (
            <p key={a.id}>
              {a.preview.target} · {a.decision}{' '}
              {a.decision === 'expired' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const data = await workCommand('runs.get', { runId: a.runId });
                      if (!('work' in data)) throw Error('NOT_FOUND');
                      await workCommand(
                        'approvals.refresh',
                        { approvalId: a.id },
                        data.work.revision,
                      );
                    })
                  }
                >
                  {t.refresh}
                </button>
              )}
              <button onClick={() => onNavigate('/work/' + a.runId)}>{t.open}</button>
            </p>
          ))}
      </details>
    </section>
  );
}
function ApprovalCard({
  approval: a,
  busy,
  act,
  onNavigate,
}: {
  approval: Approval;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const [scope, setScope] = useState<'once' | 'session' | 'persistent'>('once'),
    [editing, setEditing] = useState(false),
    [content, setContent] = useState(a.preview.after);
  async function revision() {
    const data = await workCommand('runs.get', { runId: a.runId });
    if (!('work' in data)) throw Error('NOT_FOUND');
    return data.work.revision;
  }
  return (
    <article className="work-approval" aria-label={t.approvals}>
      <h4>
        {t.target}：{a.preview.target}
      </h4>
      <div className="work-diff">
        <section>
          <h5>{t.before}</h5>
          <pre>{a.preview.before}</pre>
        </section>
        <section>
          <h5>{t.after}</h5>
          {editing ? (
            <label>
              {t.after}
              <textarea
                aria-label={t.after}
                value={content}
                maxLength={64000}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
          ) : (
            <pre>{a.preview.after}</pre>
          )}
        </section>
      </div>
      <div className="work-actions">
        {editing ? (
          <>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (a.businessArgs.tool !== 'workspace.patch') throw Error('PERMISSION_DENIED');
                  await workCommand(
                    'approvals.editDraft',
                    { approvalId: a.id, newBusinessArgs: { ...a.businessArgs, content } },
                    await revision(),
                  );
                  setEditing(false);
                })
              }
            >
              {t.save}
            </button>
            <button onClick={() => setEditing(false)}>{t.cancel}</button>
          </>
        ) : (
          <>
            <label>
              {t.scope}
              <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                {(['once', 'session', 'persistent'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  workCommand(
                    'approvals.decide',
                    {
                      approvalId: a.id,
                      decision: 'approved',
                      argsHash: a.argsHash,
                      contentVersionHash: a.contentVersionHash,
                      scope,
                    },
                    await revision(),
                  ),
                )
              }
            >
              {t.approve}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  workCommand(
                    'approvals.decide',
                    {
                      approvalId: a.id,
                      decision: 'rejected',
                      argsHash: a.argsHash,
                      contentVersionHash: a.contentVersionHash,
                      scope,
                    },
                    await revision(),
                  ),
                )
              }
            >
              {t.reject}
            </button>
            {a.businessArgs.tool === 'workspace.patch' && (
              <button onClick={() => setEditing(true)}>{t.edit}</button>
            )}
          </>
        )}
        <button onClick={() => onNavigate('/work/' + a.runId)}>{t.open}</button>
      </div>
    </article>
  );
}
