import w from '../locales/work.zh-CN.json';
import { workCommand } from './work-ui';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ActionPopover, IconButton } from './action-popover';
import { UiIcon } from './ui-icon';
import { ChatMarkdown, CopyButton, citationMarkdown } from '@tapkit/ui';
import {
  ChatSnapshotSchema,
  WebOptionsSchema,
  ChatDraftViewSchema,
  ChatSendViewSchema,
  ChatMaterialsViewSchema,
  ChatSnippetsSchema,
  CatalogViewSchema,
  PreviewViewSchema,
  CreatedEntitySchema,
  BranchChangeSchema,
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
import locale from '../locales/zh-CN.json';
import { historyCommand } from './history-ui';
import { SessionTools, MessageActions } from './message-history';
import { SelectionToolbar } from './selection-toolbar';
import { importChatFiles, chatFileOwner, type ChatFileProgress } from './chat-file-import';
import { useViewer } from '../features/viewer/state';
import { ComposerAttachment } from './composer-attachment';
import { InlineFileCard } from '../features/viewer/inline-card';
import { ProjectScopeBar } from './projects-ui';
import { ContextSummary } from './context-summary';
import { MemoryPolicy, MemoryMessage } from './memory-ui';
import { WebControlsDialog, WebSources, WebReferenceButton, webCommand } from './web-ui';
import webLocale from '../locales/web.zh-CN.json';
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
  temporary = false,
  onTemporaryCreated,
  onBusy,
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
  temporary?: boolean;
  onTemporaryCreated?: (id: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const viewer = useViewer();
  const [webOptions, setWebOptions] = useState(WebOptionsSchema.parse({})),
    [webSettingsOpen, setWebSettingsOpen] = useState(false),
    [webPanel, setWebPanel] = useState(false),
    [webSourceId, setWebSourceId] = useState<string>();
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(),
    [text, setText] = useState(seed),
    [refs, setRefs] = useState<ResourceRef[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!sessionId);
  const [catalog, setCatalog] = useState<ReturnType<typeof CatalogViewSchema.parse>>(),
    [selection, setSelection] = useState<Selection | null>(null),
    [defaultSelection, setDefaultSelection] = useState<Selection | null>(null),
    [delivery, setDelivery] = useState<'followup' | 'steer'>('followup');
  const [materials, setMaterials] = useState<ChatMaterial[]>([]),
    [choices, setChoices] = useState<ChatMaterial[]>(),
    [longPaste, setLongPaste] = useState(''),
    [preview, setPreview] = useState<ChatMaterial>();
  const [uploads, setUploads] = useState<
    { file: File; progress: ChatFileProgress; ref?: ResourceRef }[]
  >([]);
  const attachmentSignals = useRef(new Map<File, AbortController>());
  const removedDuringSend = useRef(new Set<string>());
  function importControls(files: File[]) {
    const signals = new Map<File, AbortSignal>();
    for (const file of files) {
      const controller = new AbortController();
      attachmentSignals.current.set(file, controller);
      signals.set(file, controller.signal);
    }
    setUploads(
      files.map((file) => ({
        file,
        progress: { status: 'waiting', readBytes: 0, totalBytes: file.size },
      })),
    );
    return {
      signals,
      onProgress: (file: File, progress: ChatFileProgress) => {
        if (alive.current)
          setUploads((rows) => rows.map((row) => (row.file === file ? { ...row, progress } : row)));
      },
    };
  }
  function imported(file: File, ref: ResourceRef) {
    if (!alive.current) return;
    setUploads((rows) => rows.map((row) => (row.file === file ? { ...row, ref } : row)));
    setPendingFiles((files) => files.filter((item) => item !== file));
  }
  function removeUpload(file: File) {
    attachmentSignals.current.get(file)?.abort();
    setUploads((rows) => rows.filter((row) => row.file !== file));
    setPendingFiles((files) => files.filter((item) => item !== file));
  }
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const createdKind = useRef<string | undefined>(undefined);
  const handedOff = useRef(false);
  const draftLoaded = useRef(!sessionId);
  function openCreated(target: string) {
    if (!alive.current) return;
    handedOff.current = true;
    onCreated(target);
  }
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);
  const fileOperation = useRef<AbortController | undefined>(undefined);
  const sceneEpoch = useRef(0);
  const [historyDetails, setHistoryDetails] = useState<SessionDetails>();
  const [memoryEventSeq, setMemoryEventSeq] = useState(0),
    [memoryPolicySeq, setMemoryPolicySeq] = useState(0);
  const [snippets, setSnippets] = useState<ReturnType<typeof ChatSnippetsSchema.parse>['snippets']>(
    [],
  );
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
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let width = 0;
    const resize = () => {
      input.style.height = '0px';
      input.style.height =
        Math.min(input.scrollHeight, parseFloat(getComputedStyle(input).maxHeight)) + 'px';
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth;
        resize();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [text, inputRef, settings.desktop.zoom]);
  const historyLoaded = useRef(false);
  const shownWindow = useRef({ branchId: snapshot?.branchId, count: 100 });
  shownWindow.current = { branchId: snapshot?.branchId, count: snapshot?.messages.length ?? 100 };
  const active =
    !!snapshot?.run &&
    !['completed', 'partial', 'failed', 'budget_stopped', 'cancelled'].includes(
      snapshot.run.status,
    );
  const snapshotReady = snapshot !== undefined;
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
    draftLoaded.current = !sessionId;
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
        draftLoaded.current = true;
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
      if (!sessionId && createdKind.current === 'temporary' && sid.current && !handedOff.current)
        void historyCommand('sessions.closeTemporary', { sessionId: sid.current }).catch(() => {});
      if (draftLoaded.current && !handedOff.current) void saveDraft().catch(() => {});
    };
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId) setText(seed);
  }, [seed, sessionId]);
  useEffect(() => {
    if (!loaded || !viewer.pendingSelection) return;
    const selected = viewer.pendingSelection;
    // Consume only after the current draft has loaded, so quoted refs cannot be
    // overwritten by an outstanding drafts.get response.
    viewer.consumeSelection();
    if (draft.current.attachments.length >= 20) {
      setError(c.materialLimit);
      return;
    }
    const next = draft.current.attachments.some((ref) => refKey(ref) === refKey(selected.ref))
      ? draft.current.attachments
      : [...draft.current.attachments, selected.ref];
    setRefs(next);
    change(
      [
        draft.current.text,
        selected.selectedText ? '> ' + selected.selectedText.replace(/\n/g, '\n> ') : '',
        selected.note,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    inputRef.current?.focus();
  }, [loaded, viewer.pendingSelection]);
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
    // Start from the loaded snapshot's cursor. Subscribing from zero on every
    // mount replays old chat events and reloads the entire message list per event.
    if (!sid.current || !snapshot) return;
    let stopped = false,
      off: (() => void) | undefined;
    void window.tapkit
      .subscribeEvents(
        requestOptions(),
        { streamId: 'profile', afterSeq: snapshot.eventSeq },
        (event) => {
          if (event.payload.kind === 'memory') setMemoryEventSeq(event.seq);
          if (event.payload.kind === 'settings') setMemoryEventSeq(event.seq);
          if (
            event.payload.kind === 'settings' ||
            (event.payload.kind === 'workspace' && event.payload.entityId === sid.current)
          )
            setMemoryPolicySeq(event.seq);
          if (
            (((event.payload.kind === 'chat' || event.payload.kind === 'memory') &&
              event.payload.sessionId === sid.current) ||
              (event.payload.kind === 'workspace' && event.payload.entityId === sid.current)) &&
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
  }, [sessionId, active, snapshotReady]);
  useEffect(() => {
    const target = sid.current;
    if (!refs.length) {
      setMaterials([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const reply = await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
          ...(target ? { sessionId: target } : {}),
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
    const kind = temporary ? 'temporary' : mode;
    if (sid.current && (sessionId || createdKind.current === kind)) return sid.current;
    if (sid.current && createdKind.current === 'temporary')
      await historyCommand('sessions.closeTemporary', { sessionId: sid.current });
    sid.current = undefined;
    revision.current = 1;
    const epoch = sceneEpoch.current;
    if (temporary) {
      const created = BranchChangeSchema.parse(await historyCommand('sessions.temporary'));
      onTemporaryCreated?.(created.sessionId);
      if (!alive.current || sceneEpoch.current !== epoch) {
        await historyCommand('sessions.closeTemporary', { sessionId: created.sessionId });
        throw new Error('CANCELLED');
      }
      sid.current = created.sessionId;
      createdKind.current = kind;
      return created.sessionId;
    }
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
    createdKind.current = kind;
    return created.entityId;
  }
  async function addFiles(files: File[], removeText?: string) {
    if (!files.length || fileOperation.current || busy) return;
    if (files.length + draft.current.attachments.length + pendingFiles.length > 20) {
      setError(c.materialLimit);
      return;
    }
    if (!sessionId) {
      setPendingFiles((current) => [...current, ...files]);
      if (removeText) change(draft.current.text.replace(removeText, ''));
      return;
    }
    const controller = new AbortController();
    fileOperation.current = controller;
    setBusy(true);
    setError('');
    setUploads([]);
    const epoch = sceneEpoch.current;
    try {
      const target = await ensureSession();
      const result = await importChatFiles(
        window.tapkit,
        files,
        target,
        controller.signal,
        () => {},
        imported,
        importControls(files),
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
      text.length > 100000 ||
      (!text.trim() && !refs.length && !pendingFiles.length)
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
    removedDuringSend.current.clear();
    const current = { text: draft.current.text, attachments: [...draft.current.attachments] };
    const remaining = () =>
      current.attachments.filter((ref) => !removedDuringSend.current.has(refKey(ref)));
    const visibleMaterials = (items: ChatMaterial[]) =>
      items.filter((item) => !removedDuringSend.current.has(refKey(item.ref)));
    try {
      const target = await ensureSession();
      if (pendingFiles.length) {
        const controller = new AbortController();
        fileOperation.current = controller;
        const result = await importChatFiles(
          window.tapkit,
          pendingFiles,
          target,
          controller.signal,
          () => {},
          imported,
          importControls(pendingFiles),
        );
        current.attachments.push(...result.refs);
        setRefs(current.attachments);
        draft.current = { text: draft.current.text, attachments: current.attachments };
        await saveDraft(draft.current);
        if (result.cancelled || result.errors.length) {
          setError(
            result.cancelled
              ? c.importCancelled
              : c.importPartial + ' ' + readableError(new Error(result.errors[0])),
          );
          return;
        }
      }
      current.attachments = remaining();
      await saveDraft({ ...draft.current, attachments: current.attachments });
      if (mode === 'work') {
        await saveTail.current;
        const result = await workCommand('runs.create', {
          sessionId: target,
          goal: current.text,
          refs: current.attachments,
          ...(selection ? { modelRef: selection } : {}),
        });
        if ('work' in result) {
          setText('');
          onDraft('');
          setRefs([]);
          await saveDraft({ text: '', attachments: [] });
          onNavigate?.('/work/' + result.work.runId);
        }
        return;
      }
      // Imports may still be parsing. Keep the draft and let the existing
      // material status/retry flow handle that state instead of losing files.
      if (current.attachments.length) {
        let view = ChatMaterialsViewSchema.parse(
          unwrap(
            await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
              sessionId: target,
              refs: remaining(),
            }),
          ),
        );
        const deadline = Date.now() + 120_000;
        while (
          !sessionId &&
          view.materials.some((item) => item.state === 'parsing' || item.state === 'uploading') &&
          Date.now() < deadline
        ) {
          if (!alive.current || fileOperation.current?.signal.aborted) throw new Error('CANCELLED');
          setMaterials(visibleMaterials(view.materials));
          await new Promise((resolve) => setTimeout(resolve, 500));
          view = ChatMaterialsViewSchema.parse(
            unwrap(
              await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
                sessionId: target,
                refs: remaining(),
              }),
            ),
          );
        }
        if (!alive.current || fileOperation.current?.signal.aborted) throw new Error('CANCELLED');
        setMaterials(visibleMaterials(view.materials));
        if (visibleMaterials(view.materials).some((item) => item.state !== 'ready')) {
          if (!sessionId) openCreated(target);
          return;
        }
      }
      current.attachments = remaining();
      if (!current.text.trim() && !current.attachments.length) return;
      if (!sessionId) await webCommand('web.configure', { sessionId: target, options: webOptions });
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
      if (alive.current && draft.current.text === current.text) {
        setText('');
        onDraft('');
        setRefs([]);
        draft.current = { text: '', attachments: [] };
        await saveDraft(draft.current);
      }
      clientId.current = id();
      sentPayload.current = '';
      if (!sessionId) openCreated(target);
      else if (alive.current) await refresh();
    } catch (e) {
      if (alive.current) setError(readableError(e));
    } finally {
      fileOperation.current = undefined;
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
    (mode === 'work' || !!catalog?.catalog.some((m) => m.status === 'ready')) &&
    text.length <= 100000 &&
    (!!text.trim() || refs.length > 0 || pendingFiles.length > 0) &&
    refs.every((r) => materials.some((m) => refKey(m.ref) === refKey(r) && m.state === 'ready'));
  useEffect(() => {
    let current = true;
    setDefaultSelection(null);
    void window.tapkit
      .modelCommand(requestOptions(), 'models.preview', sessionId ? { sessionId } : {})
      .then((reply) => {
        const preview = PreviewViewSchema.parse(unwrap(reply));
        if (current) setDefaultSelection(preview.candidates[0] ?? preview.effective.selection);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [sessionId, catalog]);
  const effectiveSelection = selection ?? defaultSelection;
  const noModel =
    !!catalog &&
    !catalog.catalog.some((model) => model.accountId && model.status !== 'unconfigured');
  const selectedModel = effectiveSelection
    ? catalog?.catalog.find(
        (m) =>
          m.accountId === effectiveSelection.accountId && m.modelId === effectiveSelection.modelId,
      )
    : undefined;
  const latestFailure = snapshot?.messages.findLast(
    (m) => m.runId === snapshot.run?.id && m.diagnosticCode,
  );
  return (
    <section className="chat-surface" data-session-id={sessionId}>
      <WebControlsDialog
        open={webSettingsOpen}
        onClose={() => setWebSettingsOpen(false)}
        sessionId={sessionId}
        options={webOptions}
        onOptions={setWebOptions}
        eventSeq={Math.max(snapshot?.eventSeq ?? 0, memoryPolicySeq)}
        onSources={() => {
          setWebSourceId(undefined);
          setWebPanel(true);
        }}
      />
      {webPanel && sessionId && (
        <WebSources
          key={sessionId + ':' + (webSourceId ?? 'all')}
          sessionId={sessionId}
          sourceId={webSourceId}
          onClose={() => setWebPanel(false)}
        />
      )}
      {sessionId && (
        <SelectionToolbar
          key={sessionId}
          sessionId={sessionId}
          messages={snapshot?.messages ?? []}
          active={active}
          onChanged={refresh}
        />
      )}
      <div className="conversation-controls">
        {sessionId && (
          <ContextSummary key={sessionId} sessionId={sessionId} onCreated={onCreated} />
        )}
        {sessionId && (
          <MemoryPolicy
            key={'memory-' + sessionId}
            sessionId={sessionId}
            eventSeq={Math.max(memoryEventSeq, memoryPolicySeq)}
          />
        )}
        {sessionId && (
          <ProjectScopeBar
            sessionId={sessionId}
            disabled={
              !!snapshot?.run &&
              ['queued', 'running', 'waiting_tool', 'stopping'].includes(snapshot.run.status)
            }
          />
        )}
        {sessionId && (
          <SessionTools
            sessionId={sessionId}
            eventSeq={Math.max(memoryPolicySeq, memoryEventSeq)}
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
      </div>
      {historyDetails?.session.titleStatus === 'failed' && (
        <small role="status">
          {c.titleFailed}
          {historyDetails.session.titleDiagnosticCode &&
            ' · ' + locale.auth.diagnosticReasons[historyDetails.session.titleDiagnosticCode]}
        </small>
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
                  {message.model?.modelId && message.model.modelId + ' · '}
                  {new Date(message.createdAt).toLocaleTimeString('zh-CN')} ·{' '}
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
                <details open className="answer-body">
                  <summary hidden={message.text.length <= 20000}>展开或收起长回复</summary>
                  <ChatMarkdown
                    text={
                      message.role === 'assistant'
                        ? citationMarkdown(
                            message.text,
                            message.attachments,
                            webLocale.citation,
                            webLocale.unverifiedCitation,
                          )
                        : message.text
                    }
                    streaming={message.status === 'streaming'}
                    onLink={(url) =>
                      void action(async () => {
                        const citation = /^#tapkit-citation-([0-9]{1,2})$/.exec(url);
                        if (!citation) return window.tapkit.openPublicLink(url);
                        const ref = message.attachments[Number(citation[1])];
                        if (ref?.kind === 'web') {
                          setWebSourceId(ref.sourceId);
                          setWebPanel(true);
                        } else if (ref?.kind === 'file' && sid.current) {
                          const owner = await chatFileOwner(window.tapkit, ref, sid.current);
                          await viewer.open({
                            fileId: ref.fileId,
                            versionId: ref.versionId,
                            ...(ref.locator ? { locator: ref.locator } : {}),
                            ...(owner ? { owner } : {}),
                          });
                        }
                      })
                    }
                  />
                </details>
              ) : (
                <p className="chat-user-text">{message.text}</p>
              )}
              <div className="message-footer">
                {!!message.attachments.length && (
                  <ActionPopover
                    icon="file"
                    label={
                      (message.attachments.every((ref) => ref.kind === 'message' && ref.range)
                        ? '所选原文'
                        : '引用来源') +
                      '（' +
                      message.attachments.length +
                      '）'
                    }
                  >
                    <div className="chat-sources">
                      {message.attachments.map((ref, i) =>
                        ref.kind === 'file' && sid.current ? (
                          <InlineFileCard
                            key={i}
                            refValue={ref}
                            sessionId={sid.current}
                            index={i + 1}
                          />
                        ) : ref.kind === 'web' && sid.current ? (
                          <WebReferenceButton
                            key={sid.current + ':' + ref.sourceId}
                            sessionId={sid.current}
                            sourceId={ref.sourceId}
                            onOpen={() => {
                              setWebSourceId(ref.sourceId);
                              setWebPanel(true);
                            }}
                          />
                        ) : (
                          <button
                            key={i}
                            onClick={() =>
                              void action(async () => {
                                if (ref.kind === 'web') {
                                  setWebSourceId(ref.sourceId);
                                  setWebPanel(true);
                                  return;
                                }
                                const result = ChatMaterialsViewSchema.parse(
                                  unwrap(
                                    await window.tapkit.chatCommand(
                                      requestOptions(),
                                      'inputs.references',
                                      { sessionId: sid.current, refs: [ref] },
                                    ),
                                  ),
                                );
                                if (ref.kind === 'file' && sid.current) {
                                  const owner = await chatFileOwner(
                                    window.tapkit,
                                    ref,
                                    sid.current,
                                  );
                                  await viewer.open({
                                    fileId: ref.fileId,
                                    versionId: ref.versionId,
                                    ...(ref.locator ? { locator: ref.locator } : {}),
                                    ...(owner ? { owner } : {}),
                                  });
                                } else setPreview(result.materials[0]);
                              })
                            }
                          >
                            {ref.kind === 'message'
                              ? ref.range
                                ? '所选原文'
                                : '引用消息'
                              : '引用资料'}{' '}
                            {i + 1}
                          </button>
                        ),
                      )}
                    </div>
                  </ActionPopover>
                )}
                {message.errorCode && (
                  <p role="status">
                    {c.errors[message.errorCode as keyof typeof c.errors] ?? message.errorCode}
                    {message.diagnosticCode &&
                      ' · ' + locale.auth.diagnosticReasons[message.diagnosticCode]}
                  </p>
                )}
                {sessionId && message.role !== 'tool' && (
                  <MemoryMessage
                    sessionId={sessionId}
                    messageId={message.id}
                    eventSeq={memoryEventSeq}
                    policySeq={memoryPolicySeq}
                    role={message.role}
                  />
                )}
                {message.role !== 'tool' && (
                  <div className="message-actions">
                    <CopyButton label={c.copy} text={message.text} />
                    <IconButton
                      icon="quote"
                      label={c.quote}
                      disabled={message.status === 'streaming' || message.status === 'queued'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void quote(message)}
                    />
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
              </div>
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
          {c.progress}：{c.statuses[snapshot.run.status]} · 模型回合 {snapshot.run.calls} ·{' '}
          {c.attempts} {snapshot.run.attempts}
          {!!snapshot.run.retries && (
            <>
              {' '}
              · {c.retries} {snapshot.run.retries}
            </>
          )}{' '}
          · 只读工具 {snapshot.run.tools} ·{' '}
          {snapshot.run.startedAt
            ? Math.max(
                0,
                Math.round(((snapshot.run.endedAt ?? Date.now()) - snapshot.run.startedAt) / 1000),
              )
            : 0}
          秒 · 用量
          {snapshot.run.usage.state === 'pending'
            ? '待结算'
            : (snapshot.run.usage.state === 'actual' ? '实际' : c.estimated) +
              ' ' +
              snapshot.run.usage.tokens +
              ' tokens'}
          {snapshot.run.usage.state === 'estimated' && <p>{c.estimatedHint}</p>}
          {latestFailure?.diagnosticCode && (
            <p>
              {c.latestFailure}：{locale.auth.diagnosticReasons[latestFailure.diagnosticCode]}
            </p>
          )}
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
              <span className="action-group">
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
              </span>
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
          <span className="action-group">
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
          </span>
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
        <textarea
          id="draft-input"
          aria-label={c.draft}
          ref={inputRef}
          disabled={!loaded}
          value={text}
          rows={2}
          placeholder={noModel ? '请先配置模型再使用...' : '写下你的问题...'}
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
        {longPaste && (
          <div role="status">
            <p>{c.longPaste}</p>
            <span className="action-group">
              <button
                onClick={() => {
                  const pasted = longPaste;
                  void addFiles(
                    [new File([pasted], '粘贴内容.txt', { type: 'text/plain' })],
                    pasted,
                  );
                  setLongPaste('');
                }}
              >
                {c.convert}
              </button>
              <button onClick={() => setLongPaste('')}>{c.keepText}</button>
            </span>
          </div>
        )}
        <div className="chat-materials composer-attachments" aria-label="已选附件">
          {[
            ...pendingFiles,
            ...uploads.map((row) => row.file).filter((file) => !pendingFiles.includes(file)),
          ].map((file, index) => {
            const row = uploads.find((row) => row.file === file);
            if (row?.ref && materials.some((m) => refKey(m.ref) === refKey(row.ref!))) return null;
            const state = row?.progress;
            const status = !state
              ? '待上传'
              : state.status === 'reading'
                ? '上传中' +
                  (state.totalBytes
                    ? ' ' +
                      Math.min(100, Math.floor((state.readBytes / state.totalBytes) * 100)) +
                      '%'
                    : '')
                : state.status === 'imported'
                  ? '读取中'
                  : state.status === 'failed'
                    ? readableError(new Error(state.errorCode ?? 'INTERNAL_ERROR'))
                    : state.status === 'cancelled'
                      ? '已取消'
                      : '等待上传';
            return (
              <ComposerAttachment
                key={index}
                name={file.name}
                size={file.size}
                status={status}
                working={!!state && ['waiting', 'reading'].includes(state.status)}
                onRemove={() => removeUpload(file)}
              />
            );
          })}
          {materials.map((m) => (
            <ComposerAttachment
              key={refKey(m.ref)}
              name={m.name}
              size={uploads.find((row) => row.ref && refKey(row.ref) === refKey(m.ref))?.file.size}
              status={c.materialStates[m.state]}
              working={m.state === 'uploading' || m.state === 'parsing'}
              onRemove={() => {
                removedDuringSend.current.add(refKey(m.ref));
                const next = draft.current.attachments.filter(
                  (ref) => refKey(ref) !== refKey(m.ref),
                );
                draft.current = { ...draft.current, attachments: next };
                setRefs(next);
                void saveDraft(draft.current).catch((e) => setError(readableError(e)));
                setMaterials((current) =>
                  current.filter((material) => refKey(material.ref) !== refKey(m.ref)),
                );
                setUploads((rows) =>
                  rows.filter((row) => !row.ref || refKey(row.ref) !== refKey(m.ref)),
                );
              }}
              onPreview={() =>
                void action(async () => {
                  if (m.ref.kind !== 'file' || !sid.current) {
                    setPreview(m);
                    return;
                  }
                  const owner = await chatFileOwner(window.tapkit, m.ref, sid.current);
                  await viewer.open({
                    fileId: m.ref.fileId,
                    versionId: m.ref.versionId,
                    ...(m.ref.locator ? { locator: m.ref.locator } : {}),
                    ...(owner ? { owner } : {}),
                  });
                })
              }
              onDownload={
                m.ref.kind !== 'file'
                  ? undefined
                  : () =>
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
              onRetry={
                m.ref.kind !== 'file' || m.state !== 'failed'
                  ? undefined
                  : () =>
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
            />
          ))}
        </div>
        <div className="composer-bar">
          <IconButton
            icon="search"
            label={webLocale.title + '：' + webLocale.modes[webOptions.mode]}
            onClick={() => setWebSettingsOpen(true)}
          />
          <ActionPopover label="添加附件或引用资料" icon="plus" className="composer-add">
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
                  const result = ChatMaterialsViewSchema.parse(
                    unwrap(
                      await window.tapkit.chatCommand(
                        requestOptions(),
                        'inputs.references',
                        sessionId ? { sessionId } : {},
                      ),
                    ),
                  );
                  setChoices(result.materials);
                })
              }
            >
              @ {c.refs}
            </button>
          </ActionPopover>
          <ActionPopover
            label={c.inputInfo}
            icon="info"
            className="composer-info"
            trigger={
              <>
                <UiIcon name="info" />
                <span>{c.inputInfo}</span>
              </>
            }
          >
            <p>
              {text.length.toLocaleString('zh-CN')} / 100,000 · {c.limit}
            </p>
            <p>
              本轮工具：
              {mode === 'chat' && selectedModel?.toolCalls === 'documented'
                ? c.readTools
                : c.noTools}
            </p>
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
          </ActionPopover>
          {noModel ? (
            <button
              className="composer-model-settings"
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('tapkit:connect-model'))}
            >
              设置模型
              <UiIcon name="chevronDown" />
            </button>
          ) : (
            <ActionPopover
              label="本轮模型"
              className="composer-model"
              trigger={
                <>
                  <span>{selectedModel?.modelId ?? c.connect}</span>
                  <UiIcon name="chevronDown" />
                </>
              }
            >
              <button aria-pressed={!selection} onClick={() => setSelection(null)}>
                {c.automatic}
              </button>
              {catalog?.catalog
                .filter((m) => m.accountId)
                .map((m) => (
                  <button
                    key={m.accountId + '|' + m.modelId}
                    disabled={m.status !== 'ready'}
                    aria-pressed={
                      selection?.accountId === m.accountId && selection?.modelId === m.modelId
                    }
                    onClick={() => setSelection({ accountId: m.accountId!, modelId: m.modelId })}
                  >
                    {m.providerId} · {m.modelId}
                  </button>
                ))}
            </ActionPopover>
          )}
          <button
            className="send-button icon-button"
            aria-label={busy ? c.sending : mode === 'work' ? w.create : c.send}
            disabled={!canSend}
            onClick={() => void send()}
            data-tooltip={
              mode === 'work'
                ? c.workPending
                : !catalog?.catalog.some((m) => m.status === 'ready')
                  ? c.connect
                  : c.send
            }
          >
            <UiIcon name="arrow" />
          </button>
        </div>
      </section>
      {error && (
        <div role="alert">
          {error}
          <span className="action-group">
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
          </span>
        </div>
      )}
      {choices && (
        <div role="dialog" aria-label="引用资料">
          <p>仅引用本轮选中的内容；智能体、插件和项目解析尚未开放。</p>
          {choices.map((m) => (
            <button
              key={refKey(m.ref)}
              disabled={refs.length + pendingFiles.length >= 20}
              onClick={() => {
                if (!refs.some((r) => refKey(r) === refKey(m.ref))) {
                  setRefs([...refs, m.ref]);
                  if (!sessionId) setMaterials((items) => [...items, m]);
                }
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
        <div
          role="dialog"
          aria-label={preview.ref.kind === 'message' && preview.ref.range ? '所选原文' : '材料预览'}
        >
          <h3>{preview.ref.kind === 'message' && preview.ref.range ? '所选原文' : preview.name}</h3>
          <p>
            {preview.source} · {c.materialStates[preview.state]}
          </p>
          <pre>{preview.text ?? c.disabledMedia}</pre>
          <span className="action-group">
            {preview.text && (
              <button onClick={() => quoteMaterial(preview)}>仅引用选中的文本</button>
            )}
            <button onClick={() => setPreview(undefined)}>{c.cancel}</button>
          </span>
        </div>
      )}
    </section>
  );
}
