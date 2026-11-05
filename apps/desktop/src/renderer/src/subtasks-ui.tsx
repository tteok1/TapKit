import { useEffect, useState } from 'react';
import { type WorkView, type DelegateSpec, type WorkCommand } from '@tapkit/contracts';
import { workCommand } from './work-ui';
import t from '../locales/work.zh-CN.json';

export function SubtasksPanel({
  work,
  onNavigate,
}: {
  work: WorkView;
  onNavigate: (path: string) => void;
}) {
  const [items, setItems] = useState<WorkView[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [summaryMode, setSummaryMode] = useState(!!work.definition.delegationSummaryOnly);
  useEffect(
    () => setSummaryMode(!!work.definition.delegationSummaryOnly),
    [work.definition.delegationSummaryOnly],
  );
  const terminal = ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(
    work.status,
  );
  async function read() {
    const all: WorkView[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const data = await workCommand('subtasks.list', { runId: work.runId, offset });
      if (!('workItems' in data)) throw Error('VALIDATION_ERROR');
      all.push(...data.workItems);
      offset = data.nextOffset ?? null;
    }
    setItems(all);
  }
  useEffect(() => {
    if (work.delegation) return;
    let alive = true;
    const load = () => {
      if (alive) void read().catch((e: Error) => alive && setError(e.message));
    };
    load();
    const timer = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [work.runId]);
  async function mutate(command: WorkCommand, payload: unknown, _oldRevision?: number) {
    const current = await workCommand('runs.get', { runId: work.runId });
    if (!('work' in current) || current.work.version !== work.version) throw Error('CONFLICT');
    return workCommand(command, payload, current.work.revision);
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'work' in result) {
        const next = (result as { work: WorkView }).work;
        if (next.runId !== work.runId) onNavigate('/work/' + next.runId);
      }
      await read();
    } catch (e) {
      setError('子任务操作未完成：' + (e instanceof Error ? e.message : '请重新读取后重试'));
    } finally {
      setBusy(false);
    }
  }
  if (work.delegation)
    return (
      <section aria-label="子任务关系">
        <button onClick={() => onNavigate('/work/' + work.delegation!.parentRunId)}>
          返回主任务
        </button>
        <p>
          {work.delegation.role === 'researcher' ? '研究员' : '审查员'} · {work.delegation.key}
          {work.delegation.archived ? ' · 历史版本' : ''}
        </p>
        {work.delegation.result && <Result work={work} />}
      </section>
    );
  return (
    <section className="subtasks-panel" aria-label="子任务协调">
      <h3>子任务</h3>
      <p>
        默认由单个智能体完成。可将独立资料研究或审查交给子任务；最多两个并行，费用计入主任务预算。
      </p>
      <button onClick={() => onNavigate('/settings/models')}>查看模型用量与费用</button>
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={busy} onClick={() => void act(read)}>
            重新读取
          </button>
        </p>
      )}
      {!items.length && <p>尚未委派子任务。先暂停主任务或在确认计划前添加。</p>}
      {!!items.length &&
        work.definition.planFirst &&
        !work.calls &&
        !work.tools &&
        ['waiting_user', 'paused', 'queued'].includes(work.status) && (
          <button
            disabled={busy}
            onClick={() =>
              void act(() =>
                mutate('runs.setPlan', {
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
                }),
              )
            }
          >
            确认计划并开始子任务
          </button>
        )}
      {!terminal &&
        work.definition.format === 'md' &&
        !work.definition.research &&
        work.definition.quantity === 1 &&
        !work.calls &&
        ['queued', 'waiting_user', 'paused'].includes(work.status) && (
          <label>
            <input
              type="checkbox"
              checked={summaryMode}
              disabled={busy}
              onChange={(e) => {
                const enabled = e.target.checked;
                setSummaryMode(enabled);
                void act(async () => {
                  try {
                    return await mutate('subtasks.summaryMode', { runId: work.runId, enabled });
                  } catch (error) {
                    setSummaryMode(!enabled);
                    throw error;
                  }
                });
              }}
            />
            仅汇总子任务结论、逐字依据与缺口（不追加主模型请求）
          </label>
        )}
      {items.map((child) => (
        <article key={child.runId} className="subtask-row">
          <h4>
            <button onClick={() => onNavigate('/work/' + child.runId)}>
              {child.definition.goal}
            </button>
          </h4>
          <p>
            {child.delegation?.role === 'researcher' ? '研究员' : '审查员'} ·{' '}
            {t.statuses[child.status]}
            {child.delegation?.archived ? ' · 历史版本' : ''} · 依赖：
            {child.delegation?.dependencies
              .map(
                (key) =>
                  items.find((item) => item.delegation?.key === key)?.definition.goal ?? '历史依赖',
              )
              .join('、') || '无'}
          </p>
          {child.reason && (
            <p>
              {(
                {
                  NETWORK_ERROR: '连接未完成，可重试此子任务。',
                  VALIDATION_ERROR: '返回格式不符合要求，可补充要求并重试。',
                  STREAM_INTERRUPTED: '响应中断，尚未发布结果，可重试此子任务。',
                  OUTPUT_LIMIT_REACHED: '资料或输出过长，请分配较小的资料片段。',
                } as Record<string, string>
              )[child.reason] ??
                (t.reasons as Record<string, string>)[child.reason] ??
                child.reason}
            </p>
          )}
          <Result work={child} />
          {!child.delegation?.archived && (
            <div className="work-actions">
              {!terminal && ['queued', 'running'].includes(child.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      mutate(
                        'subtasks.control',
                        { runId: work.runId, childRunId: child.runId, action: 'pause' },
                        work.revision,
                      ),
                    )
                  }
                >
                  暂停此子任务
                </button>
              )}
              {!terminal && child.status === 'paused' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      mutate(
                        'subtasks.control',
                        { runId: work.runId, childRunId: child.runId, action: 'resume' },
                        work.revision,
                      ),
                    )
                  }
                >
                  继续此子任务
                </button>
              )}
              {['failed', 'budget_stopped', 'partial'].includes(child.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      mutate(
                        'subtasks.control',
                        { runId: work.runId, childRunId: child.runId, action: 'retry' },
                        work.revision,
                      ),
                    )
                  }
                >
                  重试此子任务
                </button>
              )}
              <form
                aria-label={'补充要求 ' + child.definition.goal}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void act(() =>
                    mutate(
                      'subtasks.control',
                      {
                        runId: work.runId,
                        childRunId: child.runId,
                        action: 'steer',
                        feedback: String(data.get('feedback')),
                      },
                      work.revision,
                    ),
                  );
                }}
              >
                <label>
                  补充要求
                  <input name="feedback" required maxLength={4000} />
                </label>
                <button disabled={busy}>创建修订子任务</button>
              </form>
            </div>
          )}
        </article>
      ))}
      {!terminal && !['running', 'waiting_tool', 'pausing', 'recovering'].includes(work.status) && (
        <details open={adding} onToggle={(e) => setAdding(e.currentTarget.open)}>
          <summary>添加只读子任务</summary>
          <form
            aria-label="添加子任务"
            className="work-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form),
                refs = work.definition.refs
                  .filter((_, i) => data.getAll('inputs').includes(String(i)))
                  .filter((ref) => ref.kind !== 'project');
              const spec: DelegateSpec = {
                key: 'branch-' + crypto.randomUUID().slice(0, 8),
                role: data.get('role') as DelegateSpec['role'],
                goal: String(data.get('goal')),
                inputs: refs,
                forbidden: ['不写文件或对外操作', '不更改主任务、设置或记忆'],
                allowedTools: ['source.read', 'task.result'],
                outputContract: 'research-review-v1',
                acceptance: { minEvidence: refs.length ? 1 : 0 },
                budget: {
                  tokens: Math.min(
                    Number(data.get('tokens')),
                    work.definition.budgetOverrides.tokens,
                  ),
                  activeMs: Math.min(120000, work.definition.budgetOverrides.activeMs),
                  maxCalls: 1,
                  maxTools: Math.min(refs.length + 1, work.definition.budgetOverrides.maxTools),
                },
                deadline: work.definition.deadlineAt,
                parentTaskVersion: work.version,
                dependencies: data.getAll('dependencies').map(String),
              };
              void act(async () => {
                await mutate('task.delegate', { runId: work.runId, spec }, work.revision);
                form.reset();
              });
            }}
          >
            <label>
              负责人
              <select name="role" aria-label="负责人">
                <option value="researcher">研究员</option>
                <option value="reviewer">审查员</option>
              </select>
            </label>
            <label className="work-wide">
              子任务目标
              <textarea name="goal" required maxLength={4000} />
            </label>
            <fieldset className="work-wide">
              <legend>分配资料（仅限主任务已选版本）</legend>
              {work.definition.refs.length ? (
                work.definition.refs.map((ref, i) => (
                  <label key={i}>
                    <input type="checkbox" name="inputs" value={i} defaultChecked />
                    资料 {i + 1} · {ref.kind}
                  </label>
                ))
              ) : (
                <p>未选资料时只能给出待核实分析，不能宣称来源已验证。</p>
              )}
            </fieldset>
            <fieldset className="work-wide">
              <legend>依赖子任务</legend>
              {items
                .filter((c) => !c.delegation?.archived)
                .map((c) => (
                  <label key={c.runId}>
                    <input type="checkbox" name="dependencies" value={c.delegation?.key} />
                    {c.definition.goal}
                  </label>
                ))}
              {!items.length && <p>无依赖，可独立执行。</p>}
            </fieldset>
            <label>
              子任务 token 上限
              <input
                name="tokens"
                type="number"
                min={1024}
                max={work.definition.budgetOverrides.tokens}
                defaultValue={Math.min(16384, work.definition.budgetOverrides.tokens)}
                required
              />
            </label>
            <p className="work-wide">
              每次最多一次模型请求，只读当前分配资料；重试保留主任务已用预算。
            </p>
            <button disabled={busy}>委派子任务</button>
          </form>
        </details>
      )}
    </section>
  );
}
function Result({ work }: { work: WorkView }) {
  const [source, setSource] = useState<{
      text: string;
      name: string;
      offset: number;
      start: number;
      end: number;
      sha256: string;
    }>(),
    [error, setError] = useState('');
  const result = work.delegation?.result;
  if (!result) return null;
  return (
    <div className="subtask-result">
      <p>{result.conclusion}</p>
      <p>原文位置已核对；结论仍需主任务判断。</p>
      {result.evidence.map((e, i) => (
        <blockquote key={i}>
          <p>{e.quote}</p>
          <button
            onClick={() => {
              setError('');
              void workCommand('subtasks.source', { runId: work.runId, evidenceIndex: i })
                .then((data) => {
                  if ('delegateSource' in data) setSource(data.delegateSource);
                })
                .catch((e: Error) =>
                  setError('原文读取失败：' + e.message + '。请核对资料是否仍可访问后重试。'),
                );
            }}
          >
            查看依据 {i + 1}
          </button>
          <small>
            资料 {e.inputIndex + 1} · 字符 {e.start}–{e.end}
          </small>
        </blockquote>
      ))}
      {error && <p role="alert">{error}</p>}
      {source && (
        <section className="subtask-original" aria-label="子任务原文">
          <h4>{source.name}</h4>
          <p>SHA256 {source.sha256}</p>
          <p className="subtask-source-text">
            {source.text.slice(0, source.start - source.offset)}
            <mark>
              {source.text.slice(source.start - source.offset, source.end - source.offset)}
            </mark>
            {source.text.slice(source.end - source.offset)}
          </p>
          <button onClick={() => setSource(undefined)}>关闭原文</button>
        </section>
      )}
      {!!result.uncertainty.length && <p>待核实：{result.uncertainty.join('；')}</p>}
      {!!result.actions.length && <p>建议（未执行）：{result.actions.join('；')}</p>}
    </div>
  );
}
