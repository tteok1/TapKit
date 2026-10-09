import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileReplySchema,
  FileViewSchema,
  FileImportViewSchema,
  type FileView,
  type FileOwner,
  type FileSelection,
  type FileCommand,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import t from '../locales/files.zh-CN.json';
type FileData = z.infer<typeof FileReplySchema>;
type ImportView = z.infer<typeof FileImportViewSchema>;
type Folder = Extract<FileData, { folders: unknown }>['folders'][number];
type Info = Extract<FileData, { importInfo: unknown }>['importInfo'];
type Storage = Extract<FileData, { storage: unknown }>['storage'];
type BatchResult = {
  id: string;
  name: string;
  status: 'completed' | 'failed' | 'cancelled';
  errorCode?: string;
};
const message = (code: string) =>
  (t.errors as Record<string, string>)[code] ?? t.errors.INTERNAL_ERROR;
const state = (code: string) => (t.states as Record<string, string>)[code] ?? code;
const importState = (code: ImportView['items'][number]['status']) => t.importStates[code];
const bytes = (value: number) => {
  const unit = value >= 1024 ** 3 ? 2 : value >= 1024 ** 2 ? 1 : 0;
  return (
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(
      value / 1024 ** (unit === 2 ? 3 : unit === 1 ? 2 : 0),
    ) +
    ' ' +
    t.units[unit]
  );
};
async function command(
  name: FileCommand,
  payload: unknown = {},
  revision?: number,
): Promise<FileData> {
  const r = await window.tapkit.fileCommand(requestOptions(revision), name, payload);
  if (!r.ok) throw new Error(r.error.code);
  return FileReplySchema.parse(r.data);
}
const dateBound = (date: string, end = false) =>
  date ? new Date(date + (end ? 'T23:59:59.999' : 'T00:00:00')).getTime() : undefined;

