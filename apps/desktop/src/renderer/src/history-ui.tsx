import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SessionPageSchema,
  SidebarViewSchema,
  SessionDetailsSchema,
  SearchPageSchema,
  SearchHistorySchema,
  BranchChangeSchema,
  type SessionRecord,
  type SessionDetails,
  type SearchPage,
  type SidebarView,
  type Reply,
  type HistoryCommand,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import h from '../locales/history.zh-CN.json';
export const historyData = (r: Reply) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
export async function historyCommand(
  command: HistoryCommand,
  payload: unknown = {},
  revision?: number,
) {
  return historyData(
    await window.tapkit.historyCommand(requestOptions(revision), command, payload),
  );
}
export function HistoryList({
  collapsed = false,
  activeId,
  onNavigate,
  projects = [],
  page = false,
  modeFilter,
  projectId,
}: {
  modeFilter?: 'chat' | 'work';
  projectId?: string | undefined;
  collapsed?: boolean;
  activeId?: string | undefined;
  onNavigate: (path: string) => void;
  projects?: { id: string; name: string }[];
  page?: boolean;
}) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [sidebar, setSidebar] = useState<SidebarView>({ sections: [] }),
    [state, setState] = useState<'active' | 'archived' | 'trash' | 'all'>('active'),
    [section, setSection] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<SessionRecord>(),
    [title, setTitle] = useState(''),
    [note, setNote] = useState(''),
    [tags, setTags] = useState(''),
    [project, setProject] = useState(''),
    [group, setGroup] = useState('');
  const [newGroup, setNewGroup] = useState(false),
    [groupName, setGroupName] = useState(''),
    [groupEdit, setGroupEdit] = useState<SidebarView['sections'][number]>(),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState<string[]>(),
    [attachments, setAttachments] = useState(false),
    [menu, setMenu] = useState<string>();
  const [moving, setMoving] = useState(false),
    [batchProject, setBatchProject] = useState('keep');
  const paged = useRef(false);
  function closeDialog() {
    setEditing(undefined);
    setNewGroup(false);
    setGroupEdit(undefined);
    setConfirm(undefined);
    setMoving(false);
  }
  const filter = useRef('');
  filter.current = state + section;
  const refresh = useCallback(async () => {
    const token = state + section;
    const [s, b] = await Promise.all([
      historyCommand('sessions.list', {
        state,
        ...(section ? { sectionId: section } : {}),
        ...(modeFilter ? { mode: modeFilter } : {}),
        ...(projectId ? { projectId } : {}),
        limit: 50,
      }),
      historyCommand('sidebar.list'),
    ]);
    if (filter.current !== token) return;
    const result = SessionPageSchema.parse(s);
    setSessions((previous) =>
      paged.current
        ? previous.map((s) => result.sessions.find((n) => n.id === s.id) ?? s)
        : result.sessions,
    );
    if (!paged.current) setCursor(result.nextCursor);
    setSidebar(SidebarViewSchema.parse(b));
  }, [state, section, modeFilter, projectId]);
  useEffect(() => {
    void refresh().catch(() => setError(h.failed));
    const callback = () => void refresh().catch(() => {});
    window.addEventListener('tapkit:history-refresh', callback);
    const timer = setInterval(callback, 3000);
    return () => {
      window.removeEventListener('tapkit:history-refresh', callback);
      clearInterval(timer);
    };
  }, [refresh]);
  async function action(work: () => Promise<unknown>, reload = true) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      if (reload) {
        paged.current = false;
        await refresh();
      }
      window.dispatchEvent(new Event('tapkit:history-changed'));
    } catch {
      setError(h.failed);
    } finally {
      setBusy(false);
    }
  }
  function edit(s: SessionRecord) {
    setEditing(s);
    setTitle(s.title);
    setNote(s.note);
    setTags(s.tags.join(','));
    setProject(s.projectId ?? '');
    setGroup('keep');
    setMenu(undefined);
  }
  async function batch(
    command: 'sessions.archive' | 'sessions.trash' | 'sessions.restore' | 'sessions.purge',
    ids: string[],
    archived?: boolean,
  ) {
    await historyCommand(command, {
      sessionIds: ids,
      ...(archived === undefined ? {} : { archived }),
    });
    setSelected([]);
    setConfirm(undefined);
  }
  const entity = (id: string) => ({ type: 'session' as const, id });
  const render = (s: SessionRecord) => (
    <div
      className="session-row history-row"
      data-session-id={s.id}
      key={s.id}
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData('application/x-tapkit-entity', JSON.stringify(entity(s.id)))
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const dragged = JSON.parse(e.dataTransfer.getData('application/x-tapkit-entity')) as {
            type: 'session' | 'project';
            id: string;
          };
          const ordered = sessions.map((x) => entity(x.id)).filter((x) => x.id !== dragged.id);
          ordered.splice(
            Math.max(
              0,
              ordered.findIndex((x) => x.id === s.id),
            ),
            0,
            dragged as { type: 'session'; id: string },
          );
          void action(() =>
            historyCommand('sidebar.reorder', { sectionId: section || null, ordered }),
          );
        } catch {
          setError(h.failed);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(s.id);
      }}
    >
      {page && (
        <input
          type="checkbox"
          aria-label={h.selected + s.title}
          checked={selected.includes(s.id)}
          onChange={(e) =>
            setSelected((ids) =>
              e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id),
            )
          }
        />
      )}
      <button
        className="history-link"
        title={s.title}
        aria-current={s.id === activeId ? 'page' : undefined}
        onClick={() => {
          if (state !== 'trash') onNavigate('/sessions/' + s.id);
          else setConfirm([s.id]);
        }}
      >
        {collapsed ? (s.mode === 'chat' ? '聊' : '工') : s.title}
        {s.unread && <span aria-label={h.unread}> ●</span>}
        {s.running && <span aria-label={h.running}> ◷</span>}
        {!collapsed && <small>{new Date(s.updatedAt).toLocaleString('zh-CN')}</small>}
      </button>
      {!collapsed && (
        <>
          <button
            className="pin-button"
            aria-label={(s.pinned ? h.unpin : h.pin) + s.title}
            disabled={busy || state === 'trash'}
            onClick={() =>
              void action(() =>
                window.tapkit
                  .desktopCommand(requestOptions(s.revision), 'sessions.pin', {
                    sessionId: s.id,
                    pinned: !s.pinned,
                  })
                  .then(historyData),
              )
            }
          >
            {s.pinned ? '◆' : '◇'}
          </button>
          <button aria-label={h.editSession + s.title} onClick={() => edit(s)}>
            ⋯
          </button>
        </>
      )}
      {menu === s.id && (
        <div role="menu" className="history-menu">
          <button role="menuitem" onClick={() => edit(s)}>
            {h.rename}
          </button>
          <button
            role="menuitem"
            onClick={() => void action(() => window.tapkit.openEntity(entity(s.id)))}
          >
            {h.newWindow}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(undefined);
              onNavigate('/sessions/' + s.id + '?export=1');
            }}
          >
            {h.share}
          </button>
          <button
            role="menuitem"
            onClick={() => void action(() => batch('sessions.archive', [s.id], !s.archivedAt))}
          >
            {s.archivedAt ? h.unarchive : h.archive}
          </button>
          <button
            role="menuitem"
            onClick={() => void action(() => batch('sessions.trash', [s.id]))}
          >
            {h.remove}
          </button>
          <button role="menuitem" onClick={() => setMenu(undefined)}>
            {h.cancel}
          </button>
        </div>
      )}
    </div>
  );
  return (
    <section className="history-manager" aria-label={h.history}>
      {!collapsed && (
        <>
          <div className="history-filters">
            {(['active', 'archived', 'trash', 'all'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={state === v}
                onClick={() => {
                  paged.current = false;
                  setState(v);
                  setSelected([]);
                }}
              >
                {h[v]}
              </button>
            ))}
          </div>
          <button onClick={() => setNewGroup(true)}>{h.newGroup}</button>
          <button aria-pressed={!section} onClick={() => ((paged.current = false), setSection(''))}>
            {h.groupNone}
          </button>
          {sidebar.sections.map((g, i) => (
            <div
              key={g.id}
              className="history-group"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-tapkit-group', g.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const groupId = e.dataTransfer.getData('application/x-tapkit-group');
                if (groupId) {
                  const ids = sidebar.sections.map((x) => x.id).filter((id) => id !== groupId);
                  ids.splice(i, 0, groupId);
                  void action(() =>
                    historyCommand('sidebar.reorder', {
                      sectionId: null,
                      ordered: [],
                      sectionIds: ids,
                    }),
                  );
                  return;
                }
                try {
                  const value = JSON.parse(e.dataTransfer.getData('application/x-tapkit-entity'));
                  void action(() =>
                    historyCommand('sidebar.move', { entity: value, sectionId: g.id }),
                  );
                } catch {
                  setError(h.failed);
                }
              }}
            >
              <button
                aria-label={(g.collapsed ? h.groupExpand : h.groupCollapse) + g.name}
                onClick={() =>
                  void action(() =>
                    historyCommand(
                      'sidebar.update',
                      { sectionId: g.id, collapsed: !g.collapsed },
                      g.revision,
                    ),
                  )
                }
              >
                {g.collapsed ? '▸' : '▾'}
              </button>
              <button
                aria-pressed={section === g.id}
                onClick={() => ((paged.current = false), setSection(g.id))}
              >
                {g.name} ({g.count}) · {h.unread} {g.unread} · {h.running} {g.running}
              </button>
              <button
                aria-label={h.rename + g.name}
                onClick={() => {
                  setGroupEdit(g);
                  setGroupName(g.name);
                }}
              >
                ⋯
              </button>
              {!g.collapsed &&
                g.projects.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData(
                        'application/x-tapkit-entity',
                        JSON.stringify({ type: 'project', id: p.id }),
                      );
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const dragged = JSON.parse(
                          e.dataTransfer.getData('application/x-tapkit-entity'),
                        );
                        if (
                          dragged.type !== 'project' ||
                          !g.projects.some((x) => x.id === dragged.id)
                        )
                          return;
                        const ordered = g.projects
                          .filter((x) => x.id !== dragged.id)
                          .map((x) => ({ type: 'project' as const, id: x.id }));
                        ordered.splice(
                          Math.max(
                            0,
                            ordered.findIndex((x) => x.id === p.id),
                          ),
                          0,
                          dragged,
                        );
                        void action(() =>
                          historyCommand('sidebar.reorder', { sectionId: g.id, ordered }),
                        );
                      } catch {
                        setError(h.failed);
                      }
                    }}
                  >
                    <button onClick={() => onNavigate('/projects/' + p.id)}>{p.name}</button>
                    <button
                      aria-label={(p.pinned ? h.unpin : h.pin) + p.name}
                      onClick={() =>
                        void action(() =>
                          historyCommand(
                            'projects.pin',
                            { projectId: p.id, pinned: !p.pinned },
                            p.revision,
                          ),
                        )
                      }
                    >
                      {p.pinned ? '◆' : '◇'}
                    </button>
                    <button
                      onClick={() => void window.tapkit.openEntity({ type: 'project', id: p.id })}
                    >
                      {h.newWindow}
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </>
      )}
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void action(refresh)}>{h.reload}</button>
        </p>
      )}
      {!!selected.length && (
        <div className="history-batch">
          {h.selected} {selected.length}
          {state !== 'trash' && (
            <button
              onClick={() => {
                setMoving(true);
                setGroup('keep');
                setBatchProject('keep');
              }}
            >
              {h.move}
            </button>
          )}
          <button onClick={() => void action(() => batch('sessions.archive', selected))}>
            {h.archive}
          </button>
          <button onClick={() => void action(() => batch('sessions.trash', selected))}>
            {h.remove}
          </button>
          {state === 'trash' && (
            <>
              <button onClick={() => void action(() => batch('sessions.restore', selected))}>
                {h.restore}
              </button>
              <button onClick={() => setConfirm(selected)}>{h.purge}</button>
            </>
          )}
        </div>
      )}
      {!sessions.length && <p>{h.empty}</p>}
      {sessions
        .filter(() => !section || !sidebar.sections.find((g) => g.id === section)?.collapsed)
        .map(render)}
      {cursor && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const next = SessionPageSchema.parse(
                await historyCommand('sessions.list', {
                  state,
                  ...(section ? { sectionId: section } : {}),
                  ...(modeFilter ? { mode: modeFilter } : {}),
                  ...(projectId ? { projectId } : {}),
                  cursor,
                  limit: 50,
                }),
              );
              paged.current = true;
              setSessions((previous) => [...previous, ...next.sessions].slice(-100));
              setCursor(next.nextCursor);
            }, false)
          }
        >
          {h.more}
        </button>
      )}
      {(editing || newGroup || groupEdit || confirm || moving) && (
        <dialog
          className="history-dialog"
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={closeDialog}
          aria-modal="true"
          aria-label={editing ? h.editSession : confirm ? h.purge : h.group}
        >
          {moving ? (
            <>
              <p>{h.projectHint}</p>
              <label>
                {h.project}
                <select value={batchProject} onChange={(e) => setBatchProject(e.target.value)}>
                  <option value="keep">{h.keep}</option>
                  <option value="">{h.projectNone}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {h.group}
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="keep">{h.keep}</option>
                  <option value="">{h.groupNone}</option>
                  {sidebar.sections.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || (group === 'keep' && batchProject === 'keep')}
                onClick={() =>
                  void action(async () => {
                    await historyCommand('sessions.move', {
                      sessionIds: selected,
                      ...(batchProject !== 'keep' ? { projectId: batchProject || null } : {}),
                      ...(group !== 'keep' ? { sectionId: group || null } : {}),
                    });
                    setMoving(false);
                    setSelected([]);
                  })
                }
              >
                {h.save}
              </button>
            </>
          ) : editing ? (
            <>
              <label>
                {h.sessionTitle}
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                {h.tags}
                <input value={tags} onChange={(e) => setTags(e.target.value)} />
              </label>
              <label>
                {h.note}
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <label>
                {h.project}
                <select value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">{h.projectNone}</option>
                  {projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>{h.projectHint}</p>
              <label>
                {h.group}
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="keep">{h.keep}</option>
                  <option value="">{h.groupNone}</option>
                  {sidebar.sections.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={attachments}
                  onChange={(e) => setAttachments(e.target.checked)}
                />
                {h.attachments}
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await historyCommand(
                      'sessions.update',
                      {
                        sessionId: editing.id,
                        patch: {
                          title,
                          note,
                          tags: tags
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                          projectId: project || null,
                        },
                      },
                      editing.revision,
                    );
                    if (group !== 'keep')
                      await historyCommand('sidebar.move', {
                        entity: entity(editing.id),
                        sectionId: group || null,
                      });
                    setEditing(undefined);
                  })
                }
              >
                {h.save}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const next = BranchChangeSchema.parse(
                      await historyCommand('sessions.copy', {
                        sessionId: editing.id,
                        includeAttachments: attachments,
                      }),
                    );
                    setEditing(undefined);
                    onNavigate('/sessions/' + next.sessionId);
                  })
                }
              >
                {h.copySession}
              </button>
              <button
                onClick={() => void action(() => window.tapkit.openEntity(entity(editing.id)))}
              >
                {h.newWindow}
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await batch('sessions.archive', [editing.id], !editing.archivedAt);
                    setEditing(undefined);
                  })
                }
              >
                {editing.archivedAt ? h.unarchive : h.archive}
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await batch('sessions.trash', [editing.id]);
                    setEditing(undefined);
                  })
                }
              >
                {h.remove}
              </button>
            </>
          ) : confirm ? (
            <>
              <p>{h.purgeHint}</p>
              <button
                disabled={busy}
                onClick={() => void action(() => batch('sessions.restore', confirm))}
              >
                {h.restore}
              </button>
              <button
                disabled={busy}
                onClick={() => void action(() => batch('sessions.purge', confirm))}
              >
                {h.purge}
              </button>
            </>
          ) : (
            <>
              <label>
                {h.groupName}
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </label>
              <button
                onClick={() =>
                  void action(async () => {
                    if (groupEdit)
                      await historyCommand(
                        'sidebar.update',
                        { sectionId: groupEdit.id, name: groupName },
                        groupEdit.revision,
                      );
                    else await historyCommand('sidebar.create', { name: groupName });
                    setNewGroup(false);
                    setGroupEdit(undefined);
                    setGroupName('');
                  })
                }
              >
                {h.save}
              </button>
              {groupEdit && (
                <button
                  onClick={() =>
                    void action(async () => {
                      await historyCommand(
                        'sidebar.remove',
                        { sectionId: groupEdit.id },
                        groupEdit.revision,
                      );
                      if (section === groupEdit.id) ((paged.current = false), setSection(''));
                      setGroupEdit(undefined);
                    })
                  }
                >
                  {h.deleteGroup}
                </button>
              )}
            </>
          )}
          <button onClick={closeDialog}>{h.cancel}</button>
        </dialog>
      )}
    </section>
  );
}
export function SearchView({
  sessionId,
  fileId,
  onNavigate,
  onClose,
}: {
  sessionId?: string | undefined;
  fileId?: string | undefined;
  onNavigate: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState<'all' | 'session' | 'project' | 'file'>('all'),
    [sort, setSort] = useState<'relevance' | 'updated'>('relevance'),
    [type, setType] = useState<'all' | 'session' | 'message' | 'project' | 'task' | 'file'>('all'),
    [archived, setArchived] = useState(true),
    [result, setResult] = useState<SearchPage>(),
    [queries, setQueries] = useState<ReturnType<typeof SearchHistorySchema.parse>['queries']>([]),
    [details, setDetails] = useState<SessionDetails>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void historyCommand('search.history')
      .then((v) => setQueries(SearchHistorySchema.parse(v).queries))
      .catch(() => {});
    if (sessionId)
      void historyCommand('sessions.get', { sessionId })
        .then((v) => setDetails(SessionDetailsSchema.parse(v)))
        .catch(() => {});
  }, [sessionId]);
  async function search(cursor?: string, value = query) {
    setBusy(true);
    setError('');
    try {
      const id =
        scope === 'session'
          ? sessionId
          : scope === 'file'
            ? fileId
            : (details?.session.projectId ?? undefined);
      const next = SearchPageSchema.parse(
        await historyCommand('search.query', {
          query: value,
          scope: { type: scope, ...(id ? { id } : {}) },
          sort,
          archived,
          ...(type !== 'all' ? { types: [type] } : {}),
          limit: 30,
          ...(cursor ? { cursor } : {}),
        }),
      );
      setResult((previous) =>
        cursor && previous ? { ...next, hits: [...previous.hits, ...next.hits].slice(-100) } : next,
      );
      setQueries(SearchHistorySchema.parse(await historyCommand('search.history')).queries);
    } catch {
      setError(h.searchHint);
    } finally {
      setBusy(false);
    }
  }
  async function locate(hit: SearchPage['hits'][number]) {
    setBusy(true);
    try {
      if (hit.sessionId) {
        if (hit.branchId) {
          const d = SessionDetailsSchema.parse(
            await historyCommand('sessions.get', { sessionId: hit.sessionId }),
          );
          if (d.session.branchId !== hit.branchId)
            await historyCommand(
              'messages.switchBranch',
              { sessionId: hit.sessionId, branchId: hit.branchId },
              d.session.revision,
            );
        }
        onNavigate(
          '/sessions/' + hit.sessionId + (hit.messageId ? '?message=' + hit.messageId : ''),
        );
      } else if (hit.type === 'project') onNavigate('/projects/' + hit.id);
      else if (hit.type === 'file') onNavigate('/files?file=' + hit.id);
      onClose();
    } catch {
      setError(h.failed);
    } finally {
      setBusy(false);
    }
  }
  function highlighted(hit: SearchPage['hits'][number]) {
    const parts = [];
    let at = 0;
    for (const range of hit.ranges) {
      parts.push(
        hit.snippet.slice(at, range.start),
        <mark key={range.start}>{hit.snippet.slice(range.start, range.end)}</mark>,
      );
      at = range.end;
    }
    parts.push(hit.snippet.slice(at));
    return parts;
  }
  return (
    <section className="search-view">
      <h2>{h.search}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          {h.searchQuery}
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(undefined);
            }}
          />
        </label>
        <label>
          {h.searchScope}
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">{h.scopeAll}</option>
            <option value="session" disabled={!sessionId}>
              {h.scopeSession}
            </option>
            <option value="project" disabled={!details?.session.projectId}>
              {h.scopeProject}
            </option>
            <option value="file" disabled={!fileId}>
              {h.scopeFile}
            </option>
          </select>
        </label>
        <label>
          {h.sort}
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="relevance">{h.relevance}</option>
            <option value="updated">{h.updated}</option>
          </select>
        </label>
        <label>
          {h.searchTypes}
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {(['all', 'session', 'message', 'project', 'task', 'file'] as const).map((v) => (
              <option key={v} value={v}>
                {h[('type' + v) as keyof typeof h]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {h.includeArchived}
        </label>
        <button disabled={busy || !query.trim()}>{h.searchButton}</button>
      </form>
      <p>{h.searchHint}</p>
      {error && <p role="alert">{error}</p>}
      {result?.hits.map((hit) => (
        <button
          key={hit.type + hit.id}
          className="search-hit"
          data-message-id={hit.messageId ?? undefined}
          disabled={busy}
          onClick={() => void locate(hit)}
        >
          <strong>{hit.title}</strong>
          <p>{highlighted(hit)}</p>
        </button>
      ))}
      {result && !result.hits.length && <p>{h.noHits}</p>}
      {result?.nextCursor && (
        <button disabled={busy} onClick={() => void search(result.nextCursor!)}>
          {h.more}
        </button>
      )}
      <details>
        <summary>{h.searchHistory}</summary>
        {queries.map((q) => (
          <div key={q.id}>
            <button
              onClick={() => {
                setQuery(q.query);
                void search(undefined, q.query);
              }}
            >
              {q.query}
            </button>
            <button
              aria-label={h.deleteQuery + q.query}
              onClick={() =>
                void historyCommand('search.clear', { ids: [q.id] }).then(() =>
                  setQueries((items) => items.filter((i) => i.id !== q.id)),
                )
              }
            >
              {h.deleteQuery}
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            void historyCommand('search.clear', { clearAll: true }).then(() => setQueries([]))
          }
        >
          {h.clearHistory}
        </button>
      </details>
    </section>
  );
}
