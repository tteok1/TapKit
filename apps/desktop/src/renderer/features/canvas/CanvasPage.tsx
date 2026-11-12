import { useEffect, useRef, useState } from 'react';
import {
  FileReplySchema,
  type CanvasContent,
  type CanvasProposal,
  type CanvasRange,
  type CanvasView,
  type FileView,
} from '@tapkit/contracts';
import {
  EditorContent,
  canvasExtensions,
  useEditor,
  useEditorState,
  Link,
  useNavigate,
  type Editor,
} from '@tapkit/ui';
import { requestOptions } from '../../src/desktop-state';
import { canvasCommand, canvasError, openCanvas } from './api';
import { useCanvasDraft } from './use-draft';
import './canvas.css';

const freshId = () => requestOptions().requestId;
const imageData = async (fileId: string, versionId: string) => {
  const result = await canvasCommand('canvas.image', { fileId, versionId });
  if (!('canvasImage' in result)) throw Error('INTERNAL_ERROR');
  return result.canvasImage;
};
const extensions = canvasExtensions(freshId, imageData);
const base = (view: CanvasView) => ({
  documentId: view.documentId,
  baseVersion: view.versionId,
  revision: view.revision,
});
const fileVersion = (file: FileView) => ({ fileId: file.id, versionId: file.version.id });

type Summary = { documentId: string; title: string; updatedAt: number };
type History = {
  versionId: string;
  revision: number;
  createdAt: number;
  parentVersionId: string | null;
};
type Tab = 'outline' | 'find' | 'comments' | 'ai' | 'history';

