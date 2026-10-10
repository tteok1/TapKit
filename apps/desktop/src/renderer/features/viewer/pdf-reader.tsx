import { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  AnnotationMode,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { AnnotationView, Locator } from '@tapkit/contracts';
import t from '../../locales/viewer.zh-CN.json';

GlobalWorkerOptions.workerSrc = workerUrl;
type Rect = NonNullable<Extract<Locator, { kind: 'pdf' }>['rects']>[number];
export type Picked = {
  text: string;
  rects: Rect[];
  items?: {
    first: number;
    last: number;
    start: number;
    end: number;
    firstText: string;
    lastText: string;
  };
};
function PageCanvas({
  document,
  pageIndex,
  zoom,
  thumbnail = false,
  annotations = [],
  boxSelect = false,
  onSelect,
  onError,
}: {
  document: PDFDocumentProxy;
  pageIndex: number;
  zoom: number;
  thumbnail?: boolean;
  annotations?: AnnotationView[];
  boxSelect?: boolean;
  onSelect?: (picked: Picked) => void;
  onError?: (error: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 }),
    [drag, setDrag] = useState<{ x: number; y: number; endX: number; endY: number }>();
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const items = useRef<{ div: HTMLElement; index: number; text: string }[]>([]),
    failure = useRef(onError);
  failure.current = onError;
  useEffect(() => {
    let disposed = false,
      render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined,
      layer: TextLayer | undefined;
    void document
      .getPage(pageIndex + 1)
      .then(async (page) => {
        if (disposed || !canvas.current || !text.current) return;
        const viewport = page.getViewport({ scale: thumbnail ? 0.13 : zoom });
        if (viewport.width * viewport.height > 32_000_000) throw new Error('OUTPUT_LIMIT_REACHED');
        setSize({ width: viewport.width, height: viewport.height });
        const target = canvas.current;
        delete target.dataset.renderedPage;
        items.current = [];
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const context = target.getContext('2d');
        if (!context) throw new Error('PARSE_FAILED');
        render = page.render({
          canvas: target,
          canvasContext: context,
          viewport,
          annotationMode: AnnotationMode.DISABLE,
        });
        await render.promise;
        if (disposed || !text.current) return;
        if (thumbnail) {
          target.dataset.renderedPage = String(pageIndex);
          return;
        }
        text.current.replaceChildren();
        text.current.style.setProperty('--scale-factor', String(viewport.scale));
        layer = new TextLayer({
          textContentSource: await page.getTextContent(),
          container: text.current,
          viewport,
        });
        await layer.render();
        if (disposed) return;
        let index = 0;
        items.current = layer.textDivs.flatMap((div, i) => {
          const value = layer!.textContentItemsStr[i]!;
          return value.trim() ? [{ div, index: index++, text: value }] : [];
        });
        target.dataset.renderedPage = String(pageIndex);
      })
      .catch((error) => {
        if (!disposed) failure.current?.(error instanceof Error ? error.message : 'PARSE_FAILED');
      });
    return () => {
      disposed = true;
      render?.cancel();
      layer?.cancel();
      text.current?.replaceChildren();
    };
  }, [document, pageIndex, zoom, thumbnail]);
  const point = (event: React.PointerEvent) => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  return (
    <div
      className={'pdf-page' + (thumbnail ? ' pdf-thumbnail' : '')}
      ref={surface}
      style={{ width: size.width, height: size.height }}
      data-page-index={pageIndex}
      onPointerDown={(event) => {
        if (!boxSelect) return;
        event.preventDefault();
        start.current = point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ ...start.current, endX: start.current.x, endY: start.current.y });
      }}
      onPointerMove={(event) => {
        if (start.current) {
          const end = point(event);
          setDrag({ ...start.current, endX: end.x, endY: end.y });
        }
      }}
      onPointerUp={(event) => {
        if (start.current) {
          const end = point(event),
            begin = start.current;
          start.current = undefined;
          setDrag(undefined);
          const rect = {
            x: Math.min(begin.x, end.x),
            y: Math.min(begin.y, end.y),
            width: Math.abs(end.x - begin.x),
            height: Math.abs(end.y - begin.y),
          };
          if (rect.width > 0.002 && rect.height > 0.002) onSelect?.({ text: '', rects: [rect] });
          return;
        }
        const selection = window.getSelection();
        if (
          !selection?.rangeCount ||
          !selection.toString().trim() ||
          !text.current?.contains(selection.anchorNode) ||
          !text.current.contains(selection.focusNode)
        )
          return;
        const bounds = surface.current!.getBoundingClientRect();
        const rects = [...selection.getRangeAt(0).getClientRects()]
          .filter((r) => r.width > 0 && r.height > 0)
          .slice(0, 1000)
          .map((r) => ({
            x: Math.max(0, (r.left - bounds.left) / bounds.width),
            y: Math.max(0, (r.top - bounds.top) / bounds.height),
            width: Math.min(1, r.width / bounds.width),
            height: Math.min(1, r.height / bounds.height),
          }))
          .filter((r) => r.x + r.width <= 1.001 && r.y + r.height <= 1.001)
          .map((r) => ({
            ...r,
            width: Math.min(r.width, 1 - r.x),
            height: Math.min(r.height, 1 - r.y),
          }));
        const range = selection.getRangeAt(0),
          selected = items.current.filter((item) => range.intersectsNode(item.div)),
          first = selected[0],
          last = selected.at(-1);
        if (first && last) {
          const offset = (div: HTMLElement, node: Node, offset: number, fallback: number) => {
            if (!div.contains(node)) return fallback;
            const before = range.cloneRange();
            before.selectNodeContents(div);
            before.setEnd(node, offset);
            return before.toString().length;
          };
          onSelect?.({
            text: selection.toString(),
            rects,
            items: {
              first: first.index,
              last: last.index,
              start: offset(first.div, range.startContainer, range.startOffset, 0),
              end: offset(last.div, range.endContainer, range.endOffset, last.text.length),
              firstText: first.text,
              lastText: last.text,
            },
          });
        }
      }}
    >
      <canvas ref={canvas} aria-label={t.pageCanvas.replace('{page}', String(pageIndex + 1))} />
      <div
        className="textLayer"
        ref={text}
        style={{ pointerEvents: boxSelect ? 'none' : 'auto' }}
      />
      {!thumbnail &&
        annotations
          .filter((a) => a.locator.pageIndex === pageIndex)
          .flatMap((a) =>
            a.locator.rects.map((r, index) => (
              <span
                key={a.id + index}
                className={'pdf-annotation ' + a.color}
                title={a.body}
                style={{
                  left: r.x * 100 + '%',
                  top: r.y * 100 + '%',
                  width: r.width * 100 + '%',
                  height: r.height * 100 + '%',
                }}
              />
            )),
          )}
      {drag && (
        <span
          className="pdf-box"
          style={{
            left: Math.min(drag.x, drag.endX) * 100 + '%',
            top: Math.min(drag.y, drag.endY) * 100 + '%',
            width: Math.abs(drag.x - drag.endX) * 100 + '%',
            height: Math.abs(drag.y - drag.endY) * 100 + '%',
          }}
        />
      )}
    </div>
  );
}
export function PdfReader({
  url,
  pageIndex,
  zoom,
  annotations = [],
  onPage,
  onSelect,
  onCount,
  onError,
}: {
  url: string;
  pageIndex: number;
  zoom: number;
  annotations?: AnnotationView[];
  onPage: (index: number) => void;
  onSelect: (picked: Picked) => void;
  onCount: (count: number) => void;
  onError: (error: string) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>(),
    [outline, setOutline] = useState<{ title: string; pageIndex: number }[]>([]),
    [boxSelect, setBox] = useState(false);
  const callbacks = useRef({ onPage, onCount, onError });
  callbacks.current = { onPage, onCount, onError };
  useEffect(() => {
    let stopped = false;
    setDocument(undefined);
    setOutline([]);
    const assetBase = new URL('pdfjs/', window.document.baseURI).href;
    const loading = getDocument({
      url,
      disableRange: true,
      disableStream: true,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      useWasm: false,
      cMapUrl: assetBase + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: assetBase + 'standard_fonts/',
      verbosity: 0,
    });
    void loading.promise
      .then(async (pdf) => {
        if (stopped) return;
        if (pdf.numPages > 500) throw new Error('PAGE_LIMIT');
        callbacks.current.onCount(pdf.numPages);
        setDocument(pdf);
        const result: { title: string; pageIndex: number }[] = [];
        async function visit(items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>) {
          for (const item of items ?? []) {
            if (result.length >= 2000 || stopped) return;
            const destination =
              typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
            if (destination?.[0] !== undefined && destination?.[0] !== null) {
              const index =
                typeof destination[0] === 'number'
                  ? destination[0]
                  : await pdf.getPageIndex(destination[0]);
              if (index >= 0 && index < pdf.numPages)
                result.push({ title: item.title, pageIndex: index });
            }
            await visit(item.items);
          }
        }
        await visit(await pdf.getOutline());
        if (!stopped) setOutline(result);
      })
      .catch((error) => {
        if (!stopped)
          callbacks.current.onError(error instanceof Error ? error.message : 'PARSE_FAILED');
      });
    return () => {
      stopped = true;
      void loading.destroy();
    };
  }, [url]);
  if (!document) return <p role="status">{t.loading}</p>;
  const index = Math.max(0, Math.min(document.numPages - 1, pageIndex));
  return (
    <div className="pdf-reader">
      <div className="viewer-controls">
        <button disabled={index === 0} onClick={() => onPage(index - 1)}>
          {t.previousPage}
        </button>
        <label>
          {t.page}
          <input
            aria-label={t.page}
            type="number"
            min={1}
            max={document.numPages}
            value={index + 1}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= document.numPages)
                onPage(value - 1);
            }}
          />
        </label>
        <span>/ {document.numPages}</span>
        <button disabled={index === document.numPages - 1} onClick={() => onPage(index + 1)}>
          {t.nextPage}
        </button>
        <label>
          <input type="checkbox" checked={boxSelect} onChange={(e) => setBox(e.target.checked)} />
          {t.boxSelect}
        </label>
      </div>
      {!!outline.length && (
        <details>
          <summary>{t.outline}</summary>
          {outline.map((item, i) => (
            <button key={i} onClick={() => onPage(item.pageIndex)}>
              {item.title}
            </button>
          ))}
        </details>
      )}
      <div className="pdf-thumbnails" aria-label={t.thumbnails}>
        {Array.from(
          { length: Math.min(3, document.numPages) },
          (_, i) => Math.max(0, Math.min(document.numPages - 3, index - 1)) + i,
        ).map((page) => (
          <button
            key={page}
            onClick={() => onPage(page)}
            aria-current={page === index ? 'page' : undefined}
          >
            <PageCanvas document={document} pageIndex={page} zoom={1} thumbnail />
            {page + 1}
          </button>
        ))}
      </div>
      <div className="pdf-scroll">
        <PageCanvas
          document={document}
          pageIndex={index}
          zoom={zoom}
          annotations={annotations}
          boxSelect={boxSelect}
          onSelect={onSelect}
          onError={onError}
        />
      </div>
    </div>
  );
}
