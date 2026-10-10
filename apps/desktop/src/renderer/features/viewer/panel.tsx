import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMarkdown } from '@tapkit/ui';
import {
  ArtifactReplySchema,
  FileReplySchema,
  AnnotationViewSchema,
  pdfRectsIntersect,
  type ArtifactView,
  type AnnotationView,
  type ArtifactAccess,
  type Locator,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from '../../src/desktop-state';
import { PdfReader, type Picked } from './pdf-reader';
import { artifactCommand, useViewer, type ViewerTab, type Selection } from './state';
import t from '../../locales/viewer.zh-CN.json';
import fileStrings from '../../locales/files.zh-CN.json';
import 'pdfjs-dist/web/pdf_viewer.css';
import './viewer.css';

type BlockData = Extract<z.infer<typeof ArtifactReplySchema>, { blocks: unknown }>;
type Grid = Extract<z.infer<typeof ArtifactReplySchema>, { grid: unknown }>['grid'];
type Selected = Selection & { textRange?: { start: number; end: number } | undefined };
const accessFor = (tab: ViewerTab): ArtifactAccess => ({
  fileId: tab.access.fileId,
  versionId: tab.view!.file.version.id,
  ...(tab.access.owner ? { owner: tab.access.owner } : {}),
});
const errorText = (code: string) => (fileStrings.errors as Record<string, string>)[code] ?? t.error;
const rangeBounds = (range: string) => {
  const address = (text: string) => {
    const m = /^([A-Z]+)([1-9]\d*)$/.exec(text);
    if (!m) return { column: 1, row: 1 };
    return {
      column: [...m[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
      row: Number(m[2]),
    };
  };
  const [start, end] = range.split(':');
  return { start: address(start!), end: address(end ?? start!) };
};
function ImageReader({
  url,
  zoom,
  rotation,
  onError,
}: {
  url: string;
  zoom: number;
  rotation: number;
  onError: (code: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const error = useRef(onError);
  error.current = onError;
  useEffect(() => {
    let stopped = false,
      image: ImageBitmap | HTMLImageElement | undefined,
      objectUrl: string | undefined;
    const dispose = () => {
      if (image instanceof ImageBitmap) image.close();
      else if (image) image.src = '';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    void fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error('PERMISSION_DENIED');
        const blob = await response.blob();
        if (blob.type === 'image/svg+xml') {
          const decoded = new Image();
          objectUrl = URL.createObjectURL(blob);
          decoded.src = objectUrl;
          await decoded.decode();
          image = decoded;
        } else image = await createImageBitmap(blob);
        if (stopped) {
          dispose();
          return;
        }
        if (image.width * image.height > 32_000_000) throw new Error('OUTPUT_LIMIT_REACHED');
        const target = canvas.current!;
        const quarter = rotation % 180 !== 0;
        target.width = quarter ? image.height : image.width;
        target.height = quarter ? image.width : image.height;
        const context = target.getContext('2d');
        if (!context) throw new Error('PARSE_FAILED');
        context.translate(target.width / 2, target.height / 2);
        context.rotate((rotation * Math.PI) / 180);
        context.drawImage(image, -image.width / 2, -image.height / 2);
      })
      .catch((e) => {
        if (!stopped) error.current(e instanceof Error ? e.message : 'PARSE_FAILED');
      });
    return () => {
      stopped = true;
      dispose();
    };
  }, [url, rotation]);
  return (
    <div className="viewer-image">
      <canvas ref={canvas} style={{ zoom }} aria-label={t.preview} />
    </div>
  );
}
function GridReader({
  access,
  view,
  onSelect,
  onPosition,
}: {
  access: ArtifactAccess;
  view: ArtifactView;
  onSelect: (locator: Locator) => void;
  onPosition: (locator: Locator) => void;
}) {
  const located = view.locator ?? view.position.locator;
  const [sheetId, setSheet] = useState(
      located?.kind === 'sheet' ? located.sheetId : (view.sheets[0]?.id ?? ''),
    ),
    [offset, setOffset] = useState(
      located?.kind === 'sheet'
        ? Math.floor((rangeBounds(located.range).start.row - 1) / 100) * 100
        : 0,
    ),
    [column, setColumn] = useState(1),
    [direction, setDirection] = useState<'asc' | 'desc'>('asc'),
    [sorting, setSorting] = useState(false),
    [filter, setFilter] = useState(''),
    [range, setRange] = useState(located?.kind === 'sheet' ? located.range : 'A1'),
    [grid, setGrid] = useState<Grid>(),
    [error, setError] = useState('');
  const cells = useMemo(
    () =>
      new Map(
        grid
          ? [...grid.cells, ...grid.mergedAnchors].map((cell) => [
              cell.row + ':' + cell.column,
              cell,
            ])
          : [],
      ),
    [grid],
  );
  const merged = useMemo(() => {
    const spans = new Map<
        string,
        { rowSpan: number; colSpan: number; anchor: string; range: string }
      >(),
      covered = new Set<string>();
    if (!grid || sorting || filter) return { spans, covered };
    for (const range of grid.mergedRanges) {
      const bounds = rangeBounds(range),
        rows = grid.rows.filter((row) => row >= bounds.start.row && row <= bounds.end.row);
      if (!rows.length) continue;
      const first = rows[0]!,
        cols = bounds.end.column - bounds.start.column + 1;
      spans.set(first + ':' + bounds.start.column, {
        rowSpan: rows.length,
        colSpan: cols,
        anchor: bounds.start.row + ':' + bounds.start.column,
        range,
      });
      for (const row of rows)
        for (let c = bounds.start.column; c <= bounds.end.column; c++)
          if (row !== first || c !== bounds.start.column) covered.add(row + ':' + c);
    }
    return { spans, covered };
  }, [grid, sorting, filter]);
  const accessKey = JSON.stringify(access);
  const gridPosition = useRef(onPosition),
    latestRange = useRef(range);
  gridPosition.current = onPosition;
  latestRange.current = range;
  useEffect(() => {
    let stopped = false;
    setGrid(undefined);
    void artifactCommand('artifacts.sheet', {
      ...JSON.parse(accessKey),
      sheetId,
      offset,
      limit: 100,
      ...(sorting ? { sort: { column, direction } } : {}),
      filters: filter ? [{ column, query: filter }] : [],
    })
      .then((result) => {
        if (!stopped && 'grid' in result) {
          setGrid(result.grid);
          setError('');
          const first = result.grid.rows[0];
          if (first !== undefined && result.grid.columns > 0) {
            const chosen = result.grid.rows.includes(rangeBounds(latestRange.current).start.row)
              ? latestRange.current
              : 'A' + first;
            gridPosition.current({ kind: 'sheet', sheetId, range: chosen });
          }
        }
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [accessKey, sheetId, offset, column, direction, sorting, filter]);
  const letters = (number: number) => {
    let result = '';
    for (let n = number; n; n = Math.floor((n - 1) / 26))
      result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
    return result;
  };
  return (
    <section className="viewer-grid">
      <div className="viewer-controls">
        <label>
          {t.sheet}
          <select
            value={sheetId}
            onChange={(e) => {
              setSheet(e.target.value);
              setOffset(0);
              setRange('A1');
            }}
          >
            {view.sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.column}
          <input
            type="number"
            min={1}
            max={grid?.columns ?? 200}
            value={column}
            onChange={(e) => {
              setColumn(Number(e.target.value));
              setOffset(0);
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={sorting}
            onChange={(e) => {
              setSorting(e.target.checked);
              setOffset(0);
            }}
          />
          {t.sort}
        </label>
        <select
          aria-label={t.sort}
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'asc' | 'desc')}
        >
          <option value="asc">{t.ascending}</option>
          <option value="desc">{t.descending}</option>
        </select>
        <label>
          {t.filter}
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          {t.selectCell}
          <input
            value={range}
            onChange={(e) => setRange(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && /^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(range)) {
                setSorting(false);
                setFilter('');
                setOffset(Math.floor((rangeBounds(range).start.row - 1) / 100) * 100);
                onPosition({ kind: 'sheet', sheetId, range });
              }
            }}
          />
        </label>
        <button onClick={() => onSelect({ kind: 'sheet', sheetId, range })}>{t.quote}</button>
      </div>
      <p>{t.readOnly}</p>
      {error && <p role="alert">{errorText(error)}</p>}
      {grid && (
        <>
          <div className="grid-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.row}</th>
                  {Array.from({ length: grid.columns }, (_, i) => (
                    <th key={i}>
                      {letters(i + 1)}{' '}
                      <small>{t.columnTypes[grid.columnTypes[i] ?? 'empty']}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row}>
                    <th>{row}</th>
                    {Array.from({ length: grid.columns }, (_, i) => {
                      const coordinate = row + ':' + (i + 1),
                        span = merged.spans.get(coordinate);
                      if (merged.covered.has(coordinate)) return null;
                      const cell = cells.get(span?.anchor ?? coordinate),
                        address = span?.range ?? letters(i + 1) + row;
                      return (
                        <td
                          key={i}
                          rowSpan={span?.rowSpan}
                          colSpan={span?.colSpan}
                          tabIndex={0}
                          data-cell={address}
                          onClick={() => {
                            setRange(address);
                            onPosition({ kind: 'sheet', sheetId, range: address });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              onSelect({ kind: 'sheet', sheetId, range: address });
                          }}
                          title={cell?.formula ? t.formula + ': ' + cell.formula : undefined}
                          className={address === range ? 'cell-selected' : ''}
                        >
                          {cell?.formula && !cell.calculated
                            ? t.notCalculated
                            : String(cell?.value ?? '')}
                          {cell?.formula && <small>{cell.formula}</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!grid.mergedRanges.length && (
            <p>
              {t.merged}: {grid.mergedRanges.join(', ')}
            </p>
          )}
          <div className="viewer-controls">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>
              {t.previousBlock}
            </button>
            <span>
              {offset + 1}—{Math.min(offset + 100, grid.totalRows)} / {grid.totalRows}
            </span>
            <button
              disabled={offset + 100 >= grid.totalRows}
              onClick={() => setOffset(offset + 100)}
            >
              {t.nextBlock}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function SourceReader({
  access,
  view,
  query,
  mode,
  onSelect,
  onPosition,
}: {
  access: ArtifactAccess;
  view: ArtifactView;
  query: string;
  mode: 'preview' | 'source' | 'diff';
  onSelect: (locator: Locator, textRange?: { start: number; end: number }) => void;
  onPosition: (locator?: Locator, scrollTop?: number) => void;
}) {
  const [offset, setOffset] = useState(0),
    [data, setData] = useState<BlockData>(),
    [error, setError] = useState('');
  const target = useRef(view.locator ?? view.position.locator),
    root = useRef<HTMLElement>(null),
    restored = useRef(false),
    position = useRef(onPosition);
  position.current = onPosition;
  const key = JSON.stringify(access);
  useEffect(() => {
    setOffset(0);
  }, [query]);
  useEffect(() => {
    let stopped = false;
    void artifactCommand('artifacts.blocks', {
      ...JSON.parse(key),
      offset,
      query,
      ...(target.current && offset === 0 && !query ? { locator: target.current } : {}),
    })
      .then((result) => {
        if (!stopped && 'blocks' in result) {
          setData(result);
          setError('');
          if (!query) position.current(target.current ?? result.blocks[0]?.locator);
        }
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [key, offset, query]);
  useEffect(() => {
    if (!data || restored.current || !root.current) return;
    restored.current = true;
    const locator = target.current,
      block =
        locator &&
        data.blocks.find(
          (b) =>
            b.locator.kind === locator.kind &&
            (b.locator.kind === 'code' && locator.kind === 'code'
              ? b.locator.lineStart <= locator.lineStart && b.locator.lineEnd >= locator.lineStart
              : b.locator.kind === 'text' && locator.kind === 'text'
                ? b.locator.start <= locator.start && b.locator.end >= locator.start
                : b.locator.kind === 'slide' && locator.kind === 'slide'
                  ? b.locator.slideIndex === locator.slideIndex
                  : b.locator.kind === 'pdf' && locator.kind === 'pdf'
                    ? b.locator.pageIndex === locator.pageIndex
                    : false),
        );
    if (view.locator && block)
      root.current
        .querySelector<HTMLElement>('[data-block-id="' + block.id.replace(/[^\w-]/g, '') + '"]')
        ?.scrollIntoView({ block: 'nearest' });
    else root.current.scrollTop = view.position.scrollTop;
  }, [data, view.locator, view.position.scrollTop]);
  const page = (offset: number) => {
    target.current = undefined;
    setOffset(offset);
    root.current?.scrollTo({ top: 0 });
  };
  const highlighted = (text: string) => {
    if (!query) return text;
    const lower = text.toLocaleLowerCase(),
      needle = query.toLocaleLowerCase(),
      out: React.ReactNode[] = [];
    let from = 0,
      index = lower.indexOf(needle);
    while (index >= 0 && out.length < 2000) {
      out.push(
        text.slice(from, index),
        <mark key={index}>{text.slice(index, index + query.length)}</mark>,
      );
      from = index + query.length;
      index = lower.indexOf(needle, from);
    }
    out.push(text.slice(from));
    return out;
  };
  return (
    <section
      ref={root}
      className="viewer-source"
      onScroll={(event) => {
        if (!query) position.current(undefined, event.currentTarget.scrollTop);
      }}
    >
      {error && <p role="alert">{errorText(error)}</p>}
      {data && (
        <>
          <div className="viewer-controls">
            <button
              disabled={data.offset === 0}
              onClick={() => page(Math.max(0, data.offset - 100))}
            >
              {t.previousBlock}
            </button>
            <span>
              {data.offset + 1}—{Math.min(data.offset + 100, data.total)} / {data.total}
            </span>
            <button
              disabled={data.offset + 100 >= data.total}
              onClick={() => page(data.offset + 100)}
            >
              {t.nextBlock}
            </button>
          </div>
          {!data.blocks.length && <p>{query ? t.noMatches : t.empty}</p>}
          {mode === 'preview' && view.format === 'markdown' && !query ? (
            <ChatMarkdown text={data.blocks.map((b) => b.text).join('\n')} />
          ) : (
            data.blocks.map((block) => (
              <article key={block.id} data-block-id={block.id}>
                <button
                  onClick={() => {
                    onSelect(block.locator);
                    position.current(block.locator);
                  }}
                >
                  {block.locator.kind === 'code'
                    ? t.line + ' ' + block.locator.lineStart
                    : block.locator.kind === 'pdf'
                      ? t.page + ' ' + (block.locator.pageIndex + 1)
                      : block.kind === 'heading'
                        ? block.text
                        : t.quote}
                </button>
                <pre
                  onMouseUp={(event) => {
                    const selected = window.getSelection();
                    if (
                      !selected?.rangeCount ||
                      !selected.toString() ||
                      !event.currentTarget.contains(selected.anchorNode) ||
                      !event.currentTarget.contains(selected.focusNode)
                    )
                      return;
                    const range = selected.getRangeAt(0),
                      before = range.cloneRange();
                    before.selectNodeContents(event.currentTarget);
                    before.setEnd(range.startContainer, range.startOffset);
                    const start = before.toString().length;
                    onSelect(block.locator, { start, end: start + range.toString().length });
                  }}
                >
                  {highlighted(block.text)}
                </pre>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}
function DiffReader({ access }: { access: ArtifactAccess }) {
  const [versions, setVersions] = useState<
      Extract<z.infer<typeof FileReplySchema>, { versions: unknown }>['versions']
    >([]),
    [other, setOther] = useState(''),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Extract<z.infer<typeof ArtifactReplySchema>, { diff: unknown }>>(),
    [error, setError] = useState('');
  const key = JSON.stringify(access);
  useEffect(() => {
    let stopped = false;
    void window.tapkit
      .fileCommand(requestOptions(), 'files.versions', { fileId: access.fileId })
      .then((reply) => {
        if (!reply.ok) throw new Error(reply.error.code);
        const result = FileReplySchema.parse(reply.data);
        if (!stopped && 'versions' in result) {
          const options = result.versions.filter((v) => v.id !== access.versionId);
          setVersions(options);
          setOther(options[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [key, access.fileId, access.versionId]);
  useEffect(() => {
    if (!other) return;
    let stopped = false;
    void artifactCommand('artifacts.diff', { ...JSON.parse(key), otherVersionId: other, offset })
      .then((result) => {
        if (!stopped && 'diff' in result) {
          setData(result);
          setError('');
        }
      })
      .catch((e) => {
        if (!stopped) {
          setData(undefined);
          setError(e.message);
        }
      });
    return () => {
      stopped = true;
    };
  }, [key, other, offset]);
  return (
    <section className="viewer-diff">
      <label>
        {t.compareVersion}
        <select
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            setOffset(0);
          }}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version} · {v.name}
            </option>
          ))}
        </select>
      </label>
      {!versions.length && <p>{t.noOtherVersion}</p>}
      {error && <p role="alert">{errorText(error)}</p>}
      {data && (
        <>
          <div className="viewer-controls">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>
              {t.previousBlock}
            </button>
            <span>
              {offset + 1}—{Math.min(offset + 100, data.total)} / {data.total}
            </span>
            <button disabled={offset + 100 >= data.total} onClick={() => setOffset(offset + 100)}>
              {t.nextBlock}
            </button>
          </div>
          {data.diff.map((line, i) => (
            <pre key={i} className={'diff-' + line.kind}>
              <span>
                {line.oldLine ?? ' '} → {line.newLine ?? ' '}{' '}
                {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '}
              </span>
              {line.text}
            </pre>
          ))}
        </>
      )}
    </section>
  );
}
function FileView({ tab }: { tab: ViewerTab }) {
  const view = tab.view!,
    access = accessFor(tab),
    key = JSON.stringify(access),
    viewer = useViewer();
  const located = view.locator ?? view.position.locator;
  const [url, setUrl] = useState(''),
    [query, setQuery] = useState(''),
    [mode, setMode] = useState<ArtifactView['position']['mode']>(
      view.locator?.kind === 'text' || view.locator?.kind === 'code'
        ? 'source'
        : view.position.mode,
    ),
    [zoom, setZoom] = useState(view.position.zoom),
    [rotation, setRotation] = useState(0),
    [page, setPage] = useState(
      located?.kind === 'pdf'
        ? located.pageIndex
        : located?.kind === 'slide'
          ? located.slideIndex
          : 0,
    ),
    [pageCount, setCount] = useState(view.pageCount),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [presentation, setPresentation] = useState(false);
  const [selected, setSelected] = useState<Selected>(),
    [annotations, setAnnotations] = useState<AnnotationView[]>([]),
    [body, setBody] = useState(''),
    [color, setColor] = useState<AnnotationView['color']>('yellow'),
    [editing, setEditing] = useState<AnnotationView>();
  const selectionSequence = useRef(0),
    positionLocator = useRef(view.locator ?? view.position.locator);
  const positionScroll = useRef(view.position.scrollTop),
    positionTail = useRef<Promise<unknown>>(Promise.resolve()),
    positionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pendingPosition = useRef<(() => void) | undefined>(undefined);
  const remembered = useRef(viewer.remember);
  remembered.current = viewer.remember;
  const select = useCallback(
    async (locator: Locator, textRange?: { start: number; end: number }) => {
      const ticket = ++selectionSequence.current;
      try {
        const result = await artifactCommand('artifacts.selection', {
          ...JSON.parse(key),
          locator,
          ...(textRange ? { textRange } : {}),
        });
        if (ticket === selectionSequence.current && 'selection' in result) {
          setSelected(result.selection);
          setError('');
        }
      } catch (e) {
        if (ticket === selectionSequence.current)
          setError(e instanceof Error ? e.message : 'INTERNAL_ERROR');
      }
    },
    [key],
  );
  const savePosition = useCallback(
    (locator?: Locator, scrollTop?: number) => {
      if (locator) positionLocator.current = locator;
      if (scrollTop !== undefined) positionScroll.current = scrollTop;
      const position = {
        zoom,
        mode,
        scrollTop: positionScroll.current,
        ...(positionLocator.current ? { locator: positionLocator.current } : {}),
      };
      remembered.current(tab.key, position);
      const write = () => {
        positionTail.current = positionTail.current
          .catch(() => {})
          .then(() => artifactCommand('artifacts.reading', { ...JSON.parse(key), position }))
          .catch((e) => setError(e.message));
      };
      clearTimeout(positionTimer.current);
      pendingPosition.current = undefined;
      if (scrollTop !== undefined) {
        pendingPosition.current = write;
        positionTimer.current = setTimeout(() => {
          pendingPosition.current = undefined;
          write();
        }, 200);
      } else write();
    },
    [key, zoom, mode, tab.key],
  );
  useEffect(() => {
    savePosition();
  }, [savePosition]);
  useEffect(
    () => () => {
      clearTimeout(positionTimer.current);
      pendingPosition.current?.();
      pendingPosition.current = undefined;
    },
    [],
  );
  useEffect(() => {
    let stopped = false;
    if (view.asset !== 'none')
      void window.tapkit
        .artifactUrl({ ...JSON.parse(key), kind: view.asset })
        .then((value) => {
          if (!stopped) setUrl(value);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    if (view.format === 'pdf')
      void artifactCommand('annotations.list', {
        fileVersionId: access.versionId,
        ...(access.owner ? { owner: access.owner } : {}),
      })
        .then((result) => {
          if (!stopped && 'annotations' in result) setAnnotations(result.annotations);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    return () => {
      stopped = true;
      selectionSequence.current++;
    };
  }, [key, view.asset, view.format, access.versionId, access.owner]);
  const pdfSelection = async (picked: Picked) => {
    if (view.format !== 'pdf') {
      setNotice(t.paragraphOnly);
      return;
    }
    try {
      const blocks: BlockData['blocks'] = [];
      for (let offset = 0; offset < 200000; offset += 100) {
        const response = await artifactCommand('artifacts.blocks', {
          ...access,
          pageIndex: page,
          offset,
        });
        if (!('blocks' in response)) throw new Error('PARSE_FAILED');
        blocks.push(...response.blocks);
        if (offset + 100 >= response.total) break;
      }
      const filtered = blocks.filter(
          (b) =>
            b.locator.kind === 'pdf' &&
            (!picked.rects.length ||
              b.locator.rects?.some((r) => picked.rects.some((p) => pdfRectsIntersect(r, p)))),
        ),
        text = filtered.map((b) => b.text).join('\n');
      let range: { start: number; end: number } | undefined;
      if (picked.items) {
        const item = picked.items,
          first = blocks[item.first],
          last = blocks[item.last],
          a = first ? filtered.indexOf(first) : -1,
          b = last ? filtered.indexOf(last) : -1;
        if (a < 0 || b < a || first?.text !== item.firstText || last?.text !== item.lastText) {
          setNotice(t.selectionAmbiguous);
          return;
        }
        const before = (index: number) =>
          filtered.slice(0, index).reduce((size, block) => size + block.text.length + 1, 0);
        range = { start: before(a) + item.start, end: before(b) + item.end };
      } else if (picked.text) {
        const start = text.indexOf(picked.text);
        if (start < 0 || text.indexOf(picked.text, start + 1) >= 0) {
          setNotice(t.selectionAmbiguous);
          return;
        }
        range = { start, end: start + picked.text.length };
      }
      await select({ kind: 'pdf', pageIndex: page, rects: picked.rects }, range);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PARSE_FAILED');
    }
  };
  const action = async (work: () => Promise<unknown>) => {
    try {
      await work();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'INTERNAL_ERROR');
    }
  };
  useEffect(() => {
    if (!presentation) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,button')
      )
        return;
      if (event.key === 'Escape') {
        setPresentation(false);
        return;
      }
      const delta = ['ArrowRight', 'PageDown', ' '].includes(event.key)
        ? 1
        : ['ArrowLeft', 'PageUp'].includes(event.key)
          ? -1
          : 0;
      if (delta) {
        event.preventDefault();
        const next = Math.max(0, Math.min(pageCount - 1, page + delta));
        setPage(next);
        if (pageCount === view.slides.length) savePosition({ kind: 'slide', slideIndex: next });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [presentation, page, pageCount, view.slides.length, savePosition]);
  return (
    <div className="viewer-file" data-viewer-version={access.versionId}>
      <dl className="viewer-metadata">
        <dt>{t.name}</dt>
        <dd>{view.file.version.name}</dd>
        <dt>{t.type}</dt>
        <dd>{view.file.version.extension.toUpperCase()}</dd>
        <dt>{t.version}</dt>
        <dd>{view.file.version.version}</dd>
        <dt>{t.size}</dt>
        <dd>{new Intl.NumberFormat('zh-CN').format(view.file.version.sizeBytes)} B</dd>
        {!!pageCount && (
          <>
            <dt>{t.pages}</dt>
            <dd>{pageCount}</dd>
          </>
        )}
      </dl>
      {view.versionChanged && (
        <p className="viewer-version-change">
          {t.newVersion}
          <button
            onClick={() =>
              void action(() =>
                viewer.open({
                  fileId: access.fileId,
                  ...(access.owner ? { owner: access.owner } : {}),
                }),
              )
            }
          >
            {t.openLatest}
          </button>
        </p>
      )}
      <div className="viewer-controls">
        <button onClick={() => void viewer.reload(tab.key, true)}>{t.retry}</button>
        <button
          onClick={() =>
            void action(() =>
              window.tapkit.saveOriginal(access).then((reply) => {
                if (!reply.ok) throw new Error(reply.error.code);
              }),
            )
          }
        >
          {t.download}
        </button>
        <button
          onClick={() =>
            void action(async () => {
              setNotice('');
              const reply = await window.tapkit.saveOriginal(access);
              if (!reply.ok) throw new Error(reply.error.code);
              if ('changedIds' in reply.data && reply.data.changedIds.length)
                setNotice(t.shareHint);
            })
          }
        >
          {t.share}
        </button>
        <button onClick={() => void action(() => window.tapkit.openArtifactExternal(access))}>
          {t.external}
        </button>
        <label>
          {t.zoom}
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.search}
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} />
        </label>
        <button
          disabled={!selected}
          onClick={() =>
            void action(async () => {
              await window.tapkit.copyText(selected!.selectedText);
              setNotice(t.copied);
            })
          }
        >
          {t.copy}
        </button>
        <button disabled={!selected} onClick={() => viewer.quote(selected!)}>
          {t.quote}
        </button>
      </div>
      {error && (
        <p role="alert">
          {errorText(error)}{' '}
          <button onClick={() => void viewer.reload(tab.key, true)}>{t.retry}</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {view.status !== 'ready' && (
        <div role="alert">
          <p>
            {view.status === 'pending'
              ? t.pending
              : view.status === 'unsupported'
                ? t.unsupported
                : errorText(view.errorCode ?? 'PARSE_FAILED')}
          </p>
          <button onClick={() => void viewer.reload(tab.key, true)}>{t.retry}</button>
        </div>
      )}
      {(view.status === 'ready' || view.blockCount > 0) && (
        <>
          {['markdown', 'code', 'text', 'docx', 'pptx'].includes(view.format) && (
            <div className="viewer-controls">
              <button aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
                {t.preview}
              </button>
              <button aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
                {t.source}
              </button>
            </div>
          )}
          {['code', 'text', 'markdown'].includes(view.format) && (
            <button aria-pressed={mode === 'diff'} onClick={() => setMode('diff')}>
              {t.diff}
            </button>
          )}
          {mode === 'diff' && ['code', 'text', 'markdown'].includes(view.format) && (
            <DiffReader access={access} />
          )}
          {(view.format === 'docx' || view.format === 'pptx') && <p>{t.paragraphOnly}</p>}
          {view.format === 'pptx' && url && (
            <button onClick={() => setPresentation((value) => !value)}>
              {presentation ? t.exitPresentation : t.presentation}
            </button>
          )}
          {presentation && (
            <button className="presentation-close" onClick={() => setPresentation(false)}>
              {t.exitPresentation}
            </button>
          )}
          {url && ['pdf', 'docx', 'pptx'].includes(view.format) && mode === 'preview' && (
            <div className={presentation ? 'viewer-presentation' : ''}>
              <PdfReader
                url={url}
                pageIndex={page}
                zoom={zoom}
                annotations={annotations}
                onPage={(index) => {
                  setPage(index);
                  if (view.format === 'pdf') savePosition({ kind: 'pdf', pageIndex: index });
                  if (view.format === 'pptx' && pageCount === view.slides.length)
                    savePosition({ kind: 'slide', slideIndex: index });
                }}
                onCount={setCount}
                onSelect={(picked) => void pdfSelection(picked)}
                onError={setError}
              />
            </div>
          )}
          {view.format === 'pptx' && (
            <div className="viewer-slide-notes">
              {view.slides.map((slide) => (
                <details key={slide.index}>
                  <summary>
                    <button
                      onClick={() => {
                        if (pageCount === view.slides.length) setPage(slide.index);
                        void select({ kind: 'slide', slideIndex: slide.index });
                      }}
                    >
                      {slide.index + 1}. {slide.title}
                    </button>
                  </summary>
                  <p>{slide.notes}</p>
                </details>
              ))}
            </div>
          )}
          {view.format === 'sheet' && (
            <GridReader
              access={access}
              view={view}
              onSelect={(locator) => void select(locator)}
              onPosition={savePosition}
            />
          )}
          {view.format === 'image' && url && (
            <>
              <button onClick={() => setRotation((value) => (value + 90) % 360)}>{t.rotate}</button>
              <ImageReader url={url} zoom={zoom} rotation={rotation} onError={setError} />
            </>
          )}
          {view.format === 'zip' && (
            <section>
              <h3>{t.zip}</h3>
              {view.entries.map((entry) => (
                <p key={entry.path}>
                  {entry.directory ? '▸ ' : '▹ '}
                  {entry.path} · {entry.sizeBytes} B
                </p>
              ))}
            </section>
          )}
          {!!view.outline.length && (
            <details>
              <summary>{t.outline}</summary>
              {view.outline.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void viewer.open({ ...access, locator: item.locator })}
                >
                  {item.title}
                </button>
              ))}
            </details>
          )}
          {view.format !== 'sheet' &&
            view.format !== 'image' &&
            view.format !== 'zip' &&
            mode !== 'diff' &&
            (mode === 'source' || !url || !!query) && (
              <SourceReader
                access={access}
                view={view}
                query={query}
                mode={mode}
                onPosition={savePosition}
                onSelect={(locator, range) => {
                  if (locator.kind === 'pdf') setPage(locator.pageIndex);
                  void select(locator, range);
                }}
              />
            )}
        </>
      )}
      {view.format === 'pdf' && (
        <details className="viewer-annotations">
          <summary>
            {t.annotations} ({annotations.length})
          </summary>
          <p>{t.annotationHint}</p>
          <label>
            {t.annotationBody}
            <textarea value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label>
            {t.annotationColor}
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as AnnotationView['color'])}
            >
              {(['yellow', 'green', 'blue', 'pink'] as const).map((c) => (
                <option key={c} value={c}>
                  {t[c]}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!selected && !editing}
            onClick={() =>
              void action(async () => {
                const ref = selected?.ref,
                  locator =
                    ref?.kind === 'file' && ref.locator?.kind === 'pdf'
                      ? ref.locator
                      : editing?.locator;
                if (!locator) throw new Error('VALIDATION_ERROR');
                const result = await artifactCommand('annotations.upsert', {
                  fileVersionId: access.versionId,
                  ...(access.owner ? { owner: access.owner } : {}),
                  locator,
                  selectedTextHash: selected?.selectedTextHash ?? editing!.selectedTextHash,
                  ...(selected?.textRange
                    ? { textRange: selected.textRange }
                    : editing?.textRange
                      ? { textRange: editing.textRange }
                      : {}),
                  body,
                  color,
                  ...(editing ? { id: editing.id, expectedRevision: editing.revision } : {}),
                });
                if ('annotation' in result) {
                  const annotation = AnnotationViewSchema.parse(result.annotation);
                  setAnnotations((old) => [
                    ...old.filter((a) => a.id !== annotation.id),
                    annotation,
                  ]);
                  setEditing(undefined);
                  setBody('');
                  setNotice(t.annotationsSaved);
                }
              })
            }
          >
            {t.addAnnotation}
          </button>
          <button
            onClick={() =>
              void action(() =>
                window.tapkit.saveConversation({
                  name: 'annotations.json',
                  text: JSON.stringify(
                    { schemaVersion: 1, fileVersionId: access.versionId, annotations },
                    null,
                    2,
                  ),
                }),
              )
            }
          >
            {t.exportAnnotations}
          </button>
          {annotations.map((annotation) => (
            <article key={annotation.id}>
              <button
                onClick={() => {
                  setPage(annotation.locator.pageIndex);
                  savePosition(annotation.locator);
                }}
              >
                {t.page} {annotation.locator.pageIndex + 1}
              </button>
              <p>{annotation.body}</p>
              <button
                onClick={() => {
                  setSelected(undefined);
                  setEditing(annotation);
                  setBody(annotation.body);
                  setColor(annotation.color);
                }}
              >
                {t.editAnnotation}
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    const result = await artifactCommand('artifacts.selection', {
                      ...access,
                      locator: annotation.locator,
                      expectedTextHash: annotation.selectedTextHash,
                      ...(annotation.textRange ? { textRange: annotation.textRange } : {}),
                    });
                    if ('selection' in result)
                      viewer.quote({ ...result.selection, note: annotation.body });
                  })
                }
              >
                {t.annotationQuote}
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await artifactCommand('annotations.delete', {
                      fileVersionId: access.versionId,
                      ...(access.owner ? { owner: access.owner } : {}),
                      ids: [annotation.id],
                    });
                    setAnnotations((old) => old.filter((a) => a.id !== annotation.id));
                  })
                }
              >
                {t.deleteAnnotation}
              </button>
            </article>
          ))}
        </details>
      )}
    </div>
  );
}
export function ArtifactPanel() {
  const viewer = useViewer(),
    [fullScreen, setFullScreen] = useState(false);
  const tab = viewer.tabs.find((t) => t.key === viewer.active);
  return (
    <section
      className={'artifact-panel' + (fullScreen ? ' viewer-fullscreen' : '')}
      aria-label={t.panel}
    >
      <header className="viewer-controls">
        <h2>{t.panel}</h2>
        <button onClick={() => setFullScreen((value) => !value)}>
          {fullScreen ? t.exitFullScreen : t.fullScreen}
        </button>
        {tab && <button onClick={() => viewer.close(tab.key)}>{t.close}</button>}
      </header>
      <div role="tablist" className="viewer-tabs">
        {viewer.tabs.map((tab) => (
          <span key={tab.key}>
            <button
              role="tab"
              aria-selected={tab.key === viewer.active}
              onClick={() => viewer.activate(tab.key)}
            >
              {tab.view?.file.version.name ?? t.loading}
              {tab.view ? ' · v' + tab.view.file.version.version : ''}
            </button>
            <button aria-label={t.closeTab} onClick={() => viewer.close(tab.key)}>
              ×
            </button>
          </span>
        ))}
      </div>
      {tab?.loading && <p role="status">{t.loading}</p>}
      {tab?.error && (
        <p role="alert">
          {errorText(tab.error)}
          <button onClick={() => void viewer.reload(tab.key, true)}>{t.retry}</button>
        </p>
      )}
      {tab?.view && (
        <FileView
          key={tab.key + ':' + (tab.generation ?? 0) + JSON.stringify(tab.view.locator)}
          tab={tab}
        />
      )}
    </section>
  );
}
