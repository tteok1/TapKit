import { useEffect, useRef, useState } from 'react';
import {
  BrowserReplySchema,
  z,
  type BrowserCommand,
  type BrowserTab,
  type ResourceRef,
  type WorkView,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { workCommand } from './work-ui';
import t from '../locales/browser.zh-CN.json';
import './browser.css';
function SubmissionFields({ value }: { value: string }) {
  try {
    const preview = z
      .object({ fields: z.array(z.tuple([z.string(), z.string()])) })
      .parse(JSON.parse(value));
    return (
      <table>
        <thead>
          <tr>
            <th>{t.field}</th>
            <th>{t.content}</th>
          </tr>
        </thead>
        <tbody>
          {preview.fields.map(([name, content], index) => (
            <tr key={index}>
              <th scope="row">{name}</th>
              <td>{content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } catch {
    return <pre>{value}</pre>;
  }
}

export function BrowserPanel({
  work,
  onMaterial,
}: {
  work: WorkView;
  onMaterial: (ref: ResourceRef) => void;
}) {
  const [tabs, setTabs] = useState<BrowserTab[]>([]),
    [activeId, setActiveId] = useState(''),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [approvals, setApprovals] = useState<
    Array<{
      id: string;
      argsHash: string;
      contentVersionHash: string;
      preview: { target: string; after: string };
    }>
  >([]);
  const viewport = useRef<HTMLDivElement>(null);
  const terminal = ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(
    work.status,
  );
  const tab =
    tabs.find((v) => v.id === activeId) ?? tabs.find((v) => v.state === 'open') ?? tabs.at(-1);
  async function command(command: BrowserCommand, payload: Record<string, unknown> = {}) {
    const reply = await window.tapkit.browserCommand(requestOptions(), command, {
      runId: work.runId,
      ...payload,
    });
    if (!reply.ok) throw Error(reply.error.code);
    return BrowserReplySchema.parse(reply.data);
  }
  async function reload() {
    const data = await command('browser.tabs');
    if ('tabs' in data) setTabs(data.tabs);
    const pending = await workCommand('approvals.list', { runId: work.runId });
    if ('approvals' in pending)
      setApprovals(
        pending.approvals.filter(
          (a) => a.decision === 'pending' && a.businessArgs.tool.startsWith('browser.'),
        ),
      );
  }
  async function action(fn: () => Promise<unknown>) {
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
  useEffect(() => {
    let closed = false;
    const read = () => {
      if (!closed)
        void reload().catch((e: Error) => {
          if (!closed) setError(e.message);
        });
    };
    read();
    const timer = setInterval(read, 1500);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, [work.runId]);
  useEffect(() => {
    if (tab?.url) setUrl(tab.url);
  }, [tab?.id, tab?.url]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !tab || tab.state !== 'open' || terminal) return;
    const tabId = tab.id;
    let frame = 0;
    const present = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const scrollport = element.closest('.screen-scroll')?.getBoundingClientRect();
        const overlays = [
          ...document.querySelectorAll(
            'dialog[open], [aria-modal="true"], [role="dialog"], [role="menu"], [role="tooltip"], [popover]:popover-open',
          ),
        ];
        const occluded = overlays.some((node) => {
          const b = node.getBoundingClientRect();
          return (
            b.width > 0 &&
            b.height > 0 &&
            (node.matches('dialog[open], [aria-modal="true"]') ||
              (b.left < rect.right &&
                b.right > rect.left &&
                b.top < rect.bottom &&
                b.bottom > rect.top))
          );
        });
        const visible =
          document.visibilityState === 'visible' &&
          !occluded &&
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= innerHeight &&
          rect.right <= innerWidth &&
          (!scrollport ||
            (rect.top >= scrollport.top &&
              rect.bottom <= scrollport.bottom &&
              rect.left >= scrollport.left &&
              rect.right <= scrollport.right));
        void command('browser.present', {
          tabId,
          visible,
          bounds: {
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.max(1, Math.floor(rect.width)),
            height: Math.max(1, Math.floor(rect.height)),
          },
        }).catch(() => {});
      });
    };
    const observer = new ResizeObserver(present);
    observer.observe(element);
    const mutations = new MutationObserver(present);
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'aria-hidden', 'aria-modal', 'style', 'class'],
    });
    addEventListener('scroll', present, true);
    addEventListener('resize', present);
    document.addEventListener('visibilitychange', present);
    present();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      removeEventListener('scroll', present, true);
      removeEventListener('resize', present);
      document.removeEventListener('visibilitychange', present);
      void command('browser.present', {
        tabId,
        visible: false,
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      }).catch(() => {});
    };
  }, [tab?.id, tab?.state, terminal]);
  const tabAction = (commandName: BrowserCommand, extra: Record<string, unknown> = {}) =>
    action(() => command(commandName, { tabId: tab?.id, ...extra }));
  async function decide(id: string, decision: 'approved' | 'rejected') {
    const a = approvals.find((a) => a.id === id);
    if (!a) return;
    const current = await workCommand('runs.get', { runId: work.runId });
    if (!('work' in current)) return;
    await workCommand(
      'approvals.decide',
      {
        approvalId: id,
        decision,
        argsHash: a.argsHash,
        contentVersionHash: a.contentVersionHash,
        scope: 'once',
      },
      current.work.revision,
    );
  }
  return (
    <section className="browser-panel" aria-label={t.title}>
      <header>
        <h3>{t.title}</h3>
        <p>{t.scope}</p>
      </header>
      <form
        className="browser-address"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const data = await command('browser.open', { url });
            if ('snapshot' in data) setActiveId(data.snapshot.tabId);
          });
        }}
      >
        <label>
          {t.url}
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={terminal || busy}
            placeholder="https://example.com"
          />
        </label>
        <button disabled={terminal || busy}>{t.open}</button>
        {tab?.state === 'open' && (
          <button
            type="button"
            disabled={busy || terminal || tab.mode === 'user'}
            onClick={() => void tabAction('browser.action', { action: 'navigate', url })}
          >
            {t.go}
          </button>
        )}
      </form>
      {error && (
        <p role="alert">
          {error === 'APPROVAL_STALE' ? t.stale : `${t.error} ${error}`}{' '}
          <button
            onClick={() =>
              void (tab?.state === 'open' && !terminal
                ? tabAction('browser.observe')
                : action(reload))
            }
          >
            {tab?.state === 'open' && !terminal ? t.observe : t.refreshList}
          </button>
        </p>
      )}
      {busy && <p role="status">{t.busy}</p>}
      {!!tabs.length && (
        <div className="browser-tabs" role="tablist" aria-label={t.title}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tab?.id}
              onClick={() => setActiveId(item.id)}
              title={item.url}
            >
              {item.title || item.url}
            </button>
          ))}
        </div>
      )}
      {tab ? (
        <>
          <div className="browser-toolbar">
            {(['back', 'forward', 'reload'] as const).map((name) => (
              <button
                key={name}
                disabled={busy || terminal || tab.state !== 'open' || tab.mode === 'user'}
                onClick={() => void tabAction('browser.action', { action: name })}
              >
                {t[name]}
              </button>
            ))}
            <button
              disabled={busy || terminal || tab.state !== 'open'}
              onClick={() => void tabAction('browser.observe')}
            >
              {t.observe}
            </button>
            <button
              disabled={busy || terminal || tab.state !== 'open'}
              onClick={() =>
                void tabAction('browser.control', { mode: tab.mode === 'agent' ? 'user' : 'agent' })
              }
            >
              {tab.mode === 'agent' ? t.takeover : t.return}
            </button>
            <button onClick={() => void action(() => window.tapkit.copyText(tab.url))}>
              {t.copy}
            </button>
            <button
              disabled={tab.state !== 'open' || terminal}
              onClick={() => void tabAction('browser.external')}
            >
              {t.external}
            </button>
            <button
              disabled={busy || terminal || tab.state !== 'open'}
              onClick={() => void tabAction('browser.close')}
            >
              {t.close}
            </button>
          </div>
          <p role="status">
            {tab.state === 'open' && !terminal
              ? tab.mode === 'agent'
                ? t.agent
                : t.user
              : t.interrupted}
          </p>
          {tab.snapshot?.blocked && <p role="status">{t.blocked}</p>}
          {tab.state === 'open' && !terminal && (
            <div className="browser-viewport" ref={viewport} aria-label={t.view}>
              <p>{t.snapshot}</p>
              <pre>{tab.snapshot?.text || tab.title}</pre>
            </div>
          )}
          <div className="browser-toolbar">
            {([false, true] as const).map((selection) => (
              <button
                key={String(selection)}
                disabled={busy || terminal || tab.state !== 'open'}
                onClick={() =>
                  void action(async () => {
                    const data = await command('browser.material', { tabId: tab.id, selection });
                    if ('browserMaterial' in data) {
                      onMaterial(data.browserMaterial);
                      setSaved(true);
                    }
                  })
                }
              >
                {selection ? t.selection : t.material}
              </button>
            ))}
          </div>
          {saved && <p role="status">{t.saved}</p>}
          {tab.snapshot?.downloads.map((download) => (
            <p key={download.url}>
              {download.name}{' '}
              <button
                disabled={busy || terminal || tab.state !== 'open'}
                onClick={() =>
                  void action(async () => {
                    const data = await command('browser.download', {
                      tabId: tab.id,
                      url: download.url,
                    });
                    if ('browserMaterial' in data) {
                      onMaterial(data.browserMaterial);
                      setSaved(true);
                    }
                  })
                }
              >
                {t.download}
              </button>
            </p>
          ))}
          {tab.snapshot && (
            <details>
              <summary>{t.snapshot}</summary>
              <pre className="browser-snapshot">{tab.snapshot.text}</pre>
            </details>
          )}
        </>
      ) : (
        <p className="browser-empty">{t.empty}</p>
      )}
      {approvals.map((a) => (
        <section className="browser-review" key={a.id} aria-label={t.preview}>
          <h4>{t.preview}</h4>
          <p>{a.preview.target}</p>
          <SubmissionFields value={a.preview.after} />
          <p>{t.once}</p>
          <div className="browser-toolbar">
            <button disabled={busy} onClick={() => void action(() => decide(a.id, 'approved'))}>
              {t.approve}
            </button>
            <button disabled={busy} onClick={() => void action(() => decide(a.id, 'rejected'))}>
              {t.reject}
            </button>
          </div>
        </section>
      ))}
      {work.unresolvedCalls
        .filter((c) => c.tool.startsWith('browser.'))
        .map((call) => (
          <section key={call.id}>
            <p role="alert">{t.unknown}</p>
            <div className="browser-toolbar">
              <button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    command('browser.resolve', { callId: call.id, outcome: 'submitted' }),
                  )
                }
              >
                {t.submitted}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    command('browser.resolve', { callId: call.id, outcome: 'not_submitted' }),
                  )
                }
              >
                {t.notSubmitted}
              </button>
            </div>
          </section>
        ))}
    </section>
  );
}
