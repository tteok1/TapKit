import { ActionPopover } from './action-popover';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tapkit/ui';
import {
  BootstrapViewSchema,
  MemoryPageSchema,
  MemoryPolicySchema,
  MemoryUseSchema,
  type MemoryView,
  type MemoryScope,
  type MemoryCommand,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import t from '../locales/memory.zh-CN.json';
export async function memoryCommand(command: MemoryCommand, payload: unknown, revision?: number) {
  const r = await window.tapkit.memoryCommand(requestOptions(revision), command, payload);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
}
const errorText = (e: unknown) =>
  e instanceof Error && e.message === 'CONFLICT' ? t.conflict : t.error;
const memoryName = (predicate: string) =>
  /^事实:[a-f0-9]{24}$/.test(predicate) ? t.fact : predicate;
export function MemoryManager() {
  const [profile, setProfile] = useState(''),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [scopeId, setScopeId] = useState(''),
    [query, setQuery] = useState(''),
    [rows, setRows] = useState<MemoryView[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [predicate, setPredicate] = useState(''),
    [value, setValue] = useState(''),
    [editing, setEditing] = useState<MemoryView>(),
    [source, setSource] = useState(''),
    [clear, setClear] = useState<'scope' | 'all'>(),
    [undo, setUndo] = useState<string>();
  const scope: MemoryScope = { type: scopeId === profile ? 'profile' : 'project', id: scopeId };
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await window.tapkit.bootstrap(requestOptions());
      if (!r.ok) throw new Error(r.error.code);
      const id = BootstrapViewSchema.parse(r.data).profile.id;
      const p = await window.tapkit.projectCommand(requestOptions(), 'projects.list', {});
      if (!p.ok) throw new Error(p.error.code);
      if (alive) {
        setProfile(id);
        setScopeId(id);
        setProjects((p.data as { projects: { id: string; name: string }[] }).projects);
      }
    })().catch((e) => {
      if (alive) setError(errorText(e));
    });
    return () => {
      alive = false;
    };
  }, []);
  async function load(more = false) {
    if (!scopeId) return;
    const page = MemoryPageSchema.parse(
      await memoryCommand('memory.list', { scope, query, ...(more && cursor ? { cursor } : {}) }),
    );
    setRows((old) => (more ? [...old, ...page.memories] : page.memories));
    setCursor(page.nextCursor);
  }
  useEffect(() => {
    if (!scopeId) return;
    let alive = true;
    void memoryCommand('memory.list', { scope, query })
      .then((data) => {
        if (alive) {
          const page = MemoryPageSchema.parse(data);
          setRows(page.memories);
          setCursor(page.nextCursor);
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [scopeId, query]);
  async function action(work: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    setError('');
    try {
      const result = (await work()) as { memoryChange?: { changeEventId: string | null } };
      if (result?.memoryChange?.changeEventId) setUndo(result.memoryChange.changeEventId);
      if (refresh) await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="memory-manager" aria-label={t.title}>
      <h2>{t.title}</h2>
      <p>{t.scopeHint}</p>
      <label>
        {t.scope}
        <select
          aria-label={t.scope}
          value={scopeId}
          onChange={(e) => {
            setScopeId(e.target.value);
            if (!editing) setValue('');
          }}
        >
          <option value={profile}>{t.personal}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option disabled>{t.agent}</option>
        </select>
      </label>
      <label>
        {t.search}
        <input aria-label={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button disabled={busy} onClick={() => void action(() => load())}>
        {t.refresh}
      </button>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const result = editing
              ? await memoryCommand(
                  'memory.update',
                  { memoryId: editing.id, value, scope },
                  editing.revision,
                )
              : await memoryCommand('memory.write', { scope, predicate, value });
            setEditing(undefined);
            setPredicate('');
            setValue('');
            return result;
          });
        }}
      >
        <label>
          {t.predicate}
          <input
            aria-label={t.predicate}
            maxLength={160}
            disabled={!!editing}
            value={editing ? memoryName(editing.predicate) : predicate}
            onChange={(e) => setPredicate(e.target.value)}
            required
          />
        </label>
        <label>
          {t.value}
          <textarea
            aria-label={t.value}
            maxLength={2000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <span className="action-group">
          <button disabled={busy || !scopeId} type="submit">
            {editing ? t.save : t.add}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(undefined);
                setValue('');
              }}
            >
              {t.close}
            </button>
          )}
        </span>
      </form>
      {!rows.length && <p>{t.empty}</p>}
      {rows.map((m) => (
        <article className="memory-row" key={m.id} data-memory-id={m.id}>
          <strong>{memoryName(m.predicate)}</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{m.value}</p>
          <p>
            {m.explicit ? t.explicit : t.automatic} · {t.updated}{' '}
            {new Date(m.updatedAt).toLocaleString('zh-CN')}
          </p>
          {m.sensitive && <p>{t.sensitive}</p>}
          <span className="action-group">
            <button
              disabled={busy}
              onClick={() => {
                setEditing(m);
                setValue(m.value);
              }}
            >
              {t.edit}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(() => memoryCommand('memory.delete', { memoryId: m.id }, m.revision))
              }
            >
              {t.delete}
            </button>
          </span>
          {m.sources.map((s) => (
            <button
              key={s.messageId}
              onClick={() =>
                void action(async () => {
                  const r = (await memoryCommand('memory.source', {
                    memoryId: m.id,
                    messageId: s.messageId,
                  })) as { memorySource: { text: string } };
                  setSource(r.memorySource.text);
                })
              }
            >
              {t.source}
            </button>
          ))}
        </article>
      ))}
      {cursor && (
        <button disabled={busy} onClick={() => void action(() => load(true), false)}>
          {t.next}
        </button>
      )}
      {source && (
        <div role="region" aria-label={t.source}>
          <pre>{source}</pre>
          <button onClick={() => setSource('')}>{t.close}</button>
        </div>
      )}
      <span className="action-group">
        <button disabled={busy} onClick={() => setClear('scope')}>
          {t.clear}
        </button>
        <button disabled={busy} onClick={() => setClear('all')}>
          {t.clearAll}
        </button>
      </span>
      {clear && (
        <div role="dialog" aria-label={t.confirmClear}>
          <p>{t.clearHint}</p>
          <span className="action-group">
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const r = await memoryCommand('memory.clear', clear === 'scope' ? { scope } : {});
                  setClear(undefined);
                  setUndo(undefined);
                  return r;
                })
              }
            >
              {t.confirmClear}
            </button>
            <button onClick={() => setClear(undefined)}>{t.close}</button>
          </span>
        </div>
      )}
      {undo && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const r = await memoryCommand('memory.undo', { changeEventId: undo });
              setUndo(undefined);
              return r;
            })
          }
        >
          {t.undo}
        </button>
      )}
    </section>
  );
}
export function MemoryPolicy({ sessionId, eventSeq }: { sessionId: string; eventSeq: number }) {
  const dirty = useRef(false);
  const [open, setOpen] = useState(false),
    [policy, setPolicy] = useState<z.infer<typeof MemoryPolicySchema>>(),
    [error, setError] = useState(''),
    [memory, setMemory] = useState(true),
    [history, setHistory] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void memoryCommand('memory.policy', { sessionId })
      .then((data) => {
        if (alive) {
          const p = MemoryPolicySchema.parse(data);
          setPolicy(p);
          // Background title/workspace updates must not replace unsaved checkbox edits.
          if (!dirty.current) {
            setMemory(p.memoryEnabled);
            setHistory(p.historyEnabled);
          }
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [sessionId, eventSeq]);
  return (
    <div className="memory-policy">
      <button onClick={() => setOpen(!open)}>{t.policy}</button>
      {policy?.temporary && <p>{t.temporary}</p>}
      {open && policy && (
        <div role="region" aria-label={t.policy}>
          <p>{t.scopeHint}</p>
          <p>
            {t.scope}：{policy.scope.type === 'profile' ? t.personal : t.project}
          </p>
          <p>
            {t.global}：
            {[policy.globalMemory, policy.globalHistory, policy.globalInstructions]
              .map((v) => (v ? '✓' : '×'))
              .join(' / ')}
          </p>
          {!policy.temporary && (
            <>
              <label>
                <input
                  aria-label={t.enabled}
                  type="checkbox"
                  checked={memory}
                  disabled={busy}
                  onChange={(e) => {
                    dirty.current = true;
                    setMemory(e.target.checked);
                  }}
                />
                {t.enabled}
              </label>
              <label>
                <input
                  aria-label={t.history}
                  type="checkbox"
                  checked={history}
                  disabled={busy}
                  onChange={(e) => {
                    dirty.current = true;
                    setHistory(e.target.checked);
                  }}
                />
                {t.history}
              </label>
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void memoryCommand(
                    'memory.policy.set',
                    { sessionId, memoryEnabled: memory, historyEnabled: history },
                    policy.revision,
                  )
                    .then((r) => {
                      dirty.current = false;
                      const saved = MemoryPolicySchema.parse(r);
                      setPolicy(saved);
                      setMemory(saved.memoryEnabled);
                      setHistory(saved.historyEnabled);
                    })
                    .catch((e) => setError(errorText(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t.policySave}
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <Link to="/settings/personalization">{t.manage}</Link>
        </div>
      )}
    </div>
  );
}
export function MemoryMessage({
  sessionId,
  messageId,
  eventSeq,
  policySeq,
  role,
}: {
  sessionId: string;
  messageId: string;
  eventSeq: number;
  policySeq: number;
  role: string;
}) {
  const [uses, setUses] = useState<z.infer<typeof MemoryUseSchema>>(),
    [notices, setNotices] = useState<
      { memoryId: string; changeEventId: string; status: string; sensitive: boolean }[]
    >([]),
    [error, setError] = useState(''),
    [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    if (role === 'assistant' && uses)
      void memoryCommand('memory.used', { sessionId, messageId })
        .then((r) => {
          if (alive) setUses(MemoryUseSchema.parse(r));
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
    return () => {
      alive = false;
    };
  }, [sessionId, messageId, eventSeq, policySeq]);
  useEffect(() => {
    let alive = true;
    if (role === 'user')
      void memoryCommand('memory.notices', { sessionId, messageId })
        .then((r) => {
          if (alive) setNotices((r as { memoryNotices: typeof notices }).memoryNotices);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId, messageId, eventSeq]);
  return (
    <div className="memory-message">
      {notices
        .filter((n) => !done.includes(n.changeEventId))
        .map((n) => (
          <p role="status" key={n.changeEventId}>
            {n.status === 'deleted' ? t.deleted : t.changed} {n.sensitive && t.sensitive}{' '}
            <Link to="/settings/personalization">{t.manage}</Link>{' '}
            <button
              onClick={() => {
                setError('');
                void memoryCommand('memory.undo', { changeEventId: n.changeEventId })
                  .then(() => setDone((old) => [...old, n.changeEventId]))
                  .catch((e) => setError(errorText(e)));
              }}
            >
              {t.undo}
            </button>
          </p>
        ))}
      {role === 'assistant' && (
        <ActionPopover
          label={t.uses}
          icon="memory"
          onOpen={() => {
            void memoryCommand('memory.used', { sessionId, messageId })
              .then((r) => setUses(MemoryUseSchema.parse(r)))
              .catch((e) => setError(errorText(e)));
          }}
        >
          {uses && !uses.memoryUses.length && !uses.historyUses.length && <p>{t.noUses}</p>}
          {uses?.memoryUses.map((m) => (
            <p key={m.id}>
              {memoryName(m.predicate)}：{m.value}{' '}
              <Link to="/settings/personalization">{t.manage}</Link>
            </p>
          ))}
          {uses?.historyUses.map((h) => (
            <p key={h.messageId}>
              {h.text}
              <Link to={'/sessions/' + h.sessionId + '?message=' + h.messageId}>{t.source}</Link>
            </p>
          ))}
        </ActionPopover>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
