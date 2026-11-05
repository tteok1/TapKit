import { createHash } from 'node:crypto';
import {
  DelegateSpecSchema,
  WorkDefinitionSchema,
  DELEGATION_LIMITS,
  DelegateResultSchema,
  WorkCommandSchemas,
  ReplySchema,
  type DelegateSpec,
  type DelegateResult,
  type ResourceRef,
  type Request,
} from '@tapkit/contracts';
import { StorageError, workTerminal, newId, type WorkRun } from '@tapkit/storage';
import type { WorkCandidate, WorkService } from './work-service';
import { defaultPlan, validatePlan } from '@tapkit/workflows';

export type DelegateSource = { ref: ResourceRef; text: string; sha256: string };
export type DelegateDriver = (
  run: WorkRun,
  spec: DelegateSpec,
  sources: DelegateSource[],
  feedback: string[],
  signal: AbortSignal,
) => Promise<DelegateResult>;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class DelegationService {
  driver?: DelegateDriver;
  private active = new Map<string, AbortController>();
  private coordinating = new Set<string>();
  constructor(readonly work: WorkService) {}
  get repo() {
    return this.work.repo;
  }
  get store() {
    return this.work.store;
  }
  children(parent: WorkRun, history = false): WorkRun[] {
    return (
      this.store.db
        .prepare(
          "SELECT id FROM runs WHERE profile_id=? AND json_extract(work_json,'$.child.parentRunId')=? ORDER BY created_at,id",
        )
        .all(this.store.profileId, parent.id) as { id: string }[]
    )
      .map((r) => this.repo.row(r.id))
      .filter((r) => history || !this.repo.state(r).child!.archived);
  }
  private parent(run: WorkRun) {
    if (this.repo.state(run).child) throw new StorageError('PERMISSION_DENIED');
    if (workTerminal.has(run.status)) throw new StorageError('CONFLICT');
    return run;
  }
  private validate(parent: WorkRun, raw: DelegateSpec) {
    const spec = DelegateSpecSchema.parse(raw),
      definition = this.repo.state(parent).definition;
    this.parent(parent);
    if (spec.parentTaskVersion !== parent.task_version || spec.dependencies.includes(spec.key))
      throw new StorageError('CONFLICT');
    if (
      !spec.allowedTools.includes('task.result') ||
      (spec.inputs.length && !spec.allowedTools.includes('source.read')) ||
      spec.inputs.some(
        (ref) => !definition.refs.some((p) => JSON.stringify(p) === JSON.stringify(ref)),
      ) ||
      spec.budget.tokens > definition.budgetOverrides.tokens ||
      spec.budget.activeMs > definition.budgetOverrides.activeMs ||
      spec.budget.maxTools > definition.budgetOverrides.maxTools ||
      (definition.deadlineAt !== null &&
        (spec.deadline === null || spec.deadline > definition.deadlineAt))
    )
      throw new StorageError('PERMISSION_DENIED');
    const children = this.children(parent);
    if (
      children.length >= DELEGATION_LIMITS.maxBranches ||
      children.some((c) => this.repo.state(c).child!.spec.key === spec.key) ||
      spec.dependencies.some((k) => !children.some((c) => this.repo.state(c).child!.spec.key === k))
    )
      throw new StorageError('CONFLICT');
    return spec;
  }
  private create(parent: WorkRun, spec: DelegateSpec, prior?: WorkRun, feedback: string[] = []) {
    const definition = this.repo.state(parent).definition;
    if (prior) {
      const old = this.repo.state(this.repo.row(prior.id));
      old.child!.archived = true;
      this.repo.save(prior, old);
      this.store.db
        .prepare('UPDATE tasks SET current_version=current_version+1 WHERE id=?')
        .run(prior.task_id);
    }
    const child = this.repo.create(
      parent.session_id,
      WorkDefinitionSchema.parse({
        language: definition.language,
        audience: '主任务',
        scope: '仅分配固定资料的只读子任务',
        budgetOverrides: definition.budgetOverrides,
        modelRef: definition.modelRef,
        goal: spec.goal,
        refs: spec.inputs,
        planFirst: false,
        browserEnabled: false,
        research: undefined,
        acceptance: [],
        quantity: 1,
        format: 'md',
      }),
      [
        {
          stepKey: 'delegated',
          title: spec.goal.slice(0, 200),
          dependencies: [],
          inputRefs: spec.inputs,
          outputContract: { kind: 'research', formats: [] },
          acceptance: [],
          optional: false,
        },
      ],
      ['delegated'],
      {
        taskId: prior?.task_id ?? newId(),
        version: prior ? prior.task_version + 1 : 1,
        rootRunId: parent.root_run_id,
        newTask: !prior,
        parentRunId: parent.id,
      },
    );
    // create(prior) reuses a task; first child needs its own durable task row.
    const state = this.repo.state(child);
    state.child = {
      parentRunId: parent.id,
      spec,
      archived: false,
      feedback,
      result: null,
      sourceHashes: [],
    };
    this.repo.save(child, state);
    this.store.db
      .prepare('UPDATE tasks SET root_task_id=?,parent_task_id=? WHERE id=?')
      .run(parent.task_id, parent.task_id, child.task_id);
    this.repo.event(parent, 'plan.updated', '已委派：' + spec.key + '（' + spec.role + '）');
    return child;
  }
  private fork(parent: WorkRun, childId: string, feedback?: string) {
    const oldChildren = this.children(parent),
      target = oldChildren.find((c) => c.id === childId);
    if (!target) throw new StorageError('PERMISSION_DENIED');
    const definition = this.repo.state(parent).definition,
      plan = validatePlan(defaultPlan(definition));
    const changed = this.store.db
      .prepare(
        'UPDATE tasks SET current_version=current_version+1 WHERE id=? AND current_version=?',
      )
      .run(parent.task_id, parent.task_version);
    if (!changed.changes) throw new StorageError('CONFLICT');
    const next = this.repo.create(
      parent.session_id,
      { ...definition, planFirst: false },
      plan.steps,
      plan.selected,
      { taskId: parent.task_id, version: parent.task_version + 1, rootRunId: parent.root_run_id },
    );
    for (const old of oldChildren) {
      const previous = this.repo.state(old).child!,
        spec = { ...previous.spec, parentTaskVersion: next.task_version };
      const child = this.create(
        next,
        spec,
        undefined,
        [...previous.feedback, ...(old.id === childId && feedback ? [feedback] : [])].slice(-8),
      );
      if (old.id !== childId && previous.result && ['completed', 'partial'].includes(old.status)) {
        const state = this.repo.state(child);
        state.child!.result = previous.result;
        state.child!.sourceHashes = previous.sourceHashes;
        this.repo.save(child, state);
        this.repo.status(child, 'running');
        this.repo.stepResult(child, 'delegated', {
          status: 'completed',
          text: previous.result.conclusion,
        });
        this.repo.status(child, old.status);
      }
    }
    this.repo.event(
      next,
      'task.steered',
      '子任务修订创建新主任务版本；旧结果保留，沿用根预算并重新核验引用',
    );
    return next;
  }
  async dispatch(request: Request) {
    const p = request.payload as { runId: string },
      parent = this.repo.row(p.runId);
    if (request.command === 'subtasks.source') {
      const { evidenceIndex } = WorkCommandSchemas['subtasks.source'].parse(request.payload),
        child = this.repo.state(parent).child;
      const evidence = child?.result?.evidence[evidenceIndex];
      if (!child || !evidence) throw new StorageError('NOT_FOUND');
      this.repo.row(child.parentRunId);
      const material = (await this.work.material(
        child.spec.inputs[evidence.inputIndex]!,
        parent.session_id,
      )) as { state?: string; text?: string; name?: string };
      if (
        material.state !== 'ready' ||
        typeof material.text !== 'string' ||
        digest(material.text) !== child.sourceHashes[evidence.inputIndex] ||
        material.text.slice(evidence.start, evidence.end) !== evidence.quote
      )
        throw new StorageError('CONFLICT');
      const offset = Math.max(0, evidence.start - 500);
      return ReplySchema.parse({
        ok: true,
        requestId: request.requestId,
        data: {
          delegateSource: {
            name: material.name ?? '分配资料',
            text: material.text.slice(offset, offset + 5000),
            offset,
            totalChars: material.text.length,
            sha256: child.sourceHashes[evidence.inputIndex],
            quote: evidence.quote,
            start: evidence.start,
            end: evidence.end,
          },
        },
      });
    }
    if (request.command === 'subtasks.list') {
      const { offset } = WorkCommandSchemas['subtasks.list'].parse(request.payload),
        all = this.children(parent, true);
      return ReplySchema.parse({
        ok: true,
        requestId: request.requestId,
        data: {
          workItems: all.slice(offset, offset + 1).map((c) => this.repo.view(c.id)),
          total: all.length,
          nextOffset: offset + 1 < all.length ? offset + 1 : null,
          capacity: 2,
          running: this.children(parent).filter((c) => this.active.has(c.id)).length,
        },
      });
    }
    return this.store.receipt(request, () => {
      this.repo.revision(parent, request.expectedRevision);
      if (workTerminal.has(parent.status) && request.command === 'subtasks.control') {
        const input = WorkCommandSchemas['subtasks.control'].parse(request.payload),
          target = this.repo.row(input.childRunId);
        if (this.repo.state(target).child?.parentRunId !== parent.id)
          throw new StorageError('PERMISSION_DENIED');
        if (input.action !== 'retry' && input.action !== 'steer')
          throw new StorageError('CONFLICT');
        if (
          input.action === 'retry' &&
          !['failed', 'partial', 'budget_stopped'].includes(target.status)
        )
          throw new StorageError('CONFLICT');
        if (input.action === 'steer' && !input.feedback) throw new StorageError('VALIDATION_ERROR');
        const next = this.fork(parent, input.childRunId, input.feedback);
        return ReplySchema.parse({
          ok: true,
          requestId: request.requestId,
          data: { work: this.repo.view(next.id) },
        });
      }
      this.parent(parent);
      if (request.command === 'subtasks.summaryMode') {
        const input = WorkCommandSchemas['subtasks.summaryMode'].parse(request.payload),
          state = this.repo.state(parent);
        if (
          !['queued', 'paused', 'waiting_user'].includes(parent.status) ||
          parent.calls ||
          state.definition.research ||
          state.definition.format !== 'md' ||
          state.definition.quantity !== 1 ||
          state.selected.length !== 1
        )
          throw new StorageError('CONFLICT');
        const selected = this.repo
          .steps(parent.id)
          .filter((step) => state.selected.includes(step.stepKey));
        if (
          input.enabled &&
          (selected.length !== 1 ||
            selected[0]!.outputContract.formats.length !== 1 ||
            selected[0]!.outputContract.formats[0] !== 'md' ||
            selected[0]!.acceptance.some(
              (rule) =>
                rule.kind !== 'human_review' &&
                (rule.kind !== 'file_exists' || rule.format !== 'md' || rule.minCount > 1),
            ))
        )
          throw new StorageError('VALIDATION_ERROR');
        state.definition.delegationSummaryOnly = input.enabled;
        this.repo.save(parent, state);
        this.repo.event(
          parent,
          'plan.updated',
          input.enabled ? '仅汇总子任务结论与依据；不追加主模型调用' : '主任务继续使用模型编写成果',
        );
      } else if (request.command === 'task.delegate') {
        const input = WorkCommandSchemas['task.delegate'].parse(request.payload);
        if (!['queued', 'paused', 'waiting_user'].includes(parent.status))
          throw new StorageError('CONFLICT');
        const spec = this.validate(parent, input.spec);
        this.create(parent, spec);
      } else {
        const input = WorkCommandSchemas['subtasks.control'].parse(request.payload),
          child = this.repo.row(input.childRunId),
          state = this.repo.state(child);
        if (state.child?.parentRunId !== parent.id || state.child.archived)
          throw new StorageError('PERMISSION_DENIED');
        if (
          ['running', 'waiting_tool'].includes(parent.status) &&
          !this.coordinating.has(parent.id)
        )
          this.work.control(parent, 'pause');
        const parentState = this.repo.state(this.repo.row(parent.id));
        delete parentState.delegateSummary;
        this.repo.save(parent, parentState);
        if (input.action === 'pause') {
          if (workTerminal.has(child.status)) throw new StorageError('CONFLICT');
          this.store.db
            .prepare('UPDATE runs SET pause_requested_at=? WHERE id=?')
            .run(this.store.now(), child.id);
          this.active.get(child.id)?.abort();
          if (child.status === 'running') this.repo.status(child, 'pausing');
          this.repo.status(child, 'paused');
        } else if (input.action === 'resume') {
          if (child.status !== 'paused') throw new StorageError('CONFLICT');
          this.store.db.prepare('UPDATE runs SET pause_requested_at=NULL WHERE id=?').run(child.id);
          this.repo.status(child, 'queued');
        } else {
          if (
            input.action === 'retry' &&
            !['failed', 'budget_stopped', 'partial'].includes(child.status)
          )
            throw new StorageError('CONFLICT');
          if (input.action === 'steer' && !input.feedback)
            throw new StorageError('VALIDATION_ERROR');
          if (!workTerminal.has(child.status)) this.repo.status(child, 'cancelled');
          this.active.get(child.id)?.abort();
          this.create(
            parent,
            state.child.spec,
            child,
            [...state.child.feedback, ...(input.feedback ? [input.feedback] : [])].slice(-8),
          );
        }
        if (
          parent.status === 'waiting_user' &&
          this.repo.state(parent).planAccepted &&
          !this.repo.state(parent).questions.some((q) => q.required && q.answer === null)
        ) {
          this.repo.status(parent, 'paused');
          this.repo.status(parent, 'queued');
        }
      }
      this.repo.event(parent, 'plan.updated', '子任务状态已更新；费用计入根任务');
      return ReplySchema.parse({
        ok: true,
        requestId: request.requestId,
        data: { work: this.repo.view(parent.id) },
      });
    });
  }
  cancel(parent: WorkRun) {
    for (const child of this.children(parent)) {
      this.active.get(child.id)?.abort();
      if (!workTerminal.has(child.status)) {
        this.store.db
          .prepare('UPDATE runs SET cancel_requested_at=? WHERE id=?')
          .run(this.store.now(), child.id);
        this.repo.status(child, 'cancelled');
      }
    }
  }
  private async sources(child: WorkRun, guard: () => void, signal: AbortSignal) {
    const spec = this.repo.state(child).child!.spec,
      result: DelegateSource[] = [];
    for (const ref of spec.inputs) {
      guard();
      signal.throwIfAborted();
      const material = await this.work.gateway.delegationRead?.(child, ref, guard, signal);
      if (!material || material.state !== 'ready' || typeof material.text !== 'string')
        throw new StorageError('INDEX_NOT_READY');
      if (material.text.length > 40000) throw new StorageError('OUTPUT_LIMIT_REACHED');
      result.push({ ref, text: material.text, sha256: digest(material.text) });
    }
    return result;
  }
  private verify(result: DelegateResult, sources: DelegateSource[], spec: DelegateSpec) {
    if (result.evidence.length < spec.acceptance.minEvidence && !result.incomplete)
      throw new StorageError('VALIDATION_ERROR');
    if (!sources.length && !result.incomplete) throw new StorageError('VALIDATION_ERROR');
    if (result.incomplete && !result.uncertainty.length) throw new StorageError('VALIDATION_ERROR');
    for (const e of result.evidence) {
      const s = sources[e.inputIndex];
      if (!s || e.end <= e.start || s.text.slice(e.start, e.end) !== e.quote)
        throw new StorageError('VALIDATION_ERROR');
    }
  }
  private async execute(
    parent: WorkRun,
    child: WorkRun,
    parentGuard: () => void,
    parentSignal: AbortSignal,
  ) {
    const controller = new AbortController(),
      start = this.store.now(),
      state = this.repo.state(child),
      spec = state.child!.spec;
    const ownDeadline = AbortSignal.timeout(
      Math.max(1, Math.min(spec.budget.activeMs, (spec.deadline ?? Infinity) - start)),
    );
    const signal = AbortSignal.any([parentSignal, controller.signal, ownDeadline]);
    this.active.set(child.id, controller);
    const guard = () => {
      parentGuard();
      signal.throwIfAborted();
      if (spec.deadline !== null && this.store.now() >= spec.deadline)
        throw new StorageError('BUDGET_EXCEEDED');
      const current = this.repo.row(child.id),
        p = this.repo.row(parent.id);
      if (
        current.status !== 'running' ||
        this.repo.state(current).child!.archived ||
        p.task_version !== spec.parentTaskVersion ||
        current.pause_requested_at !== null ||
        current.cancel_requested_at !== null
      )
        throw new StorageError('CANCELLED');
    };
    try {
      this.store.db.transaction(() => {
        parentGuard();
        this.repo.status(child, 'running');
      })();
      guard();
      const usage = this.repo.rootUsage(parent),
        def = this.repo.state(parent).definition;
      if (
        usage.calls >= def.budgetOverrides.maxCalls ||
        this.repo.row(child.id).calls >= spec.budget.maxCalls ||
        !this.driver
      )
        throw new StorageError(this.driver ? 'BUDGET_EXCEEDED' : 'FEATURE_NOT_AVAILABLE');
      const sources = await this.sources(child, guard, signal);
      this.store.db.transaction(() => {
        guard();
        if (this.repo.rootUsage(parent).calls >= def.budgetOverrides.maxCalls)
          throw new StorageError('BUDGET_EXCEEDED');
        this.store.db.prepare('UPDATE runs SET calls=calls+1 WHERE id=?').run(child.id);
      })();
      const result = DelegateResultSchema.parse(
        await this.driver(child, spec, sources, state.child!.feedback, signal),
      );
      guard();
      this.verify(result, sources, spec);
      // Re-read every cited fixed version at the parent trust boundary.
      for (const index of new Set(result.evidence.map((e) => e.inputIndex))) {
        const material = (await this.work.material(sources[index]!.ref, parent.session_id)) as {
          state?: string;
          text?: string;
        };
        guard();
        if (material?.state !== 'ready' || digest(material.text ?? '') !== sources[index]!.sha256)
          throw new StorageError('CONFLICT');
      }
      if (!this.work.gateway.delegationResult) throw new StorageError('FEATURE_NOT_AVAILABLE');
      await this.work.gateway.delegationResult(child, guard, signal);
      this.store.db.transaction(() => {
        guard();
        const latest = this.repo.state(this.repo.row(child.id));
        latest.child!.result = result;
        latest.child!.sourceHashes = sources.map((s) => s.sha256);
        this.repo.save(child, latest);
        this.repo.stepResult(child, 'delegated', { status: 'completed', text: result.conclusion });
        this.repo.status(child, result.incomplete ? 'partial' : 'completed');
      })();
    } catch (error) {
      const current = this.repo.row(child.id);
      if (!workTerminal.has(current.status) && current.status !== 'paused')
        this.store.db.transaction(() => {
          this.repo.stepResult(child, 'delegated', {
            status: 'failed',
            error: ownDeadline.aborted
              ? 'BUDGET_EXCEEDED'
              : error instanceof StorageError
                ? error.code
                : 'STREAM_INTERRUPTED',
          });
          if (current.status === 'queued') {
            this.repo.status(child, 'cancelled', 'STREAM_INTERRUPTED');
            return;
          }
          if (parentSignal.aborted) this.repo.status(child, 'pausing');
          this.repo.status(
            child,
            parentSignal.aborted
              ? 'paused'
              : ownDeadline.aborted ||
                  (error instanceof StorageError && error.code === 'BUDGET_EXCEEDED')
                ? 'budget_stopped'
                : 'failed',
            ownDeadline.aborted
              ? 'BUDGET_EXCEEDED'
              : error instanceof StorageError
                ? error.code
                : 'STREAM_INTERRUPTED',
          );
        })();
    } finally {
      const latest = this.repo.state(this.repo.row(child.id));
      latest.activeMs += Math.max(0, this.store.now() - start);
      this.repo.save(child, latest);
      this.active.delete(child.id);
    }
  }
  async coordinate(parent: WorkRun, guard: () => void, signal: AbortSignal) {
    this.coordinating.add(parent.id);
    try {
      if (this.repo.state(parent).child) throw new StorageError('PERMISSION_DENIED');
      while (true) {
        guard();
        signal.throwIfAborted();
        const children = this.children(parent);
        if (!children.length) return true;
        const ready = children
          .filter(
            (c) =>
              c.status === 'queued' &&
              this.repo
                .state(c)
                .child!.spec.dependencies.every((k) =>
                  children.some(
                    (d) => this.repo.state(d).child!.spec.key === k && d.status === 'completed',
                  ),
                ),
          )
          .slice(0, DELEGATION_LIMITS.maxConcurrentChildren);
        if (ready.length) {
          await Promise.all(ready.map((c) => this.execute(parent, c, guard, signal)));
          continue;
        }
        const paused = children.some((c) => c.status === 'paused');
        if (paused) {
          this.store.db.transaction(() =>
            this.repo.status(parent, 'waiting_user', 'APPROVAL_REQUIRED'),
          )();
          return false;
        }
        const summary: {
          runId: string;
          role: string;
          status: string;
          result: DelegateResult | null;
        }[] = [];
        for (const c of children) {
          const child = this.repo.state(c).child!;
          let usable = !!child.result;
          for (const index of new Set(child.result?.evidence.map((e) => e.inputIndex) ?? [])) {
            try {
              const material = (await this.work.material(
                child.spec.inputs[index]!,
                parent.session_id,
              )) as { state?: string; text?: string };
              guard();
              if (
                material.state !== 'ready' ||
                digest(material.text ?? '') !== child.sourceHashes[index]
              )
                usable = false;
            } catch {
              usable = false;
            }
          }
          summary.push({
            runId: c.id,
            role: child.spec.role,
            status: child.result && !usable ? 'failed' : c.status,
            result: usable ? child.result : null,
          });
        }
        guard();
        this.store.db.transaction(() => {
          for (const c of children.filter((c) => c.status === 'queued'))
            this.repo.status(c, 'cancelled', 'CONFLICT');
          const state = this.repo.state(this.repo.row(parent.id));
          state.delegateSummary = summary.map((s) => ({
            ...s,
            status: this.repo.row(s.runId).status === 'cancelled' ? 'cancelled' : s.status,
          }));
          this.repo.save(parent, state);
        })();
        return true;
      }
    } finally {
      this.coordinating.delete(parent.id);
    }
  }
  closeout(parent: WorkRun): WorkCandidate | undefined {
    const state = this.repo.state(this.repo.row(parent.id));
    if (
      !state.definition.delegationSummaryOnly ||
      state.definition.research ||
      state.definition.format !== 'md' ||
      !state.delegateSummary?.length
    )
      return;
    const literal = (text: string) =>
      text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replace(/[\\`*_{}[\]()#~!|]/g, '\\$&');
    const excerpt = (text: string, max = 1000) =>
      literal(text.slice(0, max)) + (text.length > max ? '（此处截取，完整内容见任务记录）' : '');
    const lines = [
      '# 子任务核验汇总',
      '',
      excerpt(state.definition.goal, 6000),
      '',
      '范围：仅汇总分配资料、子任务结论与逐字依据。原文位置与固定版本已重新核对；不证明陈述的真实性或来源独立性，不执行子任务建议。',
    ];
    for (const item of state.delegateSummary) {
      const child = this.repo.state(this.repo.row(item.runId)).child!;
      lines.push(
        '',
        '## ' + excerpt(child.spec.goal, 200),
        '',
        '负责人：' + (item.role === 'researcher' ? '研究员' : '审查员'),
        '状态：' +
          ({
            completed: '已完成',
            partial: '部分完成',
            failed: '失败',
            cancelled: '已取消',
            budget_stopped: '预算停止',
          }[item.status] ?? '未完成'),
        '子任务记录：' + item.runId,
      );
      if (!item.result) {
        lines.push('证据缺口：此分支没有可交付的核验结果；未据此生成事实结论。');
        continue;
      }
      lines.push('', '子任务陈述：' + excerpt(item.result.conclusion));
      for (const e of item.result.evidence.slice(0, 2))
        lines.push(
          '',
          '> ' + literal(e.quote).split('\n').join('\n> '),
          '资料 ' +
            (e.inputIndex + 1) +
            '；字符 ' +
            e.start +
            '–' +
            e.end +
            '；SHA256 ' +
            child.sourceHashes[e.inputIndex],
        );
      if (item.result.evidence.length > 2) lines.push('其余逐字依据见该子任务记录。');
      if (item.result.uncertainty.length)
        lines.push('', '待核实：' + excerpt(item.result.uncertainty.join('；')));
      if (item.result.actions.length)
        lines.push('', '建议（未执行）：' + excerpt(item.result.actions.join('；')));
    }
    return {
      text: 'Core已重验来源并汇总；没有追加模型请求。',
      calls: [{ tool: 'artifact.write', name: '子任务核验汇总.md', content: lines.join('\n') }],
      finished: true,
    };
  }
  incomplete(parent: WorkRun) {
    return (
      this.children(parent).some((c) => c.status !== 'completed') ||
      !!this.repo
        .state(this.repo.row(parent.id))
        .delegateSummary?.some((s) => s.status !== 'completed')
    );
  }
}
