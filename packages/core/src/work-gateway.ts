import {
  ApprovalViewSchema,
  GrantViewSchema,
  WorkCommandSchemas,
  ResourceRefSchema,
  ReplySchema,
  ResourceRulesDocumentSchema,
  NativeWorkIdentitySchema,
  ToolNamesDocumentSchema,
  ActionClassesDocumentSchema,
  AnalysisResultSchema,
  DataPageSchema,
  SlidePageSchema,
  type ResourceRef,
  type Request,
  type WorkToolArgs,
  type Reply,
} from '@tapkit/contracts';
import {
  WorkRepository,
  DocumentRepository,
  SlideRepository,
  StorageError,
  newId,
  type WorkRun,
} from '@tapkit/storage';
import { canonicalHash, catalogAllowsTool, parseWorkTool, WORK_TOOL_SPECS } from '@tapkit/tools';
import { WorkArtifacts } from './work-artifacts';
import {
  createWorkDocument,
  reviseWorkDocument,
  verifyWorkDocumentSources,
  resolveWorkDocumentImage,
  prepareWorkDocument,
} from './work-document';
import { formatDocumentSection } from '@tapkit/workflows';
import type { ChatService } from './chat-service';
import { setTimeout as delay } from 'node:timers/promises';
import type { WorkGateway } from './work-service';
import type { WorkNativeTools } from './work-native';
import { analysisPage, dataSources } from './work-data';
import { publishWorkSlides, slidePage, verifyWorkSlideSources } from './work-slides';
import { reviseSlideDeck, slideHashes } from '@tapkit/workflows';
function structuredEdit(
  args: WorkToolArgs,
): args is Extract<
  WorkToolArgs,
  { tool: 'document.revise' | 'document.fields' | 'slides.revise' }
> {
  return (
    args.tool === 'document.revise' ||
    args.tool === 'document.fields' ||
    args.tool === 'slides.revise'
  );
}

