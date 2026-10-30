import { useEffect, useState } from 'react';
import { WorkReplySchema, type ResourceRef, z, SlidePageSchema } from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { useViewer } from '../features/viewer/state';
type SlidePage = z.infer<typeof SlidePageSchema>;
export function SlidesResults({
  runId,
  taskId,
  reference,
  onAdjust,
}: {
  runId: string;
  taskId: string;
  reference: Extract<ResourceRef, { kind: 'file' }>;
  onAdjust: (text: string) => Promise<void>;
}) {
  const viewer = useViewer(),
    [page, setPage] = useState<SlidePage>(),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [right, setRight] = useState(''),
    [notes, setNotes] = useState('');
  useEffect(() => {
    let stale = false;
    setError('');
    void window.tapkit
      .workCommand(requestOptions(), 'runs.slides', {
        runId,
        fileId: reference.fileId,
        versionId: reference.versionId,
        ...(selected ? { slideId: selected } : {}),
      })
      .then((reply) => {
        if (stale) return;
        if (!reply.ok) throw Error(reply.error.code);
        const result = WorkReplySchema.parse(reply.data);
        if (!('slidePage' in result)) throw Error('PARSE_FAILED');
        setPage(result.slidePage);
        setTitle(result.slidePage.slide.title);
        setBody(result.slidePage.slide.bullets.join('\n'));
        setRight(result.slidePage.slide.rightBullets.join('\n'));
        setNotes(result.slidePage.slide.notes);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [runId, reference.fileId, reference.versionId, selected]);
  const index = page?.slides.findIndex((s) => s.id === page.slide.id) ?? 0;
  const adjust = async (text: string) => {
    setBusy(true);
    setError('');
    try {
      await onAdjust(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="slide-results" aria-label="演示文稿成果" aria-busy={busy}>
      <h2>{page?.title ?? '演示文稿成果'}</h2>
      {error && (
        <p role="alert">暂时无法完成（{error}），已保留当前内容，请检查权限或重新读取当前版本。</p>
      )}
      {page && (
        <>
          <p>
            {page.slides.length}页 · {page.aspectRatio} ·{' '}
            {page.theme === 'light_business' ? '浅色商务' : '深色演示'}
            。每次修改生成新版本，历史版本保留。
          </p>
          {!page.current && <p role="status">当前查看历史版本。请打开最新成果后修改。</p>}
          <div className="slide-workspace">
            <nav aria-label="幻灯片列表">
              <ol>
                {page.slides.map((s, i) => (
                  <li key={s.id}>
                    <button
                      aria-current={s.id === page.slide.id ? 'page' : undefined}
                      onClick={() => setSelected(s.id)}
                    >
                      {i + 1}. {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="slide-content">
              <div className="work-actions">
                <button
                  onClick={() =>
                    void viewer.open({
                      fileId: page.preview.fileId,
                      versionId: page.preview.versionId,
                      owner: { type: 'task', id: taskId },
                      locator: { kind: 'pdf', pageIndex: index },
                    })
                  }
                >
                  预览第{index + 1}页 PDF
                </button>
                <button
                  onClick={() =>
                    void window.tapkit.saveOriginal({
                      fileId: reference.fileId,
                      versionId: reference.versionId,
                    })
                  }
                >
                  下载可编辑PPTX
                </button>
                <button
                  onClick={() =>
                    void window.tapkit.saveOriginal({
                      fileId: page.preview.fileId,
                      versionId: page.preview.versionId,
                    })
                  }
                >
                  下载PDF
                </button>
              </div>
              <form
                aria-label="修改当前幻灯片"
                onSubmit={(event) => {
                  event.preventDefault();
                  void adjust(
                    `将当前演示文稿第${index + 1}页标题修改为“${title}”。正文逐条替换为：\n${body}\n右栏逐条替换为：\n${right}\n讲者备注替换为：\n${notes}\n保留本页图片、表格和图表，其他页与备注保持不变。`,
                  );
                }}
              >
                <label>
                  页面标题
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={300}
                    required
                  />
                </label>
                <label>
                  页面正文（每行一条）
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={4000}
                  />
                </label>
                {page.slide.layout === 'two_columns' && (
                  <label>
                    右栏正文
                    <textarea
                      value={right}
                      onChange={(e) => setRight(e.target.value)}
                      maxLength={4000}
                    />
                  </label>
                )}
                {page.slide.table && (
                  <div className="data-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {page.slide.table.headers.map((h, i) => (
                            <th key={i}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {page.slide.table.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((v, j) => (
                              <td key={j}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <label>
                  讲者备注
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={3000}
                  />
                </label>
                <button disabled={busy || !page.current} type="submit">
                  生成修改版本
                </button>
              </form>
              <div className="work-actions">
                <button
                  disabled={busy || !page.current || page.slides.length >= 50}
                  onClick={() =>
                    void adjust(
                      `复制当前演示文稿第${index + 1}页，副本放在其后并使用新的页ID。保留所有其他页与备注。`,
                    )
                  }
                >
                  复制此页
                </button>
                <button
                  disabled={busy || !page.current || index === 0}
                  onClick={() =>
                    void adjust(
                      `将当前演示文稿第${index + 1}页移动到第${index}页，保留其他内容和备注。`,
                    )
                  }
                >
                  上移一页
                </button>
                <button
                  disabled={busy || !page.current || index === page.slides.length - 1}
                  onClick={() =>
                    void adjust(
                      `将当前演示文稿第${index + 1}页移动到第${index + 2}页，保留其他内容和备注。`,
                    )
                  }
                >
                  下移一页
                </button>
                <button
                  disabled={busy || !page.current || page.slides.length <= 1}
                  onClick={() =>
                    void adjust(`删除当前演示文稿第${index + 1}页，保留其他页全部内容与备注。`)
                  }
                >
                  删除此页
                </button>
                <button
                  disabled={busy || !page.current || page.slides.length >= 50}
                  onClick={() =>
                    void adjust(
                      `在当前演示文稿第${index + 1}页之后插入正文布局页，使用新页ID；标题“${title}”，正文：\n${body}\n备注：\n${notes}\n保留其他页不变。`,
                    )
                  }
                >
                  在此页后新增
                </button>
              </div>
              <p>
                更换图片、表格或图表，可在任务下方补充修改要求并选择材料；只使用已授权的固定版本。
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
