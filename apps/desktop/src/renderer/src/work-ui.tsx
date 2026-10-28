import { useEffect, useState } from 'react';
import {
  WorkReplySchema,
  CreatedEntitySchema,
  CatalogViewSchema,
  type WorkView,
  type PlanStepInput,
  type WorkCommand,
  type ResourceRef,
  ChatMaterialsViewSchema,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { useViewer } from '../features/viewer/state';
import t from '../locales/work.zh-CN.json';
import './work.css';
import { importChatFiles } from './chat-file-import';

async function readyWorkMaterials(sessionId: string, refs: ResourceRef[]) {
  const deadline = performance.now() + 120000;
  while (refs.length) {
    const reply = await window.tapkit.chatCommand(requestOptions(), 'inputs.references', {
      sessionId,
      refs,
    });
    if (!reply.ok) throw Error(reply.error.code);
    const materials = ChatMaterialsViewSchema.parse(reply.data).materials;
    if (materials.every((m) => m.state === 'ready')) return;
    if (materials.some((m) => m.state === 'failed' || m.state === 'unsupported'))
      throw Error('PARSE_FAILED');
    if (performance.now() > deadline) throw Error('INDEX_NOT_READY');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function workCommand(command: WorkCommand, payload: unknown = {}, revision?: number) {
  const reply = await window.tapkit.workCommand(requestOptions(revision), command, payload);
  if (!reply.ok) throw Error(reply.error.code);
  return WorkReplySchema.parse(reply.data);
}
export function WorkCenter({
  onNavigate,
  runId,
  sessionId,
  projects = [],
}: {
  onNavigate: (path: string) => void;
  runId?: string | undefined;
  sessionId?: string | undefined;
  projects?: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<WorkView[]>([]),
    [current, setCurrent] = useState<WorkView>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [capacity, setCapacity] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('updated'),
    [project, setProject] = useState(''),
    [model, setModel] = useState(''),
    [since, setSince] = useState(''),
    [archived, setArchived] = useState(false),
    [board, setBoard] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [batch, setBatch] = useState('');
  async function reload() {
    if (runId) {
      const data = await workCommand('runs.get', { runId });
      if ('work' in data) setCurrent(data.work);
    } else {
      const data = await workCommand('runs.list', {
        query,
        ...(status ? { status } : {}),
        ...(project ? { projectId: project } : {}),
        ...(model ? { modelId: model } : {}),
        ...(since ? { since: new Date(since).getTime() } : {}),
        sort,
        archived,
      });
      if ('workItems' in data) {
        setItems(data.workItems.filter((r) => !sessionId || r.sessionId === sessionId));
        setCapacity(`${data.running} / ${data.capacity}`);
      }
    }
  }
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (!cancelled) void reload().catch((e: Error) => !cancelled && setError(e.message));
    };
    read();
    const timer = setInterval(read, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, sessionId, query, status, sort, project, model, since, archived]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="work-center" aria-label={t.title}>
      <header className="work-header">
        <div>
          <h1>{t.title}</h1>
          <p>{t.background}</p>
        </div>
        <button onClick={() => setCreating(!creating)}>{t.new}</button>
      </header>
      {error && (
        <p role="alert">
          {t.error}
          {error} <button onClick={() => void action(reload)}>{t.refresh}</button>
        </p>
      )}
      {creating && (
        <WorkCreate
          sessionId={sessionId}
          projects={projects}
          onCreated={(id) => {
            setCreating(false);
            onNavigate('/work/' + id);
          }}
        />
      )}
      {runId ? (
        current ? (
          <WorkDetail work={current} busy={busy} action={action} onNavigate={onNavigate} />
        ) : (
          <p role="status">{error ? t.notFound : t.busy}</p>
        )
      ) : (
        <>
          <div className="work-filters">
            <label>
              {t.search}
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              {t.status}
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t.all}</option>
                {Object.entries(t.statuses).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.project}
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">{t.all}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.model}
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label>
              {t.created}
              <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </label>
            <label>
              {t.workflow}
              <select>
                <option>{t.general}</option>
              </select>
            </label>
            <label>
              {t.sort}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="updated">{t.updated}</option>
                <option value="created">{t.created}</option>
                <option value="priority">{t.priority}</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              {t.archived}
            </label>
            <button aria-pressed={board} onClick={() => setBoard(!board)}>
              {board ? t.list : t.board}
            </button>
          </div>
          <p role="status">
            {t.capacity}：{capacity} · {t.selected}：{selected.length}
          </p>
          {!!selected.length && (
            <div className="work-actions">
              {(['pause', 'cancel', 'archive'] as const).map((actionName, i) => (
                <button
                  key={actionName}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const data = await workCommand('runs.batch', {
                        runIds: selected,
                        action: actionName,
                      });
                      if ('workResults' in data)
                        setBatch(
                          data.workResults
                            .map(
                              (r) =>
                                `${items.find((i) => i.runId === r.runId)?.definition.goal ?? r.runId}：${r.ok ? '✓' : r.code}`,
                            )
                            .join('\n'),
                        );
                      setSelected([]);
                    })
                  }
                >
                  {[t.batchPause, t.batchCancel, t.batchArchive][i]}
                </button>
              ))}
            </div>
          )}
          {batch && <pre aria-label={t.partialResults}>{batch}</pre>}
          {!items.length && <p>{t.empty}</p>}
          <div className={board ? 'work-board' : 'work-list'}>
            {(board ? Object.keys(t.statuses) : ['']).map((key) => (
              <section
                key={key}
                aria-label={key ? t.statuses[key as keyof typeof t.statuses] : t.list}
              >
                {key && <h2>{t.statuses[key as keyof typeof t.statuses]}</h2>}
                {items
                  .filter((r) => !key || r.status === key)
                  .map((r) => (
                    <article key={r.runId} className="work-row">
                      <input
                        type="checkbox"
                        aria-label={r.definition.goal}
                        checked={selected.includes(r.runId)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.runId]
                              : selected.filter((id) => id !== r.runId),
                          )
                        }
                      />
                      <button className="work-open" onClick={() => onNavigate('/work/' + r.runId)}>
                        <strong>
                          {r.pinned ? '★ ' : ''}
                          {r.definition.goal}
                        </strong>
                        <span>
                          {t.statuses[r.status]} ·{' '}
                          {r.steps.filter((s) => s.status === 'completed').length}/{r.steps.length}
                          {r.overdue ? ' · ' + t.overdue : ''}
                        </span>
                      </button>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function WorkCreate({
  sessionId,
  projects,
  onCreated,
}: {
  sessionId?: string | undefined;
  projects: { id: string; name: string }[];
  onCreated: (id: string) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<{ accountId: string; modelId: string; displayName: string }[]>(
      [],
    );
  const [inputFiles, setInputFiles] = useState<File[]>([]),
    [importedRefs, setImportedRefs] = useState<ResourceRef[]>([]),
    [createdSession, setCreatedSession] = useState<{ id: string; project: string }>();
  useEffect(() => {
    void window.tapkit
      .modelCommand(requestOptions(), 'models.catalog', {})
      .then((reply) => {
        if (reply.ok)
          setModels(
            CatalogViewSchema.parse(reply.data).catalog.flatMap((m) =>
              m.accountId && m.status === 'ready'
                ? [{ accountId: m.accountId, modelId: m.modelId, displayName: m.displayName }]
                : [],
            ),
          );
      })
      .catch(() => {});
  }, []);
  return (
    <form
      className="work-create"
      aria-label={t.new}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        void (async () => {
          const project = String(form.get('project') ?? '');
          let id =
            sessionId ?? (createdSession?.project === project ? createdSession.id : undefined);
          if (!id) {
            const reply = await window.tapkit.desktopCommand(requestOptions(), 'sessions.create', {
              mode: 'work',
              title: String(form.get('goal')).slice(0, 80),
              ...(form.get('project') ? { projectId: form.get('project') } : {}),
            });
            if (!reply.ok) throw Error(reply.error.code);
            id = CreatedEntitySchema.parse(reply.data).entityId;
            setCreatedSession({ id, project });
          }
          let refs = importedRefs;
          if (inputFiles.length && !refs.length) {
            const result = await importChatFiles(
              window.tapkit,
              inputFiles,
              id,
              new AbortController().signal,
              () => {},
            );
            refs = result.refs;
            setImportedRefs(refs);
            if (result.errors.length) throw Error(result.errors[0]);
          }
          await readyWorkMaterials(id, refs);
          const selection = models.find((m) => m.accountId + ':' + m.modelId === form.get('model')),
            format = String(form.get('format'));
          const data = await workCommand('runs.create', {
            sessionId: id,
            refs,
            goal: form.get('goal'),
            audience: form.get('audience'),
            language: form.get('language'),
            format,
            quantity: Number(form.get('quantity')),
            scope: form.get('scope'),
            acceptance: [
              { kind: 'file_exists', format, minCount: 1 },
              ...(String(form.get('acceptance')).trim()
                ? [{ kind: 'human_review', description: form.get('acceptance') }]
                : []),
            ],
            deadlineAt: form.get('deadline')
              ? new Date(String(form.get('deadline'))).getTime()
              : null,
            planFirst: form.has('planFirst'),
            budgetOverrides: {
              tokens: Number(form.get('tokens')),
              activeMs: Number(form.get('minutes')) * 60000,
              maxCalls: 40,
              maxTools: 80,
            },
            ...(selection
              ? { modelRef: { accountId: selection.accountId, modelId: selection.modelId } }
              : {}),
          });
          if ('work' in data) onCreated(data.work.runId);
        })()
          .catch((e: Error) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="work-wide">
        {t.goal}
        <textarea name="goal" required maxLength={20000} />
      </label>
      <label className="work-wide">
        {t.materials}
        <input
          type="file"
          multiple
          onChange={(e) => {
            setInputFiles([...(e.target.files ?? [])]);
            setImportedRefs([]);
          }}
        />
        {inputFiles.map((f) => f.name).join('、')}
      </label>
      <label>
        {t.audience}
        <input name="audience" defaultValue="用户本人" />
      </label>
      <label>
        {t.language}
        <input name="language" defaultValue="简体中文" required />
      </label>
      <label>
        {t.format}
        <select name="format">
          {['md', 'txt', 'json', 'csv', 'pdf'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        {t.quantity}
        <input name="quantity" type="number" min={1} max={12} defaultValue={1} />
      </label>
      <label className="work-wide">
        {t.scope}
        <input name="scope" defaultValue="仅当前任务与明确提供的材料" />
      </label>
      <label className="work-wide">
        {t.acceptance}
        <input name="acceptance" maxLength={2000} />
      </label>
      <label>
        {t.deadline}
        <input name="deadline" type="datetime-local" />
      </label>
      <label>
        {t.tokens}
        <input name="tokens" type="number" min={1024} max={600000} defaultValue={600000} />
      </label>
      <label>
        {t.minutes}
        <input name="minutes" type="number" min={1} max={30} defaultValue={30} />
      </label>
      <label>
        {t.model}
        <select name="model">
          <option value="">{t.defaultModel}</option>
          {models.map((m) => (
            <option key={m.accountId + ':' + m.modelId} value={m.accountId + ':' + m.modelId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>
      {!sessionId && (
        <label>
          {t.project}
          <select name="project">
            <option value="">{t.none}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <input type="checkbox" name="planFirst" />
        {t.planFirst}
      </label>
      <button disabled={busy}>{busy ? t.busy : t.create}</button>
      {error && (
        <p role="alert">
          {t.error}
          {error}
        </p>
      )}
    </form>
  );
}
function WorkDetail({
  work: r,
  busy,
  action,
  onNavigate,
}: {
  work: WorkView;
  busy: boolean;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const viewer = useViewer(),
    [editing, setEditing] = useState(false),
    [steps, setSteps] = useState<PlanStepInput[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [steer, setSteer] = useState(''),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const [steerFiles, setSteerFiles] = useState<File[]>([]),
    [steerRefs, setSteerRefs] = useState<ResourceRef[]>([]);
  const invoke = (command: WorkCommand, payload: Record<string, unknown> = {}) =>
    action(() => workCommand(command, { runId: r.runId, ...payload }, r.revision));
  const terminal = ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(
    r.status,
  );
  return (
    <div className="work-detail">
      <button onClick={() => onNavigate('/work')}>{t.back}</button>
      <h2>{r.definition.goal}</h2>
      <dl className="work-definition">
        <dt>{t.audience}</dt>
        <dd>{r.definition.audience}</dd>
        <dt>{t.language}</dt>
        <dd>{r.definition.language}</dd>
        <dt>{t.format}</dt>
        <dd>
          {r.definition.format} × {r.definition.quantity}
        </dd>
        <dt>{t.scope}</dt>
        <dd>{r.definition.scope}</dd>
        <dt>{t.materials}</dt>
        <dd>{r.definition.refs.length}</dd>
        <dt>{t.deadline}</dt>
        <dd>
          {r.definition.deadlineAt ? new Date(r.definition.deadlineAt).toLocaleString() : t.none}
        </dd>
      </dl>
      <p role="status">
        {t.statuses[r.status]} · {t.version} {r.version} · {t.elapsed}{' '}
        {Math.round(r.activeMs / 1000)} · {t.usage} {r.tokens} tokens
      </p>
      {r.reason && <p>{(t.reasons as Record<string, string>)[r.reason] ?? r.reason}</p>}
      {r.reason === 'SIDE_EFFECT_UNKNOWN' && <p role="alert">{t.reconcile}</p>}
      {!!r.unresolvedCalls.length && (
        <section aria-label={t.reconcile}>
          {r.unresolvedCalls.map((call) => (
            <article key={call.id}>
              <p>
                {call.tool} · {call.helperState ?? t.unknown}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void invoke('runs.reconcile', {
                    callId: call.id,
                    decision: call.resultAvailable ? 'accept_verified' : 'not_committed',
                  })
                }
              >
                {call.resultAvailable ? t.verifyResult : t.notCommitted}
              </button>
            </article>
          ))}
        </section>
      )}
      <div className="work-actions">
        {!terminal && (
          <>
            <button disabled={busy} onClick={() => void invoke('runs.pause')}>
              {t.pause}
            </button>
            <button
              disabled={busy || !['paused', 'waiting_user'].includes(r.status)}
              onClick={() => void invoke('runs.resume')}
            >
              {t.resume}
            </button>
            <button disabled={busy} onClick={() => void invoke('runs.cancel')}>
              {t.cancel}
            </button>
          </>
        )}
        {terminal && r.status !== 'completed' && (
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const data = await workCommand(
                  'runs.retry',
                  { runId: r.runId, reuseVerifiedArtifacts: true },
                  r.revision,
                );
                if ('work' in data) onNavigate('/work/' + data.work.runId);
              })
            }
          >
            {t.retry}
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const data = await workCommand('runs.copy', { runId: r.runId });
              if ('work' in data) onNavigate('/work/' + data.work.runId);
            })
          }
        >
          {t.copy}
        </button>
        <button disabled={busy} onClick={() => void invoke('runs.organize', { pinned: !r.pinned })}>
          {r.pinned ? t.unpin : t.pin}
        </button>
        <button disabled={busy} onClick={() => void invoke('runs.organize', { muted: !r.muted })}>
          {r.muted ? t.unmute : t.mute}
        </button>
        <button
          disabled={busy}
          onClick={() => void invoke('runs.organize', { archived: !r.archived })}
        >
          {t.archive}
        </button>
        <label>
          {t.priority}
          <input
            type="number"
            min={0}
            max={9}
            value={r.priority}
            onChange={(e) => void invoke('runs.organize', { priority: Number(e.target.value) })}
          />
        </label>
      </div>
      <h3>{t.plan}</h3>
      <p>{t.dependencyHint}</p>
      {!terminal && !r.calls && !r.tools && (
        <button
          onClick={() => {
            setSteps(
              r.steps.map(
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
            );
            setSelected(r.selectedSteps);
            setEditing(true);
          }}
        >
          {t.editPlan}
        </button>
      )}
      {editing ? (
        <div className="work-plan-editor">
          {steps.map((s, index) => (
            <fieldset key={s.stepKey}>
              <legend>{index + 1}</legend>
              <label>
                {t.stepTitle}
                <input
                  value={s.title}
                  onChange={(e) =>
                    setSteps(
                      steps.map((v, i) => (i === index ? { ...v, title: e.target.value } : v)),
                    )
                  }
                />
              </label>
              <label>
                {t.depends}
                <select
                  multiple
                  value={s.dependencies}
                  onChange={(e) =>
                    setSteps(
                      steps.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              dependencies: [...e.target.selectedOptions].map((o) => o.value),
                            }
                          : v,
                      ),
                    )
                  }
                >
                  {steps
                    .filter((v) => v.stepKey !== s.stepKey)
                    .map((v) => (
                      <option key={v.stepKey} value={v.stepKey}>
                        {v.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(s.stepKey)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, s.stepKey]
                        : selected.filter((key) => key !== s.stepKey),
                    )
                  }
                />
                {t.execute}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.optional}
                  onChange={(e) =>
                    setSteps(
                      steps.map((v, i) => (i === index ? { ...v, optional: e.target.checked } : v)),
                    )
                  }
                />
                {t.optional}
              </label>
              <div className="work-actions">
                <button
                  disabled={!index}
                  onClick={() => {
                    const next = [...steps];
                    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                    setSteps(next);
                  }}
                >
                  {t.up}
                </button>
                <button
                  disabled={index === steps.length - 1}
                  onClick={() => {
                    const next = [...steps];
                    [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                    setSteps(next);
                  }}
                >
                  {t.down}
                </button>
                <button onClick={() => setSteps(steps.filter((_, i) => i !== index))}>
                  {t.remove}
                </button>
              </div>
            </fieldset>
          ))}
          <button
            disabled={steps.length >= 12}
            onClick={() =>
              setSteps([
                ...steps,
                {
                  stepKey: 'step-' + Date.now(),
                  title: t.stepTitle,
                  dependencies: [],
                  inputRefs: r.definition.refs,
                  outputContract: { kind: 'files', formats: [r.definition.format] },
                  acceptance: [{ kind: 'file_exists', format: r.definition.format, minCount: 1 }],
                  optional: false,
                },
              ])
            }
          >
            {t.add}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await workCommand(
                  'runs.setPlan',
                  { runId: r.runId, steps, executeStepIds: selected },
                  r.revision,
                );
                setEditing(false);
              })
            }
          >
            {t.acceptPlan}
          </button>
          <button onClick={() => setEditing(false)}>{t.close}</button>
        </div>
      ) : (
        <ol className="work-steps">
          {r.steps.map((s) => (
            <li key={s.stepKey}>
              <strong>{s.title}</strong>
              <span>
                {t.steps[s.status]}
                {r.selectedSteps.includes(s.stepKey) ? ' · ' + t.execute : ''}
              </span>
              {s.result && <p>{s.result}</p>}
              {s.optional &&
                ['paused', 'waiting_user'].includes(r.status) &&
                s.status !== 'completed' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void invoke('runs.skip', { stepKey: s.stepKey, reason: t.skipReason })
                    }
                  >
                    {t.skip}
                  </button>
                )}
              {s.artifacts.map(
                (ref, i) =>
                  ref.kind === 'file' && (
                    <span className="work-actions" key={i}>
                      <button
                        onClick={() =>
                          void viewer.open({
                            fileId: ref.fileId,
                            versionId: ref.versionId,
                            owner: { type: 'task', id: r.taskId },
                          })
                        }
                      >
                        {t.output} {i + 1}
                      </button>
                      <button
                        onClick={() =>
                          void window.tapkit.saveOriginal({
                            fileId: ref.fileId,
                            versionId: ref.versionId,
                          })
                        }
                      >
                        {t.download}
                      </button>
                    </span>
                  ),
              )}
            </li>
          ))}
        </ol>
      )}
      {r.questions.some((q) => q.answer === null) && (
        <section aria-label={t.questions}>
          <h3>{t.questions}</h3>
          {r.questions
            .filter((q) => q.answer === null)
            .map((q) => (
              <form
                key={q.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  void invoke('runs.answer', {
                    questionId: q.id,
                    taskVersion: r.version,
                    answer: answers[q.id] ?? '',
                  });
                }}
              >
                <label>
                  {q.title}
                  <input
                    required
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </label>
                {q.options.map((o) => (
                  <button
                    type="button"
                    key={o}
                    onClick={() => setAnswers({ ...answers, [q.id]: o })}
                  >
                    {o}
                  </button>
                ))}
                <button disabled={busy}>{t.answerSubmit}</button>
              </form>
            ))}
        </section>
      )}
      {
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              let refs = steerRefs;
              if (steerFiles.length && !refs.length) {
                const imported = await importChatFiles(
                  window.tapkit,
                  steerFiles,
                  r.sessionId,
                  new AbortController().signal,
                  () => {},
                );
                refs = imported.refs;
                setSteerRefs(refs);
                if (imported.errors.length) throw Error(imported.errors[0]);
              }
              await readyWorkMaterials(r.sessionId, refs);
              const data = await workCommand(
                'runs.steer',
                { runId: r.runId, text: steer, refs, clientRequestId: requestOptions().requestId },
                r.revision,
              );
              if ('work' in data) onNavigate('/work/' + data.work.runId);
            });
          }}
        >
          <label>
            {t.steer}
            <textarea
              required
              value={steer}
              maxLength={20000}
              onChange={(e) => setSteer(e.target.value)}
            />
          </label>
          <label>
            {t.materials}
            <input
              type="file"
              multiple
              onChange={(e) => {
                setSteerFiles([...(e.target.files ?? [])]);
                setSteerRefs([]);
              }}
            />
          </label>
          <button disabled={busy}>{t.steerSubmit}</button>
        </form>
      }
      <button onClick={() => onNavigate('/notifications')}>{t.permissions}</button>
      {terminal && (
        <div className="work-actions">
          {(['accepted', 'changes_requested'] as const).map((decision) => (
            <button
              key={decision}
              disabled={busy}
              onClick={() =>
                void action(() =>
                  workCommand('runs.accept', { taskId: r.taskId, decision }, r.revision),
                )
              }
            >
              {decision === 'accepted' ? t.accepted : t.changes}
            </button>
          ))}
          <span>{t.acceptanceStates[r.acceptanceStatus]}</span>
        </div>
      )}
      <details>
        <summary>{t.activity}</summary>
        <ol>
          {r.activity.map((a) => (
            <li key={a.id}>
              <time>{new Date(a.at).toLocaleString()}</time> {a.summary}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
