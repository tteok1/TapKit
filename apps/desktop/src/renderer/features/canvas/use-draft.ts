import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CanvasContentSchema,
  CanvasTitleSchema,
  IdSchema,
  z,
  type CanvasContent,
  type CanvasView,
} from '@tapkit/contracts';
import { canvasCommand } from './api';
import { requestOptions } from '../../src/desktop-state';

const Draft = z.strictObject({
  title: z.string().max(240),
  content: CanvasContentSchema,
  documentId: IdSchema,
  baseVersion: IdSchema,
  revision: z.number().int().positive(),
  requestId: IdSchema,
});
type Draft = z.infer<typeof Draft>;

function readDraft(key: string) {
  try {
    const saved = Draft.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
    return saved.success ? saved.data : undefined;
  } catch {
    return undefined;
  }
}

export function useCanvasDraft(initial: CanvasView) {
  const key = 'tapkit.canvas.draft.' + window.tapkit.windowSlot + '.' + initial.documentId;
  const [recovered] = useState(() => readDraft(key));
  const [view, setView] = useState(initial);
  const head = useRef(initial);
  const [title, setTitle] = useState(recovered?.title ?? initial.title);
  const [status, setStatus] = useState(recovered ? '已恢复本机草稿' : '已保存');
  const [conflict, setConflict] = useState(
    !!recovered && recovered.documentId !== initial.documentId,
  );
  const [dirty, setDirty] = useState(!!recovered);
  const pending = useRef<Draft | undefined>(recovered);
  const saving = useRef<Promise<CanvasView> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function persist(draft: Draft | undefined) {
    try {
      if (draft) localStorage.setItem(key, JSON.stringify(draft));
      else localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  const updateHead = useCallback((next: CanvasView) => {
    head.current = next;
    setView(next);
  }, []);

  const flush = useCallback(
    async function flush(): Promise<CanvasView> {
      clearTimeout(timer.current);
      if (saving.current) {
        await saving.current;
        return flush();
      }
      const draft = pending.current;
      if (!draft) return head.current;
      setStatus('正在保存…');
      const job = (async () => {
        try {
          CanvasTitleSchema.parse(draft.title);
          CanvasContentSchema.parse(draft.content);
          const { requestId, ...payload } = draft;
          const result = await canvasCommand('canvas.save', payload, { requestId });
          if (!('canvas' in result)) throw Error('INTERNAL_ERROR');
          updateHead(result.canvas);
          if ('conflict' in result && result.conflict) setConflict(true);
          if (pending.current === draft) pending.current = undefined;
          else if (pending.current)
            pending.current = {
              ...pending.current,
              documentId: result.canvas.documentId,
              baseVersion: result.canvas.versionId,
              revision: result.canvas.revision,
            };
          persist(pending.current);
          setDirty(!!pending.current);
          setStatus(pending.current ? '有未保存的修改' : '已保存');
          return result.canvas;
        } catch (error) {
          setStatus(
            persist(pending.current) ? '保存失败，已保留本机草稿' : '保存失败，草稿仍在此窗口',
          );
          throw error;
        }
      })();
      saving.current = job;
      try {
        return await job;
      } finally {
        saving.current = undefined;
      }
    },
    [key, updateHead],
  );

  function edit(nextTitle: string, content: CanvasContent) {
    const baseVersion = pending.current?.baseVersion ?? head.current.versionId;
    const revision = pending.current?.revision ?? head.current.revision;
    pending.current = {
      title: nextTitle,
      content,
      documentId: pending.current?.documentId ?? head.current.documentId,
      baseVersion,
      revision,
      ...requestOptions(),
    };
    setTitle(nextTitle);
    setDirty(true);
    setStatus(persist(pending.current) ? '有未保存的修改' : '有未保存的修改，无法写入本机草稿');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 500);
  }

  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    view,
    title,
    status,
    conflict,
    dirty,
    flush,
    edit,
    updateHead,
    setTitle,
    content: recovered?.content ?? initial.content,
  };
}