export function CanvasList() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Summary[]>();
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = () => {
    setError('');
    void canvasCommand('canvas.list', {})
      .then((data) => {
        if ('canvases' in data) setDocs(data.canvases);
      })
      .catch((error) => setError(canvasError(error)));
  };
  useEffect(load, []);
  return (
    <section className="canvas-home" aria-label="文档画布">
      <header>
        <h1>文档画布</h1>
        <button
          className="primary"
          disabled={creating}
          onClick={() => {
            setCreating(true);
            void openCanvas({ kind: 'blank' })
              .then(navigate)
              .catch((error) => setError(canvasError(error)))
              .finally(() => setCreating(false));
          }}
        >
          新建画布
        </button>
      </header>
      <p>可从聊天回复或资料库中的 Markdown、Word 正文打开画布。</p>
      {error && (
        <p role="alert">
          {error} <button onClick={load}>重试</button>
        </p>
      )}
      {!docs && !error && <p role="status">正在加载画布…</p>}
      {docs?.length === 0 && <p>还没有画布。</p>}
      {docs && (
        <ul>
          {docs.map((doc) => (
            <li key={doc.documentId}>
              <Link to={'/canvas/' + doc.documentId}>{doc.title}</Link>
              <time>{new Date(doc.updatedAt).toLocaleString('zh-CN')}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CanvasPage({ id }: { id: string }) {
  const [view, setView] = useState<CanvasView>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void canvasCommand('canvas.get', { documentId: id })
      .then((data) => {
        if (active && 'canvas' in data) setView(data.canvas);
      })
      .catch((error) => {
        if (active) setError(canvasError(error));
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <p role="alert">
        {error} <Link to="/canvas">返回文档画布</Link>
      </p>
    );
  return view ? <CanvasEditor initial={view} /> : <p role="status">正在加载画布…</p>;
}

function rangeOf(editor: Editor) {
  const { $from, $to, empty } = editor.state.selection;
  const blockId: unknown = $from.parent.attrs.blockId;
  if (empty || !$from.sameParent($to) || typeof blockId !== 'string') throw Error('CANVAS_SELECT');
  const from = $from.parentOffset;
  const to = $to.parentOffset;
  const text = $from.parent.textBetween(from, to, '', '\n');
  if (!text.trim() || text.length > 8000) throw Error('CANVAS_SELECT');
  return { blockId, from, to, text };
}
async function hashRange({ text, ...position }: ReturnType<typeof rangeOf>): Promise<CanvasRange> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const textHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { ...position, textHash };
}

function editorBlocks(editor: Editor) {
  const blocks: { id: string; pos: number; text: string; heading: boolean }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && typeof node.attrs.blockId === 'string') {
      blocks.push({
        id: node.attrs.blockId as string,
        pos: pos + 1,
        text: node.textBetween(0, node.content.size, '', '\n'),
        heading: node.type.name === 'heading',
      });
    }
  });
  return blocks;
}

function CanvasEditor({ initial }: { initial: CanvasView }) {
  const draft = useCanvasDraft(initial);
  const title = useRef(draft.title);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('outline');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState<CanvasProposal>();
  const [history, setHistory] = useState<History[]>([]);
  const [preview, setPreview] = useState<CanvasView>();
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [href, setHref] = useState('');
  const [tool, setTool] = useState<'link' | 'image'>();
  const [files, setFiles] = useState<FileView[]>([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [alt, setAlt] = useState('');
  const [reference, setReference] = useState('');
  const [scope, setScope] = useState<'selection' | 'whole'>('selection');
  const [action, setAction] = useState('rewrite');
  const [instruction, setInstruction] = useState('');
  const [exportFormat, setExportFormat] = useState('md');

  const editor = useEditor({
    extensions,
    content: draft.content,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': '文档正文',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => draft.edit(title.current, editor.getJSON() as CanvasContent),
  });
  const controls = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            undo: editor.can().undo(),
            redo: editor.can().redo(),
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            table: editor.isActive('table'),
            heading: editor.isActive('heading'),
            selected: !editor.state.selection.empty,
            blocks: editorBlocks(editor),
          }
        : null,
  });

  function showError(problem: unknown) {
    setError(
      problem instanceof Error && problem.message === 'CANVAS_SELECT'
        ? '请在同一段文字内选中要修改或批注的内容。'
        : canvasError(problem),
    );
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    editor?.setEditable(false, false);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (problem) {
      showError(problem);
    } finally {
      editor?.setEditable(true, false);
      setBusy(false);
    }
  }
  async function loadFiles() {
    const reply = await window.tapkit.fileCommand(requestOptions(), 'files.list', {
      owner: { type: 'library' },
      limit: 100,
    });
    if (!reply.ok) throw Error(reply.error.code);
    const data = FileReplySchema.parse(reply.data);
    if ('files' in data) setFiles(data.files);
  }
  async function loadHistory(view: CanvasView, beforeRevision?: number) {
    const data = await canvasCommand('canvas.history', {
      documentId: view.documentId,
      ...(beforeRevision ? { beforeRevision } : {}),
    });
    if ('canvasVersions' in data)
      setHistory((previous) =>
        beforeRevision ? [...previous, ...data.canvasVersions] : data.canvasVersions,
      );
  }
  function install(view: CanvasView, body = false) {
    draft.updateHead(view);
    if (body) {
      title.current = view.title;
      draft.setTitle(view.title);
      editor?.commands.setContent(view.content, { emitUpdate: false, errorOnInvalidContent: true });
    }
  }
  async function ask() {
    if (!editor || thinking || busy) return;
    setThinking(true);
    setError('');
    setNotice('');
    setProposal(undefined);
    try {
      const selected = scope === 'selection' ? rangeOf(editor) : undefined;
      const original = editor.state.doc;
      const view = await draft.flush();
      if (!editor.state.doc.eq(original)) throw Error('CONFLICT');
      const source = files.find((file) => file.id === reference);
      const data = await canvasCommand('canvas.aiEdit', {
        ...base(view),
        action,
        instruction,
        ...(source ? { reference: fileVersion(source) } : {}),
        ...(selected ? { selection: await hashRange(selected) } : {}),
      });
      if (!('canvasProposal' in data)) throw Error('INTERNAL_ERROR');
      if (!editor.state.doc.eq(original)) throw Error('CONFLICT');
      if (!data.canvasProposal.items.length) setNotice('没有需要审阅的修改。');
      else setProposal(data.canvasProposal);
    } catch (problem) {
      showError(problem);
    } finally {
      setThinking(false);
    }
  }

  const blocks = controls?.blocks ?? [];
  const matches = query
    ? blocks.flatMap((block) => {
        const ranges: { from: number; to: number }[] = [];
        let offset = block.text.indexOf(query);
        while (offset >= 0) {
          ranges.push({ from: block.pos + offset, to: block.pos + offset + query.length });
          offset = block.text.indexOf(query, offset + query.length);
        }
        return ranges;
      })
    : [];

  function jump(from: number, to = from) {
    editor?.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  }
  async function changeComment(change: unknown) {
    const view = await draft.flush();
    const result = await canvasCommand('canvas.comment', { ...base(view), change });
    if ('canvas' in result) install(result.canvas);
  }

  return (
    <section className="canvas-page" aria-label="正文编辑">
      <header className="canvas-heading">
        <Link to="/canvas">文档画布</Link>
        <input
          aria-label="文档标题"
          maxLength={240}
          disabled={busy}
          value={draft.title}
          onChange={(event) => {
            if (!editor) return;
            title.current = event.target.value;
            draft.edit(title.current, editor.getJSON() as CanvasContent);
          }}
        />
        <div className="canvas-save">
          <span role="status">
            {draft.status} · v{draft.view.revision}
          </span>
          <button
            disabled={busy || !draft.dirty}
            onClick={() =>
              void run(async () => {
                await draft.flush();
              })
            }
          >
            立即保存
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const view = await draft.flush();
                await window.tapkit.openEntity({ type: 'canvas', id: view.documentId });
              })
            }
          >
            在新窗口打开
          </button>
        </div>
      </header>
      <p className="canvas-hint">正文编辑保留常用文档结构，复杂 Office 版式可能变化。</p>
      {draft.conflict && (
        <p role="status">
          检测到并发保存，当前修改已保存为独立副本。{' '}
          <Link to={'/canvas/' + draft.view.documentId}>打开副本</Link>
        </p>
      )}
      {error && (
        <p role="alert" className="canvas-feedback">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="canvas-feedback">
          {notice}
        </p>
      )}
      <div className="canvas-tools" role="group" aria-label="正文格式">
        <button
          disabled={busy || !controls?.undo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          撤销
        </button>
        <button
          disabled={busy || !controls?.redo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          重做
        </button>
        <button
          disabled={busy}
          aria-pressed={controls?.heading ?? false}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          小标题
        </button>
        <button
          disabled={busy}
          aria-pressed={controls?.bold ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          粗体
        </button>
        <button
          disabled={busy}
          aria-pressed={controls?.italic ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          斜体
        </button>
        <button disabled={busy} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          项目列表
        </button>
        <button disabled={busy} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          编号列表
        </button>
        <button disabled={busy} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
          代码块
        </button>
        <button
          disabled={busy || controls?.table}
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
          }
        >
          插入表格
        </button>
        {controls?.table && (
          <>
            <button disabled={busy} onClick={() => editor?.chain().focus().addRowAfter().run()}>
              添加行
            </button>
            <button disabled={busy} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
              添加列
            </button>
            <button disabled={busy} onClick={() => editor?.chain().focus().deleteRow().run()}>
              删除行
            </button>
            <button disabled={busy} onClick={() => editor?.chain().focus().deleteColumn().run()}>
              删除列
            </button>
          </>
        )}
        <button
          disabled={busy || !controls?.selected}
          aria-expanded={tool === 'link'}
          onClick={() => {
            setHref(String(editor?.getAttributes('link').href ?? ''));
            setTool(tool === 'link' ? undefined : 'link');
          }}
        >
          链接
        </button>
        <button
          disabled={busy}
          aria-expanded={tool === 'image'}
          onClick={() => {
            setTool(tool === 'image' ? undefined : 'image');
            if (tool !== 'image') void loadFiles().catch(showError);
          }}
        >
          图片
        </button>
      </div>
      {tool === 'link' && (
        <form
          className="canvas-tools"
          onSubmit={(event) => {
            event.preventDefault();
            if (editor?.chain().focus().setLink({ href: href.trim() }).run()) setTool(undefined);
            else setError('请输入有效的 HTTP 或 HTTPS 链接。');
          }}
        >
          <label>
            链接地址{' '}
            <input
              type="url"
              value={href}
              maxLength={2048}
              required
              onChange={(event) => setHref(event.target.value)}
            />
          </label>
          <button disabled={busy}>应用链接</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              editor?.chain().focus().extendMarkRange('link').unsetLink().run();
              setTool(undefined);
            }}
          >
            移除链接
          </button>
        </form>
      )}
      {tool === 'image' && (
        <form
          className="canvas-tools"
          onSubmit={(event) => {
            event.preventDefault();
            const file = files.find((file) => file.id === selectedImage);
            if (!file || !editor) return;
            void imageData(file.id, file.version.id)
              .then(() => {
                const position = editor.state.selection.$from;
                const after = position.depth ? position.after(1) : position.pos;
                editor
                  .chain()
                  .focus()
                  .insertContentAt(after, {
                    type: 'image',
                    attrs: { ...fileVersion(file), blockId: freshId(), alt: alt.trim() },
                  })
                  .run();
                setTool(undefined);
              })
              .catch(showError);
          }}
        >
          <label>
            资料库 PNG{' '}
            <select
              value={selectedImage}
              onChange={(event) => setSelectedImage(event.target.value)}
              required
            >
              <option value="">选择已导入的图片</option>
              {files
                .filter(
                  (file) =>
                    file.version.extension === 'png' && file.version.sizeBytes <= 128 * 1024,
                )
                .map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            替代文字{' '}
            <input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={1000} />
          </label>
          <button disabled={busy || !selectedImage}>插入图片</button>
        </form>
      )}
      <div className="canvas-layout">
        <div className="canvas-paper">
          <EditorContent editor={editor} />
        </div>
        <aside className="canvas-review" aria-label="文档工具">
          <nav aria-label="文档工具切换">
            {(
              [
                ['outline', '目录'],
                ['find', '查找'],
                ['comments', '批注'],
                ['ai', 'AI 修改'],
                ['history', '版本'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  if (id === 'ai') void loadFiles().catch(showError);
                  if (id === 'history') void loadHistory(draft.view).catch(showError);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'outline' && (
            <section aria-label="目录">
              {blocks.some((block) => block.heading) ? (
                <ol>
                  {blocks
                    .filter((block) => block.heading)
                    .map((block) => (
                      <li key={block.id}>
                        <button onClick={() => jump(block.pos)}>{block.text || '空标题'}</button>
                      </li>
                    ))}
                </ol>
              ) : (
                <p>插入小标题后可在此跳转。</p>
              )}
            </section>
          )}
          {tab === 'find' && (
            <section aria-label="查找和替换">
              <label>
                查找文字{' '}
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={1000}
                />
              </label>
              <label>
                替换为{' '}
                <input
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  maxLength={1000}
                />
              </label>
              <p role="status">{matches.length} 处匹配</p>
              <button
                disabled={!matches.length}
                onClick={() => {
                  const match =
                    matches.find((entry) => entry.from > (editor?.state.selection.from ?? 0)) ??
                    matches[0];
                  if (match) jump(match.from, match.to);
                }}
              >
                下一处
              </button>
              <button
                disabled={busy || !matches.length}
                onClick={() => {
                  if (!editor) return;
                  const tr = editor.state.tr;
                  for (const match of [...matches].reverse())
                    tr.insertText(replacement, match.from, match.to);
                  editor.view.dispatch(tr);
                }}
              >
                全部替换
              </button>
            </section>
          )}
          {tab === 'comments' && (
            <section aria-label="批注">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editor) return;
                  void run(async () => {
                    await changeComment({
                      type: 'add',
                      anchor: await hashRange(rangeOf(editor)),
                      text: comment,
                    });
                    setComment('');
                  });
                }}
              >
                <label>
                  选区批注{' '}
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    maxLength={4000}
                    required
                  />
                </label>
                <button disabled={busy || !controls?.selected || !comment.trim()}>添加批注</button>
              </form>
              {!draft.view.threads.length && <p>暂无批注。</p>}
              {draft.view.threads.map((thread) => {
                const block = blocks.find((block) => block.id === thread.anchor.blockId);
                const offset = thread.anchor.from;
                const located =
                  !draft.dirty &&
                  !thread.stale &&
                  block?.text.slice(offset, thread.anchor.to) === thread.quote;
                return (
                  <article key={thread.id} className="canvas-thread">
                    <button
                      disabled={!located}
                      onClick={() => {
                        if (block)
                          jump(block.pos + offset, block.pos + offset + thread.quote.length);
                      }}
                    >
                      {located ? thread.quote : draft.dirty ? '保存后可定位' : '原选区已失效'}
                    </button>
                    <p>{thread.text}</p>
                    <small>本机用户 · {thread.resolved ? '已解决' : '待处理'}</small>
                    {thread.replies.map((entry, index) => (
                      <p key={index}>{entry.text}</p>
                    ))}
                    <div>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setReplyTo(thread.id);
                          setReply('');
                        }}
                      >
                        回复
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            changeComment({
                              type: 'resolve',
                              threadId: thread.id,
                              resolved: !thread.resolved,
                            }),
                          )
                        }
                      >
                        {thread.resolved ? '重新打开' : '解决'}
                      </button>
                    </div>
                    {replyTo === thread.id && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            await changeComment({
                              type: 'reply',
                              threadId: thread.id,
                              text: reply,
                            });
                            setReplyTo('');
                          });
                        }}
                      >
                        <label>
                          批注回复{' '}
                          <textarea
                            required
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                            maxLength={4000}
                          />
                        </label>
                        <button disabled={busy || !reply.trim()}>保存回复</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          {tab === 'ai' && (
            <section aria-label="AI 修改">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask();
                }}
              >
                <label>
                  修改范围{' '}
                  <select
                    value={scope}
                    onChange={(event) => {
                      const next = event.target.value === 'whole' ? 'whole' : 'selection';
                      setScope(next);
                      if (next === 'selection' && action === 'structure') setAction('rewrite');
                    }}
                  >
                    <option value="selection">仅所选文字</option>
                    <option value="whole">整份正文</option>
                  </select>
                </label>
                <label>
                  修改方式{' '}
                  <select value={action} onChange={(event) => setAction(event.target.value)}>
                    <option value="rewrite">改写</option>
                    <option value="translate">翻译</option>
                    <option value="expand">扩写</option>
                    <option value="shorten">精简</option>
                    <option value="proofread">校对</option>
                    <option value="style">调整风格</option>
                    {scope === 'whole' && <option value="structure">重排正文结构</option>}
                  </select>
                </label>
                <label>
                  修改要求{' '}
                  <textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    maxLength={2000}
                  />
                </label>
                <label>
                  参考资料{' '}
                  <select value={reference} onChange={(event) => setReference(event.target.value)}>
                    <option value="">无</option>
                    {files
                      .filter((file) => ['md', 'markdown', 'docx'].includes(file.version.extension))
                      .map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name}
                        </option>
                      ))}
                  </select>
                </label>
                {reference && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const source = files.find((file) => file.id === reference);
                        if (!source) return;
                        const result = await canvasCommand('canvas.referenceStyle', {
                          ...base(await draft.flush()),
                          reference: fileVersion(source),
                        });
                        if ('canvas' in result) {
                          install(result.canvas);
                          setNotice('已采用参考文档的模板样式。');
                        }
                      })
                    }
                  >
                    采用模板样式
                  </button>
                )}
                <button
                  disabled={thinking || busy || (scope === 'selection' && !controls?.selected)}
                >
                  {thinking ? '正在生成建议…' : '生成修改建议'}
                </button>
              </form>
              {proposal?.items.map((item) => (
                <article className="canvas-change" key={item.blockId}>
                  <p>{item.explanation}</p>
                  <dl>
                    <dt>修改前</dt>
                    <dd>{item.before}</dd>
                    <dt>修改后</dt>
                    <dd>{item.replacement || '删除所选文字'}</dd>
                  </dl>
                  {[true, false].map((accept) => (
                    <button
                      key={String(accept)}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const view = await draft.flush();
                          if (view.versionId !== proposal.versionId) throw Error('CONFLICT');
                          const result = await canvasCommand('canvas.apply', {
                            ...base(view),
                            proposalId: proposal.proposalId,
                            blockId: item.blockId,
                            accept,
                          });
                          if ('canvas' in result && 'canvasProposal' in result) {
                            install(result.canvas, accept);
                            setProposal(
                              result.canvasProposal.items.length
                                ? result.canvasProposal
                                : undefined,
                            );
                          }
                        })
                      }
                    >
                      {accept ? '接受' : '拒绝'}
                    </button>
                  ))}
                </article>
              ))}
            </section>
          )}
          {tab === 'history' && (
            <section aria-label="版本历史">
              <ol>
                {history.map((item) => (
                  <li key={item.versionId}>
                    <button
                      onClick={() =>
                        void run(async () => {
                          const result = await canvasCommand('canvas.version', {
                            documentId: draft.view.documentId,
                            versionId: item.versionId,
                          });
                          if ('canvas' in result) setPreview(result.canvas);
                        })
                      }
                    >
                      v{item.revision} · {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </button>
                  </li>
                ))}
              </ol>
              {history.length >= 50 && history.length % 50 === 0 && (
                <button
                  onClick={() =>
                    void loadHistory(draft.view, history.at(-1)?.revision).catch(showError)
                  }
                >
                  更早的版本
                </button>
              )}
              {preview && (
                <div className="canvas-version-preview">
                  <h3>
                    v{preview.revision} · {preview.title}
                  </h3>
                  <div>
                    {preview.content.content.map((node, index) => (
                      <p key={index}>{previewText(node)}</p>
                    ))}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await canvasCommand('canvas.restore', {
                          ...base(await draft.flush()),
                          versionId: preview.versionId,
                        });
                        if ('canvas' in result) {
                          install(result.canvas, true);
                          setPreview(undefined);
                          await loadHistory(result.canvas);
                        }
                      })
                    }
                  >
                    恢复此版本
                  </button>
                </div>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const view = await draft.flush();
                    const result = await canvasCommand('canvas.copy', {
                      documentId: view.documentId,
                      versionId: preview?.versionId ?? view.versionId,
                    });
                    if ('canvas' in result) void navigate('/canvas/' + result.canvas.documentId);
                  })
                }
              >
                保存副本
              </button>
            </section>
          )}
        </aside>
      </div>
      <footer className="canvas-footer">
        <span>
          {blocks.reduce((n, block) => n + [...block.text.replace(/\s/g, '')].length, 0)} 字
        </span>
        <label>
          导出格式{' '}
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
            <option value="md">Markdown</option>
            <option value="docx">Word</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const view = await draft.flush();
              const result = await canvasCommand('canvas.export', {
                documentId: view.documentId,
                versionId: view.versionId,
                format: exportFormat,
              });
              if (!('canvasExport' in result)) throw Error('INTERNAL_ERROR');
              const saved = await window.tapkit.saveOriginal(result.canvasExport);
              if (!saved.ok) throw Error(saved.error.code);
              setNotice(
                'changedIds' in saved.data && saved.data.changedIds.length
                  ? '文件已导出。'
                  : '导出文件已保存在资料库。',
              );
            })
          }
        >
          导出
        </button>
      </footer>
    </section>
  );
}

function previewText(node: CanvasContent['content'][number]): string {
  if (node.type === 'image') return String(node.attrs?.alt || '图片');
  if (node.type === 'hardBreak') return '\n';
  return (
    node.text ?? (node.content ?? []).map(previewText).join(node.type === 'tableRow' ? ' | ' : '')
  );
}
