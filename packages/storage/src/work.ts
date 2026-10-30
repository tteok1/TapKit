import {
  WorkDefinitionSchema,
  WorkViewSchema,
  type WorkDefinition,
  type PlanStepInput,
  type WorkView,
  type ResourceRef,
  RunStatusSchema,
  WORK_TOOL_CATALOG_VERSION,
  RUN_TRANSITIONS,
  type z,
} from '@tapkit/contracts';
import { Store, StorageError, newId } from './foundation';

export const workTerminal = new Set([
  'completed',
  'partial',
  'failed',
  'budget_stopped',
  'cancelled',
]);
export type WorkRun = {
  id: string;
  task_id: string;
  session_id: string;
  task_version: number;
  root_run_id: string;
  status: z.infer<typeof RunStatusSchema>;
  status_reason: string | null;
  lease_owner: string | null;
  lease_epoch: number;
  lease_expires_at: number | null;
  cancel_requested_at: number | null;
  pause_requested_at: number | null;
  revision: number;
  calls: number;
  tools: number;
  created_at: number;
  updated_at: number;
  work_json: string;
  model_json: string;
};
export type WorkState = {
  schemaVersion: 1;
  toolCatalogVersion: string;
  definition: WorkDefinition;
  selected: string[];
  planAccepted: boolean;
  activeMs: number;
  questions: {
    id: string;
    title: string;
    options: string[];
    required: boolean;
    answer: string | null;
    stepKey?: string;
    review?: boolean;
  }[];
};
export class WorkRepository {
  constructor(readonly store: Store) {}
  row(runId: string): WorkRun {
    const row = this.store.db
      .prepare(
        `SELECT r.* FROM runs r JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id
      WHERE r.id=? AND r.profile_id=? AND t.profile_id=r.profile_id AND s.profile_id=r.profile_id AND t.mode='work' AND t.deleted_at IS NULL AND s.deleted_at IS NULL`,
      )
      .get(runId, this.store.profileId) as WorkRun | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  state(run: WorkRun) {
    return JSON.parse(run.work_json) as WorkState;
  }
  save(run: WorkRun, state: WorkState) {
    this.store.db
      .prepare('UPDATE runs SET work_json=?,updated_at=?,revision=revision+1 WHERE id=?')
      .run(JSON.stringify(state), this.store.now(), run.id);
  }
  revision(run: WorkRun, revision?: number) {
    if (revision === undefined) throw new StorageError('VALIDATION_ERROR');
    if (run.revision !== revision) throw new StorageError('CONFLICT', run.revision);
  }
  event(
    run: WorkRun,
    type:
      | 'run.status'
      | 'task.steered'
      | 'plan.updated'
      | 'tool.proposed'
      | 'tool.dispatched'
      | 'tool.finished'
      | 'tool.validation'
      | 'approval.required'
      | 'approval.resolved'
      | 'artifact.ready'
      | 'budget.stopped',
    summary: string,
  ) {
    this.store.db
      .prepare('UPDATE runs SET revision=revision+1,updated_at=? WHERE id=?')
      .run(this.store.now(), run.id);
    const event = this.store.emit(type, {
      kind: 'work',
      runId: run.id,
      taskVersion: run.task_version,
      summary: summary.slice(0, 1000),
    });
    this.store.db
      .prepare('UPDATE events SET task_version=?,run_id=? WHERE id=?')
      .run(run.task_version, run.id, event.eventId);
    return event;
  }
  status(run: WorkRun, status: WorkRun['status'], reason: string | null = null) {
    const current = this.row(run.id).status;
    if (
      workTerminal.has(current) ||
      (current !== status && !RUN_TRANSITIONS[current].includes(status))
    )
      throw new StorageError('CONFLICT');
    this.store.db
      .prepare(
        `UPDATE runs SET status=?,status_reason=?,updated_at=?,revision=revision+1,
      ended_at=?,lease_owner=CASE WHEN ? THEN NULL ELSE lease_owner END,lease_expires_at=CASE WHEN ? THEN NULL ELSE lease_expires_at END WHERE id=?`,
      )
      .run(
        status,
        reason,
        this.store.now(),
        workTerminal.has(status) ? this.store.now() : null,
        status !== 'running' && status !== 'waiting_tool' ? 1 : 0,
        status !== 'running' && status !== 'waiting_tool' ? 1 : 0,
        run.id,
      );
    run.status = status;
    run.status_reason = reason;
    return this.event(run, 'run.status', status + (reason ? '：' + reason : ''));
  }
  session(id: string) {
    const session = this.store.db
      .prepare(
        "SELECT id,active_branch_id,project_id FROM sessions WHERE id=? AND profile_id=? AND mode='work' AND deleted_at IS NULL",
      )
      .get(id, this.store.profileId) as
      { id: string; active_branch_id: string; project_id: string | null } | undefined;
    if (!session) throw new StorageError('PERMISSION_DENIED');
    return session;
  }
  create(
    sessionId: string,
    definition: WorkDefinition,
    steps: PlanStepInput[],
    selected: string[],
    prior?: { taskId: string; version: number; rootRunId: string; toolCatalogVersion?: string },
  ) {
    const session = this.session(sessionId),
      time = this.store.now(),
      taskId = prior?.taskId ?? newId(),
      runId = newId(),
      version = prior?.version ?? 1,
      messageId = newId();
    definition = WorkDefinitionSchema.parse(definition);
    if (!prior)
      this.store.db
        .prepare(
          "INSERT INTO tasks(id,profile_id,created_at,updated_at,session_id,root_task_id,goal,acceptance_json,mode) VALUES(?,?,?,?,?,?,?,?,'work')",
        )
        .run(
          taskId,
          this.store.profileId,
          time,
          time,
          sessionId,
          taskId,
          definition.goal,
          JSON.stringify({ schemaVersion: 1, rules: definition.acceptance }),
        );
    this.store.db
      .prepare(
        "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status) VALUES(?,?,?,?,?,?,'user',?,'final')",
      )
      .run(
        messageId,
        this.store.profileId,
        time,
        time,
        sessionId,
        session.active_branch_id,
        JSON.stringify({ schemaVersion: 1, blocks: [{ kind: 'text', text: definition.goal }] }),
      );
    this.store.db
      .prepare(
        'INSERT OR IGNORE INTO task_versions(id,profile_id,created_at,updated_at,task_id,version,goal,constraints_json,plan_json) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        this.store.profileId,
        time,
        time,
        taskId,
        version,
        definition.goal,
        JSON.stringify({ schemaVersion: 1, definition }),
        JSON.stringify({ schemaVersion: 1, steps }),
      );
    const state: WorkState = {
      schemaVersion: 1,
      toolCatalogVersion: prior?.toolCatalogVersion ?? WORK_TOOL_CATALOG_VERSION,
      definition,
      selected,
      planAccepted: !definition.planFirst,
      activeMs: 0,
      questions: [],
    };
    this.store.db
      .prepare(
        "INSERT INTO runs(id,profile_id,created_at,updated_at,task_id,task_version,root_run_id,session_id,user_message_id,status,model_json,work_json) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?)",
      )
      .run(
        runId,
        this.store.profileId,
        time,
        time,
        taskId,
        version,
        prior?.rootRunId ?? runId,
        sessionId,
        messageId,
        JSON.stringify({ schemaVersion: 1, selection: definition.modelRef ?? null }),
        JSON.stringify(state),
      );
    this.store.db.prepare('UPDATE messages SET run_id=? WHERE id=?').run(runId, messageId);
    this.store.db
      .prepare('UPDATE branches SET head_message_id=? WHERE id=?')
      .run(messageId, session.active_branch_id);
    this.store.db
      .prepare('UPDATE sessions SET updated_at=?,last_activity_at=?,revision=revision+1 WHERE id=?')
      .run(time, time, sessionId);
    const run = this.row(runId);
    this.setSteps(run, steps);
    this.event(run, 'run.status', 'queued');
    return run;
  }
  setSteps(run: WorkRun, steps: PlanStepInput[]) {
    this.store.db.prepare('DELETE FROM plan_steps WHERE run_id=?').run(run.id);
    for (const [ordinal, step] of steps.entries())
      this.store.db
        .prepare(
          `INSERT INTO plan_steps(id,profile_id,created_at,updated_at,run_id,step_key,ordinal,task_version,title,dependencies_json,status,input_refs_json,output_refs_json,output_contract_json,acceptance_json,optional)
      VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,'[]',?,?,?)`,
        )
        .run(
          newId(),
          this.store.profileId,
          this.store.now(),
          this.store.now(),
          run.id,
          step.stepKey,
          ordinal,
          run.task_version,
          step.title,
          JSON.stringify(step.dependencies),
          JSON.stringify(step.inputRefs),
          JSON.stringify(step.outputContract),
          JSON.stringify(step.acceptance),
          +step.optional,
        );
  }
  steps(runId: string): WorkView['steps'] {
    return this.store.db
      .prepare('SELECT * FROM plan_steps WHERE run_id=? ORDER BY ordinal')
      .all(runId)
      .map((raw) => {
        const s = raw as Record<string, unknown>;
        const artifacts = JSON.parse(
          s.output_refs_json as string,
        ) as WorkView['steps'][number]['artifacts'];
        return {
          stepKey: s.step_key as string,
          title: s.title as string,
          dependencies: JSON.parse(s.dependencies_json as string),
          inputRefs: JSON.parse(s.input_refs_json as string),
          outputContract: JSON.parse(s.output_contract_json as string),
          acceptance: JSON.parse(s.acceptance_json as string),
          optional: !!s.optional,
          status: s.status as WorkView['steps'][number]['status'],
          attempts: s.attempts as number,
          result: s.result_text as string | null,
          artifacts,
          artifactFormats: artifacts.map((ref) =>
            ref.kind === 'file'
              ? ((
                  this.store.db
                    .prepare(
                      'SELECT extension FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
                    )
                    .get(ref.versionId, this.store.profileId) as { extension: string } | undefined
                )?.extension ?? '')
              : '',
          ),
          errorCode: s.error_code as string | null,
        };
      });
  }
  stepResult(
    run: WorkRun,
    key: string,
    result: { status: string; text?: string; artifacts?: ResourceRef[]; error?: string },
  ) {
    this.store.db
      .prepare(
        'UPDATE plan_steps SET status=?,result_text=?,output_refs_json=?,error_code=?,updated_at=? WHERE run_id=? AND step_key=? AND task_version=?',
      )
      .run(
        result.status,
        result.text?.slice(0, 64000) ?? null,
        JSON.stringify(result.artifacts ?? []),
        result.error ?? null,
        this.store.now(),
        run.id,
        key,
        run.task_version,
      );
    this.event(run, 'plan.updated', key + '：' + result.status);
  }
  guard(run: WorkRun, owner: string) {
    const current = this.row(run.id),
      task = this.store.db
        .prepare('SELECT current_version FROM tasks WHERE id=?')
        .get(run.task_id) as { current_version: number };
    if (
      current.lease_epoch !== run.lease_epoch ||
      current.lease_owner !== owner ||
      (current.lease_expires_at ?? 0) <= this.store.now() ||
      task.current_version !== run.task_version ||
      current.cancel_requested_at !== null ||
      current.pause_requested_at !== null ||
      !['running', 'waiting_tool'].includes(current.status)
    )
      throw new StorageError('CANCELLED');
    return current;
  }
  rootUsage(run: WorkRun) {
    const totals = this.store.db
      .prepare(
        "SELECT coalesce(sum(coalesce(json_extract(work_json,'$.activeMs'),0)),0) activeMs,coalesce(sum(calls),0) calls FROM runs WHERE root_run_id=? AND profile_id=?",
      )
      .get(run.root_run_id, this.store.profileId) as { activeMs: number; calls: number };
    const attempts = (
      this.store.db
        .prepare('SELECT count(*) n FROM provider_attempts WHERE root_run_id=? AND profile_id=?')
        .get(run.root_run_id, this.store.profileId) as { n: number }
    ).n;
    const tools = (
      this.store.db
        .prepare(
          'SELECT count(*) n FROM tool_call_attempts a JOIN tool_calls c ON c.id=a.tool_call_id JOIN runs r ON r.id=c.run_id WHERE r.root_run_id=? AND c.profile_id=?',
        )
        .get(run.root_run_id, this.store.profileId) as { n: number }
    ).n;
    return { ...totals, calls: Math.max(totals.calls, attempts), tools };
  }
  view(runId: string): WorkView {
    const run = this.row(runId),
      state = this.state(run),
      session = this.session(run.session_id),
      task = this.store.db.prepare('SELECT * FROM tasks WHERE id=?').get(run.task_id) as {
        priority: number;
        pinned_at: number | null;
        archived_at: number | null;
        muted: number;
        acceptance_status: string;
      };
    const budget = this.store.db
      .prepare(
        "SELECT sum(used_tokens+reserved_tokens) n FROM budgets WHERE profile_id=? AND owner_kind='root' AND owner_id=?",
      )
      .get(this.store.profileId, run.root_run_id) as { n: number | null };
    return WorkViewSchema.parse({
      taskId: run.task_id,
      runId: run.id,
      sessionId: run.session_id,
      projectId: session.project_id,
      version: run.task_version,
      revision: run.revision,
      status: run.status,
      reason: run.status_reason,
      definition: state.definition,
      steps: this.steps(run.id),
      selectedSteps: state.selected,
      questions: state.questions,
      priority: task.priority,
      pinned: task.pinned_at !== null,
      archived: task.archived_at !== null,
      muted: !!task.muted,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      activeMs: this.rootUsage(run).activeMs,
      calls: this.rootUsage(run).calls,
      tools: this.rootUsage(run).tools,
      tokens: budget.n ?? 0,
      overdue:
        state.definition.deadlineAt !== null &&
        state.definition.deadlineAt < this.store.now() &&
        !workTerminal.has(run.status),
      acceptanceStatus: task.acceptance_status,
      unresolvedCalls: this.store.db
        .prepare(
          "SELECT c.id,c.tool_name tool,c.result_ref,p.state helperState FROM tool_calls c LEFT JOIN process_handles p ON p.tool_call_id=c.id WHERE c.run_id=? AND c.status='unknown'",
        )
        .all(run.id)
        .map((raw) => {
          const c = raw as {
            id: string;
            tool: string;
            result_ref: string | null;
            helperState: string | null;
          };
          return {
            id: c.id,
            tool: c.tool,
            resultAvailable: c.result_ref !== null,
            helperState: c.helperState,
          };
        }),
      activity: this.store.db
        .prepare(
          'SELECT id,created_at at,event_type type,payload_json FROM events WHERE run_id=? ORDER BY seq DESC LIMIT 100',
        )
        .all(run.id)
        .map((raw) => {
          const e = raw as { id: string; at: number; type: string; payload_json: string };
          return {
            id: e.id,
            at: e.at,
            type: e.type,
            summary: JSON.parse(e.payload_json).payload.summary,
          };
        }),
    });
  }
}
