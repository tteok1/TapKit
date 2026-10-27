import { useEffect, useRef, useState } from 'react';
import {
  ExportReplySchema,
  ExportOptionsSchema,
  type ExportTarget,
  type ExportOptions,
  type ExportPreviewSchema,
  type ExportStatusSchema,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import t from '../locales/export.zh-CN.json';
const readable = (error: unknown) =>
  t.errors[(error instanceof Error ? error.message : 'INTERNAL_ERROR') as keyof typeof t.errors] ??
  t.errors.INTERNAL_ERROR;
const statusLabel = (status: z.infer<typeof ExportStatusSchema>) =>
  status.errorCode === 'SIDE_EFFECT_UNKNOWN' ? t.unknownState : t.states[status.state];
async function command(name: Parameters<typeof window.tapkit.exportCommand>[1], payload: unknown) {
  const reply = await window.tapkit.exportCommand(requestOptions(), name, payload);
  if (!reply.ok) throw new Error(reply.error.code);
  return ExportReplySchema.parse(reply.data);
}
export function ExportButton({ target }: { target: ExportTarget }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {target.kind === 'outputs' ? t.outputs : t.title}
      </button>
      {open && <ExportDialog target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
export function ExportDialog({ target, onClose }: { target: ExportTarget; onClose: () => void }) {
  const baseKey = JSON.stringify(target),
    dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0),
    alive = useRef(true);
  const [options, setOptions] = useState<ExportOptions>(() =>
      ExportOptionsSchema.parse(
        target.kind === 'files' || target.kind === 'outputs'
          ? { format: 'zip', includeAttachments: true }
          : {},
      ),
    ),
    [selected, setSelected] = useState<string[]>(),
    [preview, setPreview] = useState<z.infer<typeof ExportPreviewSchema>>(),
    [messages, setMessages] = useState<z.infer<typeof ExportPreviewSchema>['messages']>([]),
    [history, setHistory] = useState<z.infer<typeof ExportStatusSchema>[]>([]),
    [status, setStatus] = useState<z.infer<typeof ExportStatusSchema>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [signature, setSignature] = useState('');
  const effective =
    target.kind === 'session' && selected ? { ...target, messageIds: selected } : target;
  const currentSignature = JSON.stringify({ target: effective, options });
  const running = !!status && ['queued', 'running'].includes(status.state);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      generation.current++;
      dialog.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  async function refresh() {
    if (selected?.length === 0) {
      setError(t.empty);
      return;
    }
    const sequence = ++generation.current;
    setBusy(true);
    setError('');
    setStatus(undefined);
    try {
      const result = await command('exports.preview', { target: effective, options });
      if (alive.current && sequence === generation.current && 'exportPreview' in result) {
        setPreview(result.exportPreview);
        setSignature(currentSignature);
        if (!messages.length) setMessages(result.exportPreview.messages);
      }
    } catch (e) {
      if (alive.current && sequence === generation.current) setError(readable(e));
    } finally {
      if (alive.current && sequence === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    let active = true;
    void command('exports.recent', { target })
      .then((result) => {
        if (active && 'exportHistory' in result) setHistory(result.exportHistory);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [baseKey]);
  useEffect(() => {
    if (!running || !status) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void command('exports.status', { exportId: status.exportId })
        .then((result) => {
          if (!cancelled && 'exportStatus' in result) {
            setStatus(result.exportStatus);
            if (result.exportStatus.errorCode)
              setError(readable(new Error(result.exportStatus.errorCode)));
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(readable(e));
            clearInterval(timer);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status?.exportId, running]);
  async function cancel(close = false) {
    try {
      if (running && status) {
        const result = await command('exports.cancel', { exportId: status.exportId });
        if ('exportStatus' in result) setStatus(result.exportStatus);
      }
      if (close) onClose();
    } catch (e) {
      setError(readable(e));
    }
  }
  return (
    <dialog
      ref={dialog}
      className="export-dialog"
      aria-label={t.title}
      onCancel={(event) => {
        event.preventDefault();
        void cancel(true);
      }}
    >
      <h2>{t.title}</h2>
      <p>{t.hint}</p>
      <p>{t.privacy}</p>
      <fieldset disabled={busy || running}>
        <label>
          {t.format}
          <select
            aria-label={t.format}
            value={options.format}
            onChange={(e) =>
              setOptions({
                ...options,
                format: e.target.value as ExportOptions['format'],
                includeAttachments: e.target.value === 'zip' ? options.includeAttachments : false,
              })
            }
          >
            {['md', 'txt', 'html', 'pdf', 'zip'].map((format) => (
              <option
                value={format}
                key={format}
                disabled={
                  (target.kind === 'files' || target.kind === 'outputs') && format !== 'zip'
                }
              >
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeAttachments}
            disabled={
              options.format !== 'zip' || target.kind === 'files' || target.kind === 'outputs'
            }
            onChange={(e) => setOptions({ ...options, includeAttachments: e.target.checked })}
          />
          {target.kind === 'files' || target.kind === 'outputs' ? t.primaryFiles : t.attachments}
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeSources}
            onChange={(e) => setOptions({ ...options, includeSources: e.target.checked })}
          />
          {t.sources}
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeProcess}
            onChange={(e) => setOptions({ ...options, includeProcess: e.target.checked })}
          />
          {t.process}
        </label>
      </fieldset>
      <small>{t.limits}</small>
      {target.kind === 'session' && !!messages.length && (
        <details>
          <summary>{t.select}</summary>
          <label>
            <input
              type="checkbox"
              checked={!selected || selected.length === messages.length}
              disabled={busy || running}
              onChange={(e) => setSelected(e.target.checked ? undefined : [])}
            />
            {t.all}
          </label>
          <ul>
            {messages.map((message) => (
              <li key={message.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!selected || selected.includes(message.id)}
                    disabled={busy || running}
                    onChange={(e) => {
                      const ids = selected ?? messages.map((m) => m.id);
                      setSelected(
                        e.target.checked
                          ? [...ids, message.id]
                          : ids.filter((id) => id !== message.id),
                      );
                    }}
                  />
                  {message.role === 'user' ? '用户' : 'TapKit'}：{message.text.slice(0, 120)}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button disabled={busy || running || selected?.length === 0} onClick={() => void refresh()}>
        {t.refresh}
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section aria-label={t.preview}>
          <h3>{t.preview}</h3>
          <pre className="export-preview" tabIndex={0}>
            {preview.text}
          </pre>
          <h3>{t.files}</h3>
          {preview.fileNames.length ? (
            <ul>
              {preview.fileNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p>{t.noFiles}</p>
          )}
        </section>
      )}
      {status && (
        <div role="status">
          <p>
            {statusLabel(status)} · {status.name}
          </p>
          <progress aria-label={t.progress} value={status.progress} max={100} />
        </div>
      )}
      {!!history.length && (
        <details>
          <summary>{t.history}</summary>
          <ul>
            {history.map((item) => (
              <li key={item.exportId}>
                {statusLabel(item)} · {item.name}
                {item.errorCode && <p>{readable(new Error(item.errorCode))}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="export-actions">
        <button
          disabled={
            busy || running || !preview || signature !== currentSignature || selected?.length === 0
          }
          onClick={() => {
            if (!preview) return;
            setBusy(true);
            setError('');
            void window.tapkit
              .saveExport(preview.previewId, preview.snapshotVersion)
              .then((reply) => {
                if (!reply) return;
                if (!reply.ok) throw new Error(reply.error.code);
                const result = ExportReplySchema.parse(reply.data);
                if ('exportStatus' in result) setStatus(result.exportStatus);
              })
              .catch((e) => setError(readable(e)))
              .finally(() => setBusy(false));
          }}
        >
          {t.save}
        </button>
        {running && <button onClick={() => void cancel()}>{t.cancel}</button>}
        {status?.state === 'completed' && (
          <button
            onClick={() =>
              void window.tapkit
                .openExportFolder(status.exportId)
                .catch((e) => setError(readable(e)))
            }
          >
            {t.openFolder}
          </button>
        )}
        {status?.errorCode === 'SIDE_EFFECT_UNKNOWN' && (
          <button
            onClick={() =>
              void window.tapkit
                .openExportFolder(status.exportId)
                .catch((e) => setError(readable(e)))
            }
          >
            {t.checkFolder}
          </button>
        )}
        <button disabled={busy} onClick={() => void cancel(true)}>
          {t.close}
        </button>
      </div>
    </dialog>
  );
}
