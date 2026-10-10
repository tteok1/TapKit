import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from '@tapkit/ui';
import {
  BootstrapViewSchema,
  SettingsViewSchema,
  WorkspaceViewSchema,
  ProviderListSchema,
  CreatedEntitySchema,
  type SettingsValues,
  type Reply,
  type z,
} from '@tapkit/contracts';
import { AuthDiagnostic } from './auth-diagnostic';
import { ApiDiagnostic } from './api-diagnostic';
import { ModelSettings } from './model-settings';
import { DesktopSettings } from './desktop-settings';
import { readLayout, writeLayout, requestOptions, type WindowLayout } from './desktop-state';
import t from '../locales/desktop.zh-CN.json';
import text from '../locales/zh-CN.json';
import branding from '../../../../../resources/branding.json';
import { LocalAvatar } from './local-avatar';
import { ChatSurface } from './chat-surface';
import { HistoryList, SearchView, historyCommand } from './history-ui';
import { FileLibrary } from './file-library';
import { ProjectsList, ProjectPage } from './projects-ui';
import { ArtifactPanel } from '../features/viewer/panel';
import { useViewer } from '../features/viewer/state';
import h from '../locales/history.zh-CN.json';
import { BranchChangeSchema } from '@tapkit/contracts';
import { SessionDetailsSchema, type SessionRecord } from '@tapkit/contracts';
import { HistoryLocationSchema } from '@tapkit/contracts';
import { DEFAULT_SETTINGS } from '@tapkit/contracts';
type Bootstrap = z.infer<typeof BootstrapViewSchema>;
type Workspace = z.infer<typeof WorkspaceViewSchema>;
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
export function DesktopShell() {
  const viewer = useViewer();
  const [bootstrap, setBootstrap] = useState<Bootstrap>(),
    [workspace, setWorkspace] = useState<Workspace>(),
    [accounts, setAccounts] = useState<z.infer<typeof ProviderListSchema>>();
  const [connectionError, setConnectionError] = useState(false);
  const [routed, setRouted] = useState<SessionRecord>();
  const [locatedEntity, setLocatedEntity] =
    useState<ReturnType<typeof HistoryLocationSchema.parse>>();
  const [layout, setLayout] = useState<WindowLayout>(() => readLayout(window.tapkit.windowSlot)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState(''),
    [mode, setMode] = useState<'chat' | 'work'>('chat');
  const [dialog, setDialog] = useState<'search' | 'project' | null>(null),
    [projectName, setProjectName] = useState('');
  const [viewport, setViewport] = useState(window.innerWidth),
    [sidebarDrawer, setSidebarDrawer] = useState(false);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const location = useLocation(),
    navigate = useNavigate(),
    scroll = useRef<HTMLElement>(null),
    sidebarScroll = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    modal = useRef<HTMLDialogElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    layoutRef = useRef(layout),
    drafts = useRef<Record<string, string>>({});
  const temporaryIds = useRef(new Set<string>()),
    previousRoute = useRef(location.pathname);
  layoutRef.current = layout;
  useEffect(() => {
    if (viewer.active) setLayout((l) => ({ ...l, panelOpen: true }));
  }, [viewer.active, viewer.openSequence]);
  useEffect(() => {
    if (sidebarScroll.current) sidebarScroll.current.scrollTop = layoutRef.current.sidebarScroll;
  }, [bootstrap?.profile.id]);
  const refresh = useCallback(async () => {
    const boot = BootstrapViewSchema.parse(data(await window.tapkit.bootstrap(requestOptions())));
    const work = WorkspaceViewSchema.parse(
      data(await window.tapkit.desktopCommand(requestOptions(), 'desktop.workspace', {})),
    );
    setBootstrap((current) =>
      current && current.settings.revision > boot.settings.revision
        ? { ...boot, settings: current.settings }
        : boot,
    );
    setWorkspace(work);
    window.dispatchEvent(new Event('tapkit:history-refresh'));
    try {
      setAccounts(
        ProviderListSchema.parse(data(await window.tapkit.listProviders(requestOptions()))),
      );
      setConnectionError(false);
    } catch {
      setAccounts(undefined);
      setConnectionError(true);
    }
  }, []);
  useEffect(() => {
    const changed = () => void refresh().catch(() => setError(t.error));
    window.addEventListener('tapkit:history-changed', changed);
    return () => window.removeEventListener('tapkit:history-changed', changed);
  }, [refresh]);
  useEffect(() => {
    void refresh().catch((error) =>
      setError(
        String(error).includes('DATABASE_RECOVERY_REQUIRED')
          ? text.recovery
          : '本地核心暂不可用，请重试。',
      ),
    );
  }, [refresh]);
  useEffect(() => {
    let stopped = false,
      unsubscribe: (() => void) | undefined;
    void (async () => {
      const snapshot = WorkspaceViewSchema.parse(
        data(await window.tapkit.desktopCommand(requestOptions(), 'desktop.workspace', {})),
      );
      if (stopped) return () => {};
      await refresh();
      return window.tapkit.subscribeEvents(
        requestOptions(),
        { streamId: 'profile', afterSeq: snapshot.eventSeq },
        (event) => {
          if (event.payload.kind === 'chat') return;
          void refresh().catch(() => setError(t.error));
        },
      );
    })()
      .then((off) => {
        if (stopped) off();
        else unsubscribe = off;
      })
      .catch((error) =>
        setError((previous) =>
          previous === text.recovery || String(error).includes('DATABASE_RECOVERY_REQUIRED')
            ? text.recovery
            : '事件同步未连接，请重新加载。',
        ),
      );
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [refresh]);
  const save = useCallback(
    async (patch: Partial<SettingsValues>, revision?: number) => {
      if (!bootstrap) throw new Error('NOT_READY');
      const settings = SettingsViewSchema.parse(
        data(
          await window.tapkit.setSettings(requestOptions(revision ?? bootstrap.settings.revision), {
            scope: { type: 'profile', id: bootstrap.profile.id },
            patch,
          }),
        ),
      );
      setBootstrap((b) => (b ? { ...b, settings } : b));
    },
    [bootstrap],
  );
  useEffect(() => {
    writeLayout(window.tapkit.windowSlot, {
      ...layout,
      route: temporaryIds.current.has(layout.route.split('/')[2] ?? '') ? '/' : layout.route,
    });
  }, [layout]);
  useEffect(() => {
    const path = location.pathname;
    const previousId = previousRoute.current.split('/')[2];
    if (previousRoute.current !== path && previousId && temporaryIds.current.has(previousId)) {
      void historyCommand('sessions.closeTemporary', { sessionId: previousId }).catch(() => {});
      temporaryIds.current.delete(previousId);
      delete drafts.current[previousRoute.current];
    }
    previousRoute.current = path;
    setSidebarDrawer(false);
    setDraft(drafts.current[path] ?? '');
    setLayout((l) => ({ ...l, route: path }));
    if (scroll.current) scroll.current.scrollTop = layoutRef.current.scroll[path] ?? 0;
  }, [location.pathname, !!bootstrap]);
  useEffect(() => {
    if (dialog) {
      previousFocus.current = document.activeElement as HTMLElement;
      modal.current?.showModal();
      modal.current?.querySelector<HTMLInputElement>('input')?.focus();
    } else {
      modal.current?.close();
      previousFocus.current?.focus();
    }
  }, [dialog]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error && e.message === 'CONFLICT' ? t.conflict : t.error);
    } finally {
      setBusy(false);
    }
  }
  async function newSession(nextMode: 'chat' | 'work') {
    await action(async () => {
      const created = CreatedEntitySchema.parse(
        data(
          await window.tapkit.desktopCommand(requestOptions(), 'sessions.create', {
            mode: nextMode,
            title: nextMode === 'chat' ? '新聊天' : '新工作',
          }),
        ),
      );
      await refresh();
      setMode(nextMode);
      navigate('/sessions/' + created.entityId);
    });
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDialog('search');
      } else if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) void window.tapkit.newWindow().catch(() => setError(t.error));
        else void newSession('chat');
      }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, refresh]);
  useEffect(() => {
    const connect = () => navigate('/settings/connections');
    window.addEventListener('tapkit:connect-model', connect);
    return () => window.removeEventListener('tapkit:connect-model', connect);
  }, [navigate]);
  function resize(event: ReactPointerEvent, kind: 'sidebarWidth' | 'panelWidth') {
    event.preventDefault();
    const start = event.clientX,
      initial = layout[kind],
      target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: Event) =>
      setLayout((l) => ({
        ...l,
        [kind]: Math.round(
          Math.max(
            kind === 'sidebarWidth' ? 200 : 320,
            Math.min(
              kind === 'sidebarWidth' ? 400 : 600,
              initial +
                (((e as PointerEvent).clientX - start) /
                  (bootstrap?.settings.values.desktop.zoom ?? 1)) *
                  (kind === 'sidebarWidth' ? 1 : -1),
            ),
          ),
        ),
      }));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
  const settings = bootstrap?.settings.values,
    prefs = settings?.desktop,
    personal = settings?.personal;
  const selected =
      workspace?.sessions.find((s) => location.pathname === '/sessions/' + s.id) ??
      (routed && location.pathname === '/sessions/' + routed.id ? routed : undefined),
    narrow = viewport / (prefs?.zoom ?? 1) < 760,
    collapsed = narrow ? !sidebarDrawer : layout.collapsed;
  const routedSessionId = /^\/sessions\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1];
  useEffect(() => {
    let alive = true;
    setRouted((previous) => (previous?.id === routedSessionId ? previous : undefined));
    if (routedSessionId)
      void historyCommand('sessions.get', { sessionId: routedSessionId })
        .then((v) => {
          if (alive) setRouted(SessionDetailsSchema.parse(v).session);
        })
        .catch(() => {
          if (alive) setRouted(undefined);
        });
    return () => {
      alive = false;
    };
  }, [routedSessionId, workspace]);
  const settingPage = location.pathname.split('/')[2] ?? 'general';
  useEffect(() => {
    const projectId = /^\/projects\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1],
      fileId =
        location.pathname === '/files'
          ? new URLSearchParams(location.search).get('file')
          : undefined;
    const entityId = projectId ?? fileId;
    let live = true;
    setLocatedEntity(undefined);
    if (entityId)
      void historyCommand('search.locate', { type: projectId ? 'project' : 'file', id: entityId })
        .then((v) => {
          if (live) setLocatedEntity(HistoryLocationSchema.parse(v));
        })
        .catch(() => {
          if (live) setError(h.failed);
        });
    return () => {
      live = false;
    };
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (locatedEntity?.type === 'file')
      requestAnimationFrame(() =>
        document.getElementById('file-' + locatedEntity.id)?.scrollIntoView({ block: 'center' }),
      );
  }, [locatedEntity]);
  const composer = (
    <ChatSurface
      key={routedSessionId ?? '/'}
      sessionId={routedSessionId}
      exportRequested={new URLSearchParams(location.search).get('export') === '1'}
      mode={selected?.mode ?? mode}
      seed={draft}
      settings={settings ?? DEFAULT_SETTINGS}
      inputRef={input}
      onDraft={(value) => {
        if (routedSessionId && temporaryIds.current.has(routedSessionId)) return;
        setDraft(value);
        drafts.current[location.pathname] = value;
      }}
      onMode={setMode}
      onNew={() => void newSession('chat')}
      onCreated={(id) => {
        void refresh();
        navigate('/sessions/' + id);
      }}
      targetMessageId={new URLSearchParams(location.search).get('message') ?? undefined}
      onNavigate={navigate}
    />
  );
  const home = (
    <>
      <section className="welcome">
        <div className="home-mark" aria-hidden="true">
          {branding.mark}
        </div>
        <p className="eyebrow">本地空间 · 无需注册</p>
        <h1>{t.home}</h1>
        <p>{workspace?.sessions.length ? '继续一段会话，或从新的目标开始。' : t.emptyHistory}</p>
        {prefs?.showSuggestions && (
          <div className="suggestions">
            {t.examples.map((example, i) => (
              <button
                key={example}
                onClick={() => {
                  setDraft(example);
                  drafts.current[location.pathname] = example;
                  setMode(i === 1 ? 'work' : 'chat');
                  input.current?.focus();
                }}
              >
                {example}
              </button>
            ))}
            <button
              className="quiet"
              onClick={() =>
                void action(() => save({ desktop: { ...prefs, showSuggestions: false } }))
              }
            >
              隐藏示例
            </button>
          </div>
        )}
      </section>
      {composer}
      <section className="start-links">
        <Link to="/dev/api">{text.api.title}</Link>
        <Link to="/dev/codex">{text.auth.title}</Link>
        <Link to="/settings/models">模型与用量</Link>
      </section>
      {prefs?.showPlanned && (
        <section className="planned">
          <h2>{t.planned}</h2>
          {t.future.map((name) => (
            <span key={name}>{name} · 规划中</span>
          ))}
        </section>
      )}
    </>
  );
  return (
    <div
      className={'desktop-shell ' + (prefs?.compact ? 'compact' : '')}
      data-theme={prefs?.theme ?? 'system'}
      style={
        {
          '--sidebar-width': (collapsed ? 64 : layout.sidebarWidth) + 'px',
          '--panel-width': layout.panelWidth + 'px',
          '--ui-font':
            (prefs?.fontSize === 'large' ? 16 : prefs?.fontSize === 'small' ? 12 : 14) + 'px',
          '--ui-zoom': prefs?.zoom ?? 1,
        } as CSSProperties
      }
    >
      <aside
        className={
          'sidebar ' +
          (collapsed ? 'collapsed' : '') +
          (narrow && sidebarDrawer ? ' sidebar-drawer' : '')
        }
        aria-label="侧栏"
      >
        <div className="sidebar-brand">
          <Link to="/" aria-label="TapKit 首页">
            <span className="mark" aria-hidden="true">
              {branding.mark}
            </span>
            {!collapsed && <strong>{branding.name}</strong>}
          </Link>
          <button
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            onClick={() =>
              narrow
                ? setSidebarDrawer(!sidebarDrawer)
                : setLayout((l) => ({ ...l, collapsed: !l.collapsed }))
            }
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <div className="new-actions">
          <button
            disabled={busy || !bootstrap}
            onClick={() =>
              void action(async () => {
                const next = BranchChangeSchema.parse(await historyCommand('sessions.temporary'));
                temporaryIds.current.add(next.sessionId);
                navigate('/sessions/' + next.sessionId);
              })
            }
          >
            {collapsed ? '临' : h.temporary}
          </button>
          <button
            disabled={busy || !bootstrap}
            onClick={() => void newSession('chat')}
            title="Ctrl+N"
          >
            {collapsed ? '聊' : t.newChat}
          </button>
          <button disabled={busy || !bootstrap} onClick={() => void newSession('work')}>
            {collapsed ? '工' : t.newWork}
          </button>
          <button disabled={busy || !bootstrap} onClick={() => setDialog('project')}>
            {collapsed ? '项' : t.newProject}
          </button>
        </div>
        <nav aria-label="主导航">
          <button onClick={() => setDialog('search')} title="Ctrl+K">
            {collapsed ? '⌕' : t.search}
          </button>
          {layout.navigation.map((key) => (
            <Link
              key={key}
              to={'/' + key}
              aria-label={t[key]}
              title={t[key]}
              aria-current={location.pathname === '/' + key ? 'page' : undefined}
            >
              {collapsed ? t[key].slice(0, 1) : t[key]}
              {key === 'notifications' && !!workspace?.pendingApprovals && (
                <span>{workspace.pendingApprovals}</span>
              )}
            </Link>
          ))}
          {!collapsed && (
            <details>
              <summary>{h.navigation}</summary>
              {(['chats', 'work', 'projects', 'files', 'notifications'] as const).map((key) => (
                <div key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={layout.navigation.includes(key)}
                      onChange={(e) =>
                        setLayout((l) => ({
                          ...l,
                          navigation: e.target.checked
                            ? [...l.navigation, key]
                            : l.navigation.filter((k) => k !== key),
                        }))
                      }
                    />
                    {t[key]}
                  </label>
                  <button
                    aria-label={h.moveUp + t[key]}
                    disabled={layout.navigation.indexOf(key) <= 0}
                    onClick={() =>
                      setLayout((l) => {
                        const navigation = [...l.navigation],
                          i = navigation.indexOf(key);
                        [navigation[i - 1], navigation[i]] = [navigation[i]!, navigation[i - 1]!];
                        return { ...l, navigation };
                      })
                    }
                  >
                    {h.moveUp}
                  </button>
                </div>
              ))}
            </details>
          )}
        </nav>
        <div
          className="history"
          ref={sidebarScroll}
          onScroll={(e) => {
            const y = Math.min(10000000, e.currentTarget.scrollTop);
            setLayout((l) => ({ ...l, sidebarScroll: y }));
          }}
        >
          <HistoryList
            collapsed={collapsed}
            activeId={routedSessionId}
            onNavigate={navigate}
            projects={workspace?.projects ?? []}
          />
        </div>
        <div className="sidebar-status">
          {!collapsed && (
            <>
              <small>{t.runHint}</small>
              <small>
                {t.approval}：{workspace?.pendingApprovals ?? '—'}
              </small>
            </>
          )}
        </div>
        <Link className="profile-link" to="/settings/personal" aria-label="个人资料与设置">
          {personal?.avatar ? (
            <img src={personal.avatar} alt="" width="28" height="28" />
          ) : (
            <LocalAvatar />
          )}
          {!collapsed && (
            <span>
              {personal?.nickname ?? '本地用户'}
              <small>个人资料与设置</small>
            </span>
          )}
        </Link>
        <Link to="/settings/general" aria-label="设置">
          {collapsed ? '⚙' : t.settings}
        </Link>
        {!collapsed && (
          <div
            role="separator"
            aria-label="调整侧栏宽度"
            aria-orientation="vertical"
            aria-valuemin={200}
            aria-valuemax={400}
            aria-valuenow={layout.sidebarWidth}
            tabIndex={0}
            className="sidebar-resize"
            onPointerDown={(e) => resize(e, 'sidebarWidth')}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                setLayout((l) => ({
                  ...l,
                  sidebarWidth: Math.max(
                    200,
                    Math.min(400, l.sidebarWidth + (e.key === 'ArrowRight' ? 10 : -10)),
                  ),
                }));
              }
            }}
          />
        )}
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button aria-label={h.back} onClick={() => navigate(-1)}>
            ‹
          </button>
          <button aria-label={h.forward} onClick={() => navigate(1)}>
            ›
          </button>
          <Link to="/">首页</Link>
          <span data-testid="core-status">
            {bootstrap
              ? text.ready
              : error === text.recovery
                ? text.recovery
                : error
                  ? text.failure
                  : text.checking}
          </span>
          <span className="connection-summary">
            {accounts
              ? accounts.accounts.filter((a) => a.status === 'ready').length + ' 个模型账户已连接'
              : connectionError
                ? '账户状态不可用'
                : '账户状态待加载'}
          </span>
          <button
            aria-label="详情面板"
            aria-expanded={layout.panelOpen}
            onClick={() => setLayout((l) => ({ ...l, panelOpen: !l.panelOpen }))}
          >
            详情
          </button>
        </header>
        {connectionError && (
          <div className="shell-error" role="alert">
            模型账户暂不可用；本地设置仍可使用。<Link to="/settings/connections">查看模型连接</Link>
          </div>
        )}
        {error && (
          <div className="shell-error" role="alert">
            {error}
            <button
              onClick={() =>
                void refresh()
                  .then(() => setError(''))
                  .catch(() => setError(t.error))
              }
            >
              重试加载
            </button>
          </div>
        )}
        <div className="workspace-body">
          <main
            className="screen-scroll"
            ref={scroll}
            onScroll={(e) => {
              const y = e.currentTarget.scrollTop;
              setLayout((l) => ({
                ...l,
                scroll: {
                  ...Object.fromEntries(
                    Object.entries(l.scroll)
                      .filter(([key]) => key !== location.pathname)
                      .slice(-49),
                  ),
                  [location.pathname]: y,
                },
              }));
            }}
          >
            <div className="screen-content">
              <Routes>
                <Route path="/dev/api" element={<ApiDiagnostic />} />
                <Route path="/dev/codex" element={<AuthDiagnostic />} />
                <Route path="/dev/models" element={<ModelSettings />} />
                <Route
                  path="/settings/models"
                  element={
                    <>
                      <nav className="settings-tabs">
                        <Link to="/settings/general">返回设置</Link>
                        <Link to="/settings/connections">模型连接</Link>
                      </nav>
                      <ModelSettings />
                    </>
                  }
                />
                <Route
                  path="/settings/*"
                  element={
                    settings ? (
                      <DesktopSettings
                        page={settingPage}
                        values={settings}
                        revision={bootstrap!.settings.revision}
                        save={save}
                        reload={refresh}
                      />
                    ) : (
                      <p>正在读取设置…</p>
                    )
                  }
                />
                <Route
                  path="/chats"
                  element={
                    <HistoryList
                      page
                      modeFilter="chat"
                      activeId={routedSessionId}
                      onNavigate={navigate}
                      projects={workspace?.projects ?? []}
                    />
                  }
                />
                <Route
                  path="/work"
                  element={
                    <section>
                      <h1>工作</h1>
                      <p>{t.runHint}</p>
                      <HistoryList
                        page
                        modeFilter="work"
                        onNavigate={navigate}
                        projects={workspace?.projects ?? []}
                      />
                    </section>
                  }
                />
                <Route
                  path="/projects"
                  element={<ProjectsList onCreate={() => setDialog('project')} />}
                />
                <Route
                  path="/projects/:id"
                  element={
                    <ProjectPage
                      key={location.pathname}
                      projectId={location.pathname.split('/')[2]!}
                    />
                  }
                />
                <Route
                  path="/files"
                  element={
                    <FileLibrary
                      projects={workspace?.projects ?? []}
                      sessions={workspace?.sessions ?? []}
                      focusFileId={new URLSearchParams(location.search).get('file') ?? undefined}
                    />
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <section>
                      <h1>{t.notifications}</h1>
                      <p>
                        {t.approval}：{workspace?.pendingApprovals ?? '—'}
                      </p>
                      <p>{t.runHint}。审批操作将在工作阶段提供。</p>
                    </section>
                  }
                />
                <Route
                  path="/sessions/:id"
                  element={
                    selected ? (
                      <>
                        <section className="welcome">
                          <p className="eyebrow">{selected.mode === 'chat' ? '聊天' : '工作'}</p>
                          <h1>{selected.title}</h1>
                          <p>{selected.mode === 'chat' ? t.chatHint : t.workHint}</p>
                        </section>
                        {composer}
                      </>
                    ) : (
                      <section>
                        <h1>会话未找到</h1>
                        <p>记录已删除或尚未加载。</p>
                        <Link to="/">回到首页</Link>
                      </section>
                    )
                  }
                />
                <Route path="*" element={home} />
              </Routes>
            </div>
          </main>
          {layout.panelOpen && (
            <aside className="detail-panel" aria-label="详情">
              <div
                role="separator"
                aria-label="调整详情宽度"
                aria-valuemin={320}
                aria-valuemax={600}
                aria-valuenow={layout.panelWidth}
                aria-orientation="vertical"
                tabIndex={0}
                className="panel-resize"
                onPointerDown={(e) => resize(e, 'panelWidth')}
                onKeyDown={(e) => {
                  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    setLayout((l) => ({
                      ...l,
                      panelWidth: Math.max(
                        320,
                        Math.min(600, l.panelWidth + (e.key === 'ArrowLeft' ? 10 : -10)),
                      ),
                    }));
                  }
                }}
              />
              <button onClick={() => setLayout((l) => ({ ...l, panelOpen: false }))}>
                关闭详情
              </button>
              {viewer.tabs.length ? (
                <ArtifactPanel />
              ) : (
                <>
                  <h2>{selected?.title ?? '本地空间'}</h2>
                  <p>当前资料保存在本机。尚未开放的功能不会执行。</p>
                  <dl>
                    <dt>会话</dt>
                    <dd>{workspace?.sessions.length ?? '—'}</dd>
                    <dt>项目</dt>
                    <dd>{workspace?.projects.length ?? '—'}</dd>
                    <dt>待确认</dt>
                    <dd>{workspace?.pendingApprovals ?? '—'}</dd>
                  </dl>
                  <Link to="/settings/connections">管理模型连接</Link>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
      <dialog
        ref={modal}
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === modal.current) setDialog(null);
        }}
        aria-label={dialog === 'project' ? t.newProject : t.search}
      >
        <button className="dialog-close" onClick={() => setDialog(null)} aria-label="关闭弹窗">
          ×
        </button>
        {dialog === 'project' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                data(
                  await window.tapkit.desktopCommand(requestOptions(), 'projects.create', {
                    name: projectName,
                  }),
                );
                await refresh();
                setProjectName('');
                setDialog(null);
                navigate('/projects');
              });
            }}
          >
            <h2>{t.newProject}</h2>
            <label>
              项目名称
              <input
                autoFocus
                maxLength={80}
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>
            <button disabled={busy || !projectName.trim()}>创建项目</button>
          </form>
        ) : routedSessionId && temporaryIds.current.has(routedSessionId) ? (
          <p>{h.temporaryHint}</p>
        ) : (
          <SearchView
            sessionId={routedSessionId}
            fileId={new URLSearchParams(location.search).get('file') ?? undefined}
            onNavigate={navigate}
            onClose={() => setDialog(null)}
          />
        )}
      </dialog>
    </div>
  );
}