export function FileLibrary({
  projects = [],
  sessions = [],
  focusFileId,
}: {
  projects?: { id: string; name: string }[];
  sessions?: { id: string; title: string }[];
  focusFileId?: string | undefined;
}) {
  const [scope, setScope] = useState('library'),
    [folderId, setFolderId] = useState('');
  const [query, setQuery] = useState(''),
    [type, setType] = useState(''),
    [source, setSource] = useState('');
  const [after, setAfter] = useState(''),
    [before, setBefore] = useState('');
  const [favorite, setFavorite] = useState(false),
    [trash, setTrash] = useState(false),
    [grid, setGrid] = useState(false);
  const [sort, setSort] = useState<'updated' | 'size' | 'name'>('updated');
  const [files, setFiles] = useState<FileView[]>([]),
    [folders, setFolders] = useState<Folder[]>([]);
  const [storage, setStorage] = useState<Storage>(),
    [info, setInfo] = useState<Info>();
  const [interrupted, setInterrupted] = useState<ImportView[]>([]);
  const [cursor, setCursor] = useState<string>(),
    [next, setNext] = useState<string | null>(null),
    [history, setHistory] = useState<(string | undefined)[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [selections, setSelections] = useState<FileSelection[]>([]),
    [duplicate, setDuplicate] = useState<'keep' | 'skip' | 'replace'>('keep');
  const [replacements, setReplacements] = useState<Record<string, string>>({}),
    [importView, setImportView] = useState<ImportView>();
  const [detail, setDetail] = useState<FileView>(),
    [versions, setVersions] = useState<z.infer<typeof FileViewSchema>['version'][]>([]);
  const [usage, setUsage] = useState<Extract<FileData, { usage: unknown }>['usage']>();
  const [name, setName] = useState(''),
    [destinationFolder, setDestinationFolder] = useState(''),
    [linkScope, setLinkScope] = useState('');
  const [newFolder, setNewFolder] = useState(false),
    [folderName, setFolderName] = useState('');
  const [remove, setRemove] = useState<'trash' | 'purge' | 'unlink'>();
  const [impact, setImpact] = useState<FileView[]>([]),
    [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const uploadDialog = useRef<HTMLDialogElement>(null),
    detailDialog = useRef<HTMLDialogElement>(null),
    folderDialog = useRef<HTMLDialogElement>(null),
    removeDialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0),
    detailSequence = useRef(0),
    importRequestId = useRef<string | undefined>(undefined);
  const owner: FileOwner =
    scope === 'library'
      ? { type: 'library' }
      : scope.startsWith('project:')
        ? { type: 'project', id: scope.slice(8) }
        : { type: 'session', id: scope.slice(8) };
  const ownerJson = JSON.stringify(owner);
  const ownerLabel = (o: FileOwner) =>
    o.type === 'library'
      ? t.library
      : o.type === 'project'
        ? t.project + ' · ' + (projects.find((p) => p.id === o.id)?.name ?? t.project)
        : t.session + ' · ' + (sessions.find((s) => s.id === o.id)?.title ?? t.session);
  const payload = {
    owner,
    folderId: folderId || null,
    query,
    ...(type ? { type } : {}),
    ...(source ? { source } : {}),
    ...(after ? { updatedAfter: dateBound(after)! } : {}),
    ...(before ? { updatedBefore: dateBound(before, true)! } : {}),
    favorite,
    trash,
    sort,
  };
  const filter = JSON.stringify(payload);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    setLoading(true);
    try {
      const [list, dirs, usage, space, imports] = await Promise.all([
        command('files.list', { ...JSON.parse(filter), ...(cursor ? { cursor } : {}) }),
        command('folders.list', { owner: JSON.parse(ownerJson) }),
        command('files.storage'),
        command('files.importInfo'),
        command('files.importHistory'),
      ]);
      if (sequence.current !== ticket) return;
      if ('files' in list) {
        setFiles(list.files);
        setNext(list.nextCursor);
      }
      if ('folders' in dirs) setFolders(dirs.folders);
      if ('storage' in usage) setStorage(usage.storage);
      if ('importInfo' in space) setInfo(space.importInfo);
      if ('imports' in imports) setInterrupted(imports.imports);
    } catch (e) {
      if (sequence.current === ticket)
        setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
    } finally {
      if (sequence.current === ticket) setLoading(false);
    }
  }, [filter, ownerJson, cursor]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    setCursor(undefined);
    setHistory([]);
    setSelected([]);
    setFiles([]);
    setBatchResults([]);
  }, [filter]);
  useEffect(() => {
    void refresh();
    return () => {
      ++sequence.current;
    };
  }, [refresh]);
  useEffect(() => {
    const changed = () => void refresh();
    window.addEventListener('tapkit:history-refresh', changed);
    return () => window.removeEventListener('tapkit:history-refresh', changed);
  }, [refresh]);
  useEffect(() => {
    if (selections.length) uploadDialog.current?.showModal();
    else uploadDialog.current?.close();
  }, [selections.length]);
  useEffect(() => {
    if (detail) detailDialog.current?.showModal();
    else detailDialog.current?.close();
  }, [detail?.id]);
  useEffect(() => {
    if (newFolder) folderDialog.current?.showModal();
    else folderDialog.current?.close();
  }, [newFolder]);
  useEffect(() => {
    if (remove) removeDialog.current?.showModal();
    else removeDialog.current?.close();
  }, [remove]);
  const run = async (work: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await work();
      if (result !== false) setNotice(t.actionComplete);
      await refreshRef.current();
    } catch (e) {
      setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
    } finally {
      setBusy(false);
    }
  };
  async function selectFiles(folder = false, dropped?: File[]) {
    await run(async () => {
      const r = dropped
        ? await window.tapkit.selectDroppedFiles(dropped)
        : await window.tapkit.chooseFiles(folder);
      if (!r.ok) throw new Error(r.error.code);
      const d = FileReplySchema.parse(r.data);
      if ('selections' in d && d.selections.length) {
        setSelections(d.selections);
        setReplacements({});
        setImportView(undefined);
        setDuplicate('keep');
      } else return false;
    });
  }
  async function closeUpload() {
    if (importRequestId.current) {
      await command('files.cancelImport', { importRequestId: importRequestId.current }).catch(
        () => {},
      );
      return;
    }
    const tokens = selections.map((s) => s.token);
    setSelections([]);
    if (tokens.length)
      await command('files.releaseSelection', { selectionTokens: tokens }).catch(() => {});
  }
  async function importFiles() {
    const options = requestOptions();
    importRequestId.current = options.requestId;
    setError('');
    setBusy(true);
    const poll = setInterval(() => {
      void command('files.importStatus', { importRequestId: options.requestId })
        .then((d) => {
          if (importRequestId.current === options.requestId && 'import' in d)
            setImportView(d.import);
        })
        .catch(() => {});
    }, 300);
    try {
      const r = await window.tapkit.fileCommand(options, 'files.import', {
        selectionTokens: selections.map((s) => s.token),
        destination: owner,
        ...(folderId ? { folderId } : {}),
        duplicate,
        replacements:
          duplicate === 'replace'
            ? selections.map((s) => ({ token: s.token, fileId: replacements[s.token] }))
            : [],
      });
      if (!r.ok) throw new Error(r.error.code);
      const d = FileReplySchema.parse(r.data);
      if ('import' in d) {
        setImportView(d.import);
        if (d.import.items.some((i) => i.status === 'failed' || i.status === 'cancelled'))
          setError(t.partial);
      }
      await refreshRef.current();
    } catch (e) {
      setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
    } finally {
      clearInterval(poll);
      importRequestId.current = undefined;
      setBusy(false);
    }
  }
  async function cancelFile(token: string) {
    if (importRequestId.current) {
      try {
        await command('files.cancelImport', {
          importRequestId: importRequestId.current,
          selectionToken: token,
        });
      } catch (e) {
        setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
      }
    } else if (!importView) {
      await run(async () => {
        await command('files.releaseSelection', { selectionTokens: [token] });
        setSelections((items) => items.filter((item) => item.token !== token));
      });
    }
  }
  async function openDetail(file: FileView) {
    const ticket = ++detailSequence.current;
    setName(file.name);
    setDestinationFolder(file.folderId ?? '');
    setLinkScope('');
    setDetail(file);
    setVersions([]);
    setUsage(undefined);
    try {
      const [v, u] = await Promise.all([
        command('files.versions', { fileId: file.id, trash: !!file.deletedAt }),
        command('files.usage', { fileId: file.id, trash: !!file.deletedAt }),
      ]);
      if (detailSequence.current !== ticket) return;
      if ('versions' in v) setVersions(v.versions);
      if ('usage' in u) setUsage(u.usage);
    } catch (e) {
      if (detailSequence.current === ticket)
        setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
    }
  }
  async function refreshDetail(fileId: string, reopen = false) {
    const ticket = detailSequence.current;
    const d = await command('files.get', { fileId, owner });
    if (ticket !== detailSequence.current || !('file' in d)) return;
    const file = FileViewSchema.parse(d.file);
    if (reopen) await openDetail(file);
    else setDetail(file);
  }
  async function download(file: FileView, versionId = file.version.id) {
    const r = await window.tapkit.saveOriginal({ fileId: file.id, versionId, owner });
    if (!r.ok) throw new Error(r.error.code);
    if ('changedIds' in r.data && r.data.changedIds.length) setNotice(t.downloaded);
    return 'changedIds' in r.data && !!r.data.changedIds.length;
  }
  async function batch(action: 'move' | 'download' | 'restore' | 'clearPreview') {
    await run(async () => {
      const ids = [...selected];
      const results: BatchResult[] = [];
      setBatchResults([]);
      if (action === 'restore' || action === 'clearPreview') {
        try {
          const info = await command('files.impact', { fileIds: ids, owner });
          if (!('impact' in info)) throw new Error('INTERNAL_ERROR');
          await command(action === 'restore' ? 'files.restore' : 'files.deletePreview', {
            fileIds: ids,
            owner,
          });
          results.push(
            ...info.impact.map((f) => ({ id: f.id, name: f.name, status: 'completed' as const })),
          );
        } catch (e) {
          const errorCode = e instanceof Error ? e.message : 'INTERNAL_ERROR';
          results.push(
            ...ids.map((id) => ({
              id,
              name: files.find((f) => f.id === id)?.name ?? t.details,
              status: 'failed' as const,
              errorCode,
            })),
          );
        }
      } else {
        let cancelled = false;
        for (const id of ids) {
          let name = files.find((f) => f.id === id)?.name ?? t.details;
          try {
            if (cancelled) throw new Error('CANCELLED');
            const d = await command('files.get', { fileId: id, owner });
            if (!('file' in d)) throw new Error('INTERNAL_ERROR');
            name = d.file.name;
            if (action === 'download') {
              if (!(await download(d.file))) {
                cancelled = true;
                throw new Error('CANCELLED');
              }
            } else
              await command(
                'files.move',
                { fileId: id, folderId: destinationFolder || null },
                d.file.revision,
              );
            results.push({ id, name, status: 'completed' });
          } catch (e) {
            const errorCode = e instanceof Error ? e.message : 'INTERNAL_ERROR';
            results.push({
              id,
              name,
              status: errorCode === 'CANCELLED' ? 'cancelled' : 'failed',
              errorCode,
            });
          }
          setBatchResults([...results]);
        }
      }
      setBatchResults(results);
      setSelected(results.filter((r) => r.status !== 'completed').map((r) => r.id));
      if (results.some((r) => r.status !== 'completed')) {
        setError(t.batchPartial);
        return false;
      }
    });
  }
  async function previewRemoval(action: 'trash' | 'purge' | 'unlink') {
    await run(async () => {
      const d = await command('files.impact', { fileIds: selected, owner });
      if (!('impact' in d)) throw new Error('INTERNAL_ERROR');
      setImpact(d.impact);
      setRemove(action);
      return false;
    });
  }
  useEffect(() => {
    if (!focusFileId) return;
    let stopped = false;
    void command('files.get', { fileId: focusFileId })
      .then((d) => {
        if (!stopped && 'file' in d) void openDetail(d.file);
      })
      .catch((e) => {
        if (!stopped) setError(message(e instanceof Error ? e.message : 'INTERNAL_ERROR'));
      });
    return () => {
      stopped = true;
    };
  }, [focusFileId]);
  const scopeOptions = (
    <>
      <option value="library">{t.library}</option>
      {projects.map((p) => (
        <option key={p.id} value={'project:' + p.id}>
          {t.project} · {p.name}
        </option>
      ))}
      {sessions.map((s) => (
        <option key={s.id} value={'session:' + s.id}>
          {t.session} · {s.title}
        </option>
      ))}
    </>
  );
  const folderOptions = (
    <>
      <option value="">{t.root}</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </>
  );
  return (
    <section className="file-library" aria-label={t.title}>
      <header>
        <h1>{t.title}</h1>
        <button disabled={busy || trash} onClick={() => void selectFiles()}>
          {t.chooseFiles}
        </button>
        <button disabled={busy || trash} onClick={() => void selectFiles(true)}>
          {t.chooseFolder}
        </button>
      </header>
      <p>{t.supported}</p>
      <p>
        {t.limits}{' '}
        {info && (
          <span>
            {t.available}：{bytes(info.availableBytes)}
          </span>
        )}
      </p>
      <div
        className="file-drop"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy && !trash && event.dataTransfer.files.length)
            void selectFiles(false, [...event.dataTransfer.files]);
        }}
      >
        {t.dropHint}
      </div>
      <div className="file-filters">
        <label>
          {t.scope}
          <select
            value={scope}
            disabled={busy}
            onChange={(e) => {
              setScope(e.target.value);
              setFolderId('');
            }}
          >
            {scopeOptions}
          </select>
        </label>
        <label>
          {t.folder}
          <select value={folderId} disabled={busy} onChange={(e) => setFolderId(e.target.value)}>
            {folderOptions}
          </select>
        </label>
        <button
          disabled={busy || owner.type === 'session' || trash}
          onClick={() => {
            setFolderName('');
            setNewFolder(true);
          }}
        >
          {t.newFolder}
        </button>
        <label>
          {t.search}
          <input value={query} maxLength={500} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          {t.type}
          <input
            value={type}
            maxLength={32}
            placeholder="pdf"
            onChange={(e) => setType(e.target.value)}
          />
        </label>
        <label>
          {t.source}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t.all}</option>
            <option value="import">{t.import}</option>
            <option value="generated">{t.generated}</option>
            <option value="url">{t.url}</option>
          </select>
        </label>
        <label>
          {t.after}
          <input type="date" value={after} onChange={(e) => setAfter(e.target.value)} />
        </label>
        <label>
          {t.before}
          <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
        </label>
        <label>
          {t.sort}
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated">{t.updated}</option>
            <option value="size">{t.size}</option>
            <option value="name">{t.name}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          {t.favoriteOnly}
        </label>
        <label>
          <input type="checkbox" checked={trash} onChange={(e) => setTrash(e.target.checked)} />
          {t.trash}
        </label>
        <button aria-pressed={!grid} onClick={() => setGrid(false)}>
          {t.list}
        </button>
        <button aria-pressed={grid} onClick={() => setGrid(true)}>
          {t.grid}
        </button>
        <button disabled={busy} onClick={() => void refresh()}>
          {t.refresh}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!!interrupted.length && (
        <section aria-label={t.interruptedImports}>
          <h2>{t.interruptedImports}</h2>
          <p>{t.interruptedHint}</p>
          {interrupted.map((batch) => (
            <article key={batch.requestId}>
              <ul>
                {batch.items.map((item) => (
                  <li key={item.token}>
                    {item.name ?? t.details} · {importState(item.status)}{' '}
                    {item.errorCode && message(item.errorCode)}
                  </li>
                ))}
              </ul>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    command('files.dismissImport', { importRequestId: batch.requestId }),
                  )
                }
              >
                {t.dismissImport}
              </button>
            </article>
          ))}
        </section>
      )}
      {!!selected.length && (
        <div className="file-actions">
          <span>
            {t.select} {selected.length}
          </span>
          {trash ? (
            <>
              <button disabled={busy} onClick={() => void batch('restore')}>
                {t.restore}
              </button>
              <button disabled={busy} onClick={() => void previewRemoval('purge')}>
                {t.purge}
              </button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => void batch('download')}>
                {t.download}
              </button>
              <label>
                {t.folder}
                <select
                  value={destinationFolder}
                  onChange={(e) => setDestinationFolder(e.target.value)}
                >
                  {folderOptions}
                </select>
              </label>
              <button disabled={busy} onClick={() => void batch('move')}>
                {t.move}
              </button>
              <button disabled={busy} onClick={() => void previewRemoval('trash')}>
                {t.delete}
              </button>
              {owner.type !== 'library' && (
                <button disabled={busy} onClick={() => void previewRemoval('unlink')}>
                  {t.unlink}
                </button>
              )}
              <button disabled={busy} onClick={() => void batch('clearPreview')}>
                {t.clearPreview}
              </button>
            </>
          )}
        </div>
      )}
      {loading && <p>{t.loading}</p>}
      {!!batchResults.length && (
        <section aria-label={t.batchResults}>
          <h2>{t.batchResults}</h2>
          <ul>
            {batchResults.map((r) => (
              <li key={r.id}>
                {r.name} · {t.batchStates[r.status]} {r.errorCode && message(r.errorCode)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <label>
        <input
          type="checkbox"
          checked={!!files.length && files.every((f) => selected.includes(f.id))}
          onChange={(e) => {
            if (e.target.checked) {
              const ids = [...new Set([...selected, ...files.map((f) => f.id)])];
              if (ids.length > 100) setError(t.selectionLimit);
              else setSelected(ids);
            } else setSelected((ids) => ids.filter((id) => !files.some((f) => f.id === id)));
          }}
        />
        {t.selectAll}
      </label>
      {!files.length && !loading && <p>{t.empty}</p>}
      <ul className={grid ? 'file-grid' : 'file-list'}>
        {files.map((file) => (
          <li key={file.id} id={'file-' + file.id} className="file-card">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(file.id)}
                aria-label={t.select + ' ' + file.name}
                onChange={(e) => {
                  if (e.target.checked && selected.length >= 100) setError(t.selectionLimit);
                  else
                    setSelected((ids) =>
                      e.target.checked ? [...ids, file.id] : ids.filter((id) => id !== file.id),
                    );
                }}
              />
            </label>
            <button className="file-name" title={file.name} onClick={() => void openDetail(file)}>
              {file.name}
            </button>
            <span>
              {file.extension.toUpperCase()} · {bytes(file.version.sizeBytes)}
            </span>
            <span>
              {state(file.status)} · {state(file.version.parseStatus)}
            </span>
            {file.version.id !== file.currentVersionId && (
              <span>
                {t.scopedVersion} {file.version.version} · {file.version.name}
              </span>
            )}
            <span>{new Date(file.updatedAt).toLocaleString('zh-CN')}</span>
            {file.version.errorCode && (
              <p>
                {message(file.version.errorCode)}{' '}
                {file.version.errorReason
                  ? ((t.reasons as Record<string, string>)[file.version.errorReason] ?? '')
                  : ''}
              </p>
            )}
            {file.purgeAfter && (
              <span>
                {t.expires} {new Date(file.purgeAfter).toLocaleDateString('zh-CN')}
              </span>
            )}
            {!trash && (
              <button disabled={busy} onClick={() => void run(() => download(file))}>
                {t.download}
              </button>
            )}
          </li>
        ))}
      </ul>
      <nav className="file-pagination" aria-label={t.title}>
        <button
          disabled={loading || !history.length}
          onClick={() => {
            setCursor(history.at(-1));
            setHistory((h) => h.slice(0, -1));
          }}
        >
          {t.previous}
        </button>
        <span>{history.length + 1}</span>
        <button
          disabled={loading || !next}
          onClick={() => {
            setHistory((h) => [...h, cursor]);
            setCursor(next!);
          }}
        >
          {t.next}
        </button>
      </nav>
      {storage && (
        <aside>
          <h2>{t.storage}</h2>
          <p>
            {t.originalBytes}：{bytes(storage.originalBytes)} · {t.derivedBytes}：
            {bytes(storage.derivedBytes)} · {t.backupBytes}：{bytes(storage.backupRetainedBytes)}
          </p>
          <p>{t.storageHint}</p>
        </aside>
      )}
      <dialog
        ref={uploadDialog}
        className="files-dialog"
        aria-label={t.selectedFiles}
        onCancel={(e) => {
          e.preventDefault();
          void closeUpload();
        }}
      >
        <h2>{t.selectedFiles}</h2>
        <p>{t.readingSeparate}</p>
        <p>
          {t.scope}：{ownerLabel(owner)}
        </p>
        <label>
          {t.duplicate}
          <select
            value={duplicate}
            disabled={busy || !!importView}
            onChange={(e) => setDuplicate(e.target.value as typeof duplicate)}
          >
            <option value="keep">{t.keep}</option>
            <option value="skip">{t.skip}</option>
            <option value="replace">{t.replace}</option>
          </select>
        </label>
        <ul>
          {selections.map((s) => {
            const item = importView?.items.find((i) => i.token === s.token);
            return (
              <li key={s.token}>
                <strong>{s.relativePath}</strong> · {bytes(s.sizeBytes)}
                {(!importView || item?.status === 'waiting' || item?.status === 'reading') && (
                  <button
                    disabled={busy && !importRequestId.current}
                    onClick={() => void cancelFile(s.token)}
                  >
                    {t.cancelFile}
                  </button>
                )}
                {item && ['failed', 'cancelled'].includes(item.status) && (
                  <button disabled={busy} onClick={() => void selectFiles(false)}>
                    {t.reselectFile}
                  </button>
                )}
                {duplicate === 'replace' && (
                  <label>
                    {t.replaceTarget}
                    <select
                      disabled={busy || !!importView}
                      value={replacements[s.token] ?? ''}
                      onChange={(e) =>
                        setReplacements((r) => ({ ...r, [s.token]: e.target.value }))
                      }
                    >
                      <option value="">{t.chooseTarget}</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {t.version} {f.version.version}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {item && (
                  <>
                    <progress
                      max={Math.max(1, item.totalBytes)}
                      value={item.readBytes}
                      aria-label={s.name}
                    />
                    <span>
                      {importState(item.status)} {item.errorCode ? message(item.errorCode) : ''}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p role="alert">{error}</p>}
        <button
          disabled={
            busy ||
            selections.length === 0 ||
            !!importView ||
            (duplicate === 'replace' && selections.some((s) => !replacements[s.token]))
          }
          onClick={() => void importFiles()}
        >
          {t.startImport}
        </button>
        {busy && importRequestId.current && (
          <button
            onClick={() =>
              void command('files.cancelImport', { importRequestId: importRequestId.current })
            }
          >
            {t.cancelImport}
          </button>
        )}
        <button disabled={busy} onClick={() => void closeUpload()}>
          {t.close}
        </button>
      </dialog>
      <dialog
        ref={detailDialog}
        className="files-dialog"
        aria-label={t.details}
        onCancel={() => {
          ++detailSequence.current;
          setDetail(undefined);
        }}
      >
        {detail && (
          <>
            <h2>{detail.name}</h2>
            <p>
              {t.owner}：{detail.owners.map(ownerLabel).join(' · ')}
            </p>
            <p>
              {t.version} {detail.version.version} · {detail.version.mime} ·{' '}
              {bytes(detail.version.sizeBytes)}
            </p>
            <p className="file-hash">
              {t.hash}：{detail.version.sha256}
            </p>
            <p>
              {t.status}：{state(detail.status)} / {state(detail.version.parseStatus)}
            </p>
            {detail.version.errorCode && (
              <p role="status">
                {message(detail.version.errorCode)}{' '}
                {detail.version.errorReason
                  ? ((t.reasons as Record<string, string>)[detail.version.errorReason] ?? '')
                  : ''}
              </p>
            )}
            {detail.version.id !== detail.currentVersionId && (
              <p>
                {t.scopedVersion} {detail.version.version} · {detail.version.name}
              </p>
            )}
            {!trash && (
              <>
                <label>
                  {t.name}
                  <input value={name} maxLength={240} onChange={(e) => setName(e.target.value)} />
                </label>
                <button
                  disabled={busy || !name.trim()}
                  onClick={() =>
                    void run(async () => {
                      await command('files.rename', { fileId: detail.id, name }, detail.revision);
                      await refreshDetail(detail.id);
                    })
                  }
                >
                  {t.rename}
                </button>
                <button
                  disabled={
                    busy ||
                    (name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '') !==
                      detail.version.extension
                  }
                  onClick={() =>
                    void run(() =>
                      command('files.copy', {
                        fileId: detail.id,
                        versionId: detail.version.id,
                        name,
                        owner,
                        ...(destinationFolder ? { folderId: destinationFolder } : {}),
                      }),
                    )
                  }
                >
                  {t.copy}
                </button>
                {(name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '') !==
                  detail.version.extension && (
                  <p>
                    {t.copyFormatHint} {detail.version.extension.toUpperCase()}
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await command(
                        'files.favorite',
                        { fileId: detail.id, favorite: !detail.favorite },
                        detail.revision,
                      );
                      await refreshDetail(detail.id);
                    })
                  }
                >
                  {detail.favorite ? t.unfavorite : t.favorite}
                </button>
                <button
                  disabled={busy || !['failed', 'cancelled'].includes(detail.version.parseStatus)}
                  onClick={() =>
                    void run(async () => {
                      await command('files.retryParse', { fileVersionId: detail.version.id });
                      await refreshDetail(detail.id);
                    })
                  }
                >
                  {t.retryParse}
                </button>
                <button
                  disabled={busy || !['pending', 'parsing'].includes(detail.version.parseStatus)}
                  onClick={() =>
                    void run(async () => {
                      await command('files.cancelParse', { fileVersionId: detail.version.id });
                      await refreshDetail(detail.id);
                    })
                  }
                >
                  {t.cancelParse}
                </button>
                <label>
                  {t.linkTarget}
                  <select value={linkScope} onChange={(e) => setLinkScope(e.target.value)}>
                    <option value="">{t.chooseTarget}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={'project:' + p.id}>
                        {t.project} · {p.name}
                      </option>
                    ))}
                    {sessions.map((s) => (
                      <option key={s.id} value={'session:' + s.id}>
                        {t.session} · {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy || !linkScope}
                  onClick={() =>
                    void run(() =>
                      command('files.link', {
                        fileId: detail.id,
                        versionId: detail.version.id,
                        owner: {
                          type: linkScope.startsWith('project:') ? 'project' : 'session',
                          id: linkScope.slice(8),
                        },
                      }),
                    )
                  }
                >
                  {t.link}
                </button>
              </>
            )}
            <h3>{t.versions}</h3>
            <ul>
              {versions.map((v) => (
                <li key={v.id}>
                  {t.version} {v.version} · {v.name} · {state(v.parseStatus)}
                  <button
                    disabled={busy || trash}
                    onClick={() => void run(() => download(detail, v.id))}
                  >
                    {t.download}
                  </button>
                  <button
                    disabled={busy || trash || v.id === detail.currentVersionId}
                    onClick={() =>
                      void run(async () => {
                        await command(
                          'files.restoreVersion',
                          { fileId: detail.id, versionId: v.id },
                          detail.revision,
                        );
                        await refreshDetail(detail.id, true);
                      })
                    }
                  >
                    {t.restoreVersion}
                  </button>
                  <button
                    disabled={busy || trash}
                    onClick={() =>
                      void run(() =>
                        command('files.copy', {
                          fileId: detail.id,
                          versionId: v.id,
                          name: v.name,
                          owner,
                        }),
                      )
                    }
                  >
                    {t.copy}
                  </button>
                </li>
              ))}
            </ul>
            <h3>{t.usage}</h3>
            {usage && (
              <section aria-label={t.usage}>
                <p>
                  {usage.links
                    .map(
                      (l) =>
                        (l.owner.type === 'project' ? t.project : t.session) +
                        ' · ' +
                        l.ownerName +
                        ' · ' +
                        t.version +
                        ' ' +
                        (versions.find((v) => v.id === l.versionId)?.version ?? ''),
                    )
                    .join(' · ')}{' '}
                  · {t.versions} {usage.versionCount} · {bytes(usage.retainedBytes)}
                </p>
                <h4>{t.taskUsage}</h4>
                {usage.records.length === 0 ? (
                  <p>{t.noTaskUsage}</p>
                ) : (
                  <ul>
                    {usage.records.map((record) => (
                      <li key={record.runId + ':' + record.versionId}>
                        <strong>{record.taskTitle || t.task}</strong>
                        {' · '}
                        {record.sessionTitle}
                        {' · '}
                        {t.taskVersion} {record.taskVersion}
                        {' · '}
                        {t.version}{' '}
                        {versions.find((v) => v.id === record.versionId)?.version ??
                          t.historicalVersion}
                        {' · '}
                        {t.runStates[record.status]}
                        {' · '}
                        {new Date(record.createdAt).toLocaleString('zh-CN')}
                      </li>
                    ))}
                  </ul>
                )}
                {usage.recordsTruncated && <p>{t.latestTaskUsage}</p>}
              </section>
            )}
            {error && <p role="alert">{error}</p>}
            <button
              onClick={() => {
                ++detailSequence.current;
                setDetail(undefined);
              }}
            >
              {t.close}
            </button>
          </>
        )}
      </dialog>
      <dialog
        ref={folderDialog}
        className="files-dialog"
        aria-label={t.newFolder}
        onCancel={() => setNewFolder(false)}
      >
        <label>
          {t.folderName}
          <input
            value={folderName}
            maxLength={240}
            onChange={(e) => setFolderName(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !folderName.trim()}
          onClick={() =>
            void run(async () => {
              await command('folders.create', {
                name: folderName,
                parentId: folderId || null,
                owner,
              });
              setNewFolder(false);
            })
          }
        >
          {t.save}
        </button>
        <button onClick={() => setNewFolder(false)}>{t.cancel}</button>
      </dialog>
      <dialog
        ref={removeDialog}
        className="files-dialog"
        aria-label={t.confirmDelete}
        onCancel={() => setRemove(undefined)}
      >
        <h2>{t.confirmDelete}</h2>
        <p>{t.retention}</p>
        <p>
          {t.affected}：
          {impact
            .map(
              (f) =>
                `${f.name} (${(remove === 'unlink' ? [owner] : f.owners).map(ownerLabel).join(' · ')})`,
            )
            .join(' · ')}
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!remove) return;
              await command(`files.${remove}`, { fileIds: impact.map((f) => f.id), owner });
              setSelected((ids) => ids.filter((id) => !impact.some((f) => f.id === id)));
              setRemove(undefined);
            })
          }
        >
          {t.confirm}
        </button>
        <button disabled={busy} onClick={() => setRemove(undefined)}>
          {t.cancel}
        </button>
      </dialog>
    </section>
  );
}
