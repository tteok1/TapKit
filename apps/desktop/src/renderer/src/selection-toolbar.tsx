import { CopyButton } from '@tapkit/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@tapkit/contracts';
import { historyCommand } from './history-ui';
import h from '../locales/history.zh-CN.json';

const operations = ['translate', 'explain', 'expand', 'shorten', 'rewrite'] as const;
type Operation = (typeof operations)[number];
type Target = { message: ChatMessage; range: Range; x: number; y: number };

export function SelectionToolbar({
  sessionId,
  messages,
  active,
  onChanged,
}: {
  sessionId: string;
  messages: ChatMessage[];
  active: boolean;
  onChanged: () => Promise<void>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef({ messages, active });
  latest.current = { messages, active };
  const [target, setTarget] = useState<Target>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let dragging = false;
    let canSelect = false;
    let readFrame = 0;
    const hide = () => {
      cancelAnimationFrame(readFrame);
      readFrame = 0;
      setTarget(undefined);
    };
    const read = (point?: { x: number; y: number }) => {
      const selected = window.getSelection();
      if (
        latest.current.active ||
        document.activeElement?.closest('input,textarea,select,[contenteditable="true"]') ||
        !selected?.rangeCount ||
        selected.isCollapsed ||
        !selected.toString().trim()
      ) {
        hide();
        return;
      }
      const nativeRange = selected.getRangeAt(0);
      const surface = panel.current?.closest<HTMLElement>('.chat-surface');
      let body: Element | undefined;
      let messageRange: Range | undefined;
      // Chromium can place a drag endpoint in surrounding layout whitespace.
      // Accept that only when ALL selected text still belongs to one message body.
      for (const candidate of surface?.querySelectorAll('.chat-markdown,.chat-user-text') ?? []) {
        if (!nativeRange.intersectsNode(candidate)) continue;
        const contents = document.createRange();
        contents.selectNodeContents(candidate);
        const clipped = nativeRange.cloneRange();
        if (clipped.compareBoundaryPoints(Range.START_TO_START, contents) < 0)
          clipped.setStart(contents.startContainer, contents.startOffset);
        if (clipped.compareBoundaryPoints(Range.END_TO_END, contents) > 0)
          clipped.setEnd(contents.endContainer, contents.endOffset);
        const contained =
          candidate.contains(nativeRange.startContainer) &&
          candidate.contains(nativeRange.endContainer);
        // Selection.toString excludes nonselectable UI; Range.toString does not.
        // Ignore only layout whitespace for this eligibility check. The saved
        // Range and transform source retain their exact, unnormalized text.
        if (
          !clipped.collapsed &&
          (contained ||
            clipped.toString().replace(/\s/g, '') === selected.toString().replace(/\s/g, ''))
        ) {
          body = candidate;
          messageRange = clipped;
          break;
        }
      }
      const article = body?.closest<HTMLElement>('.chat-message');
      const message = latest.current.messages.find((m) => article?.id === 'message-' + m.id);
      if (
        !body ||
        !messageRange ||
        surface?.dataset.sessionId !== sessionId ||
        !message ||
        message.role === 'tool' ||
        ['streaming', 'queued'].includes(message.status)
      ) {
        hide();
        return;
      }
      const range = messageRange;
      const rects = range.getClientRects();
      const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hide();
        return;
      }
      setTarget((previous) => {
        // A late selectionchange must not move a mouse-anchored toolbar away
        // from the release point when the actual range has not changed.
        if (
          !point &&
          previous?.range.startContainer === range.startContainer &&
          previous.range.startOffset === range.startOffset &&
          previous.range.endContainer === range.endContainer &&
          previous.range.endOffset === range.endOffset
        )
          return previous;
        return {
          message,
          range: range.cloneRange(),
          x: point?.x ?? rect.right,
          y: point?.y ?? rect.bottom,
        };
      });
    };
    const scheduleRead = (point?: { x: number; y: number }) => {
      cancelAnimationFrame(readFrame);
      readFrame = requestAnimationFrame(() => {
        readFrame = 0;
        read(point);
      });
    };
    const down = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      dragging = true;
      const element = event.target instanceof Element ? event.target : null;
      canSelect =
        event.button === 0 &&
        !element?.closest('button,a,input,textarea,select,[contenteditable="true"]');
      hide();
    };
    const up = (event: PointerEvent) => {
      dragging = false;
      const fromSelectionGesture = canSelect;
      canSelect = false;
      if (panel.current?.contains(event.target as Node)) return;
      // Neither pointer endpoint has to hit a glyph or its containing body.
      // Read the final native selection after default selection/drag-scroll work.
      if (fromSelectionGesture) scheduleRead({ x: event.clientX, y: event.clientY });
      else hide();
    };
    const changed = () => {
      if (!dragging && !readFrame && !panel.current?.contains(document.activeElement))
        scheduleRead();
    };
    const scroll = (event: Event) => {
      if (dragging || readFrame) return;
      if (event.target instanceof Node) {
        if (panel.current?.contains(event.target)) return;
        const anchor = window.getSelection()?.anchorNode;
        if (anchor && !event.target.contains(anchor)) return;
      }
      hide();
    };
    const cancel = () => {
      dragging = false;
      canSelect = false;
      hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('selectionchange', changed);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', hide);
    return () => {
      cancelAnimationFrame(readFrame);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('selectionchange', changed);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [sessionId]);
  useEffect(() => {
    if (active) setTarget(undefined);
  }, [active]);
  useLayoutEffect(() => {
    const popup = panel.current!;
    if (!target) {
      if (popup.matches(':popover-open')) popup.hidePopover();
      return;
    }
    popup.showPopover();
    const rect = popup.getBoundingClientRect();
    const scale = rect.width / popup.offsetWidth || 1;
    popup.style.left =
      Math.max(8, Math.min(target.x + 8, innerWidth - rect.width - 8)) / scale + 'px';
    const top =
      target.y + rect.height + 20 <= innerHeight ? target.y + 12 : target.y - rect.height - 12;
    popup.style.top = Math.max(8, Math.min(top, innerHeight - rect.height - 8)) / scale + 'px';
  }, [target]);
  async function transform(operation: Operation) {
    if (!target || active || busy) return;
    const selected = target;
    setTarget(undefined);
    setError('');
    const article = document.getElementById('message-' + selected.message.id);
    const body = article?.querySelector('.chat-markdown,.chat-user-text');
    const text = selected.range.toString();
    if (
      !body?.contains(selected.range.startContainer) ||
      !body.contains(selected.range.endContainer) ||
      !text
    ) {
      setError(h.selectionHint);
      return;
    }
    const start = selected.message.text.indexOf(text);
    if (start < 0) {
      setError(h.selectionHint);
      return;
    }
    if (selected.message.text.indexOf(text, start + 1) >= 0) {
      setError(h.selectionUnique);
      return;
    }
    setBusy(true);
    try {
      await historyCommand('messages.transform', {
        sessionId,
        messageId: selected.message.id,
        version: selected.message.revision,
        range: { start, end: start + text.length },
        action: operation,
      });
      await onChanged();
      window.dispatchEvent(new Event('tapkit:history-changed'));
    } catch {
      setError(h.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        ref={panel}
        popover="manual"
        role="toolbar"
        aria-label="选区操作"
        className="selection-toolbar"
        onMouseDown={(event) => event.preventDefault()}
      >
        {target && <CopyButton label="复制选区" text={() => target.range.toString()} />}
        {operations.map((operation) => (
          <button
            key={operation}
            disabled={active || busy}
            data-tooltip={h[operation]}
            onClick={() => void transform(operation)}
          >
            {h[operation]}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
