import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChatMarkdown } from '@tapkit/ui';
import {
  ChatSnapshotSchema,
  ChatDraftViewSchema,
  ChatSendViewSchema,
  ChatMaterialsViewSchema,
  ChatSnippetsSchema,
  CatalogViewSchema,
  CreatedEntitySchema,
  type ChatSnapshot,
  type SessionDetails,
  type ChatMaterial,
  type ResourceRef,
  type SettingsValues,
  type Selection,
  type Reply,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import c from '../locales/chat.zh-CN.json';
import h from '../locales/history.zh-CN.json';
import { historyCommand } from './history-ui';
import { SessionTools, MessageActions } from './message-history';
import { importChatFiles, chatFileOwner, type ChatImportView } from './chat-file-import';
const unwrap = (reply: Reply) => {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
};
const id = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)),
    time = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[5 - i] = Number((time >> BigInt(i * 8)) & 255n);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
const refKey = (ref: ResourceRef) => JSON.stringify(ref);
export function ChatSurface({
  sessionId,
  mode,
  seed = '',
  settings,
  inputRef,
  onCreated,
  onDraft,
  onMode,
  onNew,
  targetMessageId,
  exportRequested = false,
  onNavigate,
}: {
  sessionId?: string | undefined;
  mode: 'chat' | 'work';
  seed?: string;
  settings: SettingsValues;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onCreated: (id: string) => void;
  onDraft: (value: string) => void;
  onMode: (mode: 'chat' | 'work') => void;
  onNew: () => void;
  targetMessageId?: string | undefined;
  exportRequested?: boolean;
  onNavigate?: ((path: string) => void) | undefined;
}) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(),
    [text, setText] = useState(seed),
    [refs, setRefs] = useState<ResourceRef[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!sessionId),
    [expanded, setExpanded] = useState(false);
  const [catalog, setCatalog] = useState<ReturnType<typeof CatalogViewSchema.parse>>(),
    [selection, setSelection] = useState<Selection | null>(null),
    [delivery, setDelivery] = useState<'followup' | 'steer'>('followup');
  const [materials, setMaterials] = useState<ChatMaterial[]>([]),
    [choices, setChoices] = useState<ChatMaterial[]>(),
    [longPaste, setLongPaste] = useState(''),
    [preview, setPreview] = useState<ChatMaterial>();
  const [fileImport, setFileImport] = useState<ChatImportView>();
  const fileOperation = useRef<AbortController | undefined>(undefined);
  const sceneEpoch = useRef(0);
  const [historyDetails, setHistoryDetails] = useState<SessionDetails>();
  const [snippets, setSnippets] = useState<ReturnType<typeof ChatSnippetsSchema.parse>['snippets']>(
      [],
    ),
    [snippetName, setSnippetName] = useState(''),
    [snippetText, setSnippetText] = useState('');
  const [editing, setEditing] = useState<{
      id: string;
      text: string;
      revision: number;
      attachments: ResourceRef[];
    }>(),
    [unread, setUnread] = useState(false);
  const revision = useRef(1),
    draft = useRef({ text: seed, attachments: [] as ResourceRef[] }),
    saveTail = useRef<Promise<unknown>>(Promise.resolve()),
    clientId = useRef(id()),
    sentPayload = useRef('');
  const alive = useRef(true),
    sid = useRef(sessionId),
    list = useRef<HTMLDivElement>(null),
    following = useRef(true),
    upload = useRef<HTMLInputElement>(null),
    undo = useRef<string[]>([]),
    redo = useRef<string[]>([]);
  const historyLoaded = useRef(false);
  const shownWindow = useRef({ branchId: snapshot?.branchId, count: 100 });
  shownWindow.current = { branchId: snapshot?.branchId, count: snapshot?.messages.length ?? 100 };
  const active =
    !!snapshot?.run &&
    !['completed', 'partial', 'failed', 'budget_stopped', 'cancelled'].includes(
      snapshot.run.status,
    );
  draft.current = { text, attachments: refs };
  const readableError = (e: unknown) =>
    c.errors[(e instanceof Error ? e.message : 'INTERNAL_ERROR') as keyof typeof c.errors] ??
    c.errors.INTERNAL_ERROR;
  function change(value: string, track = true) {
    if (track) {
      undo.current.push(draft.current.text);
      if (undo.current.length > 100) undo.current.shift();
      redo.current = [];
    }
    setText(value);
    onDraft(value);
    if (value !== draft.current.text) {
      clientId.current = id();
      sentPayload.current = '';
    }
  }
  async function refresh() {
    if (!sid.current) return;
    let next = ChatSnapshotSchema.parse(
      unwrap(
        await window.tapkit.chatCommand(requestOptions(), 'messages.list', {
          sessionId: sid.current,
          limit: 100,
        }),
      ),
    );
    if (historyLoaded.current && shownWindow.current.branchId === next.branchId) {
      const rows = [...next.messages];
      let page = next;
      while (page.nextCursor && rows.length < shownWindow.current.count) {
        page = ChatSnapshotSchema.parse(
          unwrap(
            await window.tapkit.chatCommand(requestOptions(), 'messages.list', {
              sessionId: sid.current,
              limit: 100,
              cursor: page.nextCursor,
            }),
          ),
        );
        if (page.branchId !== next.branchId) return;
        rows.unshift(...page.messages);
      }
      next = { ...next, messages: rows, nextCursor: page.nextCursor };
    }
    if (!alive.current) return;
    setSnapshot((previous) => {
      if (previous && previous.eventSeq > next.eventSeq) return previous;
      if (
        !following.current &&
        (next.messages.at(-1)?.id !== previous?.messages.at(-1)?.id ||
          next.messages.at(-1)?.status === 'streaming')
      )
        setUnread(true);
      if (previous && previous.branchId !== next.branchId) {
        historyLoaded.current = false;
        return next;
      }
      return next;
    });
    if (following.current)
      requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
  }
  function saveDraft(value = draft.current) {
    const target = sid.current;
    if (!target) return Promise.resolve();
    const copy = { text: value.text, attachments: [...value.attachments] };
    const work = saveTail.current
      .catch(() => {})
      .then(async () => {
        const result = ChatDraftViewSchema.parse(
          unwrap(
            await window.tapkit.chatCommand(requestOptions(revision.current), 'drafts.save', {
              sessionId: target,
              windowId: window.tapkit.windowSlot,
              ...copy,
            }),
          ),
        );
        revision.current = result.revision;
      });
    saveTail.current = work;
    return work;
  }
  useEffect(() => {
    alive.current = true;
    sid.current = sessionId;
    revision.current = 1;
    void window.tapkit
      .modelCommand(requestOptions(), 'models.catalog', {})
      .then((reply) => {
        if (alive.current) setCatalog(CatalogViewSchema.parse(unwrap(reply)));
      })
      .catch(() => {});
    void window.tapkit
      .chatCommand(requestOptions(), 'chat.snippets.get', {})
      .then((reply) => {
        if (alive.current) setSnippets(ChatSnippetsSchema.parse(unwrap(reply)).snippets);
      })
      .catch(() => {});
    if (sessionId) {
      void (async () => {
        const d = ChatDraftViewSchema.parse(
          unwrap(
            await window.tapkit.chatCommand(requestOptions(), 'drafts.get', {
              sessionId,
              windowId: window.tapkit.windowSlot,
            }),
          ),
        );
        if (!alive.current) return;
        revision.current = d.revision;
        setText(d.text);
        setRefs(d.attachments);
        setLoaded(true);
        await refresh();
      })().catch((e) => {
        if (alive.current) setError(readableError(e));
      });
    }
    return () => {
      sceneEpoch.current++;
      alive.current = false;
      fileOperation.current?.abort();
      void saveDraft().catch(() => {});
    };
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId) setText(seed);
  }, [seed, sessionId]);
  useEffect(() => {
    if (sessionId && snapshot && following.current)
      void historyCommand('sessions.read', { sessionId }).catch(() => {});
  }, [sessionId, snapshot?.messages.at(-1)?.id, snapshot?.messages.at(-1)?.status]);
  useEffect(() => {
    if (!targetMessageId || !snapshot || snapshot.messages.some((m) => m.id === targetMessageId)) {
      if (targetMessageId && snapshot?.messages.some((m) => m.id === targetMessageId)) {
        following.current = false;
        requestAnimationFrame(() =>
          document
            .getElementById('message-' + targetMessageId)
            ?.scrollIntoView({ block: 'center' }),
        );
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      let page = snapshot;
      const rows = [...page.messages];
      while (page.nextCursor && !rows.some((m) => m.id === targetMessageId)) {
        page = ChatSnapshotSchema.parse(
          unwrap(
            await window.tapkit.chatCommand(requestOptions(), 'messages.list', {
              sessionId: sid.current,
              cursor: page.nextCursor,
              limit: 100,
            }),
          ),
        );
        rows.unshift(...page.messages);
      }
      if (cancelled) return;
      following.current = false;
      historyLoaded.current = true;
      shownWindow.current = { branchId: page.branchId, count: rows.length };
      setSnapshot((current) =>
        current ? { ...current, messages: rows, nextCursor: page.nextCursor } : current,
      );
      if (!rows.some((m) => m.id === targetMessageId)) setError(c.errors.INTERNAL_ERROR);
      else
        requestAnimationFrame(() =>
          document
            .getElementById('message-' + targetMessageId)
            ?.scrollIntoView({ block: 'center' }),
        );
    })().catch((e) => {
      if (!cancelled) setError(readableError(e));
    });
    return () => {
      cancelled = true;
    };
  }, [targetMessageId, snapshot?.branchId]);
  useEffect(() => {
    if (!loaded || !sid.current) return;
    const timer = setTimeout(
      () =>
        void saveDraft().catch((e) => {
          if (alive.current)
            setError(
              e instanceof Error && e.message === 'CONFLICT' ? c.draftConflict : readableError(e),
            );
        }),
      180,
    );
    return () => clearTimeout(timer);
  }, [text, refs, loaded]);
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = Math.min(expanded ? 500 : 180, Math.max(66, input.scrollHeight)) + 'px';
    }
  }, [text, expanded]);
  useEffect(() => {
    if (!sid.current) return;
    let stopped = false,
      off: (() => void) | undefined;
    void window.tapkit
      .subscribeEvents(
        requestOptions(),
        { streamId: 'profile', afterSeq: snapshot?.eventSeq ?? 0 },
        (event) => {
          if (
            event.payload.kind === 'chat' &&
            event.payload.sessionId === sid.current &&
            event.type !== 'draft.updated'
          )
            void refresh().catch(() => {});
        },
      )
      .then((fn) => {
        if (stopped) fn();
        else off = fn;
      })
      .catch(() => {});
    const timer = setInterval(() => {
      if (active) void refresh().catch(() => {});
    }, 500);
    return () => {
      stopped = true;
      off?.();
      clearInterval(timer);
    };
  }, [sessionId, active]);
  useEffect(() => {
    const target = sid.current;
    if (!target || !refs.length) {
      setMaterials([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const reply = await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
          sessionId: target,
          refs,
        });
        if (!alive.current || cancelled) return;
        const next = ChatMaterialsViewSchema.parse(unwrap(reply)).materials;
        setMaterials(next);
        if (next.some((m) => m.state === 'uploading' || m.state === 'parsing'))
          timer = setTimeout(() => void read(), 500);
      } catch (e) {
        if (alive.current && !cancelled) setError(readableError(e));
      }
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refs, sessionId]);
  async function ensureSession() {
    if (sid.current) return sid.current;
    const epoch = sceneEpoch.current;
    const created = CreatedEntitySchema.parse(
      unwrap(
        await window.tapkit.desktopCommand(requestOptions(), 'sessions.create', {
          mode,
          title: mode === 'chat' ? '新聊天' : '新工作',
        }),
      ),
    );
    if (!alive.current || sceneEpoch.current !== epoch) throw new Error('CANCELLED');
    sid.current = created.entityId;
    return created.entityId;
  }
  async function addFiles(files: File[], removeText?: string) {
    if (!files.length || fileOperation.current || busy) return;
    if (files.length + draft.current.attachments.length > 20) {
      setError(c.materialLimit);
      return;
    }
    const controller = new AbortController();
    fileOperation.current = controller;
    setBusy(true);
    setError('');
    setFileImport(undefined);
    const epoch = sceneEpoch.current;
    try {
      const target = await ensureSession();
      const result = await importChatFiles(
        window.tapkit,
        files,
        target,
        controller.signal,
        (view) => {
          if (alive.current && sid.current === target) setFileImport(view);
        },
      );
      if (result.refs.length) {
        // Serialize with pending draft writes. After navigation, append to the
        // original session's latest draft with CAS, never to the new session.
        const work = saveTail.current
          .catch(() => {})
          .then(async () => {
            const current = alive.current && sid.current === target;
            const saved = current
              ? undefined
              : ChatDraftViewSchema.parse(
                  unwrap(
                    await window.tapkit.chatCommand(requestOptions(), 'drafts.get', {
                      sessionId: target,
                      windowId: window.tapkit.windowSlot,
                    }),
                  ),
                );
            const source = saved ?? draft.current;
            const next = [...source.attachments];
            for (const ref of result.refs)
              if (!next.some((existing) => refKey(existing) === refKey(ref))) next.push(ref);
            if (next.length > 20) throw new Error('FILE_TOO_LARGE');
            const nextText =
              removeText && !result.cancelled && !result.errors.length
                ? source.text.replace(removeText, '')
                : source.text;
            if (current) {
              draft.current = { text: nextText, attachments: next };
              setRefs(next);
              if (removeText) change(nextText);
            }
            const persisted = ChatDraftViewSchema.parse(
              unwrap(
                await window.tapkit.chatCommand(
                  requestOptions(saved?.revision ?? revision.current),
                  'drafts.save',
                  {
                    sessionId: target,
                    windowId: window.tapkit.windowSlot,
                    text: nextText,
                    attachments: next,
                  },
                ),
              ),
            );
            if (alive.current && sid.current === target) revision.current = persisted.revision;
          });
        saveTail.current = work;
        await work;
      }
      if (alive.current && sid.current === target) {
        if (result.errors.length)
          setError(c.importPartial + ' ' + readableError(new Error(result.errors[0])));
        else if (result.cancelled) setError(c.importCancelled);
        if (!sessionId && result.refs.length) onCreated(target);
      }
    } catch (e) {
      if (alive.current && sceneEpoch.current === epoch) setError(readableError(e));
    } finally {
      if (fileOperation.current === controller) fileOperation.current = undefined;
      if (alive.current) setBusy(false);
    }
  }
  async function send() {
    if (
      busy ||
      fileOperation.current ||
      mode !== 'chat' ||
      text.length > 100000 ||
      (!text.trim() && !refs.length)
    )
      return;
    if (text.trim() === '/help') {
      setError(c.commands);
      return;
    }
    if (text.trim() === '/new') {
      onNew();
      return;
    }
    if (text.trim() === '/work') {
      onMode('work');
      change('');
      return;
    }
    const snippet = snippets.find((s) => text.trim() === '/' + s.name);
    if (snippet) {
      change(snippet.text);
      return;
    }
    setBusy(true);
    setError('');
    const current = { text: draft.current.text, attachments: [...draft.current.attachments] };
    try {
      const target = await ensureSession();
      await saveDraft(current);
      const payload = {
        sessionId: target,
        clientMessageId: clientId.current,
        text: current.text,
        attachments: current.attachments,
        mode: 'chat' as const,
        delivery,
        ...(selection ? { modelRef: selection } : {}),
      };
      const fingerprint = JSON.stringify({ ...payload, clientMessageId: null });
      if (sentPayload.current && sentPayload.current !== fingerprint) clientId.current = id();
      payload.clientMessageId = clientId.current;
      sentPayload.current = fingerprint;
      ChatSendViewSchema.parse(
        unwrap(await window.tapkit.chatCommand(requestOptions(), 'messages.send', payload)),
      );
      // Clear only the acknowledged draft. Typing during the request remains intact.
      if (draft.current.text === current.text) {
        setText('');
        onDraft('');
        setRefs([]);
        draft.current = { text: '', attachments: [] };
        await saveDraft(draft.current);
      }
      clientId.current = id();
      sentPayload.current = '';
      if (!sessionId) onCreated(target);
      else await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(work: () => Promise<unknown>) {
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(readableError(e));
    }
  }
  async function quote(message: ChatSnapshot['messages'][number]) {
    const selected = window.getSelection()?.toString(),
      start = selected ? message.text.indexOf(selected) : -1;
    const ref: ResourceRef = {
      kind: 'message',
      sessionId: sid.current!,
      messageId: message.id,
      version: message.revision,
      ...(start >= 0 ? { range: { start, end: start + selected!.length } } : {}),
    };
    if (refs.length >= 20) return;
    setRefs([...refs, ref]);
    inputRef.current?.focus();
  }
  function quoteMaterial(material: ChatMaterial) {
    const selected = window.getSelection()?.toString(),
      start = selected && material.text ? material.text.indexOf(selected) : -1;
    if (!selected || start < 0) {
      setError('请先选中预览中的文本');
      return;
    }
    let ref = material.ref;
    if (ref.kind === 'file') {
      const offset = ref.locator?.kind === 'text' ? ref.locator.start : 0;
      ref = {
        ...ref,
        locator: { kind: 'text', start: offset + start, end: offset + start + selected.length },
      };
    } else if (ref.kind === 'message') {
      const offset = ref.range?.start ?? 0;
      ref = { ...ref, range: { start: offset + start, end: offset + start + selected.length } };
    } else return;
    setRefs(refs.map((r) => (refKey(r) === refKey(material.ref) ? ref : r)));
    setPreview(undefined);
  }
  const canSend =
    loaded &&
    !busy &&
    mode === 'chat' &&
    !!catalog?.catalog.some((m) => m.status === 'ready') &&
    text.length <= 100000 &&
    (!!text.trim() || refs.length > 0) &&
    refs.every((r) => materials.some((m) => refKey(m.ref) === refKey(r) && m.state === 'ready'));
  const selectedModel = selection
    ? catalog?.catalog.find(
        (m) => m.accountId === selection.accountId && m.modelId === selection.modelId,
      )
    : catalog?.catalog.find((m) => m.status === 'ready');
  return (
    <section className="chat-surface" data-session-id={sessionId}>
      {sessionId && (
        <SessionTools
          sessionId={sessionId}
          snapshot={snapshot}
          onDetails={setHistoryDetails}
          exportRequested={exportRequested}
          personalization={settings.personalization.enabled}
          onChanged={refresh}
          onNavigate={
            onNavigate ??
            ((path) => {
              if (path === '/') onNew();
              else onCreated(path.split('/')[2]!.split('?')[0]!);
            })
          }
        />
      )}
      {snapshot && (
        <div
          className="chat-messages"
          ref={list}
          onScroll={(e) => {
            const node = e.currentTarget;
            following.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 80;
            if (following.current) {
              setUnread(false);
            }
          }}
        >
          {snapshot.nextCursor && (
            <button
              onClick={() =>
                void (async () => {
                  try {
                    const older = ChatSnapshotSchema.parse(
                      unwrap(
                        await window.tapkit.chatCommand(requestOptions(), 'messages.list', {
                          sessionId: sid.current,
                          cursor: snapshot.nextCursor,
                        }),
                      ),
                    );
                    historyLoaded.current = true;
                    shownWindow.current = {
                      branchId: older.branchId,
                      count: shownWindow.current.count + older.messages.length,
                    };
                    setSnapshot((current) =>
                      current
                        ? {
                            ...current,
                            nextCursor: older.nextCursor,
                            messages: [
                              ...older.messages.filter(
                                (m) => !current.messages.some((n) => n.id === m.id),
                              ),
                              ...current.messages,
                            ],
                          }
                        : older,
                    );
                  } catch (e) {
                    setError(readableError(e));
                  }
                })()
              }
            >
              {c.more}
            </button>
          )}
          {!snapshot.messages.length && <p>{c.noMessages}</p>}
          {snapshot.messages.map((message) => (
            <article
              className={
                'chat-message ' +
                message.role +
                (message.id === targetMessageId ? ' located-message' : '')
              }
              key={message.id}
              id={'message-' + message.id}
            >
              <header>
                <strong>
                  {message.role === 'user' ? '你' : message.role === 'tool' ? c.process : 'TapKit'}
                </strong>
                <small>
                  {[
                    catalog?.catalog.find(
                      (m) =>
                        m.accountId === message.model?.accountId &&
                        m.modelId === message.model?.modelId,
                    )?.providerId,
                    message.model?.modelId,
                  ]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  · {new Date(message.createdAt).toLocaleTimeString('zh-CN')} ·{' '}
                  {message.status === 'streaming'
                    ? '正在回答'
                    : message.status === 'final'
                      ? c.sent
                      : message.status === 'queued'
                        ? c.queued
                        : message.status === 'interrupted'
                          ? c.interrupted
                          : message.status === 'cancelled'
                            ? '已取消'
                            : c.failed}
                </small>
              </header>
              {historyDetails && message.sourceProjectId !== historyDetails.session.projectId && (
                <small>
                  {h.sourceProject}:{' '}
                  {message.sourceProjectName ??
                    (message.sourceProjectId ? h.otherProject : h.projectNone)}
                </small>
              )}
              {message.role === 'tool' ? (
                <details>
                  <summary>{c.process}</summary>
                  <pre>{message.text}</pre>
                </details>
              ) : message.role === 'assistant' ? (
                <details open>
                  <summary>{message.text.length > 20000 ? '展开或收起长回复' : '回复正文'}</summary>
                  <ChatMarkdown
                    text={message.text}
                    streaming={message.status === 'streaming'}
                    onLink={(url) =>
                      void window.tapkit
                        .openPublicLink(url)
                        .catch((e) => setError(readableError(e)))
                    }
                  />
                </details>
              ) : (
                <p className="chat-user-text">{message.text}</p>
              )}
              {!!message.attachments.length && (
                <details>
                  <summary>引用资料（{message.attachments.length}）</summary>
                  <div className="chat-sources">
                    {message.attachments.map((ref, i) => (
                      <button
                        key={i}
                        onClick={() =>
                          void action(async () => {
                            const result = ChatMaterialsViewSchema.parse(
                              unwrap(
                                await window.tapkit.chatCommand(
                                  requestOptions(),
                                  'inputs.references',
                                  { sessionId: sid.current, refs: [ref] },
                                ),
                              ),
                            );
                            setPreview(result.materials[0]);
                          })
                        }
                      >
                        引用资料 {i + 1}
                      </button>
                    ))}
                  </div>
                </details>
              )}
              {message.errorCode && (
                <p role="status">
                  {c.errors[message.errorCode as keyof typeof c.errors] ?? message.errorCode}
                </p>
              )}
              {message.role !== 'tool' && (
                <div className="message-actions">
                  {sessionId && (
                    <MessageActions
                      details={historyDetails}
                      sessionId={sessionId}
                      message={message}
                      active={active}
                      selection={selection}
                      onChanged={refresh}
                      onNavigate={(path) => onCreated(path.split('/')[2]!)}
                    />
                  )}
                  <button onClick={() => void navigator.clipboard.writeText(message.text)}>
                    {c.copy}
                  </button>
                  <button
                    disabled={message.status === 'streaming' || message.status === 'queued'}
                    onClick={() => void quote(message)}
                  >
                    {c.quote}
                  </button>
                  {['failed', 'interrupted'].includes(message.status) && (
                    <button
                      onClick={() => {
                        const user = snapshot.messages.find(
                          (m) => m.role === 'user' && m.runId === message.runId,
                        );
                        if (user) {
                          change(user.text);
                          setRefs(user.attachments);
                          inputRef.current?.focus();
                        }
                      }}
                    >
                      {c.retry}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {unread && (
        <button
          className="chat-latest"
          onClick={() => {
            following.current = true;
            setUnread(false);
            list.current?.scrollTo({ top: list.current.scrollHeight });
          }}
        >
          {c.unread} · {c.latest}
        </button>
      )}
      {snapshot?.run && (
        <div className="chat-progress" role="status">
          {c.progress}：{c.statuses[snapshot.run.status]} · 模型回合 {snapshot.run.calls} · 只读工具{' '}
          {snapshot.run.tools} ·{' '}
          {snapshot.run.startedAt
            ? Math.max(
                0,
                Math.round(((snapshot.run.endedAt ?? Date.now()) - snapshot.run.startedAt) / 1000),
              )
            : 0}
          秒 · 用量
          {snapshot.run.usage.state === 'pending'
            ? '待结算'
            : (snapshot.run.usage.state === 'actual' ? '实际' : '估计') +
              ' ' +
              snapshot.run.usage.tokens +
              ' tokens'}
          {active && (
            <button
              onClick={() =>
                void action(() =>
                  window.tapkit
                    .chatCommand(requestOptions(), 'runs.cancel', { runId: snapshot.run!.id })
                    .then(unwrap),
                )
              }
            >
              {c.stop}
            </button>
          )}
          {snapshot.run.errorCode && (
            <span>
              {c.errors[snapshot.run.errorCode as keyof typeof c.errors] ?? snapshot.run.errorCode}
            </span>
          )}
        </div>
      )}
      {!!snapshot?.pending.length && (
        <details open className="chat-queue">
          <summary>
            {c.queue}（{snapshot.pending.length}）
          </summary>
          {snapshot.pending.map((p) => (
            <div key={p.id}>
              <span>{p.text.slice(0, 120)}</span>
              <button onClick={() => setEditing({ ...p })}>{c.edit}</button>
              <button
                onClick={() =>
                  void action(() =>
                    window.tapkit
                      .chatCommand(requestOptions(p.revision), 'inputs.cancel', { inputId: p.id })
                      .then(unwrap),
                  )
                }
              >
                {c.cancel}
              </button>
            </div>
          ))}
        </details>
      )}
      {editing && (
        <div role="dialog" aria-label="编辑排队消息">
          <textarea
            aria-label="排队消息内容"
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
          />
          <button
            onClick={() =>
              void action(async () => {
                unwrap(
                  await window.tapkit.chatCommand(
                    requestOptions(editing.revision),
                    'inputs.update',
                    { inputId: editing.id, text: editing.text, attachments: editing.attachments },
                  ),
                );
                setEditing(undefined);
              })
            }
          >
            {c.save}
          </button>
          <button onClick={() => setEditing(undefined)}>{c.cancel}</button>
        </div>
      )}
      <section
        className="composer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles([...e.dataTransfer.files]);
        }}
      >
        <label htmlFor="draft-input">{c.draft}</label>
        <textarea
          id="draft-input"
          ref={inputRef}
          disabled={!loaded}
          value={text}
          rows={3}
          placeholder="写下你的问题…"
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              (settings.desktop.enterSends ? !e.ctrlKey : e.ctrlKey)
            ) {
              e.preventDefault();
              void send();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              const previous = undo.current.pop();
              if (previous !== undefined) {
                redo.current.push(text);
                change(previous, false);
              }
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              const next = redo.current.pop();
              if (next !== undefined) {
                undo.current.push(text);
                change(next, false);
              }
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void addFiles([...e.clipboardData.files]);
              return;
            }
            let value = e.clipboardData.getData('text/plain');
            if (!value && e.clipboardData.getData('text/html')) {
              const html = e.clipboardData
                .getData('text/html')
                .replace(
                  /<(script|style|iframe|object|embed|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
                  '',
                )
                .replace(
                  /<\/?(?:script|style|iframe|object|embed|video|audio|img|link|source|base)\b[^>]*>/gi,
                  '',
                );
              const doc = new DOMParser().parseFromString(html, 'text/html');
              doc
                .querySelectorAll('table')
                .forEach((table) =>
                  table.replaceWith(
                    doc.createTextNode(
                      [...table.rows]
                        .map((r) => [...r.cells].map((cell) => cell.textContent).join('\t'))
                        .join('\n'),
                    ),
                  ),
                );
              value = doc.body.textContent ?? '';
            }
            if (value) {
              e.preventDefault();
              const start = e.currentTarget.selectionStart,
                end = e.currentTarget.selectionEnd;
              change(text.slice(0, start) + value + text.slice(end));
              if (value.length > 20000) setLongPaste(value);
            }
          }}
        />
        <small>
          {text.length.toLocaleString('zh-CN')} / 100,000 · {c.limit}
        </small>
        <small>
          本轮工具：
          {mode === 'chat' && selectedModel?.toolCalls === 'documented' ? c.readTools : c.noTools}
        </small>
        {longPaste && (
          <div role="status">
            <p>{c.longPaste}</p>
            <button
              onClick={() => {
                const pasted = longPaste;
                void addFiles([new File([pasted], '粘贴内容.txt', { type: 'text/plain' })], pasted);
                setLongPaste('');
              }}
            >
              {c.convert}
            </button>
            <button onClick={() => setLongPaste('')}>{c.keepText}</button>
          </div>
        )}
        <div className="chat-materials">
          {materials.map((m, i) => (
            <div key={refKey(m.ref)}>
              <span>
                {m.name} · {m.source} · {c.materialStates[m.state]}
              </span>
              <button onClick={() => setPreview(m)}>{c.preview}</button>
              {m.ref.kind === 'file' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (m.ref.kind !== 'file' || !sid.current) return;
                      const owner = await chatFileOwner(window.tapkit, m.ref, sid.current);
                      unwrap(
                        await window.tapkit.saveOriginal({
                          fileId: m.ref.fileId,
                          versionId: m.ref.versionId,
                          ...(owner ? { owner } : {}),
                        }),
                      );
                    })
                  }
                >
                  {c.downloadOriginal}
                </button>
              )}
              {m.ref.kind === 'file' && m.state === 'failed' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (m.ref.kind !== 'file') return;
                      unwrap(
                        await window.tapkit.fileCommand(requestOptions(), 'files.retryParse', {
                          fileVersionId: m.ref.versionId,
                        }),
                      );
                      setRefs([...draft.current.attachments]);
                    })
                  }
                >
                  {c.retryRead}
                </button>
              )}
              <button disabled={busy} onClick={() => setRefs(refs.filter((_, j) => i !== j))}>
                {m.state === 'unsupported' ? c.keepOriginal : c.remove}
              </button>
            </div>
          ))}
        </div>
        {materials.some((m) => m.state !== 'ready') && <p>{c.materialPending}</p>}
        {fileImport && (
          <section aria-label={c.importProgress}>
            <p>{c.importOriginal}</p>
            {fileImport.items.map((item) => (
              <div key={item.token}>
                {item.name} · {c.importStates[item.status]} · {item.readBytes}/{item.totalBytes}
                {item.errorCode && <span> · {readableError(new Error(item.errorCode))}</span>}
              </div>
            ))}
          </section>
        )}
        {fileOperation.current && (
          <button onClick={() => fileOperation.current?.abort()}>{c.cancelImport}</button>
        )}
        <div className="composer-bar">
          <label>
            模式
            <select
              value={mode}
              onChange={(e) => onMode(e.target.value as 'chat' | 'work')}
              disabled={!!sessionId}
            >
              <option value="chat">聊天</option>
              <option value="work">工作</option>
            </select>
          </label>
          <label>
            {c.model}
            <select
              aria-label="本轮模型"
              value={selection ? selection.accountId + '|' + selection.modelId : ''}
              onChange={(e) => {
                const [accountId, modelId] = e.target.value.split('|');
                setSelection(accountId && modelId ? { accountId, modelId } : null);
              }}
            >
              <option value="">{c.automatic}</option>
              {catalog?.catalog
                .filter((m) => m.accountId)
                .map((m) => (
                  <option
                    key={m.accountId + '|' + m.modelId}
                    disabled={m.status !== 'ready'}
                    value={m.accountId + '|' + m.modelId}
                  >
                    {m.providerId} · {m.modelId}
                  </option>
                ))}
            </select>
          </label>
          <button onClick={() => upload.current?.click()} disabled={busy}>
            {c.attach}
          </button>
          <input
            hidden
            ref={upload}
            type="file"
            multiple
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <button
            onClick={() =>
              void action(async () => {
                const target = await ensureSession();
                const result = ChatMaterialsViewSchema.parse(
                  unwrap(
                    await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
                      sessionId: target,
                    }),
                  ),
                );
                setChoices(result.materials);
              })
            }
          >
            @ {c.refs}
          </button>
          <button onClick={() => setExpanded(!expanded)}>{expanded ? c.collapse : c.expand}</button>
          <button onClick={() => change('')}>{c.clear}</button>
          {active && (
            <label>
              {c.delivery}
              <select
                value={delivery}
                onChange={(e) => setDelivery(e.target.value as 'followup' | 'steer')}
              >
                <option value="followup">{c.followup}</option>
                <option value="steer">{c.steer}</option>
              </select>
            </label>
          )}
          <button
            disabled={!canSend}
            onClick={() => void send()}
            title={!catalog?.catalog.some((m) => m.status === 'ready') ? c.connect : ''}
          >
            {busy ? c.sending : c.send}
          </button>
          {!catalog?.catalog.some((m) => m.status === 'ready') && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('tapkit:connect-model'));
              }}
            >
              {c.connect}
            </a>
          )}
        </div>
        {mode === 'work' && <p>{c.workPending}</p>}
        {!historyDetails?.session.temporary && (
          <details>
            <summary>{c.snippets}</summary>
            <p>{c.commands}</p>
            {snippets.map((s) => (
              <div key={s.id}>
                <button onClick={() => change(s.text)}>{s.name}</button>
                <button
                  onClick={() =>
                    void action(async () => {
                      const next = snippets.filter((v) => v.id !== s.id);
                      unwrap(
                        await window.tapkit.chatCommand(requestOptions(), 'chat.snippets.set', {
                          snippets: next,
                        }),
                      );
                      setSnippets(next);
                    })
                  }
                >
                  {c.deleteSnippet}
                </button>
              </div>
            ))}
            <label>
              {c.snippetName}
              <input
                value={snippetName}
                maxLength={80}
                onChange={(e) => setSnippetName(e.target.value)}
              />
            </label>
            <label>
              {c.snippetText}
              <textarea
                value={snippetText}
                maxLength={8000}
                onChange={(e) => setSnippetText(e.target.value)}
              />
            </label>
            <button
              disabled={!snippetName.trim() || !snippetText || snippets.length >= 100}
              onClick={() =>
                void action(async () => {
                  const next = [...snippets, { id: id(), name: snippetName, text: snippetText }];
                  unwrap(
                    await window.tapkit.chatCommand(requestOptions(), 'chat.snippets.set', {
                      snippets: next,
                    }),
                  );
                  setSnippets(next);
                  setSnippetName('');
                  setSnippetText('');
                })
              }
            >
              {c.saveSnippet}
            </button>
          </details>
        )}
      </section>
      {error && (
        <div role="alert">
          {error}
          <button onClick={() => void action(refresh)}>{c.refresh}</button>
          {error === c.draftConflict && (
            <button
              onClick={() =>
                void action(async () => {
                  const d = ChatDraftViewSchema.parse(
                    unwrap(
                      await window.tapkit.chatCommand(requestOptions(), 'drafts.get', {
                        sessionId: sid.current,
                        windowId: window.tapkit.windowSlot,
                      }),
                    ),
                  );
                  revision.current = d.revision;
                  setText(d.text);
                  setRefs(d.attachments);
                })
              }
            >
              {c.reloadDraft}
            </button>
          )}
        </div>
      )}
      {choices && (
        <div role="dialog" aria-label="引用资料">
          <p>仅引用本轮选中的内容；智能体、插件和项目解析尚未开放。</p>
          {choices.map((m) => (
            <button
              key={refKey(m.ref)}
              disabled={refs.length >= 20}
              onClick={() => {
                if (!refs.some((r) => refKey(r) === refKey(m.ref))) setRefs([...refs, m.ref]);
                setChoices(undefined);
              }}
            >
              {m.name} · {m.source} · {c.materialStates[m.state]}
            </button>
          ))}
          <button onClick={() => setChoices(undefined)}>{c.cancel}</button>
        </div>
      )}
      {preview && (
        <div role="dialog" aria-label="材料预览">
          <h3>{preview.name}</h3>
          <p>
            {preview.source} · {c.materialStates[preview.state]}
          </p>
          <pre>{preview.text ?? c.disabledMedia}</pre>
          {preview.text && <button onClick={() => quoteMaterial(preview)}>仅引用选中的文本</button>}
          <button onClick={() => setPreview(undefined)}>{c.cancel}</button>
        </div>
      )}
    </section>
  );
}
