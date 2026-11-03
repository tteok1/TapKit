import { useEffect, useState, useRef } from 'react';
import {
  ResearchSpecSchema,
  ResearchViewSchema,
  type ResearchSpec,
  type ResourceRef,
  type WorkView,
} from '@tapkit/contracts';
import { workCommand } from './work-ui';
import { requestOptions } from './desktop-state';
import { useViewer } from '../features/viewer/state';
import './research.css';

export const defaultOutline = '事实与背景是什么？\n有哪些证据与不同观点？\n适用范围与局限是什么？';
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
export function researchFromForm(
  form: FormData,
  refs: ResourceRef[],
  format: string,
): ResearchSpec {
  return ResearchSpecSchema.parse({
    topic: form.get('goal'),
    purpose: form.get('purpose'),
    scope: form.get('scope'),
    questions: lines(form.get('researchQuestions')).map((text, i) => ({
      key: 'q' + (i + 1),
      text,
    })),
    webEnabled: form.has('researchWeb'),
    seedUrls: lines(form.get('seedUrls')),
    dates: {
      ...(form.get('researchFrom') ? { from: form.get('researchFrom') } : {}),
      ...(form.get('researchTo') ? { to: form.get('researchTo') } : {}),
    },
    includeDomains: lines(form.get('includeDomains')),
    excludeDomains: lines(form.get('excludeDomains')),
    localVersions: refs.flatMap((r) =>
      r.kind === 'file' ? [{ fileId: r.fileId, versionId: r.versionId }] : [],
    ),
    outputFormat: format,
  });
}
export function ResearchFields() {
  return (
    <fieldset className="work-wide research-fields">
      <legend>研究提纲</legend>
      <label className="work-wide">
        公开检索问题（每行一个，最多6个）
        <textarea
          name="researchQuestions"
          defaultValue={defaultOutline}
          maxLength={3000}
          required
        />
      </label>
      <label className="work-wide">
        研究用途
        <input name="purpose" maxLength={1000} placeholder="例如：比较方案、支持选型" />
      </label>
      <label className="work-wide research-check">
        <span>
          <input type="checkbox" name="researchWeb" defaultChecked /> 允许检索公开网页
        </span>
        <small>
          工作目标与上方问题会用于公开检索；文件正文不会自动转为搜索词。取消勾选可仅研究附加的本地资料。
        </small>
      </label>
      <label className="work-wide">
        起始网页（每行一个，可留空）
        <textarea name="seedUrls" maxLength={8000} placeholder="https://…" />
      </label>
      <label>
        发布日期起日
        <input type="date" name="researchFrom" />
      </label>
      <label>
        发布日期止日
        <input type="date" name="researchTo" />
      </label>
      <label>
        只查这些域名（每行一个）
        <textarea name="includeDomains" maxLength={2000} />
      </label>
      <label>
        排除域名（每行一个）
        <textarea name="excludeDomains" maxLength={2000} />
      </label>
      <small className="work-wide">
        提纲可在运行前后调整。搜索最多8次、来源读取最多40次，每个问题最多3轮；发布日期未知的网页不作为日期筛选的依据。
      </small>
    </fieldset>
  );
}
type ResearchView = ReturnType<typeof ResearchViewSchema.parse>;
type SourceView = {
  title: string;
  text: string;
  offset: number;
  start?: number;
  end?: number;
  url: string | null;
  time: number;
  hash: string | null;
};
const labels = {
  fact: '原文陈述',
  inference: '推断 · 待核验',
  gap: '证据缺口',
  conflict: '不同证据 · 未裁决',
};
const terminal = new Set(['completed', 'partial', 'failed', 'cancelled', 'budget_stopped']);
function researchError(message: string) {
  const reasons: Record<string, string> = {
    CONFLICT: '研究版本已更新，请打开最新任务版本后继续操作。',
    PERMISSION_DENIED: '当前资料或任务的访问权限已变化，请检查研究范围。',
    NOT_FOUND: '研究任务或资料已不存在，请返回工作列表查看。',
    VALIDATION_ERROR: '研究数据未通过校验，请重新读取；若仍失败，请保留任务并查看诊断。',
    SOURCE_UNAVAILABLE: '来源暂时无法读取，可更换来源或保留证据缺口。',
    WEB_UNAVAILABLE: '网页暂时无法读取，可稍后重试或更换来源。',
    BUDGET_EXCEEDED: '研究已达到预算，请保存部分成果或调整后创建新任务。',
  };
  return (
    reasons[message] ??
    (message === '研究设置已更新，请查看最新版本。' ? message : '研究操作未完成，请稍后重试。')
  );
}
export function ResearchPanel({
  work,
  onNavigate,
}: {
  work: WorkView;
  onNavigate: (path: string) => void;
}) {
  const [data, setData] = useState<ResearchView>(),
    [error, setError] = useState(''),
    [readError, setReadError] = useState(''),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [sourceOffset, setSourceOffset] = useState(0),
    [findingOffset, setFindingOffset] = useState(0),
    [source, setSource] = useState<SourceView>();
  const viewer = useViewer(),
    spec = work.definition.research!;
  const original = useRef<HTMLElement>(null),
    sourceTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (source) {
      original.current?.scrollIntoView({ block: 'start' });
      original.current?.focus({ preventScroll: true });
    }
  }, [source]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void workCommand('research.get', { runId: work.runId, sourceOffset, findingOffset })
      .then((reply) => {
        if (live && 'research' in reply) {
          setData(reply.research);
          setReadError('');
        }
      })
      .catch((e: Error) => live && setReadError(researchError(e.message)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [work, sourceOffset, findingOffset, reload]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(researchError((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function revise(research: ResearchSpec, text: string) {
    const current = await freshWork();
    const reply = await workCommand(
      'runs.steer',
      { runId: work.runId, text, research, refs: [], clientRequestId: requestOptions().requestId },
      current.revision,
    );
    if ('work' in reply) onNavigate('/work/' + reply.work.runId);
  }
  async function freshWork() {
    const reply = await workCommand('runs.get', { runId: work.runId });
    if (
      !('work' in reply) ||
      reply.work.version !== work.version ||
      JSON.stringify(reply.work.definition.research) !== JSON.stringify(spec)
    )
      throw Error('研究设置已更新，请查看最新版本。');
    return reply.work;
  }
  async function finish() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await freshWork();
      if (terminal.has(current.status)) return;
      try {
        await workCommand('research.finish', { runId: work.runId }, current.revision);
        return;
      } catch (e) {
        if (attempt || (e as Error).message !== 'CONFLICT') throw e;
      }
    }
  }
  async function showSource(sourceId: string, findingId?: string) {
    sourceTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const reply = await workCommand('research.source', {
      runId: work.runId,
      sourceId,
      ...(findingId ? { findingId } : {}),
    });
    if ('researchSource' in reply) {
      const q = reply.highlights[0];
      setSource({
        title: reply.researchSource.title,
        text: reply.text,
        offset: reply.offset,
        ...(q ? { start: q.start - reply.offset, end: q.end - reply.offset } : {}),
        url: reply.researchSource.url,
        time: reply.researchSource.fetchedAt,
        hash: reply.researchSource.contentHash,
      });
    }
  }
  return (
    <section className="research-panel" aria-label="深度研究">
      <header className="research-header">
        <div>
          <h3>深度研究</h3>
          <p>固定来源、逐字核验，保留证据冲突与未知。</p>
        </div>
        {work.status === 'waiting_user' &&
          work.reason === 'APPROVAL_REQUIRED' &&
          work.calls === 0 &&
          work.unresolvedCalls.length === 0 && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const current = await freshWork();
                  if (
                    JSON.stringify(
                      current.steps.map((s) => [
                        s.stepKey,
                        s.title,
                        s.dependencies,
                        s.inputRefs,
                        s.outputContract,
                        s.acceptance,
                        s.optional,
                      ]),
                    ) !==
                    JSON.stringify(
                      work.steps.map((s) => [
                        s.stepKey,
                        s.title,
                        s.dependencies,
                        s.inputRefs,
                        s.outputContract,
                        s.acceptance,
                        s.optional,
                      ]),
                    )
                  )
                    throw Error('计划已更新，请重新确认。');
                  return workCommand(
                    'runs.setPlan',
                    {
                      runId: work.runId,
                      steps: work.steps.map(
                        ({
                          stepKey,
                          title,
                          dependencies,
                          inputRefs,
                          outputContract,
                          acceptance,
                          optional,
                        }) => ({
                          stepKey,
                          title,
                          dependencies,
                          inputRefs,
                          outputContract,
                          acceptance,
                          optional,
                        }),
                      ),
                      executeStepIds: work.selectedSteps,
                    },
                    current.revision,
                  );
                })
              }
            >
              确认提纲并开始研究
            </button>
          )}
        {!terminal.has(work.status) && (
          <button disabled={busy} onClick={() => void action(finish)}>
            提前结束并保存部分成果
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {readError && (
        <div role="alert">
          <p>
            研究进度读取失败。{readError}
            {data && ' 当前显示上次读取的结果。'}
          </p>
          <button disabled={loading} onClick={() => setReload((value) => value + 1)}>
            重新读取进度
          </button>
        </div>
      )}
      {!data ? (
        loading ? (
          <p role="status">正在读取研究进度…</p>
        ) : null
      ) : (
        <>
          <p className="research-counts" role="status">
            搜索 {data.rootSearches} / 8 · 来源读取 {data.rootReads} / 40 · 已记录{' '}
            {data.totalFindings} 项发现
          </p>
          <ol className="research-outline">
            {spec.questions.map((q) => (
              <li key={q.key}>
                {q.text}{' '}
                <span>
                  本轮搜索 {data.progress.queries.filter((s) => s.questionKey === q.key).length} 次
                </span>
              </li>
            ))}
          </ol>
          {data.progress.lastIssue && <p role="status">待处理：{data.progress.lastIssue}</p>}
          <details>
            <summary>调整提纲与研究范围</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const questions = lines(f.get('outline')).map((text, i) => ({
                  key: spec.questions[i]?.key ?? 'q' + (i + 1),
                  text,
                }));
                void action(() =>
                  revise(
                    ResearchSpecSchema.parse({ ...spec, questions, scope: f.get('scope') }),
                    '按更新后的公开提纲与范围继续研究',
                  ),
                );
              }}
            >
              <label>
                公开检索问题（每行一个，最多6个）
                <textarea
                  name="outline"
                  defaultValue={spec.questions.map((q) => q.text).join('\n')}
                  required
                  maxLength={3000}
                />
              </label>
              <label>
                研究范围
                <textarea name="scope" defaultValue={spec.scope} maxLength={4000} />
              </label>
              <p>保存会创建新任务版本，保留已读资料的固定版本；不重置根任务预算。</p>
              <button disabled={busy}>保存提纲并创建新版本</button>
            </form>
          </details>
          <h4>已读取的来源</h4>
          {!data.totalSources && <p>尚未读取来源。搜索候选只有在实际读取后才可引用。</p>}
          <ul className="research-sources">
            {data.progress.sources.map((s) => (
              <li key={s.id}>
                <div>
                  <button
                    disabled={busy || s.status !== 'ready'}
                    onClick={() => void action(() => showSource(s.id))}
                  >
                    {s.title}
                  </button>
                  <span>
                    {s.excluded ? '已排除' : s.status === 'ready' ? '已归档' : '无法访问'}
                  </span>
                </div>
                <p>{s.url ?? '本地文件固定版本'}</p>
                <small>
                  访问/固定：{new Date(s.fetchedAt).toLocaleString()} · 发布：
                  {s.publishedAt === null ? '未知' : new Date(s.publishedAt).toLocaleDateString()}
                  {s.error ? ' · ' + s.error : ''}
                </small>
                {!s.excluded && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(() =>
                        revise(
                          { ...spec, excludedSources: [...spec.excludedSources, s.id] },
                          '排除此来源并重新查证',
                        ),
                      )
                    }
                  >
                    排除此来源并重新查证
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="research-pagination">
            <button disabled={!sourceOffset} onClick={() => setSourceOffset(0)}>
              来源首页
            </button>
            {data.nextSourceOffset !== null && (
              <button onClick={() => setSourceOffset(data.nextSourceOffset!)}>下一页来源</button>
            )}
          </div>
          <h4>阶段发现与依据</h4>
          {!data.totalFindings && <p>尚无可核验的发现。证据不足会如实保留缺口。</p>}
          <div className="research-findings">
            {data.progress.findings.map((f) => (
              <article key={f.id}>
                <strong>{labels[f.kind]}</strong>
                <p>{f.text}</p>
                <div className="work-actions">
                  {[...new Set([...f.supports, ...f.opposes].map((q) => q.sourceId))].map(
                    (id, i) => (
                      <button
                        key={id}
                        disabled={busy}
                        onClick={() => void action(() => showSource(id, f.id))}
                      >
                        查看原文依据 {i + 1}
                      </button>
                    ),
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(() =>
                        revise(
                          {
                            ...spec,
                            questions: spec.questions.filter((q) => q.key === f.questionKey),
                          },
                          '继续查证指定发现：\n' +
                            f.text +
                            '\n核对支持、不同证据与局限；沿用已确认的公开检索问题。',
                        ),
                      )
                    }
                  >
                    继续查证此发现
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="research-pagination">
            <button disabled={!findingOffset} onClick={() => setFindingOffset(0)}>
              发现首页
            </button>
            {data.nextFindingOffset !== null && (
              <button onClick={() => setFindingOffset(data.nextFindingOffset!)}>下一页发现</button>
            )}
          </div>
          {source && (
            <section
              className="research-original"
              aria-label="来源原文"
              ref={original}
              tabIndex={-1}
            >
              <header>
                <h4>{source.title}</h4>
                <button
                  onClick={() => {
                    setSource(undefined);
                    sourceTrigger.current?.focus();
                  }}
                >
                  关闭原文
                </button>
              </header>
              <p>
                {source.url ?? '本地文件固定版本'} · 字符窗口起点 {source.offset}
              </p>
              <p>固定时间：{new Date(source.time).toLocaleString()}</p>
              <pre>
                {source.start === undefined ? (
                  source.text
                ) : (
                  <>
                    {source.text.slice(0, source.start)}
                    <mark>{source.text.slice(source.start, source.end)}</mark>
                    {source.text.slice(source.end)}
                  </>
                )}
              </pre>
              <small>SHA256：{source.hash}</small>
            </section>
          )}
          {data.progress.report && (
            <section className="research-delivery">
              <h4>{data.progress.report.ready ? '研究成果' : '报告已保存，导出处理中'}</h4>
              <p>
                {data.progress.report.quality === 'partial'
                  ? '部分成果，仍有证据缺口。'
                  : '本轮证据整理完成；来源陈述仍需结合用途判断。'}
              </p>
              <div className="work-actions">
                {data.progress.report.refs.map(
                  (ref, i) =>
                    ref.kind === 'file' && (
                      <span className="work-actions" key={ref.versionId}>
                        <button
                          onClick={() =>
                            void action(() =>
                              viewer.open({
                                fileId: ref.fileId,
                                versionId: ref.versionId,
                                owner: { type: 'task', id: work.taskId },
                              }),
                            )
                          }
                        >
                          {['研究报告 MD', '来源清单 JSON', '研究报告 DOCX', '研究报告 PDF'][i] ??
                            '研究成果'}
                        </button>
                        <button
                          onClick={() =>
                            void action(() =>
                              window.tapkit.saveOriginal({
                                fileId: ref.fileId,
                                versionId: ref.versionId,
                              }),
                            )
                          }
                        >
                          下载成果 {i + 1}
                        </button>
                      </span>
                    ),
                )}
              </div>
            </section>
          )}
          <details>
            <summary>继续查证新问题</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  text = String(f.get('question')).trim();
                void action(() =>
                  revise(
                    ResearchSpecSchema.parse({ ...spec, questions: [{ key: 'followup', text }] }),
                    text,
                  ),
                );
              }}
            >
              <label>
                新的公开检索问题
                <input name="question" required maxLength={500} />
              </label>
              <p>创建独立运行并继承已读来源的固定版本；生成的报告不会作为研究来源。</p>
              <button disabled={busy}>创建新运行继续查证</button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