type Call = {
  id: string;
  run_id: string;
  task_version: number;
  step_key: string;
  tool_name: keyof typeof WORK_TOOL_SPECS;
  tool_version: string;
  args_json: string;
  args_hash: string;
  resource_hash: string;
  content_hash: string;
  status: string;
  side_effect: string;
  result_ref: string | null;
  approval_id: string | null;
  grant_id: string | null;
  lease_epoch: number;
};
type Approval = {
  id: string;
  tool_call_id: string;
  task_version: number;
  args_hash: string;
  resource_hash: string;
  content_version_hash: string;
  decision: string;
  expires_at: number;
  consumed_at: number | null;
  preview_json: string;
};
export class WorkToolGateway implements WorkGateway {
  readonly repo: WorkRepository;
  constructor(
    readonly artifacts: WorkArtifacts,
    readonly native?: WorkNativeTools,
    readonly chat?: Pick<ChatService, 'store' | 'material' | 'blobs'>,
  ) {
    this.repo = artifacts.repo;
  }
  get store() {
    return this.repo.store;
  }
  private current(call: Call) {
    return this.repo.row(call.run_id);
  }
  private call(id: string) {
    const row = this.store.db
      .prepare('SELECT * FROM tool_calls WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as Call | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private approval(id: string) {
    const row = this.store.db
      .prepare('SELECT * FROM approvals WHERE id=? AND profile_id=? AND deleted_at IS NULL')
      .get(id, this.store.profileId) as Approval | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private snapshot(run: WorkRun, args: WorkToolArgs) {
    const state = this.repo.state(run),
      spec = WORK_TOOL_SPECS[args.tool];
    if (!spec) throw new StorageError('PERMISSION_DENIED');
    if (!catalogAllowsTool(state.toolCatalogVersion, args.tool))
      throw new StorageError('FEATURE_NOT_AVAILABLE');
    let target: string,
      before = '',
      identity: unknown;
    if (
      args.tool !== 'artifact.write' &&
      args.tool !== 'document.create' &&
      args.tool !== 'slides.create'
    ) {
      const session = this.repo.session(run.session_id);
      if (structuredEdit(args)) {
        const current = this.artifacts.files.get(args.fileId, {
          owner: { type: 'session', id: run.session_id },
        });
        if (current.currentVersionId !== args.versionId || current.revision !== args.revision)
          throw new StorageError('CONFLICT');
      }
      const access = () => {
        if (!session.project_id)
          return this.artifacts.files.get(args.fileId, { versionId: args.versionId });
        try {
          return this.artifacts.files.get(args.fileId, {
            versionId: args.versionId,
            owner: { type: 'session', id: run.session_id },
          });
        } catch (error) {
          if (!(error instanceof StorageError) || error.code !== 'PERMISSION_DENIED') throw error;
          return this.artifacts.files.get(args.fileId, {
            versionId: args.versionId,
            owner: { type: 'project', id: session.project_id },
          });
        }
      };
      const file = access();
      const source = this.store.db
        .prepare(
          'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=?',
        )
        .get(args.versionId) as { root_run_id: string } | undefined;
      if (
        (args.tool === 'workspace.patch' || structuredEdit(args)) &&
        (file.kind !== 'artifact' || !source || source.root_run_id !== run.root_run_id)
      )
        throw new StorageError('PERMISSION_DENIED');
      if (args.tool === 'workspace.patch' && file.currentVersionId !== args.versionId)
        throw new StorageError('PERMISSION_DENIED');
      if (
        structuredEdit(args) &&
        (file.currentVersionId !== args.versionId || file.revision !== args.revision)
      )
        throw new StorageError('CONFLICT');
      if (
        args.tool !== 'workspace.patch' &&
        !structuredEdit(args) &&
        !state.definition.refs.some(
          (r) => r.kind === 'file' && r.fileId === args.fileId && r.versionId === args.versionId,
        ) &&
        source?.root_run_id !== run.root_run_id
      )
        throw new StorageError('PERMISSION_DENIED');
      if (args.tool === 'workspace.patch' || structuredEdit(args))
        this.artifacts.files.get(args.fileId, {
          versionId: args.versionId,
          owner: { type: 'session', id: run.session_id },
        });
      target = file.name;
      identity = {
        fileId: args.fileId,
        versionId: args.versionId,
        sha256: file.version.sha256,
        revision: file.revision,
      };
    } else {
      target = args.name;
      identity = { root: run.root_run_id, name: args.name };
    }
    if (args.tool === 'data.analyze') {
      const sources = dataSources(this.artifacts, run, args.spec);
      if (sources[0]?.fileId !== args.fileId || sources[0].versionId !== args.versionId)
        throw new StorageError('VALIDATION_ERROR');
      if (
        (args.spec.csvMode === 'preserve_values' &&
          state.definition.dataOptions?.csvMode !== 'preserve_values') ||
        (args.spec.includeDetailsInHtml && !state.definition.dataOptions?.includeDetailsInHtml)
      )
        throw new StorageError('PERMISSION_DENIED');
      identity = { primary: identity, sources };
    }
    if ('content' in args) this.artifacts.validate(target, args.content);
    return {
      target,
      before,
      identity,
      argsHash: canonicalHash(args),
      resourceHash: canonicalHash({
        profile: this.store.profileId,
        session: run.session_id,
        task: run.task_id,
        tool: spec.name,
        version: spec.version,
        identity,
      }),
      contentHash: canonicalHash({
        content: 'content' in args ? args.content : args,
        taskVersion: run.task_version,
        selection:
          JSON.parse(this.repo.row(run.id).model_json ?? '{}').selection ??
          state.definition.modelRef ??
          null,
        catalog: state.toolCatalogVersion,
      }),
    };
  }
  private grant(run: WorkRun, args: WorkToolArgs, callId: string) {
    if (args.tool !== 'workspace.patch' && !structuredEdit(args)) return null;
    const rows = this.store.db
      .prepare(
        "SELECT * FROM grants WHERE profile_id=? AND deleted_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND ((scope_kind='once' AND scope_id=?) OR (scope_kind='session' AND scope_id=?) OR (scope_kind='persistent' AND scope_id=?)) ORDER BY created_at DESC",
      )
      .all(
        this.store.profileId,
        this.store.now(),
        callId,
        run.session_id,
        this.store.profileId,
      ) as {
      id: string;
      tool_names_json: string;
      resource_rules_json: string;
      action_classes_json: string;
    }[];
    return (
      rows.find(
        (g) =>
          ToolNamesDocumentSchema.parse(JSON.parse(g.tool_names_json)).names.includes(args.tool) &&
          ResourceRulesDocumentSchema.parse(JSON.parse(g.resource_rules_json)).rules.some(
            (rule) =>
              rule.resourceId === args.fileId &&
              rule.revision === this.artifacts.files.get(args.fileId).revision &&
              rule.actions.includes('workspace_write'),
          ) &&
          ActionClassesDocumentSchema.parse(JSON.parse(g.action_classes_json)).actions.includes(
            'workspace_write',
          ),
      ) ?? null
    );
  }
  private async preview(run: WorkRun, args: WorkToolArgs) {
    const binding = this.snapshot(run, args);
    let before = '';
    let after = '';
    if (args.tool === 'workspace.patch') {
      const file = await this.artifacts.files.original(args.fileId, {
        versionId: args.versionId,
        owner: { type: 'session', id: run.session_id },
      });
      before = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
      after = args.content;
      if (Buffer.byteLength(before) > 64000) throw new StorageError('OUTPUT_LIMIT_REACHED');
      this.snapshot(run, args);
    } else if (args.tool === 'slides.revise') {
      const old = new SlideRepository(this.artifacts.files).read(args.fileId, args.versionId, {
        type: 'session',
        id: run.session_id,
      });
      const next = reviseSlideDeck(old.spec, args.actions),
        oldHashes = slideHashes(old.spec),
        newHashes = slideHashes(next);
      const describe = (deck: typeof old.spec, other: Record<string, string>) =>
        deck.slides
          .map(
            (s, i) =>
              `${i + 1}. ${s.title}` +
              (other[s.id] === slideHashes({ ...deck, slides: [s] })[s.id]
                ? ''
                : `\n布局：${s.layout}\n正文：${s.bullets.join('\n')}\n右栏：${s.rightBullets.join('\n')}\n表格：${s.table ? JSON.stringify(s.table) : '无'}\n图表：${s.chartRef ? JSON.stringify(s.chartRef) : '无'}\n图片：${s.imageVersionId ?? '无'}\n备注：${s.notes}`),
          )
          .join('\n\n');
      before = describe(old.spec, newHashes);
      after = describe(next, oldHashes);
      if (Buffer.byteLength(before) > 64000 || Buffer.byteLength(after) > 64000)
        throw new StorageError('OUTPUT_LIMIT_REACHED');
      this.snapshot(run, args);
    } else if (args.tool === 'document.revise') {
      const spec = new DocumentRepository(this.artifacts.files).read(args.fileId, args.versionId, {
        type: 'session',
        id: run.session_id,
      });
      const old = spec.sections.find((section) => section.blockId === args.blockId);
      if (!old || args.replacement.blockId !== args.blockId)
        throw new StorageError('VALIDATION_ERROR');
      before = formatDocumentSection(old);
      after = formatDocumentSection(args.replacement);
      if (Buffer.byteLength(before) > 64000 || Buffer.byteLength(after) > 64000)
        throw new StorageError('OUTPUT_LIMIT_REACHED');
      this.snapshot(run, args);
    } else if (args.tool === 'document.fields') {
      const spec = new DocumentRepository(this.artifacts.files).read(args.fileId, args.versionId, {
        type: 'session',
        id: run.session_id,
      });
      const labels = { name: '姓名', date: '日期', brand: '品牌' } as const;
      const keys = Object.keys(args.fields) as Array<keyof typeof labels>;
      before = keys.map((key) => `${labels[key]}：${spec.style.fields[key]}`).join('\n');
      after = keys.map((key) => `${labels[key]}：${args.fields[key]}`).join('\n');
      this.snapshot(run, args);
    }
    return { ...binding, before, after };
  }
  private propose(
    run: WorkRun,
    stepKey: string,
    args: WorkToolArgs,
    preview: Awaited<ReturnType<WorkToolGateway['preview']>>,
    idempotencyKey?: string,
  ) {
    const id = newId(),
      time = this.store.now();
    this.store.db
      .prepare(
        `INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect,step_key,content_hash,lease_epoch)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'proposed','none',?,?,?)`,
      )
      .run(
        id,
        this.store.profileId,
        time,
        time,
        run.id,
        run.task_version,
        id,
        args.tool,
        WORK_TOOL_SPECS[args.tool].version,
        JSON.stringify(args),
        preview.argsHash,
        preview.resourceHash,
        idempotencyKey ??
          canonicalHash({ run: run.id, version: run.task_version, step: stepKey, args }),
        stepKey,
        preview.contentHash,
        run.lease_epoch,
      );
    this.repo.event(run, 'tool.proposed', args.tool + '：' + preview.target);
    if ((args.tool === 'workspace.patch' || structuredEdit(args)) && !this.grant(run, args, id))
      this.requireApproval(this.call(id), preview);
    return this.call(id);
  }
  private requireApproval(call: Call, preview: Awaited<ReturnType<WorkToolGateway['preview']>>) {
    const id = newId(),
      run = this.current(call),
      time = this.store.now(),
      args = parseWorkTool(JSON.parse(call.args_json));
    if (args.tool !== 'workspace.patch' && !structuredEdit(args))
      throw new StorageError('PERMISSION_DENIED');
    this.store.db
      .prepare(
        "INSERT INTO approvals(id,profile_id,created_at,updated_at,tool_call_id,task_version,args_hash,resource_hash,content_version_hash,decision,expires_at,preview_json) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)",
      )
      .run(
        id,
        this.store.profileId,
        time,
        time,
        call.id,
        run.task_version,
        preview.argsHash,
        preview.resourceHash,
        preview.contentHash,
        time + 600000,
        JSON.stringify({
          schemaVersion: 1,
          tool: args.tool,
          target: preview.target,
          before: preview.before,
          after: preview.after,
        }),
      );
    this.store.db.prepare('UPDATE tool_calls SET approval_id=? WHERE id=?').run(id, call.id);
    this.repo.status(run, 'waiting_user', 'APPROVAL_REQUIRED');
    this.repo.event(run, 'approval.required', args.tool + '：' + preview.target);
  }
  async execute(
    run: WorkRun,
    stepKey: string,
    raw: WorkToolArgs,
    guard: () => void,
    signal?: AbortSignal,
  ): Promise<ResourceRef | null> {
    const args = parseWorkTool(raw);
    if (args.tool === 'data.analyze') {
      const options = this.repo.state(this.repo.row(run.id)).definition.dataOptions;
      if (
        (args.spec.csvMode === 'preserve_values' && options?.csvMode !== 'preserve_values') ||
        (args.spec.includeDetailsInHtml && !options?.includeDetailsInHtml)
      )
        throw new StorageError('PERMISSION_DENIED');
      args.spec.csvMode = options?.csvMode ?? 'safe';
      args.spec.includeDetailsInHtml = options?.includeDetailsInHtml ?? false;
    }
    guard();
    const succeeded = this.store.db
      .prepare(
        "SELECT c.* FROM tool_calls c JOIN runs r ON r.id=c.run_id WHERE r.root_run_id=? AND c.profile_id=? AND c.task_version=? AND c.step_key=? AND c.args_hash=? AND c.status='succeeded' ORDER BY c.created_at DESC LIMIT 1",
      )
      .get(
        run.root_run_id,
        this.store.profileId,
        run.task_version,
        stepKey,
        canonicalHash(args),
      ) as Call | undefined;
    if (succeeded?.result_ref) {
      const ref = ResourceRefSchema.parse(JSON.parse(succeeded.result_ref));
      await this.waitForReceipt(run, succeeded, ref, guard, signal);
      if (await this.verify(run, [ref])) return ref;
      throw new StorageError('CONFLICT');
    }
    const preview = await this.preview(run, args);
    guard();
    const key = canonicalHash({ run: run.id, version: run.task_version, step: stepKey, args });
    let call = this.store.db
      .prepare('SELECT * FROM tool_calls WHERE profile_id=? AND idempotency_key=?')
      .get(this.store.profileId, key) as Call | undefined;
    if (!call)
      call = this.store.db.transaction(() => {
        guard();
        return this.propose(run, stepKey, args, preview);
      })();
    for (let retry = 0; call.status === 'failed' && call.side_effect === 'not_committed'; retry++) {
      if (retry >= 3) throw new StorageError('PERMISSION_DENIED');
      const retryKey = canonicalHash({ retryOf: call.id });
      call =
        (this.store.db
          .prepare('SELECT * FROM tool_calls WHERE profile_id=? AND idempotency_key=?')
          .get(this.store.profileId, retryKey) as Call | undefined) ??
        this.store.db.transaction(() => {
          guard();
          return this.propose(run, stepKey, args, preview, retryKey);
        })();
    }
    if (call.status === 'succeeded' && call.result_ref) {
      const ref = ResourceRefSchema.parse(JSON.parse(call.result_ref));
      await this.waitForReceipt(run, call, ref, guard, signal);
      if (!(await this.verify(run, [ref]))) throw new StorageError('CONFLICT');
      return ref;
    }
    if (['unknown', 'dispatched', 'pending'].includes(call.status))
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    if (['cancelled', 'failed'].includes(call.status)) throw new StorageError('PERMISSION_DENIED');
    if (call.approval_id && this.approval(call.approval_id).decision === 'pending') return null;
    return this.dispatch(call, guard, signal);
  }
  private async dispatch(
    call: Call,
    guard: () => void,
    signal?: AbortSignal,
  ): Promise<ResourceRef> {
    const run = this.current(call),
      args = parseWorkTool(JSON.parse(call.args_json));
    this.store.db.transaction(() => {
      guard();
      const binding = this.snapshot(run, args);
      if (
        binding.argsHash !== call.args_hash ||
        binding.resourceHash !== call.resource_hash ||
        binding.contentHash !== call.content_hash ||
        call.task_version !== run.task_version ||
        call.tool_name !== args.tool ||
        call.tool_version !== WORK_TOOL_SPECS[args.tool].version
      )
        throw new StorageError('APPROVAL_STALE');
      const grant = this.grant(run, args, call.id);
      if ((args.tool === 'workspace.patch' || structuredEdit(args)) && !grant)
        throw new StorageError('PERMISSION_DENIED');
      if (call.approval_id) {
        const a = this.approval(call.approval_id);
        if (
          a.decision !== 'approved' ||
          a.consumed_at !== null ||
          a.expires_at <= this.store.now() ||
          a.task_version !== run.task_version ||
          a.args_hash !== binding.argsHash ||
          a.resource_hash !== binding.resourceHash ||
          a.content_version_hash !== binding.contentHash
        )
          throw new StorageError('APPROVAL_STALE');
        this.store.db
          .prepare('UPDATE approvals SET consumed_at=? WHERE id=? AND consumed_at IS NULL')
          .run(this.store.now(), a.id);
      }
      const state = this.repo.state(run),
        current = this.repo.row(run.id);
      if (this.repo.rootUsage(current).tools >= state.definition.budgetOverrides.maxTools)
        throw new StorageError('BUDGET_EXCEEDED');
      const used = (
        this.store.db
          .prepare(
            'SELECT coalesce(sum(v.size_bytes),0) n FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE r.root_run_id=? AND v.deleted_at IS NULL',
          )
          .get(run.root_run_id) as { n: number }
      ).n;
      if (
        used +
          (args.tool === 'data.analyze' ||
          args.tool === 'office.convert' ||
          args.tool === 'document.create' ||
          args.tool === 'document.revise' ||
          args.tool === 'document.fields' ||
          args.tool === 'slides.create' ||
          args.tool === 'slides.revise'
            ? 100 * 1024 * 1024
            : 64000) >
        2 * 1024 ** 3
      )
        throw new StorageError('BUDGET_EXCEEDED');
      this.store.db.prepare('UPDATE runs SET tools=tools+1 WHERE id=?').run(run.id);
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='dispatched',lease_epoch=?,grant_id=?,updated_at=? WHERE id=?",
        )
        .run(run.lease_epoch, grant?.id ?? null, this.store.now(), call.id);
      this.store.db
        .prepare(
          'INSERT INTO tool_call_attempts(id,profile_id,tool_call_id,attempt_no,started_at) VALUES(?,?,?,1,?)',
        )
        .run(newId(), this.store.profileId, call.id, this.store.now());
      this.repo.event(run, 'tool.dispatched', args.tool);
      this.repo.status(run, 'waiting_tool');
    })();
    const live = () => {
      guard();
      if (
        (args.tool === 'workspace.patch' || structuredEdit(args)) &&
        !this.grant(run, args, call.id)
      )
        throw new StorageError('PERMISSION_DENIED');
      const binding = this.snapshot(run, args);
      if (
        binding.argsHash !== call.args_hash ||
        binding.resourceHash !== call.resource_hash ||
        binding.contentHash !== call.content_hash
      )
        throw new StorageError('APPROVAL_STALE');
    };
    const committed = (result: ResourceRef) => {
      if (!this.store.db.inTransaction) throw new StorageError('INTERNAL_ERROR');
      const dispatched = this.call(call.id);
      if ((args.tool === 'workspace.patch' || structuredEdit(args)) && dispatched.grant_id) {
        const revision = this.artifacts.files.get(args.fileId).revision;
        this.store.db
          .prepare(
            'UPDATE grants SET resource_rules_json=?,revision=revision+1,updated_at=? WHERE id=? AND revoked_at IS NULL',
          )
          .run(
            JSON.stringify(
              ResourceRulesDocumentSchema.parse({
                schemaVersion: 1,
                rules: [{ resourceId: args.fileId, revision, actions: ['workspace_write'] }],
              }),
            ),
            this.store.now(),
            dispatched.grant_id,
          );
      }
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='succeeded',side_effect='committed',result_ref=?,updated_at=? WHERE id=? AND status='dispatched'",
        )
        .run(JSON.stringify(result), this.store.now(), call.id);
      this.store.db
        .prepare('UPDATE tool_call_attempts SET ended_at=? WHERE tool_call_id=?')
        .run(this.store.now(), call.id);
      this.repo.event(run, 'tool.finished', args.tool + '：success');
      if (this.current(call).status === 'waiting_tool') this.repo.status(run, 'running');
    };
    try {
      let result: ResourceRef;
      if (args.tool === 'workspace.patch') result = await this.patch(run, args, live, committed);
      else if (args.tool === 'artifact.write')
        result = await this.artifacts.execute(run, call.step_key, args, live, committed);
      else if (args.tool === 'slides.create' || args.tool === 'slides.revise') {
        if (!this.chat || !this.native) throw new StorageError('SANDBOX_UNAVAILABLE');
        result = await publishWorkSlides(
          this.artifacts,
          this.chat,
          this.native,
          run,
          args,
          live,
          committed,
          signal ?? new AbortController().signal,
          (raw) => {
            const value = NativeWorkIdentitySchema.parse(raw);
            this.store.db.transaction(() => {
              this.store.db
                .prepare('UPDATE tool_call_attempts SET external_handle=? WHERE tool_call_id=?')
                .run(JSON.stringify(value), call.id);
            })();
          },
        );
        await this.waitForDocument(run, result, guard, signal);
        if (result.kind === 'file') {
          const deck = new SlideRepository(this.artifacts.files).read(
            result.fileId,
            result.versionId,
            { type: 'task', id: run.task_id },
          );
          await this.waitForDocument(run, deck.preview, guard, signal);
        }
      } else if (args.tool === 'document.create') {
        if (!this.chat) throw new StorageError('FEATURE_NOT_AVAILABLE');
        result = await createWorkDocument(
          this.chat,
          this.artifacts.files,
          this.artifacts.blobs,
          run,
          args.name,
          args.spec,
          live,
          committed,
        );
        await this.waitForDocument(run, result, live, signal);
      } else if (args.tool === 'document.revise' || args.tool === 'document.fields') {
        if (!this.chat) throw new StorageError('FEATURE_NOT_AVAILABLE');
        result = await reviseWorkDocument(
          this.chat,
          this.artifacts.files,
          this.artifacts.blobs,
          run,
          {
            fileId: args.fileId,
            baseVersion: args.versionId,
            revision: args.revision,
            ...(args.tool === 'document.revise'
              ? { blockId: args.blockId, replacement: args.replacement }
              : {
                  fields: Object.fromEntries(
                    Object.entries(args.fields).filter(([, value]) => value !== undefined),
                  ),
                }),
          },
          live,
          committed,
        );
        await this.waitForDocument(run, result, guard, signal);
      } else {
        if (!this.native) throw new StorageError('SANDBOX_UNAVAILABLE');
        const spec =
          args.tool === 'office.convert' && this.chat
            ? this.artifacts.documentSourceSpec(run, args.fileId, args.versionId)
            : undefined;
        const chat = this.chat;
        result = await this.native.execute(
          run,
          args,
          live,
          committed,
          signal ?? new AbortController().signal,
          (raw) => {
            const value = NativeWorkIdentitySchema.parse(raw);
            this.store.db.transaction(() => {
              this.store.db
                .prepare('UPDATE tool_call_attempts SET external_handle=? WHERE tool_call_id=?')
                .run(JSON.stringify(value), call.id);
              this.store.db
                .prepare(
                  `INSERT INTO process_handles(id,profile_id,run_id,tool_call_id,helper_instance_id,pid,job_id,started_at,state,lease_epoch,identity_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET helper_instance_id=excluded.helper_instance_id,pid=excluded.pid,job_id=excluded.job_id,state=excluded.state,identity_json=excluded.identity_json`,
                )
                .run(
                  call.id,
                  this.store.profileId,
                  run.id,
                  call.id,
                  value.helperInstanceId,
                  value.pid,
                  value.nativeRunId,
                  this.store.now(),
                  value.state,
                  value.leaseEpoch,
                  JSON.stringify(value),
                );
            })();
          },
          spec && chat
            ? {
                spec,
                candidate: async (attempt) =>
                  (await prepareWorkDocument(chat, run, spec, live, false, attempt)).docx,
              }
            : undefined,
        );
        await this.waitForReceipt(run, call, result, live, signal);
      }
      return result;
    } catch (error) {
      this.store.db.transaction(() => {
        const failed = this.store.db
          .prepare(
            "UPDATE tool_calls SET status=?,side_effect=?,updated_at=? WHERE id=? AND status IN ('dispatched','unknown')",
          )
          .run(
            error instanceof StorageError && error.code === 'SIDE_EFFECT_UNKNOWN'
              ? 'unknown'
              : 'failed',
            error instanceof StorageError && error.code === 'SIDE_EFFECT_UNKNOWN'
              ? 'unknown'
              : 'not_committed',
            this.store.now(),
            call.id,
          );
        if (!failed.changes) return;
        this.store.db
          .prepare('UPDATE tool_call_attempts SET ended_at=?,error_json=? WHERE tool_call_id=?')
          .run(
            this.store.now(),
            JSON.stringify({ code: error instanceof StorageError ? error.code : 'INTERNAL_ERROR' }),
            call.id,
          );
        this.repo.event(run, 'tool.finished', args.tool + '：failed');
        if (
          this.current(call).status === 'waiting_tool' &&
          !(error instanceof StorageError && error.code === 'SIDE_EFFECT_UNKNOWN')
        )
          this.repo.status(run, 'running');
      })();
      throw error;
    }
  }
  private async waitForDocument(
    run: WorkRun,
    ref: ResourceRef,
    guard: () => void,
    signal?: AbortSignal,
  ) {
    if (ref.kind !== 'file') throw new StorageError('PARSE_FAILED');
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      guard();
      if (signal?.aborted) throw new StorageError('CANCELLED');
      const file = this.artifacts.files.get(ref.fileId, {
        versionId: ref.versionId,
        owner: { type: 'task', id: run.task_id },
      });
      if (file.version.parseStatus === 'ready') {
        if (!(await this.verify(run, [ref]))) throw new StorageError('PARSE_FAILED');
        guard();
        return;
      }
      if (['failed', 'cancelled', 'unsupported'].includes(file.version.parseStatus))
        throw new StorageError('PARSE_FAILED');
      try {
        await delay(250, undefined, { signal });
      } catch {
        throw new StorageError('CANCELLED');
      }
    }
    throw new StorageError('INDEX_NOT_READY');
  }
  private async waitForReceipt(
    run: WorkRun,
    call: Call,
    ref: ResourceRef,
    guard: () => void,
    signal?: AbortSignal,
  ) {
    if (
      call.tool_name === 'document.create' ||
      call.tool_name === 'document.revise' ||
      call.tool_name === 'document.fields' ||
      call.tool_name === 'slides.create' ||
      call.tool_name === 'slides.revise' ||
      (call.tool_name === 'office.convert' &&
        ref.kind === 'file' &&
        this.artifacts.documentSourceForPdf(run, ref.versionId))
    ) {
      await this.waitForDocument(run, ref, guard, signal);
      if (
        (call.tool_name === 'slides.create' || call.tool_name === 'slides.revise') &&
        ref.kind === 'file'
      ) {
        const record = new SlideRepository(this.artifacts.files).read(ref.fileId, ref.versionId, {
          type: 'task',
          id: run.task_id,
        });
        await this.waitForDocument(run, record.preview, guard, signal);
      }
    }
  }
  private async patch(
    run: WorkRun,
    args: Extract<WorkToolArgs, { tool: 'workspace.patch' }>,
    guard: () => void,
    committed: (ref: ResourceRef) => void,
  ): Promise<ResourceRef> {
    const file = this.artifacts.files.get(args.fileId, { versionId: args.versionId }),
      blob = await this.artifacts.blobs.put(Buffer.from(args.content), file.version.mime);
    guard();
    return this.store.db.transaction(() => {
      guard();
      const result = this.artifacts.files.importBlob({
        blobId: blob.id,
        name: file.name,
        relativePath: file.name,
        replaceId: file.id,
        generatedByRunId: run.id,
        owner: { type: 'session', id: run.session_id },
      }).file;
      this.store.db
        .prepare(
          "UPDATE file_versions SET created_by_run_id=?,parse_status='ready',preview_status='ready' WHERE id=?",
        )
        .run(run.id, result.version.id);
      const ref = { kind: 'file' as const, fileId: file.id, versionId: result.version.id };
      this.artifacts.files.link(file.id, result.version.id, { type: 'task', id: run.task_id });
      committed(ref);
      return ref;
    })();
  }
  async resume(
    run: WorkRun,
    stepKey: string,
    guard: () => void,
    options: { allowDispatch?: boolean; signal?: AbortSignal } = {},
  ): Promise<ResourceRef[] | null | undefined> {
    const calls = this.store.db
      .prepare(
        "SELECT * FROM tool_calls WHERE run_id=? AND step_key=? AND status IN ('proposed','approved','succeeded') ORDER BY created_at,id",
      )
      .all(run.id, stepKey) as Call[];
    if (!calls.length) return undefined;
    const refs: ResourceRef[] = [];
    for (const call of calls) {
      if (call.status === 'succeeded' && call.result_ref) {
        const ref = ResourceRefSchema.parse(JSON.parse(call.result_ref));
        await this.waitForReceipt(run, call, ref, guard, options.signal);
        if (!(await this.verify(run, [ref]))) throw new StorageError('CONFLICT');
        refs.push(ref);
        continue;
      }
      if (call.approval_id && this.approval(call.approval_id).decision === 'pending') return null;
      if (options.allowDispatch === false) throw new StorageError('BUDGET_EXCEEDED');
      refs.push(
        await this.dispatch(
          call,
          () => {
            guard();
            options.signal?.throwIfAborted();
          },
          options.signal,
        ),
      );
    }
    return refs;
  }
  async verify(run: WorkRun, refs: ResourceRef[]) {
    try {
      const resolveImage = this.chat
        ? (versionId: string) => resolveWorkDocumentImage(this.chat!, run, versionId, () => {})
        : undefined;
      if (!(await this.artifacts.verify(run, refs, resolveImage))) return false;
      for (const ref of refs) {
        if (ref.kind !== 'file') return false;
        const owner = { type: 'task' as const, id: run.task_id };
        const file = this.artifacts.files.get(ref.fileId, { versionId: ref.versionId, owner });
        if (file.version.extension === 'pptx') {
          const record = new SlideRepository(this.artifacts.files).read(
            ref.fileId,
            ref.versionId,
            owner,
          );
          if (
            !this.chat ||
            !(await verifyWorkSlideSources(this.artifacts, this.chat, run, record.spec))
          )
            return false;
        }
        if (file.version.extension === 'json') {
          const { bytes } = await this.artifacts.files.original(ref.fileId, {
            versionId: ref.versionId,
            owner,
          });
          const value = JSON.parse(bytes.toString('utf8'));
          if (value?.kind === 'tapkit.analysis')
            dataSources(this.artifacts, run, AnalysisResultSchema.parse(value).spec);
        }
        const hasDocumentSpec = !!this.store.db
          .prepare('SELECT 1 FROM document_specs WHERE file_version_id=? AND profile_id=?')
          .get(ref.versionId, this.store.profileId);
        const spec =
          file.version.extension === 'docx' || (file.version.extension === 'md' && hasDocumentSpec)
            ? new DocumentRepository(this.artifacts.files).read(ref.fileId, ref.versionId, owner)
            : file.version.extension === 'pdf'
              ? this.artifacts.documentSourceForPdf(run, ref.versionId)
              : undefined;
        if (!spec) continue;
        if (
          (spec.citations.length ||
            spec.sections.some((section) =>
              section.blocks.some((block) => block.type === 'image'),
            )) &&
          (!this.chat || !(await verifyWorkDocumentSources(this.chat, run, spec)))
        )
          return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  async formats(run: WorkRun, refs: ResourceRef[]) {
    const formats: string[] = [];
    for (const ref of refs) {
      if (ref.kind !== 'file') continue;
      const owner = { type: 'task' as const, id: run.task_id };
      const file = this.artifacts.files.get(ref.fileId, { versionId: ref.versionId, owner });
      formats.push(file.version.extension);
      if (file.version.extension !== 'json') continue;
      const { bytes } = await this.artifacts.files.original(ref.fileId, {
        versionId: ref.versionId,
        owner,
      });
      const value = JSON.parse(bytes.toString('utf8'));
      if (value?.kind !== 'tapkit.analysis') continue;
      const result = AnalysisResultSchema.parse(value);
      for (const output of result.exports)
        formats.push(
          this.artifacts.files.get(output.fileId, { versionId: output.versionId, owner }).version
            .extension,
        );
    }
    return formats;
  }
  async recover(run: WorkRun) {
    const dispatched = this.store.db
      .prepare("SELECT * FROM tool_calls WHERE run_id=? AND status IN ('dispatched','pending')")
      .all(run.id) as Call[];
    for (const call of dispatched) {
      const args = parseWorkTool(JSON.parse(call.args_json));
      const guard = () => {
        const task = this.store.db
          .prepare('SELECT current_version FROM tasks WHERE id=?')
          .get(run.task_id) as { current_version: number };
        const current = this.repo.row(run.id);
        if (
          current.status !== 'recovering' ||
          current.lease_epoch !== run.lease_epoch ||
          task.current_version !== run.task_version
        )
          throw new StorageError('CANCELLED');
        const binding = this.snapshot(current, args);
        if (
          binding.argsHash !== call.args_hash ||
          binding.resourceHash !== call.resource_hash ||
          binding.contentHash !== call.content_hash
        )
          throw new StorageError('APPROVAL_STALE');
      };
      if (
        args.tool === 'artifact.write' ||
        args.tool === 'workspace.patch' ||
        args.tool === 'document.create' ||
        args.tool === 'document.revise' ||
        args.tool === 'document.fields'
      ) {
        // Registration and receipt share a SQLite transaction; dispatched means no managed file was committed.
        try {
          guard();
          this.store.db
            .prepare("UPDATE tool_calls SET status='failed',side_effect='not_committed' WHERE id=?")
            .run(call.id);
        } catch {
          /* Remain unknown below when the bound resource changed. */
        }
      } else if (this.native && args.tool !== 'slides.create' && args.tool !== 'slides.revise') {
        const handle = this.store.db
          .prepare(
            'SELECT external_handle FROM tool_call_attempts WHERE tool_call_id=? ORDER BY attempt_no DESC LIMIT 1',
          )
          .get(call.id) as { external_handle: string | null } | undefined;
        const identity = handle?.external_handle
          ? NativeWorkIdentitySchema.safeParse(JSON.parse(handle.external_handle))
          : null;
        if (identity?.success && identity.data.state === 'finished')
          try {
            await this.native.recoverOutput(run, args, identity.data, guard, (ref) => {
              this.store.db
                .prepare(
                  "UPDATE tool_calls SET status='succeeded',side_effect='committed',result_ref=?,updated_at=? WHERE id=?",
                )
                .run(JSON.stringify(ref), this.store.now(), call.id);
              this.store.db
                .prepare('UPDATE tool_call_attempts SET ended_at=? WHERE tool_call_id=?')
                .run(this.store.now(), call.id);
              this.repo.event(run, 'tool.finished', args.tool + '：已核验恢复成果');
            });
          } catch {
            /* Unregistered or changed output requires explicit reconciliation. */
          }
      }
    }
    // A committed immutable version plus its ledger result can be re-verified. A dispatched intention without that receipt is unknown.
    this.store.db.transaction(() => {
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='unknown',side_effect='unknown' WHERE run_id=? AND status IN ('dispatched','pending')",
        )
        .run(run.id);
    })();
    return !this.store.db
      .prepare(
        "SELECT 1 FROM tool_calls WHERE run_id=? AND (status='unknown' OR side_effect='unknown')",
      )
      .get(run.id);
  }
  async dispatchCommand(request: Request): Promise<Reply> {
    const ok = (data: unknown) =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data });
    const command = request.command;
    if (command === 'runs.slides') {
      const p = WorkCommandSchemas['runs.slides'].parse(request.payload),
        run = this.repo.row(p.runId);
      const receipt = this.store.db
        .prepare(
          "SELECT 1 FROM tool_calls c JOIN runs r ON r.id=c.run_id WHERE r.root_run_id=? AND c.profile_id=? AND c.tool_name IN ('slides.create','slides.revise') AND c.status='succeeded' AND json_extract(c.result_ref,'$.fileId')=? AND json_extract(c.result_ref,'$.versionId')=?",
        )
        .get(run.root_run_id, this.store.profileId, p.fileId, p.versionId);
      if (!receipt) throw new StorageError('PERMISSION_DENIED');
      const record = new SlideRepository(this.artifacts.files).read(p.fileId, p.versionId, {
        type: 'task',
        id: run.task_id,
      });
      if (
        !this.chat ||
        !(await verifyWorkSlideSources(this.artifacts, this.chat, run, record.spec))
      )
        throw new StorageError('PERMISSION_DENIED');
      return ok({
        slidePage: SlidePageSchema.parse(
          slidePage(this.artifacts, run, p.fileId, p.versionId, p.slideId),
        ),
      });
    }
    if (command === 'runs.data') {
      const p = WorkCommandSchemas['runs.data'].parse(request.payload),
        run = this.repo.row(p.runId);
      const receipt = this.store.db
        .prepare(
          "SELECT 1 FROM tool_calls c JOIN runs r ON r.id=c.run_id WHERE r.root_run_id=? AND c.profile_id=? AND c.tool_name='data.analyze' AND c.status='succeeded' AND json_extract(c.result_ref,'$.fileId')=? AND json_extract(c.result_ref,'$.versionId')=?",
        )
        .get(run.root_run_id, this.store.profileId, p.fileId, p.versionId);
      if (!receipt) throw new StorageError('PERMISSION_DENIED');
      const { bytes } = await this.artifacts.files.original(p.fileId, {
        versionId: p.versionId,
        owner: { type: 'task', id: run.task_id },
      });
      const result = AnalysisResultSchema.parse(JSON.parse(bytes.toString('utf8')));
      dataSources(this.artifacts, run, result.spec);
      return ok({ dataPage: DataPageSchema.parse(analysisPage(result, p)) });
    }
    if (command === 'approvals.refresh') {
      const p = WorkCommandSchemas['approvals.refresh'].parse(request.payload),
        original = this.approval(p.approvalId),
        oldCall = this.call(original.tool_call_id),
        current = this.current(oldCall),
        args = parseWorkTool(JSON.parse(oldCall.args_json)),
        preview = await this.preview(current, args);
      return this.store.receipt(request, () => {
        const a = this.approval(p.approvalId),
          call = this.call(a.tool_call_id),
          run = this.current(call);
        this.repo.revision(run, request.expectedRevision);
        const task = this.store.db
          .prepare('SELECT current_version FROM tasks WHERE id=?')
          .get(run.task_id) as { current_version: number };
        const binding = this.snapshot(run, args);
        if (
          run.status !== 'waiting_user' ||
          a.decision !== 'pending' ||
          a.expires_at > this.store.now() ||
          a.consumed_at !== null ||
          call.status !== 'proposed' ||
          call.side_effect !== 'none' ||
          run.task_version !== task.current_version ||
          call.args_json !== oldCall.args_json ||
          binding.argsHash !== preview.argsHash ||
          binding.resourceHash !== preview.resourceHash ||
          binding.contentHash !== preview.contentHash
        )
          throw new StorageError('APPROVAL_STALE');
        this.store.db
          .prepare("UPDATE approvals SET decision='expired',updated_at=? WHERE id=?")
          .run(this.store.now(), a.id);
        this.store.db
          .prepare(
            "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE id=?",
          )
          .run(call.id);
        const next = this.propose(
          run,
          call.step_key,
          args,
          preview,
          canonicalHash({ refreshOf: call.id, requestId: request.requestId }),
        );
        if (!next.approval_id) this.requireApproval(next, preview);
        return ok({ work: this.repo.view(run.id) });
      });
    }
    if (command === 'approvals.list') {
      const p = WorkCommandSchemas['approvals.list'].parse(request.payload);
      const rows = this.store.db
        .prepare(
          'SELECT a.* FROM approvals a JOIN tool_calls c ON c.id=a.tool_call_id JOIN runs r ON r.id=c.run_id JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id WHERE a.profile_id=? AND a.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND (? IS NULL OR c.run_id=?) ORDER BY a.created_at DESC,a.id DESC LIMIT 100',
        )
        .all(this.store.profileId, p.runId ?? null, p.runId ?? null) as Approval[];
      return ok({
        approvals: rows.map((a) => {
          const call = this.call(a.tool_call_id);
          const { schemaVersion: _, ...preview } = JSON.parse(a.preview_json);
          return ApprovalViewSchema.parse({
            id: a.id,
            runId: call.run_id,
            callId: call.id,
            taskVersion: a.task_version,
            decision:
              a.decision === 'pending' && a.expires_at <= this.store.now() ? 'expired' : a.decision,
            argsHash: a.args_hash,
            resourceHash: a.resource_hash,
            contentVersionHash: a.content_version_hash,
            expiresAt: a.expires_at,
            businessArgs: parseWorkTool(JSON.parse(call.args_json)),
            preview,
          });
        }),
      });
    }
    if (command === 'grants.list' || command === 'grants.revoke') {
      let affectedRuns: string[] = [];
      if (command === 'grants.revoke') {
        const p = WorkCommandSchemas['grants.revoke'].parse(request.payload);
        return this.store.receipt(request, () => {
          for (const id of p.grantIds) {
            if (
              !this.store.db
                .prepare(
                  'UPDATE grants SET revoked_at=?,revision=revision+1 WHERE id=? AND profile_id=?',
                )
                .run(this.store.now(), id, this.store.profileId).changes
            )
              throw new StorageError('NOT_FOUND');
          }
          const rows = this.store.db
            .prepare(
              "SELECT r.id FROM runs r JOIN tasks t ON t.id=r.task_id WHERE t.mode='work' AND r.status IN ('running','waiting_tool','queued','waiting_user','paused')",
            )
            .all() as { id: string }[];
          affectedRuns = rows.map((r) => r.id);
          for (const r of rows)
            this.repo.event(
              this.repo.row(r.id),
              'approval.resolved',
              '权限已撤销，新调用会重新核验',
            );
          return ok({ grants: this.grants(), affectedRuns });
        });
      }
      return ok({ grants: this.grants() });
    }
    if (command === 'approvals.decide')
      return this.store.receipt(request, () => {
        const p = WorkCommandSchemas['approvals.decide'].parse(request.payload),
          a = this.approval(p.approvalId),
          call = this.call(a.tool_call_id),
          run = this.current(call),
          args = parseWorkTool(JSON.parse(call.args_json)),
          binding = this.snapshot(run, args);
        this.repo.revision(run, request.expectedRevision);
        const task = this.store.db
          .prepare('SELECT current_version FROM tasks WHERE id=?')
          .get(run.task_id) as { current_version: number };
        if (
          run.status !== 'waiting_user' ||
          a.decision !== 'pending' ||
          a.expires_at <= this.store.now() ||
          a.consumed_at !== null ||
          a.task_version !== task.current_version ||
          binding.argsHash !== a.args_hash ||
          binding.resourceHash !== a.resource_hash ||
          binding.contentHash !== a.content_version_hash ||
          p.argsHash !== a.args_hash ||
          p.contentVersionHash !== a.content_version_hash
        )
          throw new StorageError('APPROVAL_STALE');
        this.store.db
          .prepare('UPDATE approvals SET decision=?,decided_at=?,updated_at=? WHERE id=?')
          .run(p.decision, this.store.now(), this.store.now(), a.id);
        if (p.decision === 'approved') {
          if (args.tool !== 'workspace.patch' && !structuredEdit(args))
            throw new StorageError('PERMISSION_DENIED');
          const grantId = newId();
          this.store.db
            .prepare(
              'INSERT INTO grants(id,profile_id,created_at,updated_at,scope_kind,scope_id,tool_names_json,resource_rules_json,action_classes_json,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              grantId,
              this.store.profileId,
              this.store.now(),
              this.store.now(),
              p.scope,
              p.scope === 'once'
                ? call.id
                : p.scope === 'session'
                  ? run.session_id
                  : this.store.profileId,
              JSON.stringify({ schemaVersion: 1, names: [args.tool] }),
              JSON.stringify(
                ResourceRulesDocumentSchema.parse({
                  schemaVersion: 1,
                  rules: [
                    {
                      resourceId: args.fileId,
                      revision: this.artifacts.files.get(args.fileId).revision,
                      actions: ['workspace_write'],
                    },
                  ],
                }),
              ),
              JSON.stringify({ schemaVersion: 1, actions: ['workspace_write'] }),
              p.scope === 'once' ? a.expires_at : null,
            );
          this.store.db
            .prepare("UPDATE tool_calls SET status='approved',grant_id=? WHERE id=?")
            .run(grantId, call.id);
          this.store.db
            .prepare("UPDATE plan_steps SET status='pending' WHERE run_id=? AND step_key=?")
            .run(run.id, call.step_key);
          this.repo.status(run, 'paused');
          this.repo.status(run, 'queued');
        } else {
          this.store.db
            .prepare(
              "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE id=?",
            )
            .run(call.id);
          this.repo.stepResult(run, call.step_key, {
            status: 'failed',
            error: 'PERMISSION_DENIED',
          });
          this.repo.status(run, 'paused', 'PERMISSION_DENIED');
        }
        this.repo.event(run, 'approval.resolved', p.decision);
        return ok({ work: this.repo.view(run.id) });
      });
    if (command === 'approvals.editDraft')
      return this.store.receipt(request, () => {
        const p = WorkCommandSchemas['approvals.editDraft'].parse(request.payload),
          a = this.approval(p.approvalId),
          call = this.call(a.tool_call_id),
          run = this.current(call),
          args = parseWorkTool(p.newBusinessArgs);
        this.repo.revision(run, request.expectedRevision);
        if (
          a.decision !== 'pending' ||
          a.expires_at <= this.store.now() ||
          run.status !== 'waiting_user' ||
          args.tool !== 'workspace.patch'
        )
          throw new StorageError('APPROVAL_STALE');
        const old = parseWorkTool(JSON.parse(call.args_json));
        if (
          old.tool !== 'workspace.patch' ||
          args.fileId !== old.fileId ||
          args.versionId !== old.versionId
        )
          throw new StorageError('PERMISSION_DENIED');
        const binding = this.snapshot(run, args),
          oldPreview = JSON.parse(a.preview_json);
        this.store.db
          .prepare("UPDATE approvals SET decision='expired',updated_at=? WHERE id=?")
          .run(this.store.now(), a.id);
        this.store.db
          .prepare(
            "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE id=?",
          )
          .run(call.id);
        this.propose(run, call.step_key, args, {
          ...binding,
          before: oldPreview.before,
          after: args.content,
        });
        return ok({ work: this.repo.view(run.id) });
      });
    throw new StorageError('FEATURE_NOT_AVAILABLE');
  }
  private grants() {
    return this.store.db
      .prepare(
        'SELECT * FROM grants WHERE profile_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',
      )
      .all(this.store.profileId)
      .flatMap((raw) => {
        const g = raw as {
          id: string;
          scope_kind: string;
          scope_id: string;
          tool_names_json: string;
          resource_rules_json: string;
          revision: number;
          revoked_at: number | null;
        };
        const rules = ResourceRulesDocumentSchema.safeParse(JSON.parse(g.resource_rules_json));
        const resource = rules.success ? rules.data.rules[0] : undefined;
        return resource
          ? [
              GrantViewSchema.parse({
                id: g.id,
                scope: g.scope_kind,
                scopeId: g.scope_id,
                tool: JSON.parse(g.tool_names_json).names[0],
                resourceId: resource.resourceId,
                revision: g.revision,
                revoked: g.revoked_at !== null,
              }),
            ]
          : [];
      });
  }
}
