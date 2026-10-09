import { useEffect, useState, useRef } from 'react';
import {
  SessionDetailsSchema,
  ChatMaterialsViewSchema,
  DeletePreviewSchema,
  BranchChangeSchema,
  type ChatMessage,
  type Selection,
  type ChatSnapshot,
  type SessionDetails,
} from '@tapkit/contracts';
import { historyCommand } from './history-ui';
import { requestOptions } from './desktop-state';
import h from '../locales/history.zh-CN.json';
export function SessionTools({
  sessionId,
  snapshot,
  onChanged,
  onNavigate,
  onDetails,
  exportRequested,
  personalization,
}: {
  sessionId: string;
  snapshot?: ChatSnapshot | undefined;
  onChanged: () => Promise<void>;
  onNavigate: (path: string) => void;
  onDetails: (value: SessionDetails) => void;
  exportRequested: boolean;
  personalization: boolean;
}) {
  const [details, setDetails] = useState<ReturnType<typeof SessionDetailsSchema.parse>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [share, setShare] = useState<string>();
  const [materials, setMaterials] = useState<string[]>([]);
  const lastUser = snapshot?.messages.filter((m) => m.role === 'user').at(-1);
  useEffect(() => {
    let alive = true;
    setMaterials([]);
    if (lastUser?.attachments.length)
      void window.tapkit
        .chatCommand(requestOptions(), 'inputs.references', {
          sessionId,
          refs: lastUser.attachments,
        })
        .then((reply) => {
          if (alive && reply.ok)
            setMaterials(ChatMaterialsViewSchema.parse(reply.data).materials.map((m) => m.name));
        })
        .catch(() => {
          if (alive) setMaterials([h.materialUnavailable]);
        });
    return () => {
      alive = false;
    };
  }, [sessionId, lastUser?.id]);
  useEffect(() => {
    let alive = true;
    void historyCommand('sessions.get', { sessionId })
      .then((v) => {
        if (alive) {
          const d = SessionDetailsSchema.parse(v);
          setDetails(d);
          onDetails(d);
        }
      })
      .catch(() => {
        if (alive) setError(h.failed);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, snapshot?.eventSeq]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
      const current = SessionDetailsSchema.parse(
        await historyCommand('sessions.get', { sessionId }),
      );
      setDetails(current);
      onDetails(current);
      window.dispatchEvent(new Event('tapkit:history-changed'));
    } catch {
      setError(h.failed);
    } finally {
      setBusy(false);
    }
  }
  async function prepareExport() {
    let cursor: string | undefined;
    const messages: ChatMessage[] = [];
    do {
      const reply = await window.tapkit.chatCommand(requestOptions(), 'messages.list', {
        sessionId,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      if (!reply.ok) throw new Error(reply.error.code);
      const page = reply.data as ChatSnapshot;
      messages.unshift(...page.messages);
      cursor = page.nextCursor ?? undefined;
      if (messages.length > 1000) throw new Error('FILE_TOO_LARGE');
    } while (cursor);
    setShare(
      '# ' +
        details!.session.title +
        '\n\n' +
        messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => '## ' + (m.role === 'user' ? '用户' : 'TapKit') + '\n\n' + m.text)
          .join('\n\n'),
    );
  }
  const exported = useRef(false);
  useEffect(() => {
    if (exportRequested && details && !details.session.temporary && !exported.current) {
      exported.current = true;
      void action(prepareExport);
    }
  }, [exportRequested, details?.session.id]);
  return (
    <section className="session-tools">
      {details?.session.temporary && (
        <p role="status">
          {h.temporaryHint}
          <button
            onClick={() =>
              void historyCommand('sessions.closeTemporary', { sessionId })
                .then(() => onNavigate('/'))
                .catch(() => setError(h.failed))
            }
          >
            {h.closeTemporary}
          </button>
        </p>
      )}
      {details && (
        <>
          <label>
            {h.branches}
            <select
              aria-label={h.branches}
              disabled={
                busy ||
                snapshot?.run?.status === 'running' ||
                snapshot?.run?.status === 'waiting_tool'
              }
              value={details.session.branchId}
              onChange={(e) => {
                const branchId = e.target.value;
                void action(async () => {
                  const current = SessionDetailsSchema.parse(
                    await historyCommand('sessions.get', { sessionId }),
                  );
                  await historyCommand(
                    'messages.switchBranch',
                    { sessionId, branchId },
                    current.session.revision,
                  );
                });
              }}
            >
              {details.branches.map((b, i) => (
                <option value={b.id} key={b.id}>
                  {b.label} {i + 1}
                </option>
              ))}
            </select>
          </label>
          {!details.session.temporary && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const current = SessionDetailsSchema.parse(
                      await historyCommand('sessions.get', { sessionId }),
                    );
                    return historyCommand(
                      'sessions.title',
                      { sessionId },
                      current.session.revision,
                    );
                  })
                }
              >
                {h.titleAI}
              </button>
              <button disabled={busy} onClick={() => void action(prepareExport)}>
                {h.share}
              </button>
            </>
          )}
          <details>
            <summary>{h.details}</summary>
            <p>
              {details.session.projectId
                ? h.projectRules + ': ' + (details.projectRules || '—')
                : personalization
                  ? h.personalization
                  : h.personalizationOff}
            </p>
            <p>
              {h.contextTools}:{' '}
              {snapshot?.tools
                .map(
                  (t) =>
                    (
                      ({
                        'files.read': h.toolFiles,
                        'history.search': h.toolHistory,
                        'inputs.list': h.toolInputs,
                        'messages.read': h.toolMessages,
                      }) as Record<string, string>
                    )[t] ?? t,
                )
                .join('、') || '—'}
            </p>
            <p>
              {h.contextFiles}: {materials.join('、') || '—'}
            </p>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {share !== undefined && (
        <div role="dialog" aria-label={h.share}>
          <p>{h.shareHint}</p>
          <textarea readOnly value={share} />
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await window.tapkit.saveConversation({
                  name: (details?.session.title ?? '会话') + '.md',
                  text: share,
                });
                setShare(undefined);
              })
            }
          >
            {h.export}
          </button>
          <button onClick={() => setShare(undefined)}>{h.cancel}</button>
        </div>
      )}
    </section>
  );
}
export function MessageActions({
  sessionId,
  message,
  active,
  selection,
  details,
  onChanged,
  onNavigate,
}: {
  sessionId: string;
  message: ChatMessage;
  active: boolean;
  selection: Selection | null;
  details?: SessionDetails | undefined;
  onChanged: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const [mode, setMode] = useState<'edit' | 'delete' | 'feedback'>(),
    [value, setValue] = useState(message.text),
    [report, setReport] = useState(false),
    [preview, setPreview] = useState<ReturnType<typeof DeletePreviewSchema.parse>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const mark = details?.marks.find((m) => m.messageId === message.id),
    bookmarked = !!mark?.bookmark;
  async function action(work: () => Promise<unknown>, keepModal = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      if (!keepModal) await onChanged();
      if (!keepModal) setMode(undefined);
      window.dispatchEvent(new Event('tapkit:history-changed'));
    } catch {
      setError(h.failed);
    } finally {
      setBusy(false);
    }
  }
  async function mutation(
    command: 'messages.edit' | 'messages.regenerate' | 'messages.delete',
    payload: Record<string, unknown>,
  ) {
    const d = SessionDetailsSchema.parse(await historyCommand('sessions.get', { sessionId }));
    return historyCommand(
      command,
      { sessionId, messageId: message.id, ...payload },
      d.session.revision,
    );
  }
  async function transform(actionName: 'translate' | 'explain' | 'expand' | 'shorten' | 'rewrite') {
    const selection = window.getSelection(),
      article = document.getElementById('message-' + message.id),
      body = article?.querySelector('.chat-markdown,.chat-user-text');
    if (
      !selection ||
      !body ||
      !selection.rangeCount ||
      !body.contains(selection.anchorNode) ||
      !body.contains(selection.focusNode) ||
      !selection.toString()
    ) {
      setError(h.selectionHint);
      return;
    }
    const text = selection.toString(),
      start = message.text.indexOf(text);
    if (start < 0) {
      setError(h.selectionHint);
      return;
    }
    if (message.text.indexOf(text, start + 1) >= 0) {
      setError(h.selectionUnique);
      return;
    }
    await action(() =>
      historyCommand('messages.transform', {
        sessionId,
        messageId: message.id,
        version: message.revision,
        range: { start, end: start + text.length },
        action: actionName,
      }),
    );
  }
  return (
    <div className="message-history-actions">
      {message.role === 'user' && (
        <button
          disabled={active || busy}
          onClick={() => {
            setValue(message.text);
            setMode('edit');
          }}
        >
          {h.editMessage}
        </button>
      )}
      {message.role === 'assistant' && (
        <>
          <button
            disabled={active || busy}
            onClick={() => void action(() => mutation('messages.regenerate', {}))}
          >
            {h.regenerate}
          </button>
          <button
            disabled={active || busy || !selection}
            onClick={() =>
              void action(() => mutation('messages.regenerate', { modelRef: selection }))
            }
          >
            {h.otherModel}
          </button>
        </>
      )}
      <button
        disabled={active || busy || details?.session.temporary}
        onClick={() =>
          void action(async () => {
            const branch = BranchChangeSchema.parse(
              await historyCommand('sessions.fork', {
                sessionId,
                fromMessageId: message.id,
                includeAttachments: true,
              }),
            );
            onNavigate('/sessions/' + branch.sessionId);
          })
        }
      >
        {h.fork}
      </button>
      <button
        disabled={busy}
        onClick={() =>
          void action(async () => {
            await historyCommand('messages.mark', {
              sessionId,
              messageId: message.id,
              bookmark: !bookmarked,
            });
          })
        }
      >
        {bookmarked ? h.unbookmark : h.bookmark}
      </button>
      <button
        disabled={busy || details?.session.temporary}
        onClick={() =>
          void action(() =>
            historyCommand('messages.saveNote', { sessionId, messageId: message.id }),
          )
        }
      >
        {h.saveNote}
      </button>
      {details?.session.projectId && !details.session.temporary && (
        <button
          disabled={busy}
          onClick={() =>
            void action(() =>
              historyCommand('messages.saveNote', {
                sessionId,
                messageId: message.id,
                projectId: details.session.projectId,
              }),
            )
          }
        >
          {h.saveProjectNote}
        </button>
      )}
      {message.role === 'assistant' && (
        <>
          <button
            aria-pressed={mark?.rating === 'up'}
            disabled={busy}
            onClick={() =>
              void action(() =>
                historyCommand('messages.mark', { sessionId, messageId: message.id, rating: 'up' }),
              )
            }
          >
            {h.up}
          </button>
          <button
            aria-pressed={mark?.rating === 'down'}
            disabled={busy}
            onClick={() =>
              void action(() =>
                historyCommand('messages.mark', {
                  sessionId,
                  messageId: message.id,
                  rating: 'down',
                }),
              )
            }
          >
            {h.down}
          </button>
          <button
            onClick={() => {
              setValue('');
              setMode('feedback');
            }}
          >
            {h.feedback}
          </button>
        </>
      )}
      <details>
        <summary>{h.transform}</summary>
        {(['translate', 'explain', 'expand', 'shorten', 'rewrite'] as const).map((v) => (
          <button
            key={v}
            disabled={active || busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void transform(v)}
          >
            {h[v]}
          </button>
        ))}
      </details>
      <button
        disabled={active || busy}
        onClick={() =>
          void action(async () => {
            setPreview(
              DeletePreviewSchema.parse(
                await historyCommand('messages.deletePreview', {
                  sessionId,
                  messageId: message.id,
                }),
              ),
            );
            setMode('delete');
          }, true)
        }
      >
        {h.deleteMessage}
      </button>
      {error && <span role="alert">{error}</span>}
      {mode && (
        <div
          className="message-edit"
          role="dialog"
          aria-label={
            h[mode === 'edit' ? 'editMessage' : mode === 'delete' ? 'deleteMessage' : 'feedback']
          }
        >
          {mode === 'delete' ? (
            <>
              <p>
                {h.deleteHint}
                {preview?.laterCount ?? 0}
              </p>
              <button
                onClick={() =>
                  void action(() => mutation('messages.delete', { descendants: 'branch' }))
                }
              >
                {h.deleteSuffix}
              </button>
              <button
                onClick={() =>
                  void action(() => mutation('messages.delete', { descendants: 'keep-as-note' }))
                }
              >
                {h.deleteNote}
              </button>
            </>
          ) : (
            <>
              <label>
                {mode === 'feedback' ? h.feedbackText : h.editMessage}
                <textarea value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
              {mode === 'feedback' && (
                <label>
                  <input
                    type="checkbox"
                    checked={report}
                    onChange={(e) => setReport(e.target.checked)}
                  />
                  {h.report}
                </label>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    mode === 'edit'
                      ? mutation('messages.edit', { text: value })
                      : historyCommand('messages.mark', {
                          sessionId,
                          messageId: message.id,
                          note: value,
                          report,
                        }),
                  )
                }
              >
                {h.save}
              </button>
            </>
          )}
          <button onClick={() => setMode(undefined)}>{h.cancel}</button>
        </div>
      )}
    </div>
  );
}
