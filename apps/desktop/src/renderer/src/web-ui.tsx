import { useEffect, useRef, useState } from 'react';
import {
  WebOptionsSchema,
  WebSourceSchema,
  WebSourceInfoSchema,
  WebReplySchema,
  WebActivitySchema,
  z,
  type WebOptions,
  type WebSource,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { ActionPopover } from './action-popover';
import t from '../locales/web.zh-CN.json';

export async function webCommand(
  command: Parameters<typeof window.tapkit.webCommand>[1],
  payload: unknown,
) {
  const reply = await window.tapkit.webCommand(requestOptions(), command, payload);
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
export function webError(error: unknown) {
  const code = error instanceof Error ? error.message : 'WEB_UNAVAILABLE';
  return t.errors[code as keyof typeof t.errors] ?? t.errors.WEB_UNAVAILABLE;
}
export function WebReferenceButton({
  sessionId,
  sourceId,
  onOpen,
}: {
  sessionId: string;
  sourceId: string;
  onOpen: () => void;
}) {
  const [info, setInfo] = useState<z.infer<typeof WebSourceInfoSchema>>();
  useEffect(() => {
    let alive = true;
    void webCommand('web.sourceInfo', { sessionId, sourceId })
      .then((value) => {
        const parsed = z.object({ webSourceInfo: WebSourceInfoSchema }).parse(value);
        if (alive) setInfo(parsed.webSourceInfo);
      })
      .catch(() => {
        if (alive) setInfo(undefined);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, sourceId]);
  return (
    <button className="web-reference" onClick={onOpen} disabled={!info}>
      <span>{info?.title ?? '网页来源不可用'}</span>
      {info && (
        <small>
          网页 · v{info.revision} · {new Date(info.fetchedAt).toLocaleString()}
        </small>
      )}
    </button>
  );
}
export function WebControls({
  sessionId,
  options,
  onOptions,
  onSources,
  eventSeq,
}: {
  sessionId?: string | undefined;
  options: WebOptions;
  onOptions: (value: WebOptions) => void;
  onSources: () => void;
  eventSeq: number;
}) {
  const [configured, setConfigured] = useState(false),
    [projectOnly, setProjectOnly] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (sessionId)
      void webCommand('web.settings', { sessionId })
        .then((data) => {
          const parsed = WebReplySchema.parse(data);
          if (alive && 'webOptions' in parsed) {
            onOptions(parsed.webOptions);
            setConfigured(parsed.searchConfigured);
            setProjectOnly(parsed.projectOnly);
          }
        })
        .catch((e) => {
          if (alive) setError(webError(e));
        });
    return () => {
      alive = false;
    };
  }, [sessionId, eventSeq]);
  async function save(next: WebOptions) {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      WebOptionsSchema.parse(next);
      if (sessionId) await webCommand('web.configure', { sessionId, options: next });
      onOptions(next);
      setStatus(t.saved);
    } catch (e) {
      setError(webError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="web-controls">
      <label>
        {t.mode}
        <select
          aria-label={t.mode}
          value={options.mode}
          disabled={projectOnly || busy}
          onChange={(e) => void save({ ...options, mode: e.target.value as WebOptions['mode'] })}
        >
          {Object.entries(t.modes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ActionPopover label={t.title} className="web-settings">
        <p>{projectOnly ? t.projectOnly : t.autoHelp}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget),
              next = { ...options };
            try {
              const days = String(values.get('days') ?? '').trim(),
                language = String(values.get('language') ?? '').trim(),
                country = String(values.get('country') ?? '').trim();
              delete next.days;
              delete next.language;
              delete next.country;
              if (days) next.days = Number(days);
              if (language) next.language = language;
              if (country) next.country = country;
              next.domains = String(values.get('domains') ?? '')
                .split(/[,，\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
              next.excludeDomains = String(values.get('excludeDomains') ?? '')
                .split(/[,，\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
              void save(WebOptionsSchema.parse(next));
            } catch (error) {
              setError(webError(error));
            }
          }}
        >
          <label>
            {t.days}
            <input name="days" type="number" min="1" max="3650" defaultValue={options.days ?? ''} />
          </label>
          <label>
            {t.language}
            <input name="language" maxLength={5} defaultValue={options.language ?? ''} />
          </label>
          <label>
            {t.country}
            <input name="country" maxLength={64} defaultValue={options.country ?? ''} />
          </label>
          <label>
            {t.domains}
            <input name="domains" defaultValue={options.domains.join(', ')} />
          </label>
          <label>
            {t.excludeDomains}
            <input name="excludeDomains" defaultValue={options.excludeDomains.join(', ')} />
          </label>
          <button type="submit" disabled={busy || projectOnly}>
            {t.apply}
          </button>
        </form>
        <p role="status">
          {configured ? t.configured : sessionId ? t.notConfigured : t.statusAfterSend}
        </p>
        <small>{t.keyHelp}</small>
        <p>
          <small>{t.filterHelp}</small>
        </p>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
      </ActionPopover>
      {sessionId && (
        <button type="button" onClick={onSources}>
          {t.sources}
        </button>
      )}
      {projectOnly && <small>{t.projectOnly}</small>}
    </div>
  );
}
export function WebControlsDialog({
  open,
  onClose,
  ...controls
}: Parameters<typeof WebControls>[0] & { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="web-config-dialog"
      aria-label={t.title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2>{t.title}</h2>
      <WebControls
        key={controls.sessionId ?? 'draft'}
        {...controls}
        onSources={() => {
          onClose();
          controls.onSources();
        }}
      />
      <button type="button" onClick={onClose}>
        {t.closeSettings}
      </button>
    </dialog>
  );
}
export function WebSources({
  sessionId,
  sourceId,
  onClose,
}: {
  sessionId: string;
  sourceId?: string | undefined;
  onClose: () => void;
}) {
  const [sources, setSources] = useState<z.infer<typeof WebSourceSchema>[]>([]),
    [selected, setSelected] = useState(sourceId),
    [activity, setActivity] = useState<z.infer<typeof WebActivitySchema>[]>([]),
    [source, setSource] = useState<WebSource>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectId, setProjectId] = useState(''),
    [status, setStatus] = useState('');
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void webCommand('web.sources', { sessionId })
      .then((data) => {
        const p = WebReplySchema.parse(data);
        if (alive && 'webSources' in p)
          setSources(p.webSources.map((s) => ({ ...s, text: '', links: [] })));
      })
      .catch((e) => {
        if (alive) setError(webError(e));
      });
    void webCommand('web.activity', { sessionId })
      .then((data) => {
        const p = WebReplySchema.parse(data);
        if (alive && 'webActivity' in p) setActivity(p.webActivity);
      })
      .catch((e) => {
        if (alive) setError(webError(e));
      });
    void window.tapkit
      .desktopCommand(requestOptions(), 'desktop.workspace', {})
      .then((reply) => {
        if (alive && reply.ok && 'projects' in reply.data) setProjects(reply.data.projects);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId]);
  useEffect(() => {
    let alive = true;
    if (selected) {
      setBusy(true);
      setError('');
      setSource(undefined);
      void webCommand('web.source', { sessionId, sourceId: selected })
        .then((data) => {
          const p = WebReplySchema.parse(data);
          if (alive && 'webSource' in p) setSource(p.webSource);
        })
        .catch((e) => {
          if (alive) setError(webError(e));
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [selected, sessionId]);
  return (
    <aside
      className="web-source-panel"
      aria-label={t.sources}
      tabIndex={-1}
      ref={panel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header>
        <h2>{t.sources}</h2>
        <button onClick={onClose} aria-label={t.close}>
          {t.close}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{t.loading}</p>}
      {!sources.length && !busy && <p>{t.empty}</p>}
      {!!activity.length && (
        <details>
          <summary>{t.activity}</summary>
          <ul>
            {activity.map((item, i) => (
              <li key={i}>
                <p>
                  {item.state === 'pending'
                    ? t.pending
                    : item.errorCode
                      ? webError(new Error(item.errorCode))
                      : item.tool === 'web.search'
                        ? t.searchSucceeded
                        : t.readSucceeded}
                </p>
                {item.searches !== null && <small>托管搜索 {item.searches} 次</small>}
                {item.extraCostUnknown && <small> · 厂商可能另计搜索费用，金额未知</small>}
                {item.candidates.map((candidate) => (
                  <p key={candidate.url}>
                    <button onClick={() => void window.tapkit.openPublicLink(candidate.url)}>
                      {candidate.title}
                    </button>
                    <small>{candidate.snippet}</small>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ul className="web-source-list">
        {sources.map((item) => (
          <li key={item.sourceId}>
            <button
              onClick={() => setSelected(item.sourceId)}
              aria-pressed={selected === item.sourceId}
            >
              {item.title}
            </button>
            <small>
              {new Date(item.fetchedAt).toLocaleString()} · v{item.revision}
            </small>
          </li>
        ))}
      </ul>
      {source && (
        <article>
          <h3>{source.title}</h3>
          <p>{source.url}</p>
          <small>
            {t.snapshot} · {new Date(source.fetchedAt).toLocaleString()}
          </small>
          <button onClick={() => void window.tapkit.openPublicLink(source.url)}>{t.open}</button>
          <p className="web-source-text">{source.text}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              void webCommand('web.saveProject', {
                sessionId,
                sourceId: source.sourceId,
                projectId,
              })
                .then(() => setStatus(t.saved))
                .catch((e) => setError(webError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              {t.project}
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t.project}</option>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <small>{t.saveProjectHelp}</small>
            <button disabled={!projectId || busy}>{t.saveProject}</button>
          </form>
          {status && <p role="status">{status}</p>}
        </article>
      )}
    </aside>
  );
}
