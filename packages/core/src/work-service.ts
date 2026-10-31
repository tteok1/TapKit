import {
  WorkCommandSchemas,
  WorkDefinitionSchema,
  WorkToolArgsSchema,
  RequestSchema,
  ReplySchema,
  ErrorCodeSchema,
  LEASE_MS,
  HEARTBEAT_MS,
  type WorkView,
  type WorkToolArgs,
  type ResourceRef,
  type Request,
  type Reply,
  ResourceRefSchema,
  ChatMaterialSchema,
  isDocumentImageMaterial,
} from '@tapkit/contracts';
import {
  WorkRepository,
  workTerminal,
  Store,
  StorageError,
  failure,
  newId,
  type WorkRun,
} from '@tapkit/storage';
import { defaultPlan, validatePlan } from '@tapkit/workflows';
import { WorkNotifications } from './work-notifications';

export type WorkCandidate = {
  text: string;
  calls: WorkToolArgs[];
  question?: { title: string; options: string[] };
  finished: boolean;
};
export type WorkDriver = (
  run: WorkRun,
  step: WorkView['steps'][number],
  signal: AbortSignal,
) => Promise<WorkCandidate>;
export interface WorkGateway {
  dispatchCommand?(request: Request): Reply | Promise<Reply>;
  resume?(
    run: WorkRun,
    stepKey: string,
    guard: () => void,
    options?: { allowDispatch?: boolean; signal?: AbortSignal },
  ): Promise<ResourceRef[] | null | undefined>;
  execute(
    run: WorkRun,
    step: string,
    args: WorkToolArgs,
    guard: () => void,
    signal?: AbortSignal,
  ): Promise<ResourceRef | null>;
  verify(run: WorkRun, refs: ResourceRef[]): Promise<boolean>;
  formats?(run: WorkRun, refs: ResourceRef[]): Promise<string[]>;
  recover?(run: WorkRun): Promise<boolean>;
}
export class WorkService {
  readonly repo: WorkRepository;
  readonly notifications: WorkNotifications;
  readonly owner = newId();
  private timer?: ReturnType<typeof setInterval>;
  private closing = false;
  private suspended = false;
  private active = new Map<
    string,
    { controller: AbortController; promise: Promise<void>; accountTime?: () => void }
  >();
  private tickBusy = false;
  onStatus?: (run: WorkRun) => void;
  constructor(
    readonly store: Store,
    readonly driver: WorkDriver,
    readonly gateway: WorkGateway,
    readonly material: (ref: ResourceRef, sessionId: string) => Promise<unknown>,
    readonly claimRoot: () => () => void = () => () => {},
  ) {
    this.repo = new WorkRepository(store);
    this.notifications = new WorkNotifications(store);
  }
  handles(command: string, payload: unknown) {
    if (!Object.hasOwn(WorkCommandSchemas, command)) return false;
    if (command !== 'runs.cancel') return true;
    const id = (payload as { runId?: unknown })?.runId;
    return (
      typeof id === 'string' &&
      !!this.store.db
        .prepare(
          "SELECT 1 FROM runs r JOIN tasks t ON t.id=r.task_id WHERE r.id=? AND r.profile_id=? AND t.mode='work'",
        )
        .get(id, this.store.profileId)
    );
  }
  private ok(request: Request, data: unknown): Reply {
    return ReplySchema.parse({ ok: true, requestId: request.requestId, data });
  }
  private change(run: WorkRun, status: WorkRun['status'], reason: string | null = null) {
    this.repo.status(run, status, reason);
    this.onStatus?.(run);
  }
  private mutable(run: WorkRun, revision?: number) {
    this.repo.revision(run, revision);
    if (workTerminal.has(run.status)) throw new StorageError('CONFLICT');
  }
  private async refs(refs: ResourceRef[], sessionId: string, allowDocumentImages = false) {
    for (const ref of refs) {
      const material = await this.material(ref, sessionId);
      const candidate = ChatMaterialSchema.safeParse(material);
      if (
        material &&
        typeof material === 'object' &&
        'state' in material &&
        material.state !== 'ready' &&
        !(allowDocumentImages && candidate.success && isDocumentImageMaterial(candidate.data))
      )
        throw new StorageError('INDEX_NOT_READY');
    }
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const request = parsed.data;
    try {
      const schema = WorkCommandSchemas[request.command as keyof typeof WorkCommandSchemas];
      if (!schema) return failure(request.requestId, 'FEATURE_NOT_AVAILABLE');
      const p = schema.parse(request.payload);
      request.payload = p;
      let verifiedReconciliation: string | null = null;
      if (request.command === 'runs.reconcile') {
        const input = WorkCommandSchemas['runs.reconcile'].parse(p);
        if (input.decision === 'accept_verified') {
          const run = this.repo.row(input.runId),
            call = this.store.db
              .prepare('SELECT result_ref FROM tool_calls WHERE id=? AND run_id=?')
              .get(input.callId, run.id) as { result_ref: string | null } | undefined;
          if (
            !call?.result_ref ||
            !(await this.gateway.verify(run, [
              ResourceRefSchema.parse(JSON.parse(call.result_ref)),
            ]))
          )
            throw new StorageError('CONFLICT');
          verifiedReconciliation = call.result_ref;
        }
      }
      if (request.command.startsWith('notifications.')) return this.notifications.dispatch(request);
      if (/^(approvals|grants)\./.test(request.command) && this.gateway.dispatchCommand)
        return await this.gateway.dispatchCommand(request);
      if (
        (request.command === 'runs.data' || request.command === 'runs.slides') &&
        this.gateway.dispatchCommand
      )
        return await this.gateway.dispatchCommand(request);
      if (request.command === 'runs.create') {
        const input = WorkCommandSchemas['runs.create'].parse(p);
        this.repo.session(input.sessionId);
        await this.refs(
          input.refs,
          input.sessionId,
          ['docx', 'pdf', 'pptx'].includes(input.format),
        );
        return this.store.receipt(request, () => {
          const definition = WorkDefinitionSchema.parse(
            Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'sessionId')),
          );
          const plan = validatePlan(defaultPlan(definition));
          const run = this.repo.create(input.sessionId, definition, plan.steps, plan.selected);
          return this.ok(request, { work: this.repo.view(run.id) });
        });
      }
      if (request.command === 'runs.list') {
        const input = WorkCommandSchemas['runs.list'].parse(p),
          items = this.store.db
            .prepare(
              `SELECT r.id FROM runs r JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id
          WHERE r.profile_id=? AND t.mode='work' AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND (? OR t.archived_at IS NULL)
          AND (? IS NULL OR s.project_id=?) AND (? IS NULL OR r.status=?) AND (? IS NULL OR r.updated_at>=?)
          AND (? IS NULL OR instr(lower(json_extract(r.work_json,'$.definition.goal')),lower(?))>0)
          AND (? IS NULL OR coalesce(json_extract(r.model_json,'$.selection.modelId'),json_extract(r.work_json,'$.definition.modelRef.modelId'))=?)
          ORDER BY t.pinned_at DESC,CASE WHEN ?='priority' THEN t.priority ELSE 0 END DESC,CASE WHEN ?='created' THEN r.created_at ELSE r.updated_at END DESC,r.id DESC LIMIT ?`,
            )
            .all(
              this.store.profileId,
              +input.archived,
              input.projectId ?? null,
              input.projectId ?? null,
              input.status ?? null,
              input.status ?? null,
              input.since ?? null,
              input.since ?? null,
              input.query ?? null,
              input.query ?? null,
              input.modelId ?? null,
              input.modelId ?? null,
              input.sort,
              input.sort,
              input.limit,
            ) as { id: string }[];
        const workItems = items.map((r) => this.repo.view(r.id));
        const running = (
          this.store.db
            .prepare(
              "SELECT count(*) n FROM runs WHERE status IN ('running','waiting_tool','pausing')",
            )
            .get() as { n: number }
        ).n;
        return this.ok(request, {
          workItems,
          capacity: this.store.settings.values.maxConcurrentRoots,
          running,
        });
      }
      if (request.command === 'runs.get')
        return this.ok(request, {
          work: this.repo.view(WorkCommandSchemas['runs.get'].parse(p).runId),
        });
      if (request.command === 'runs.steer') {
        const input = WorkCommandSchemas['runs.steer'].parse(p),
          run = this.repo.row(input.runId);
        await this.refs(
          input.refs,
          run.session_id,
          ['docx', 'pdf', 'pptx'].includes(this.repo.state(run).definition.format),
        );
      }
      return this.store.receipt(request, () => {
        if (request.command === 'runs.accept') {
          const input = WorkCommandSchemas['runs.accept'].parse(p),
            task = this.store.db
              .prepare(
                "SELECT id,revision FROM tasks WHERE id=? AND profile_id=? AND mode='work' AND deleted_at IS NULL",
              )
              .get(input.taskId, this.store.profileId) as
              { id: string; revision: number } | undefined;
          if (!task) throw new StorageError('NOT_FOUND');
          const latest = this.store.db
            .prepare('SELECT id FROM runs WHERE task_id=? ORDER BY created_at DESC,id DESC LIMIT 1')
            .get(task.id) as { id: string };
          const latestRun = this.repo.row(latest.id);
          this.repo.revision(latestRun, request.expectedRevision);
          this.store.db
            .prepare(
              'UPDATE tasks SET acceptance_status=?,revision=revision+1,updated_at=? WHERE id=?',
            )
            .run(input.decision, this.store.now(), task.id);
          const run = this.store.db
            .prepare('SELECT id FROM runs WHERE task_id=? ORDER BY created_at DESC,id DESC LIMIT 1')
            .get(task.id) as { id: string };
          this.repo.event(
            this.repo.row(run.id),
            'plan.updated',
            input.decision + (input.feedback ? '：' + input.feedback.slice(0, 200) : ''),
          );
          this.repo.save(latestRun, this.repo.state(latestRun));
          return this.ok(request, { work: this.repo.view(run.id) });
        }
        if (request.command === 'runs.batch') {
          const input = WorkCommandSchemas['runs.batch'].parse(p);
          const workResults = input.runIds.map((runId) => {
            try {
              const run = this.repo.row(runId);
              if (input.action === 'archive')
                this.store.db
                  .prepare(
                    'UPDATE tasks SET archived_at=?,updated_at=?,revision=revision+1 WHERE id=?',
                  )
                  .run(this.store.now(), this.store.now(), run.task_id);
              else this.control(run, input.action);
              return { runId, ok: true };
            } catch (e) {
              return {
                runId,
                ok: false,
                code: e instanceof StorageError ? e.code : 'INTERNAL_ERROR',
              };
            }
          });
          return this.ok(request, { workResults });
        }
        const run = this.repo.row((p as { runId: string }).runId);
        if (request.command === 'runs.copy') {
          const state = this.repo.state(run),
            plan = validatePlan(defaultPlan(state.definition));
          const next = this.repo.create(
            run.session_id,
            { ...state.definition, planFirst: true },
            plan.steps,
            plan.selected,
          );
          return this.ok(request, { work: this.repo.view(next.id) });
        }
        if (request.command === 'runs.reconcile') {
          const input = WorkCommandSchemas['runs.reconcile'].parse(p);
          this.repo.revision(run, request.expectedRevision);
          const call = this.store.db
            .prepare(
              'SELECT id,status,result_ref FROM tool_calls WHERE id=? AND run_id=? AND profile_id=?',
            )
            .get(input.callId, run.id, this.store.profileId) as
            { id: string; status: string; result_ref: string | null } | undefined;
          if (!call || call.status !== 'unknown' || run.status !== 'waiting_user')
            throw new StorageError('CONFLICT');
          if (input.decision === 'accept_verified') {
            if (!verifiedReconciliation || call.result_ref !== verifiedReconciliation)
              throw new StorageError('CONFLICT');
            this.store.db
              .prepare(
                "UPDATE tool_calls SET status='succeeded',side_effect='committed' WHERE id=? AND status='unknown'",
              )
              .run(call.id);
          } else {
            if (call.result_ref) throw new StorageError('CONFLICT');
            this.store.db
              .prepare(
                "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE id=? AND status='unknown'",
              )
              .run(call.id);
          }
          this.repo.event(
            run,
            'tool.finished',
            input.decision === 'accept_verified'
              ? '用户核验并接受已存在的成果'
              : '用户核对操作未提交；不自动重放',
          );
          const more = this.store.db
            .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='unknown'")
            .get(run.id);
          if (!more) {
            if (run.cancel_requested_at !== null) this.change(run, 'cancelled');
            else this.change(run, 'paused', 'SIDE_EFFECT_UNKNOWN');
          }
          return this.ok(request, { work: this.repo.view(run.id) });
        }
        if (request.command === 'runs.retry') {
          this.repo.revision(run, request.expectedRevision);
          if (!workTerminal.has(run.status)) throw new StorageError('CONFLICT');
          if (
            this.store.db
              .prepare(
                "SELECT 1 FROM tool_calls WHERE run_id=? AND (side_effect='unknown' OR status IN ('dispatched','pending','unknown'))",
              )
              .get(run.id)
          )
            throw new StorageError('SIDE_EFFECT_UNKNOWN');
          const state = this.repo.state(run),
            plan = validatePlan(
              this.repo
                .steps(run.id)
                .map(
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
              state.selected,
            ),
            next = this.repo.create(
              run.session_id,
              { ...state.definition, planFirst: false },
              plan.steps,
              plan.selected,
              {
                taskId: run.task_id,
                version: run.task_version,
                rootRunId: run.root_run_id,
                toolCatalogVersion: state.toolCatalogVersion,
              },
            );
          // Reuse is validated asynchronously before claiming a new execution lease.
          for (const step of this.repo.steps(run.id).filter((s) => s.status === 'completed'))
            this.repo.stepResult(next, step.stepKey, {
              status: 'pending',
              text: 'reuse:' + run.id,
              artifacts: step.artifacts,
            });
          return this.ok(request, { work: this.repo.view(next.id) });
        }
        if (request.command === 'runs.organize') {
          this.repo.revision(run, request.expectedRevision);
          const input = WorkCommandSchemas['runs.organize'].parse(p);
          this.store.db
            .prepare(
              'UPDATE tasks SET priority=coalesce(?,priority),pinned_at=CASE WHEN ? IS NULL THEN pinned_at WHEN ? THEN ? ELSE NULL END,archived_at=CASE WHEN ? IS NULL THEN archived_at WHEN ? THEN ? ELSE NULL END,muted=coalesce(?,muted),revision=revision+1,updated_at=? WHERE id=?',
            )
            .run(
              input.priority ?? null,
              input.pinned === undefined ? null : +input.pinned,
              +!!input.pinned,
              this.store.now(),
              input.archived === undefined ? null : +input.archived,
              +!!input.archived,
              this.store.now(),
              input.muted === undefined ? null : +input.muted,
              this.store.now(),
              run.task_id,
            );
          this.repo.save(run, this.repo.state(run));
          return this.ok(request, { work: this.repo.view(run.id) });
        }
        if (request.command === 'runs.steer') this.repo.revision(run, request.expectedRevision);
        else this.mutable(run, request.expectedRevision);
        if (request.command === 'runs.setPlan') {
          if (!['queued', 'paused', 'waiting_user'].includes(run.status) || run.calls || run.tools)
            throw new StorageError('CONFLICT');
          const input = WorkCommandSchemas['runs.setPlan'].parse(p),
            plan = validatePlan(input.steps, input.executeStepIds),
            state = this.repo.state(run);
          for (const step of plan.steps)
            for (const ref of step.inputRefs)
              if (!state.definition.refs.some((r) => JSON.stringify(r) === JSON.stringify(ref)))
                throw new StorageError('PERMISSION_DENIED');
          state.selected = plan.selected;
          state.planAccepted = true;
          this.repo.setSteps(run, plan.steps);
          this.repo.save(run, state);
          this.store.db
            .prepare('UPDATE task_versions SET plan_json=? WHERE task_id=? AND version=?')
            .run(
              JSON.stringify({ schemaVersion: 1, steps: plan.steps }),
              run.task_id,
              run.task_version,
            );
          this.repo.event(
            run,
            'plan.updated',
            '计划已接受；执行含必要依赖：' + plan.selected.join('、'),
          );
          if (run.status === 'waiting_user') this.change(run, 'paused');
          if (run.status === 'paused') this.change(run, 'queued');
        } else if (request.command === 'runs.steer') {
          const input = WorkCommandSchemas['runs.steer'].parse(p),
            state = this.repo.state(run);
          if (!workTerminal.has(run.status)) this.control(run, 'cancel');
          const updated = this.store.db
            .prepare(
              "UPDATE tasks SET current_version=current_version+1,goal=?,acceptance_status='unreviewed',updated_at=?,revision=revision+1 WHERE id=? AND current_version=?",
            )
            .run(input.text, this.store.now(), run.task_id, run.task_version);
          if (!updated.changes) throw new StorageError('CONFLICT');
          const definition = {
              ...state.definition,
              goal: input.text,
              refs: [...state.definition.refs, ...input.refs].slice(0, 20),
            },
            plan = validatePlan(defaultPlan(definition));
          const next = this.repo.create(run.session_id, definition, plan.steps, plan.selected, {
            taskId: run.task_id,
            version: run.task_version + 1,
            rootRunId: run.root_run_id,
          });
          this.repo.event(next, 'task.steered', '目标更新；旧版本结果仅归档');
          return this.ok(request, { work: this.repo.view(next.id) });
        } else if (request.command === 'runs.answer') {
          const input = WorkCommandSchemas['runs.answer'].parse(p),
            state = this.repo.state(run),
            q = state.questions.find((q) => q.id === input.questionId);
          if (
            input.taskVersion !== run.task_version ||
            !q ||
            q.answer !== null ||
            run.status !== 'waiting_user'
          )
            throw new StorageError('CONFLICT');
          q.answer = input.answer;
          if (q.review && q.stepKey) {
            const step = this.repo.steps(run.id).find((s) => s.stepKey === q.stepKey);
            if (step)
              this.repo.stepResult(run, q.stepKey, {
                status: input.answer === '接受' ? 'completed' : 'pending',
                artifacts: step.artifacts,
                text: input.answer,
              });
          }
          this.repo.save(run, state);
          if (state.questions.every((q) => !q.required || q.answer !== null)) {
            this.change(run, 'paused');
            this.change(run, 'queued');
          }
        } else if (request.command === 'runs.skip') {
          const input = WorkCommandSchemas['runs.skip'].parse(p),
            step = this.repo.steps(run.id).find((s) => s.stepKey === input.stepKey);
          if (!step || !step.optional || !['paused', 'waiting_user'].includes(run.status))
            throw new StorageError('PERMISSION_DENIED');
          this.repo.stepResult(run, step.stepKey, { status: 'skipped', text: input.reason });
        } else if (['runs.pause', 'runs.resume', 'runs.cancel'].includes(request.command))
          this.control(run, request.command.slice(5) as 'pause' | 'resume' | 'cancel');
        else throw new StorageError('FEATURE_NOT_AVAILABLE');
        return this.ok(request, { work: this.repo.view(run.id) });
      });
    } catch (error) {
      return failure(
        request.requestId,
        error instanceof StorageError
          ? error.code
          : error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
            ? ErrorCodeSchema.parse(error.message)
            : error instanceof Error && error.name === 'ZodError'
              ? 'VALIDATION_ERROR'
              : 'INTERNAL_ERROR',
        error instanceof StorageError ? error.currentRevision : undefined,
      );
    }
  }
  control(run: WorkRun, action: 'pause' | 'resume' | 'cancel') {
    if (workTerminal.has(run.status)) throw new StorageError('CONFLICT');
    this.active.get(run.id)?.accountTime?.();
    if (action === 'resume') {
      if (!['paused', 'waiting_user'].includes(run.status)) throw new StorageError('CONFLICT');
      const state = this.repo.state(run);
      if (
        !state.planAccepted ||
        state.questions.some((q) => q.required && q.answer === null) ||
        this.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND status IN ('proposed','approved','dispatched','pending','unknown')",
          )
          .get(run.id)
      )
        throw new StorageError('APPROVAL_REQUIRED');
      this.store.db.prepare('UPDATE runs SET pause_requested_at=NULL WHERE id=?').run(run.id);
      if (run.status === 'waiting_user') this.change(run, 'paused');
      this.change(run, 'queued');
      return;
    }
    this.store.db
      .prepare(
        `UPDATE runs SET ${action === 'cancel' ? 'cancel_requested_at' : 'pause_requested_at'}=?,revision=revision+1 WHERE id=?`,
      )
      .run(this.store.now(), run.id);
    if (action === 'cancel') {
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE run_id=? AND status IN ('proposed','approved')",
        )
        .run(run.id);
      this.store.db
        .prepare(
          "UPDATE approvals SET decision='revoked',updated_at=? WHERE tool_call_id IN (SELECT id FROM tool_calls WHERE run_id=?) AND decision IN ('pending','approved') AND consumed_at IS NULL",
        )
        .run(this.store.now(), run.id);
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='unknown',side_effect='unknown' WHERE run_id=? AND status IN ('dispatched','pending')",
        )
        .run(run.id);
      const unknown = this.store.db
        .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='unknown'")
        .get(run.id);
      this.change(
        run,
        unknown ? 'waiting_user' : 'cancelled',
        unknown ? 'SIDE_EFFECT_UNKNOWN' : null,
      );
    } else if (
      this.store.db
        .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='unknown'")
        .get(run.id)
    )
      this.change(run, 'waiting_user', 'SIDE_EFFECT_UNKNOWN');
    else if (this.active.has(run.id)) this.change(run, 'pausing');
    else this.change(run, 'paused');
    this.active.get(run.id)?.controller.abort();
  }
  private cancelUnsent(run: WorkRun) {
    const result = this.store.db
      .prepare(
        "UPDATE tool_calls SET status='cancelled',side_effect='not_committed',updated_at=? WHERE run_id=? AND profile_id=? AND status IN ('proposed','approved') AND side_effect='none'",
      )
      .run(this.store.now(), run.id, this.store.profileId);
    if (result.changes)
      this.repo.event(run, 'tool.finished', '任务已终结，取消尚未派发的操作；未执行该操作。');
  }
  async start() {
    await this.recover();
    this.closing = false;
    this.timer = setInterval(() => void this.tick(), 100);
    void this.tick();
  }
  async recover(ids?: string[]) {
    if (!ids)
      this.store.db.transaction(() => {
        const terminal = this.store.db
          .prepare(
            "SELECT DISTINCT r.id FROM runs r JOIN tool_calls c ON c.run_id=r.id WHERE r.profile_id=? AND r.task_id IS NOT NULL AND r.status IN ('completed','failed','partial','cancelled','budget_stopped') AND c.status IN ('proposed','approved') AND c.side_effect='none'",
          )
          .all(this.store.profileId) as { id: string }[];
        for (const row of terminal) this.cancelUnsent(this.repo.row(row.id));
      })();
    const rows = ids
      ? ids.map((id) => ({ id }))
      : (this.store.db
          .prepare(
            "SELECT r.id FROM runs r JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id WHERE t.mode='work' AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND r.status IN ('running','waiting_tool','pausing','recovering')",
          )
          .all() as { id: string }[]);
    for (const { id } of rows) {
      const run = this.repo.row(id);
      this.active.get(id)?.controller.abort();
      this.store.db.transaction(() => {
        this.store.db.prepare('UPDATE runs SET lease_epoch=lease_epoch+1 WHERE id=?').run(id);
        this.change(run, 'recovering', 'STREAM_INTERRUPTED');
      })();
      const safe =
        (await this.gateway.recover?.(this.repo.row(id))) ??
        !this.store.db
          .prepare(
            "SELECT 1 FROM tool_calls WHERE run_id=? AND status IN ('dispatched','pending','unknown')",
          )
          .get(id);
      this.store.db.transaction(() => {
        this.store.db
          .prepare("UPDATE plan_steps SET status='pending' WHERE run_id=? AND status='running'")
          .run(id);
        this.change(
          this.repo.row(id),
          safe
            ? run.cancel_requested_at !== null
              ? 'cancelled'
              : run.pause_requested_at !== null
                ? 'paused'
                : 'queued'
            : 'waiting_user',
          safe ? 'STREAM_INTERRUPTED' : 'SIDE_EFFECT_UNKNOWN',
        );
      })();
    }
  }
  async tick() {
    if (this.closing || this.suspended || this.tickBusy) return;
    this.tickBusy = true;
    try {
      for (const [id, active] of this.active) {
        try {
          this.repo.guard(this.repo.row(id), this.owner);
        } catch {
          active.controller.abort();
        }
      }
      const expired = this.store.db
        .prepare(
          "SELECT r.id FROM runs r JOIN tasks t ON t.id=r.task_id WHERE t.mode='work' AND r.status IN ('running','waiting_tool','pausing') AND r.lease_expires_at<=?",
        )
        .all(this.store.now()) as { id: string }[];
      if (expired.length) await this.recover(expired.map((r) => r.id));
      const rows = this.store.db
        .prepare(
          `SELECT r.id FROM runs r JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id WHERE t.mode='work' AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND r.status='queued'
        AND NOT EXISTS(SELECT 1 FROM runs a WHERE a.session_id=r.session_id AND a.id<>r.id AND a.status IN ('running','waiting_tool','waiting_user','pausing','paused','recovering')) ORDER BY t.priority DESC,r.created_at,r.id LIMIT 100`,
        )
        .all() as { id: string }[];
      for (const { id } of rows) {
        if (this.active.has(id)) continue;
        const pending = this.repo.row(id);
        if (
          this.store.db
            .prepare(
              "SELECT 1 FROM runs WHERE session_id=? AND id<>? AND status IN ('running','waiting_tool','waiting_user','pausing','paused','recovering')",
            )
            .get(pending.session_id, id)
        )
          continue;
        let release: () => void;
        try {
          release = this.claimRoot();
        } catch {
          break;
        }
        const controller = new AbortController(),
          run = this.repo.row(id),
          state = this.repo.state(run);
        try {
          this.store.db.transaction(() => {
            this.store.db
              .prepare(
                "UPDATE runs SET lease_owner=?,lease_epoch=lease_epoch+1,lease_expires_at=?,started_at=coalesce(started_at,?) WHERE id=? AND status='queued'",
              )
              .run(this.owner, this.store.now() + LEASE_MS, this.store.now(), id);
            this.change(run, 'running');
          })();
        } catch (error) {
          release();
          throw error;
        }
        if (!state.planAccepted) {
          try {
            this.store.db.transaction(() =>
              this.change(run, 'waiting_user', 'APPROVAL_REQUIRED'),
            )();
          } finally {
            release();
          }
          continue;
        }
        const current = this.repo.row(id),
          active: {
            controller: AbortController;
            promise: Promise<void>;
            accountTime?: () => void;
          } = { controller, promise: Promise.resolve() };
        this.active.set(id, active);
        active.promise = this.execute(current, controller.signal).finally(() => {
          release();
          this.active.delete(id);
        });
      }
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        String(error.code).startsWith('SQLITE_BUSY')
      ))
        console.error('TAPKIT_WORK_SCHEDULER_FAILED');
    } finally {
      this.tickBusy = false;
    }
  }
  private async execute(run: WorkRun, signal: AbortSignal) {
    const parentSignal = signal;
    const remaining = Math.max(
      1,
      this.repo.state(run).definition.budgetOverrides.activeMs - this.repo.rootUsage(run).activeMs,
    );
    const deadline = AbortSignal.timeout(remaining);
    signal = AbortSignal.any([signal, deadline]);
    const guard = () => {
        parentSignal.throwIfAborted();
        this.repo.guard(run, this.owner);
      },
      started = this.store.now();
    let lastActive = started;
    const accountTime = () => {
      const now = this.store.now(),
        state = this.repo.state(this.repo.row(run.id));
      state.activeMs += Math.max(0, now - lastActive);
      lastActive = now;
      this.repo.save(run, state);
    };
    const active = this.active.get(run.id);
    if (active) active.accountTime = accountTime;
    const heartbeat = setInterval(() => {
      try {
        guard();
        this.store.db.transaction(() => {
          guard();
          accountTime();
          this.store.db
            .prepare(
              'UPDATE runs SET lease_expires_at=? WHERE id=? AND lease_epoch=? AND lease_owner=?',
            )
            .run(this.store.now() + LEASE_MS, run.id, run.lease_epoch, this.owner);
        })();
      } catch {
        this.active.get(run.id)?.controller.abort();
      }
    }, HEARTBEAT_MS);
    try {
      while (true) {
        guard();
        const current = this.repo.row(run.id),
          state = this.repo.state(current),
          steps = this.repo.steps(run.id);
        const tokens = (
          this.store.db
            .prepare(
              "SELECT coalesce(sum(used_tokens+reserved_tokens),0) n FROM budgets WHERE owner_kind='root' AND owner_id=?",
            )
            .get(run.root_run_id) as { n: number }
        ).n;
        const root = this.repo.rootUsage(current);
        const executionExhausted =
          root.activeMs + Math.max(0, this.store.now() - lastActive) >=
            state.definition.budgetOverrides.activeMs ||
          root.tools >= state.definition.budgetOverrides.maxTools ||
          tokens >= state.definition.budgetOverrides.tokens;
        const exhausted =
          executionExhausted || root.calls >= state.definition.budgetOverrides.maxCalls;
        const selected = steps.filter((s) => state.selected.includes(s.stepKey)),
          step = selected.find(
            (s) =>
              s.status === 'pending' &&
              s.dependencies.every((key) =>
                selected.some(
                  (d) => d.stepKey === key && ['completed', 'skipped'].includes(d.status),
                ),
              ),
          );
        if (!step) {
          const unresolved = this.store.db
            .prepare(
              "SELECT 1 FROM tool_calls WHERE run_id=? AND status IN ('proposed','approved','dispatched','pending','unknown')",
            )
            .get(run.id);
          const complete = selected.every((s) => ['completed', 'skipped'].includes(s.status));
          this.store.db.transaction(() => {
            accountTime();
            this.change(
              run,
              unresolved
                ? 'waiting_user'
                : complete
                  ? selected.some((s) => s.status === 'skipped' && !s.optional)
                    ? 'partial'
                    : 'completed'
                  : selected.some((s) => s.status === 'completed')
                    ? 'partial'
                    : 'failed',
              unresolved ? 'SIDE_EFFECT_UNKNOWN' : complete ? null : 'PARSE_FAILED',
            );
          })();
          return;
        }
        if (
          step.result?.startsWith('reuse:') &&
          step.artifacts.length &&
          (await this.gateway.verify(run, step.artifacts))
        ) {
          guard();
          this.store.db.transaction(() =>
            this.repo.stepResult(run, step.stepKey, {
              status: 'completed',
              artifacts: step.artifacts,
              text: '已重新验证历史成果',
            }),
          )();
          continue;
        }
        await this.refs(
          step.inputRefs,
          run.session_id,
          ['docx', 'pdf', 'pptx'].includes(state.definition.format),
        );
        guard();
        const resumed =
          step.errorCode === 'PARSE_FAILED'
            ? undefined
            : await this.gateway.resume?.(run, step.stepKey, guard, {
                allowDispatch: !executionExhausted,
                signal,
              });
        if (resumed === null) return;
        if (!resumed && exhausted) throw new StorageError('BUDGET_EXCEEDED');
        if (!resumed && step.attempts >= 3) {
          this.store.db.transaction(() => {
            this.repo.stepResult(run, step.stepKey, {
              status: 'failed',
              error: 'PARSE_FAILED',
              artifacts: step.artifacts,
            });
            if (step.optional) this.change(run, 'waiting_user', 'PARSE_FAILED');
          })();
          if (step.optional) return;
          continue;
        }
        this.store.db.transaction(() => {
          this.store.db
            .prepare(
              "UPDATE plan_steps SET status='running',attempts=attempts+? WHERE run_id=? AND step_key=?",
            )
            .run(resumed ? 0 : 1, run.id, step.stepKey);
          if (!resumed)
            this.store.db.prepare('UPDATE runs SET calls=calls+1 WHERE id=?').run(run.id);
        })();
        const candidate: WorkCandidate = resumed
          ? { text: '已执行审阅通过的操作', calls: [], finished: true }
          : await this.driver(run, step, signal);
        guard();
        if (!resumed) signal.throwIfAborted();
        if (candidate.question) {
          this.store.db.transaction(() => {
            const state = this.repo.state(this.repo.row(run.id));
            if (state.questions.length >= 12) throw new StorageError('OUTPUT_LIMIT_REACHED');
            state.questions.push({
              id: newId(),
              title: candidate.question!.title,
              options: candidate.question!.options,
              required: true,
              answer: null,
            });
            this.repo.save(run, state);
            this.repo.stepResult(run, step.stepKey, { status: 'pending', text: candidate.text });
            this.store.db
              .prepare(
                'UPDATE plan_steps SET attempts=max(0,attempts-1) WHERE run_id=? AND step_key=?',
              )
              .run(run.id, step.stepKey);
            accountTime();
            this.change(run, 'waiting_user', 'APPROVAL_REQUIRED');
          })();
          return;
        }
        const refs = [
          ...new Map(
            [...step.artifacts, ...(resumed ?? [])].map((r) => [JSON.stringify(r), r]),
          ).values(),
        ];
        for (const args of candidate.calls) {
          guard();
          const ref = await this.gateway.execute(
            run,
            step.stepKey,
            WorkToolArgsSchema.parse(args),
            () => {
              guard();
              signal.throwIfAborted();
            },
            signal,
          );
          if (ref) {
            if (!refs.some((r) => JSON.stringify(r) === JSON.stringify(ref))) refs.push(ref);
            if (this.repo.row(run.id).status === 'waiting_user') {
              this.store.db.transaction(() =>
                this.repo.stepResult(run, step.stepKey, {
                  status: 'pending',
                  text: candidate.text,
                  artifacts: refs,
                }),
              )();
              return;
            }
          } else {
            this.store.db.transaction(() => {
              accountTime();
              this.repo.stepResult(run, step.stepKey, {
                status: 'pending',
                artifacts: refs,
                text: candidate.text,
              });
            })();
            return;
          }
        }
        guard();
        const browserOnly =
          state.definition.browserEnabled &&
          !!this.store.db
            .prepare(
              "SELECT 1 FROM tool_calls WHERE run_id=? AND step_key=? AND tool_name LIKE 'browser.%' AND status='succeeded'",
            )
            .get(run.id, step.stepKey) &&
          !this.store.db
            .prepare(
              "SELECT 1 FROM tool_calls WHERE run_id=? AND step_key=? AND tool_name NOT LIKE 'browser.%' AND status='succeeded'",
            )
            .get(run.id, step.stepKey);
        if (browserOnly) {
          this.store.db.transaction(() => {
            accountTime();
            this.repo.stepResult(run, step.stepKey, {
              status: 'pending',
              text: candidate.text,
              artifacts: refs,
            });
            if (!resumed)
              this.store.db
                .prepare(
                  'UPDATE plan_steps SET attempts=max(0,attempts-1) WHERE run_id=? AND step_key=?',
                )
                .run(run.id, step.stepKey);
          })();
          continue;
        }
        const outputsValid = await this.gateway.verify(run, refs);
        const formats =
          outputsValid && this.gateway.formats ? await this.gateway.formats(run, refs) : undefined;
        const valid =
          candidate.finished &&
          outputsValid &&
          step.acceptance.every(
            (rule) =>
              rule.kind === 'human_review' ||
              (rule.kind === 'file_exists' &&
                (formats
                  ? formats.filter((format) => format === rule.format)
                  : refs.filter(
                      (r) =>
                        r.kind === 'file' &&
                        (
                          this.store.db
                            .prepare(
                              'SELECT extension FROM file_versions WHERE id=? AND file_id=? AND profile_id=?',
                            )
                            .get(r.versionId, r.fileId, this.store.profileId) as
                            { extension: string } | undefined
                        )?.extension === rule.format,
                    )
                ).length >= rule.minCount) ||
              (rule.kind === 'schema' &&
                rule.schemaId === 'json.object' &&
                refs.some(
                  (r) =>
                    r.kind === 'file' &&
                    (
                      this.store.db
                        .prepare('SELECT extension FROM file_versions WHERE id=? AND profile_id=?')
                        .get(r.versionId, this.store.profileId) as { extension: string } | undefined
                    )?.extension === 'json',
                )),
          );
        guard();
        const review = valid && step.acceptance.find((r) => r.kind === 'human_review');
        this.store.db.transaction(() => {
          accountTime();
          this.repo.stepResult(run, step.stepKey, {
            status: valid && !review ? 'completed' : 'pending',
            text: candidate.text,
            artifacts: refs,
            ...(!valid ? { error: 'PARSE_FAILED' } : {}),
          });
          if (review) {
            const state = this.repo.state(this.repo.row(run.id));
            state.questions.push({
              id: newId(),
              title: review.description,
              options: ['接受', '需要修改'],
              required: true,
              answer: null,
              stepKey: step.stepKey,
              review: true,
            });
            this.repo.save(run, state);
            this.change(run, 'waiting_user', 'APPROVAL_REQUIRED');
          }
        })();
        if (review) return;
      }
    } catch (error) {
      try {
        this.repo.row(run.id);
      } catch {
        return;
      }
      this.store.db.transaction(() => {
        const current = this.repo.row(run.id);
        // A late result cannot change a terminal/new-version run.
        if (current.lease_epoch !== run.lease_epoch || workTerminal.has(current.status)) return;
        accountTime();
        this.store.db
          .prepare("UPDATE plan_steps SET status='pending' WHERE run_id=? AND status='running'")
          .run(run.id);
        const unknown = this.store.db
          .prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status='unknown'")
          .get(run.id);
        if (unknown) this.change(current, 'waiting_user', 'SIDE_EFFECT_UNKNOWN');
        else if (current.cancel_requested_at !== null) this.change(current, 'cancelled');
        else if (current.pause_requested_at !== null || current.status === 'pausing')
          this.change(current, 'paused');
        else if (current.status !== 'waiting_user') {
          this.cancelUnsent(current);
          this.change(
            current,
            deadline.aborted || (error instanceof StorageError && error.code === 'BUDGET_EXCEEDED')
              ? 'budget_stopped'
              : 'failed',
            deadline.aborted
              ? 'BUDGET_EXCEEDED'
              : error instanceof StorageError
                ? error.code
                : 'STREAM_INTERRUPTED',
          );
        }
      })();
    } finally {
      clearInterval(heartbeat);
    }
  }
  async stop() {
    this.closing = true;
    clearInterval(this.timer);
    for (const [id, a] of this.active) {
      a.controller.abort();
      let run: WorkRun;
      try {
        run = this.repo.row(id);
      } catch {
        continue;
      }
      if (['running', 'waiting_tool', 'pausing'].includes(run.status))
        this.store.db.transaction(() => {
          a.accountTime?.();
          this.store.db
            .prepare('UPDATE runs SET pause_requested_at=? WHERE id=?')
            .run(this.store.now(), id);
          this.change(run, 'pausing');
        })();
      a.controller.abort();
    }
    await Promise.all([...this.active.values()].map((a) => a.promise));
  }
  cancelAccount(accountId: string) {
    for (const [id] of this.active) {
      const run = this.repo.row(id);
      if (JSON.parse(run.model_json).selection?.accountId === accountId)
        this.store.db.transaction(() => this.control(run, 'cancel'))();
    }
  }
  async suspend() {
    this.suspended = true;
    for (const [id, a] of this.active) {
      a.controller.abort();
      let run: WorkRun;
      try {
        run = this.repo.row(id);
      } catch {
        continue;
      }
      if (['running', 'waiting_tool', 'pausing', 'recovering'].includes(run.status))
        this.store.db.transaction(() => {
          a.accountTime?.();
          this.store.db.prepare('UPDATE runs SET lease_epoch=lease_epoch+1 WHERE id=?').run(id);
          this.change(run, 'recovering', 'STREAM_INTERRUPTED');
        })();
      a.controller.abort();
    }
    await Promise.all([...this.active.values()].map((a) => a.promise));
  }
  async wake() {
    await this.suspend();
    await this.recover();
    this.suspended = false;
    void this.tick();
  }
}
