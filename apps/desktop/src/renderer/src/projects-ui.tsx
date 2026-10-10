import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tapkit/ui';
import {
  ProjectReplySchema,
  ProjectImpactSchema,
  ProjectScopeSchema,
  FileReplySchema,
  CatalogViewSchema,
  CreatedEntitySchema,
  type ProjectCommand,
  type ProjectView,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { historyCommand } from './history-ui';
import { useViewer } from '../features/viewer/state';
import t from '../locales/projects.zh-CN.json';
type Result = z.infer<typeof ProjectReplySchema>;
export async function projectCommand(
  command: ProjectCommand,
  payload: unknown,
  revision?: number,
): Promise<Result> {
  const r = await window.tapkit.projectCommand(requestOptions(revision), command, payload);
  if (!r.ok) throw new Error(r.error.code);
  return ProjectReplySchema.parse(r.data);
}
const notify = () => window.dispatchEvent(new Event('tapkit:history-changed'));
export function ProjectsList({ onCreate }: { onCreate: () => void }) {
  const [projects, setProjects] = useState<ProjectView[]>([]),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [favorite, setFavorite] = useState(false),
    [sort, setSort] = useState<'updated' | 'name'>('updated'),
    [error, setError] = useState(''),
    [next, setNext] = useState<number | null>(null);
  const load = useCallback(
    async (offset = 0) => {
      const r = await projectCommand('projects.list', { query, archived, favorite, sort, offset });
      if ('projects' in r) {
        setProjects((p) => (offset ? [...p, ...r.projects] : r.projects));
        setNext(r.nextOffset);
        setError('');
      }
    },
    [query, archived, favorite, sort],
  );
  useEffect(() => {
    let alive = true;
    void load().catch(() => alive && setError(t.failed));
    const changed = () => void load().catch(() => alive && setError(t.failed));
    window.addEventListener('tapkit:history-refresh', changed);
    return () => {
      alive = false;
      window.removeEventListener('tapkit:history-refresh', changed);
    };
  }, [load]);
  return (
    <section className="projects-page">
      <h1>{t.title}</h1>
      <button onClick={onCreate}>{t.new}</button>
      <label>
        {t.search}
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        {t.archived}
      </label>
      <label>
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
        {t.favorite}
      </label>
      <label>
        {t.sort}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="updated">{t.updated}</option>
          <option value="name">{t.nameSort}</option>
        </select>
      </label>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void load()}>{t.reload}</button>
        </p>
      )}
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <span style={{ color: p.color }}>●</span> <Link to={'/projects/' + p.id}>{p.name}</Link>
            <p>{p.description}</p>
            <button
              onClick={() =>
                void historyCommand(
                  'projects.pin',
                  { projectId: p.id, pinned: !p.pinned },
                  p.revision,
                )
                  .then(() => load())
                  .catch(() => setError(t.conflict))
              }
            >
              {p.pinned ? t.unpin : t.pin}
            </button>
            <button onClick={() => void window.tapkit.openEntity({ type: 'project', id: p.id })}>
              {t.newWindow}
            </button>
          </li>
        ))}
      </ul>
      {!projects.length && <p>{t.empty}</p>}
      {next !== null && <button onClick={() => void load(next)}>{t.loadMore}</button>}
    </section>
  );
}
type Material = Extract<Result, { materials: unknown }>['materials'][number];
export function ProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate(),
    viewer = useViewer();
  const [project, setProject] = useState<ProjectView>(),
    [edit, setEdit] = useState<ProjectView>(),
    [tab, setTab] = useState<keyof typeof t.tabs>('sessions'),
    [materials, setMaterials] = useState<Material[]>([]),
    [overview, setOverview] = useState<Extract<Result, { overview: unknown }>['overview']>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [impact, setImpact] = useState<z.infer<typeof ProjectImpactSchema>>(),
    [removeId, setRemoveId] = useState<string>(),
    [trashSessions, setTrashSessions] = useState(false),
    [trashFiles, setTrashFiles] = useState(false);
  const [name, setName] = useState(''),
    [body, setBody] = useState(''),
    [url, setUrl] = useState(''),
    [folderName, setFolderName] = useState(''),
    [folders, setFolders] = useState<{ id: string; name: string }[]>([]),
    [library, setLibrary] = useState<{ id: string; name: string; currentVersionId: string }[]>([]),
    [libraryId, setLibraryId] = useState(''),
    [folderFilter, setFolderFilter] = useState('*'),
    [tagFilter, setTagFilter] = useState(''),
    [models, setModels] = useState<z.infer<typeof CatalogViewSchema>['catalog']>([]),
    [query, setQuery] = useState(''),
    [evidence, setEvidence] = useState<Extract<Result, { hits: unknown }>>();
  const refresh = useCallback(async () => {
    const p = await projectCommand('projects.get', { projectId });
    if ('project' in p) {
      setProject(p.project);
      setEdit(p.project);
    }
    const m = await projectCommand('projects.materials', { projectId });
    if ('materials' in m) setMaterials(m.materials);
    const o = await projectCommand('projects.overview', { projectId });
    if ('overview' in o) setOverview(o.overview);
    const f = await window.tapkit.fileCommand(requestOptions(), 'folders.list', {
      owner: { type: 'project', id: projectId },
    });
    if (f.ok) {
      const result = FileReplySchema.parse(f.data);
      if ('folders' in result) setFolders(result.folders);
    }
  }, [projectId]);
  useEffect(() => {
    void refresh().catch(() => setError(t.failed));
    void window.tapkit.modelCommand(requestOptions(), 'models.catalog', {}).then((r) => {
      if (r.ok) setModels(CatalogViewSchema.parse(r.data).catalog);
    });
  }, [refresh]);
  useEffect(() => {
    const changed = () => {
      void projectCommand('projects.materials', { projectId })
        .then((r) => {
          if ('materials' in r) setMaterials(r.materials);
        })
        .catch(() => {});
    };
    const timer = setInterval(changed, 1500);
    return () => clearInterval(timer);
  }, [projectId]);
  async function act(work: () => Promise<unknown>, reload = true) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      if (reload) await refresh();
      notify();
    } catch (e) {
      setError(e instanceof Error && e.message === 'CONFLICT' ? t.conflict : t.failed);
    } finally {
      setBusy(false);
    }
  }
  async function createSession(mode: 'chat' | 'work') {
    await act(async () => {
      const r = await window.tapkit.desktopCommand(requestOptions(), 'sessions.create', {
        projectId,
        mode,
        title: mode === 'chat' ? t.newChat : t.newWork,
      });
      if (!r.ok) throw new Error(r.error.code);
      navigate('/sessions/' + CreatedEntitySchema.parse(r.data).entityId);
    }, false);
  }
  async function upload(replace?: string) {
    const r = await window.tapkit.chooseFiles();
    if (!r.ok) throw new Error(r.error.code);
    const d = FileReplySchema.parse(r.data);
    if (!('selections' in d) || !d.selections.length) return;
    if (replace && d.selections.length !== 1) throw new Error('VALIDATION_ERROR');
    const imported = await window.tapkit.fileCommand(requestOptions(), 'files.import', {
      selectionTokens: d.selections.map((s) => s.token),
      destination: { type: 'project', id: projectId },
      duplicate: replace ? 'replace' : 'keep',
      replacements: replace ? [{ token: d.selections[0]!.token, fileId: replace }] : [],
    });
    if (!imported.ok) throw new Error(imported.error.code);
    const result = FileReplySchema.parse(imported.data);
    if (
      'import' in result &&
      result.import.items.some((i) => !['imported', 'skipped'].includes(i.status))
    )
      throw new Error('PARSE_FAILED');
  }
  if (!project || !edit)
    return (
      <section>
        <p role="status">{error || t.reload}</p>
        <button onClick={() => void refresh()}>{t.reload}</button>
      </section>
    );
  const patch = (p: Partial<ProjectView>) => setEdit({ ...edit, ...p });
  return (
    <section className="projects-page" data-project-id={projectId}>
      <h1 style={{ color: project.color }}>{project.name}</h1>
      <p>{project.description}</p>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void refresh().then(() => setError(''))}>{t.reload}</button>
        </p>
      )}
      <div className="project-actions">
        <button
          disabled={busy || project.archivedAt !== null}
          onClick={() => void createSession('chat')}
        >
          {t.newChat}
        </button>
        <button
          disabled={busy || project.archivedAt !== null}
          onClick={() => void createSession('work')}
        >
          {t.newWork}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const r = await projectCommand('projects.copy', { projectId }, project.revision);
              if ('project' in r) navigate('/projects/' + r.project.id);
            }, false)
          }
        >
          {t.copy}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void act(() =>
              projectCommand(
                'projects.archive',
                { projectId, archived: project.archivedAt === null },
                project.revision,
              ),
            )
          }
        >
          {project.archivedAt === null ? t.archive : t.unarchive}
        </button>
        <button
          onClick={() =>
            void act(async () => {
              const r = await projectCommand('projects.deletePreview', { projectId });
              if ('impact' in r) {
                setImpact(r.impact);
                setRemoveId(undefined);
              }
            }, false)
          }
        >
          {t.delete}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const r = await projectCommand('projects.exportPreview', { projectId });
              if ('exportPreview' in r) {
                if (
                  !window.confirm(
                    t.exportHint +
                      '\n' +
                      r.exportPreview.files.length +
                      ' / ' +
                      r.exportPreview.totalBytes,
                  )
                )
                  return;
                const exported = await window.tapkit.exportProject({
                  projectId,
                  revision: project.revision,
                });
                if (!exported.ok) throw new Error(exported.error.code);
              }
            }, false)
          }
        >
          {t.export}
        </button>
      </div>
      <nav aria-label={t.title}>
        {Object.entries(t.tabs).map(([id, label]) => (
          <button aria-pressed={tab === id} key={id} onClick={() => setTab(id as typeof tab)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'settings' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              projectCommand(
                'projects.update',
                {
                  projectId,
                  patch: {
                    name: edit.name,
                    icon: edit.icon,
                    color: edit.color,
                    description: edit.description,
                    instructions: edit.instructions,
                    allowGlobalMemory: edit.allowGlobalMemory,
                    allowGlobalHistory: edit.allowGlobalHistory,
                    allowGlobalInstructions: edit.allowGlobalInstructions,
                    independentMemory: edit.independentMemory,
                    defaults: edit.defaults,
                  },
                },
                project.revision,
              ),
            );
          }}
        >
          <label>
            {t.name}
            <input
              required
              maxLength={80}
              value={edit.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            {t.icon}
            <select
              aria-label={t.icon}
              value={edit.icon}
              onChange={(e) => patch({ icon: e.target.value as ProjectView['icon'] })}
            >
              {Object.entries(t.icons).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.color}
            <input
              type="color"
              value={edit.color}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </label>
          <label>
            {t.description}
            <textarea
              maxLength={2000}
              value={edit.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <label>
            {t.instructions}
            <textarea
              maxLength={8000}
              value={edit.instructions}
              onChange={(e) => patch({ instructions: e.target.value })}
            />
          </label>
          <p>{t.relation}</p>
          {(
            [
              'independentMemory',
              'allowGlobalMemory',
              'allowGlobalHistory',
              'allowGlobalInstructions',
            ] as const
          ).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={edit[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
              />
              {
                t[
                  key === 'allowGlobalMemory'
                    ? 'globalMemory'
                    : key === 'allowGlobalHistory'
                      ? 'globalHistory'
                      : key === 'allowGlobalInstructions'
                        ? 'globalInstructions'
                        : key
                ]
              }
            </label>
          ))}
          <p>{t.memoryHint}</p>
          <label>
            {t.model}
            <select
              aria-label={t.model}
              value={edit.defaults.model ? JSON.stringify(edit.defaults.model) : ''}
              onChange={(e) =>
                patch({
                  defaults: {
                    ...edit.defaults,
                    model: e.target.value ? JSON.parse(e.target.value) : null,
                  },
                })
              }
            >
              <option value="">{t.inherit}</option>
              {models
                .filter((m) => m.accountId)
                .map((m) => (
                  <option
                    key={m.accountId + ':' + m.modelId}
                    value={JSON.stringify({ accountId: m.accountId, modelId: m.modelId })}
                  >
                    {m.displayName}
                  </option>
                ))}
            </select>
          </label>
          {(['language', 'length', 'tone', 'format'] as const).map((key) => (
            <label key={key}>
              {t[key]}
              <select
                aria-label={t[key]}
                value={edit.defaults.answer[key]}
                onChange={(e) =>
                  patch({
                    defaults: {
                      ...edit.defaults,
                      answer: { ...edit.defaults.answer, [key]: e.target.value },
                    },
                  })
                }
              >
                {(key === 'language'
                  ? ['auto', 'zh-CN', 'en']
                  : key === 'length'
                    ? ['short', 'normal', 'long']
                    : key === 'tone'
                      ? ['natural', 'professional', 'friendly']
                      : ['auto', 'plain', 'markdown', 'json']
                ).map((v) => (
                  <option key={v} value={v}>
                    {t.choices[v as keyof typeof t.choices]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <fieldset>
            <legend>{t.tools}</legend>
            {Object.entries(t.toolNames).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={edit.defaults.tools.includes(key as 'files.read')}
                  onChange={(e) =>
                    patch({
                      defaults: {
                        ...edit.defaults,
                        tools: e.target.checked
                          ? [...edit.defaults.tools, key as 'files.read']
                          : edit.defaults.tools.filter((v) => v !== key),
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button disabled={busy || project.archivedAt !== null}>{t.save}</button>
        </form>
      )}
      {['sessions', 'tasks', 'outputs'].includes(tab) && (
        <div>
          {tab === 'sessions' && <p>{t.workHint}</p>}
          <ul>
            {(overview?.[tab as 'sessions' | 'tasks' | 'outputs'] ?? []).map((e) => (
              <li key={e.id}>
                {tab === 'sessions' ? <Link to={'/sessions/' + e.id}>{e.title}</Link> : e.title}{' '}
                <span>{e.status}</span>
              </li>
            ))}
          </ul>
          {!(overview?.[tab as 'sessions' | 'tasks' | 'outputs'] ?? []).length && (
            <p>{t.emptyList}</p>
          )}
        </div>
      )}
      {(tab === 'materials' || tab === 'sources') && (
        <>
          <div className="project-actions">
            <button
              disabled={busy || project.archivedAt !== null}
              onClick={() => void act(() => upload())}
            >
              {t.upload}
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  const r = await window.tapkit.fileCommand(requestOptions(), 'files.list', {
                    owner: { type: 'library' },
                    limit: 100,
                  });
                  if (!r.ok) throw new Error(r.error.code);
                  const result = FileReplySchema.parse(r.data);
                  if ('files' in result) setLibrary(result.files);
                }, false)
              }
            >
              {t.library}
            </button>
          </div>
          {library.length > 0 && (
            <div>
              <select
                aria-label={t.library}
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
              >
                <option value="">{t.library}</option>
                {library.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !libraryId}
                onClick={() =>
                  void act(() =>
                    projectCommand(
                      'projects.linkMaterial',
                      {
                        projectId,
                        fileId: libraryId,
                        versionId: library.find((f) => f.id === libraryId)!.currentVersionId,
                      },
                      project.revision,
                    ),
                  )
                }
              >
                {t.link}
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await projectCommand(
                  'projects.addText',
                  { projectId, name, text: body, ...(url ? { url } : {}) },
                  project.revision,
                );
                setName('');
                setBody('');
                setUrl('');
              });
            }}
          >
            <label>
              {t.note}
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {t.noteText}
              <textarea value={body} maxLength={100000} onChange={(e) => setBody(e.target.value)} />
            </label>
            <label>
              {t.url}
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <p>{t.urlHint}</p>
            <p>{t.emptyText}</p>
            <button disabled={busy || project.archivedAt !== null}>{t.addText}</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const r = await window.tapkit.fileCommand(requestOptions(), 'folders.create', {
                  name: folderName,
                  parentId: null,
                  owner: { type: 'project', id: projectId },
                });
                if (!r.ok) throw new Error(r.error.code);
                setFolderName('');
              });
            }}
          >
            <label>
              {t.folderName}
              <input required value={folderName} onChange={(e) => setFolderName(e.target.value)} />
            </label>
            <button disabled={busy}>{t.createFolder}</button>
          </form>
          <label>
            {t.folder}
            <select
              aria-label={t.folder}
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
            >
              <option value="*">{t.all}</option>
              <option value="">{t.root}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.tags}
            <input
              aria-label={t.search}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </label>
          <ul className="project-materials">
            {materials
              .filter(
                (m) =>
                  (folderFilter === '*' || (m.folderId ?? '') === folderFilter) &&
                  (!tagFilter || m.tags.some((tag) => tag.includes(tagFilter))),
              )
              .map((m) => (
                <MaterialRow
                  key={m.file.id + ':' + m.indexVersion}
                  material={m}
                  folders={folders}
                  busy={busy}
                  onOpen={() =>
                    void viewer.open({
                      fileId: m.file.id,
                      versionId: m.file.version.id,
                      owner: { type: 'project', id: projectId },
                    })
                  }
                  onReplace={() => void act(() => upload(m.file.id))}
                  onHistory={() => navigate('/files?file=' + m.file.id)}
                  onRemove={() =>
                    void act(async () => {
                      const r = await projectCommand('projects.removeMaterialPreview', {
                        projectId,
                        fileId: m.file.id,
                      });
                      if ('impact' in r) {
                        setRemoveId(m.file.id);
                        setImpact(r.impact);
                      }
                    }, false)
                  }
                  onClassify={(folderId, tags, expiresAt) =>
                    void act(() =>
                      projectCommand(
                        'projects.classifyMaterial',
                        { projectId, fileId: m.file.id, folderId, tags, expiresAt },
                        project.revision,
                      ),
                    )
                  }
                />
              ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const r = await projectCommand('knowledge.query', { projectId, query });
                if ('hits' in r) setEvidence(r);
              }, false);
            }}
          >
            <label>
              {t.query}
              <input required value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button disabled={busy}>{t.queryAction}</button>
          </form>
          {evidence && (
            <div role="status">
              {evidence.diagnostics.map((v, i) => (
                <p key={i}>{v}</p>
              ))}
              {evidence.hits.map((v, i) => (
                <p key={i}>
                  <button
                    onClick={() => {
                      if (v.ref.kind === 'file')
                        void viewer.open({
                          fileId: v.ref.fileId,
                          versionId: v.ref.versionId,
                          owner: { type: 'project', id: projectId },
                          ...(v.ref.locator ? { locator: v.ref.locator } : {}),
                        });
                    }}
                  >
                    {t.open}
                  </button>
                  {v.text}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {impact && (
        <div role="dialog" aria-label={t.preview}>
          <h2>{t.preview}</h2>
          <p>{t.detachHint}</p>
          <p>
            {t.sessions}：{impact.sessionIds.length} · {t.tasks}：{impact.taskIds.length} ·{' '}
            {t.files}：{impact.fileIds.length} · {t.shared}：{impact.sharedFileIds.length}
          </p>
          {!removeId && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={trashSessions}
                  onChange={(e) => setTrashSessions(e.target.checked)}
                />
                {t.trashSessions}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={trashFiles}
                  onChange={(e) => setTrashFiles(e.target.checked)}
                />
                {t.trashFiles}
              </label>
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await projectCommand(
                  removeId ? 'projects.removeMaterial' : 'projects.trash',
                  removeId
                    ? { projectId, fileId: removeId }
                    : {
                        projectId,
                        sessionDisposition: trashSessions ? 'trash' : 'detach',
                        trashExclusiveFiles: trashFiles,
                      },
                  project.revision,
                );
                setImpact(undefined);
                if (!removeId) navigate('/projects');
              }, !!removeId)
            }
          >
            {removeId ? t.confirmRemove : t.confirmDelete}
          </button>
          <button onClick={() => setImpact(undefined)}>{t.cancel}</button>
        </div>
      )}
    </section>
  );
}
function MaterialRow({
  material: m,
  folders,
  busy,
  onOpen,
  onReplace,
  onHistory,
  onRemove,
  onClassify,
}: {
  material: Material;
  folders: { id: string; name: string }[];
  busy: boolean;
  onOpen: () => void;
  onReplace: () => void;
  onHistory: () => void;
  onRemove: () => void;
  onClassify: (folder: string | null, tags: string[], expires: number | null) => void;
}) {
  const [tags, setTags] = useState(m.tags.join(',')),
    [folder, setFolder] = useState(m.folderId ?? ''),
    [expires, setExpires] = useState(
      m.expiresAt ? new Date(m.expiresAt).toISOString().slice(0, 10) : '',
    );
  return (
    <li>
      <strong>{m.file.name}</strong> · {t.states[m.state]} · {t.version} {m.file.version.version} ·{' '}
      {t.index} {m.indexVersion}
      <p>
        {t.source}：{m.source} · {new Date(m.file.updatedAt).toLocaleString('zh-CN')}
      </p>
      {m.pendingVersionId && (
        <p>
          {t.pending}：{m.pendingStatus}
        </p>
      )}
      <button onClick={onOpen}>{t.open}</button>
      <button disabled={busy} onClick={onReplace}>
        {t.replace}
      </button>
      <button onClick={onHistory}>{t.history}</button>
      <button disabled={busy} onClick={onRemove}>
        {t.remove}
      </button>
      <label>
        {t.folder}
        <select value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">{t.root}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.tags}
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label>
        {t.expires}
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          onClassify(
            folder || null,
            tags
              .split(/[,，]/)
              .map((v) => v.trim())
              .filter(Boolean),
            expires ? new Date(expires + 'T23:59:59').getTime() : null,
          )
        }
      >
        {t.classify}
      </button>
    </li>
  );
}
export function ProjectScopeBar({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const [scope, setScope] = useState<z.infer<typeof ProjectScopeSchema>>(),
    [revision, setRevision] = useState(0),
    [projectId, setProjectId] = useState(''),
    [materials, setMaterials] = useState<Material[]>([]),
    [error, setError] = useState('');
  const readScope = useCallback(async () => {
    const r = await historyCommand('sessions.get', { sessionId });
    if (!('session' in r) || !r.session.projectId) return;
    const id = r.session.projectId,
      s = await projectCommand('projects.sessionScope', { sessionId }),
      m = await projectCommand('projects.materials', { projectId: id });
    if ('scope' in s && 'materials' in m) return { id, s, m };
  }, [sessionId]);
  const applyScope = (result: Awaited<ReturnType<typeof readScope>>) => {
    if (!result) return;
    setScope(result.s.scope);
    setRevision(result.s.revision);
    setProjectId(result.id);
    setMaterials(result.m.materials);
    setError('');
  };
  useEffect(() => {
    let alive = true;
    setScope(undefined);
    void readScope()
      .then((result) => alive && applyScope(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [readScope]);
  if (!scope) return null;
  return (
    <details className="project-scope">
      <summary>{t.selection}</summary>
      <p>{projectId}</p>
      <label>
        <input
          type="checkbox"
          checked={scope.projectOnly}
          disabled={disabled}
          onChange={(e) => setScope({ ...scope, projectOnly: e.target.checked })}
        />
        {t.projectOnly}
      </label>
      <button disabled={disabled} onClick={() => setScope({ ...scope, selectedVersionIds: null })}>
        {t.all}
      </button>
      <button disabled={disabled} onClick={() => setScope({ ...scope, selectedVersionIds: [] })}>
        {t.none}
      </button>
      {materials.map((m) => (
        <label key={m.file.id}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={
              scope.selectedVersionIds === null ||
              scope.selectedVersionIds.includes(m.file.version.id)
            }
            onChange={(e) => {
              const current = scope.selectedVersionIds ?? materials.map((m) => m.file.version.id);
              const selectedVersionIds = e.target.checked
                ? [...new Set([...current, m.file.version.id])]
                : current.filter((id) => id !== m.file.version.id);
              if (selectedVersionIds.length > 20) {
                setError(t.scopeLimit);
                return;
              }
              setScope({ ...scope, selectedVersionIds });
              setError('');
            }}
          />
          {m.file.name} · {t.states[m.state]}
        </label>
      ))}
      <button
        disabled={disabled}
        onClick={() =>
          void projectCommand('projects.sessionScope', { sessionId, scope }, revision)
            .then((r) => {
              if ('scope' in r) {
                setScope(r.scope);
                setRevision(r.revision);
                notify();
                setError('');
              }
            })
            .catch(() => setError(t.conflict))
        }
      >
        {t.selected}
      </button>
      <button
        disabled={disabled}
        onClick={() =>
          void readScope()
            .then(applyScope)
            .catch(() => setError(t.failed))
        }
      >
        {t.reload}
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
