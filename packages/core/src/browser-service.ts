import {
  BrowserCommandSchemas,
  BrowserSnapshotSchema,
  BrowserPreparedSchema,
  BrowserResultSchema,
  BrowserWorkToolArgsSchema,
  WorkCommandSchemas,
  ReplySchema,
  ResourceRefSchema,
  ErrorCodeSchema,
  z,
  type BrowserHostRequest,
  type BrowserSnapshot,
  type BrowserTab,
  type BrowserWorkToolArgs,
  type BrowserPrepared,
  type Request,
  type Reply,
  type ResourceRef,
} from '@tapkit/contracts';
import { StorageError, newId, workTerminal, type WorkRun } from '@tapkit/storage';
import { canonicalHash, catalogAllowsTool } from '@tapkit/tools';
import { publicUrl, NetworkPolicyService } from '@tapkit/network';
import type { WorkArtifacts } from './work-artifacts';
import { ProjectService } from './project-service';

type Call = {
  id: string;
  run_id: string;
  step_key: string;
  task_version: number;
  args_json: string;
  args_hash: string;
  resource_hash: string;
  content_hash: string;
  status: string;
  approval_id: string | null;
  result_ref: string | null;
};
export class BrowserService {
  onTakeover?: (runId: string) => void;
  readonly repo;
  readonly store;
  constructor(
    readonly artifacts: WorkArtifacts,
    readonly host: (request: BrowserHostRequest) => Promise<unknown>,
    readonly proxy: (url: string) => Promise<string> = async () => '',
  ) {
    this.repo = artifacts.repo;
    this.store = this.repo.store;
    this.store.db
      .prepare("UPDATE browser_sessions SET state='interrupted' WHERE state='open'")
      .run();
    this.store.db.prepare("UPDATE browser_tabs SET state='interrupted' WHERE state='open'").run();
  }
  private run(id: string, active = true) {
    const run = this.repo.row(id);
    this.repo.session(run.session_id);
    const state = this.repo.state(run);
    const session = this.repo.session(run.session_id);
    if (
      session.project_id &&
      new ProjectService(this.artifacts.files).scope(run.session_id).scope.projectOnly
    )
      throw new StorageError('PERMISSION_DENIED');
    if (
      !state.definition.browserEnabled ||
      !catalogAllowsTool(state.toolCatalogVersion, 'browser.open')
    )
      throw new StorageError('PERMISSION_DENIED');
    const task = this.store.db
      .prepare('SELECT current_version,deleted_at FROM tasks WHERE id=? AND profile_id=?')
      .get(run.task_id, this.store.profileId) as
      { current_version: number; deleted_at: number | null } | undefined;
    if (
      !task ||
      task.deleted_at !== null ||
      task.current_version !== run.task_version ||
      (active && workTerminal.has(run.status))
    )
      throw new StorageError('CONFLICT');
    return run;
  }
  private async rpc(run: WorkRun, request: Omit<BrowserHostRequest, 'runId' | 'rootRunId'>) {
    return this.host({ ...request, runId: run.id, rootRunId: run.root_run_id });
  }
  private row(run: WorkRun, id: string) {
    const row = this.store.db
      .prepare(
        'SELECT t.* FROM browser_tabs t JOIN browser_sessions s ON s.id=t.session_id WHERE t.id=? AND t.profile_id=? AND s.run_id=?',
      )
      .get(id, this.store.profileId, run.id) as
      | {
          id: string;
          state: string;
          mode: 'agent' | 'user';
          url: string;
          title: string;
          last_snapshot_id: string | null;
        }
      | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private save(run: WorkRun, snapshot: BrowserSnapshot) {
    this.run(run.id);
    return this.store.db.transaction(() => {
      const p = this.store.profileId,
        now = this.store.now();
      this.store.db
        .prepare(
          "INSERT OR IGNORE INTO browser_sessions(id,profile_id,run_id,root_run_id,partition_id,state,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,?)",
        )
        .run(run.id, p, run.id, run.root_run_id, 'ephemeral:' + run.root_run_id, now, now);
      this.store.db
        .prepare(
          "INSERT INTO browser_tabs(id,profile_id,session_id,url,title,navigation_epoch,last_snapshot_id,mode,state,updated_at) VALUES(?,?,?,?,?,?,?,?,'open',?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,navigation_epoch=excluded.navigation_epoch,last_snapshot_id=excluded.last_snapshot_id,mode=excluded.mode,updated_at=excluded.updated_at",
        )
        .run(
          snapshot.tabId,
          p,
          run.id,
          snapshot.url,
          snapshot.title,
          snapshot.navigationEpoch,
          snapshot.id,
          snapshot.mode,
          now,
        );
      const seq = (
        this.store.db
          .prepare('SELECT coalesce(max(snapshot_seq),0)+1 n FROM browser_snapshots WHERE tab_id=?')
          .get(snapshot.tabId) as { n: number }
      ).n;
      this.store.db
        .prepare(
          'INSERT OR IGNORE INTO browser_snapshots(id,profile_id,tab_id,navigation_epoch,snapshot_seq,dom_json,observed_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          snapshot.id,
          p,
          snapshot.tabId,
          snapshot.navigationEpoch,
          seq,
          JSON.stringify(snapshot),
          now,
        );
      // Keep bounded history per tab; selected materials are independent immutable file versions.
      this.store.db
        .prepare(
          'DELETE FROM browser_snapshots WHERE tab_id=? AND id NOT IN (SELECT id FROM browser_snapshots WHERE tab_id=? ORDER BY snapshot_seq DESC LIMIT 20)',
        )
        .run(snapshot.tabId, snapshot.tabId);
      return snapshot;
    })();
  }
  private async observe(run: WorkRun, tabId: string) {
    if (this.row(run, tabId).state !== 'open') throw new StorageError('CONFLICT');
    return this.save(
      run,
      BrowserSnapshotSchema.parse(await this.rpc(run, { op: 'observe', tabId })),
    );
  }
  private async open(run: WorkRun, value: string) {
    const url = publicUrl(value).href;
    const snapshot = BrowserSnapshotSchema.parse(
      await this.rpc(run, { op: 'open', url, proxyURL: await this.proxy(url) }),
    );
    try {
      return this.save(run, snapshot);
    } catch (error) {
      await this.rpc(run, { op: 'close', tabId: snapshot.tabId });
      throw error;
    }
  }
  tabs(run: WorkRun): BrowserTab[] {
    const rows = this.store.db
      .prepare(
        "SELECT t.id FROM browser_tabs t JOIN browser_sessions s ON s.id=t.session_id WHERE s.run_id=? AND t.profile_id=? ORDER BY (t.state='open') DESC,t.updated_at DESC,t.id DESC LIMIT 20",
      )
      .all(run.id, this.store.profileId) as { id: string }[];
    return rows.map(({ id }) => {
      const row = this.row(run, id);
      const saved = row.last_snapshot_id
        ? (this.store.db
            .prepare('SELECT dom_json FROM browser_snapshots WHERE id=? AND profile_id=?')
            .get(row.last_snapshot_id, this.store.profileId) as { dom_json: string } | undefined)
        : undefined;
      return {
        id,
        runId: run.id,
        url: row.url,
        title: row.title,
        state: row.state as BrowserTab['state'],
        mode: row.mode,
        snapshot: saved ? BrowserSnapshotSchema.parse(JSON.parse(saved.dom_json)) : null,
      };
    });
  }
  async dispose(run: WorkRun) {
    await this.rpc(run, { op: 'dispose' });
    this.store.db
      .prepare(
        "UPDATE browser_tabs SET state='closed',mode='agent' WHERE session_id IN (SELECT id FROM browser_sessions WHERE root_run_id=? AND profile_id=?)",
      )
      .run(run.root_run_id, this.store.profileId);
    this.store.db
      .prepare(
        "UPDATE browser_sessions SET state='closed',updated_at=? WHERE root_run_id=? AND profile_id=?",
      )
      .run(this.store.now(), run.root_run_id, this.store.profileId);
  }
  async sweep() {
    const roots = this.store.db
      .prepare(
        "SELECT r.* FROM browser_sessions s JOIN runs r ON r.id=s.run_id JOIN tasks t ON t.id=r.task_id JOIN sessions c ON c.id=r.session_id WHERE s.state='open' AND (t.deleted_at IS NOT NULL OR c.deleted_at IS NOT NULL OR r.status IN ('completed','partial','failed','budget_stopped','cancelled'))",
      )
      .all() as WorkRun[];
    for (const run of roots) await this.dispose(run);
  }
  async dispatch(request: Request): Promise<Reply> {
    try {
      return await this.executeCommand(request);
    } catch (error) {
      return failureReply(request.requestId, error);
    }
  }
  async executeCommand(request: Request): Promise<Reply> {
    const ok = (data: unknown) =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data });
    const command = request.command as keyof typeof BrowserCommandSchemas;
    const input = BrowserCommandSchemas[command].parse(request.payload),
      run = this.run(input.runId, command !== 'browser.tabs');
    if (command === 'browser.tabs') return ok({ tabs: this.tabs(run) });
    if (command === 'browser.open')
      return ok({
        snapshot: await this.open(run, BrowserCommandSchemas[command].parse(input).url),
      });
    if (command === 'browser.resolve') {
      const p = BrowserCommandSchemas[command].parse(input),
        call = this.call(p.callId);
      if (call.run_id !== run.id || call.status !== 'unknown' || run.status !== 'waiting_user')
        throw new StorageError('CONFLICT');
      BrowserWorkToolArgsSchema.parse(JSON.parse(call.args_json));
      if (p.outcome === 'submitted') {
        await this.artifacts.publishBytes(
          run,
          '人工核对-' + call.id + '.json',
          Buffer.from(
            JSON.stringify({
              kind: 'tapkit.browser.user_verification',
              verifiedBy: 'user',
              outcome: 'submitted',
              statement: '用户明确核对网页提交已成功；不是机器验证结论',
            }),
          ),
          'application/json',
          () => {
            if (this.run(run.id).status !== 'waiting_user') throw new StorageError('CONFLICT');
          },
          (ref) => {
            this.store.db
              .prepare(
                "UPDATE tool_calls SET status='succeeded',side_effect='committed',result_ref=? WHERE id=? AND status='unknown'",
              )
              .run(JSON.stringify(ref), call.id);
          },
        );
      } else
        this.store.db
          .prepare(
            "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE id=? AND status='unknown'",
          )
          .run(call.id);
      this.store.db.transaction(() => {
        this.repo.status(run, 'paused');
        this.repo.event(
          run,
          'tool.finished',
          p.outcome === 'submitted'
            ? '用户核对网页已提交；待用户继续任务'
            : '用户核对未提交；不会自动重放',
        );
      })();
      return ok({ browserAck: true });
    }
    if (!('tabId' in input) || typeof input.tabId !== 'string')
      throw new StorageError('VALIDATION_ERROR');
    this.row(run, input.tabId);
    if (command === 'browser.observe')
      return ok({ snapshot: await this.observe(run, input.tabId) });
    if (command === 'browser.control') {
      const p = BrowserCommandSchemas[command].parse(input);
      const snapshot = BrowserSnapshotSchema.parse(
        await this.rpc(run, { op: 'control', tabId: p.tabId, mode: p.mode }),
      );
      this.save(run, snapshot);
      if (p.mode === 'user') this.onTakeover?.(run.id);
      this.store.db.transaction(() =>
        this.repo.event(
          run,
          'tool.finished',
          p.mode === 'user' ? '浏览器已由用户接管，自动派发已锁定' : '已重新观察并交回Agent',
        ),
      )();
      return ok({ snapshot });
    }
    if (command === 'browser.action') {
      const p = BrowserCommandSchemas[command].parse(input),
        snapshot = await this.observe(run, p.tabId);
      if (snapshot.mode === 'user') throw new StorageError('PERMISSION_DENIED');
      const action = {
        tabId: p.tabId,
        snapshotId: snapshot.id,
        action: p.action,
        ...(p.url ? { url: p.url } : {}),
      };
      const prepared = BrowserPreparedSchema.parse(
        await this.rpc(run, { op: 'prepare', tabId: p.tabId, action }),
      );
      const result = BrowserResultSchema.parse(
        await this.rpc(run, { op: 'act', tabId: p.tabId, action, binding: prepared.binding }),
      );
      return ok({ snapshot: this.save(run, result.snapshot) });
    }
    if (command === 'browser.material') {
      const p = BrowserCommandSchemas[command].parse(input),
        snapshot = await this.observe(run, p.tabId);
      const content = p.selection ? snapshot.selection : snapshot.text;
      if (!content.trim()) throw new StorageError('NOT_FOUND');
      const ref = await this.artifacts.publishBytes(
        run,
        '网页材料-' + snapshot.id + '.txt',
        Buffer.from(`${snapshot.title}\n${snapshot.url}\n快照：${snapshot.revision}\n\n${content}`),
        'text/plain',
        () => {
          this.run(run.id);
        },
      );
      return ok({ browserMaterial: ref });
    }
    if (command === 'browser.download') {
      const p = BrowserCommandSchemas[command].parse(input),
        snapshot = await this.observe(run, p.tabId);
      const download = snapshot.downloads.find((d) => d.url === p.url);
      if (
        !download ||
        !/\.(txt|md|csv|json|pdf|docx|xlsx|pptx|zip|png|jpe?g)$/i.test(download.name)
      )
        throw new StorageError('FORMAT_UNSUPPORTED');
      const policy = new NetworkPolicyService({ proxy: async (url) => this.proxy(url.href) });
      const response = await policy.request(publicUrl(download.url).href, {
        limit: 50 * 1024 * 1024,
      });
      this.run(run.id);
      this.row(run, p.tabId);
      if (response.status !== 200 || response.bytes.subarray(0, 2).toString() === 'MZ')
        throw new StorageError('PERMISSION_DENIED');
      const blob = await this.artifacts.blobs.put(
        response.bytes,
        response.headers['content-type'] ?? 'application/octet-stream',
      );
      this.run(run.id);
      const file = this.artifacts.files.importBlob({
        blobId: blob.id,
        name: download.name,
        relativePath: download.name,
        owner: { type: 'session', id: run.session_id },
      });
      return ok({
        browserMaterial: {
          kind: 'file',
          fileId: file.file.id,
          versionId: file.file.currentVersionId,
        },
      });
    }
    if (command === 'browser.present') {
      const p = BrowserCommandSchemas[command].parse(input);
      await this.rpc(run, {
        op: 'present',
        tabId: p.tabId,
        bounds: p.bounds,
        visible: p.visible,
        ...(request.windowId ? { windowId: request.windowId } : {}),
      });
    } else {
      await this.rpc(run, {
        op: command === 'browser.external' ? 'external' : 'close',
        tabId: input.tabId,
      });
      if (command === 'browser.close')
        this.store.db.prepare("UPDATE browser_tabs SET state='closed' WHERE id=?").run(input.tabId);
    }
    return ok({ browserAck: true });
  }
  private call(id: string) {
    const call = this.store.db
      .prepare('SELECT * FROM tool_calls WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as Call | undefined;
    if (!call) throw new StorageError('NOT_FOUND');
    return call;
  }
  private invalidate(call: Call) {
    this.store.db.transaction(() => {
      this.store.db
        .prepare(
          "UPDATE approvals SET decision='expired',updated_at=? WHERE tool_call_id=? AND decision IN ('pending','approved')",
        )
        .run(this.store.now(), call.id);
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='cancelled',side_effect='not_committed',updated_at=? WHERE id=? AND status IN ('proposed','approved')",
        )
        .run(this.store.now(), call.id);
      const run = this.repo.row(call.run_id);
      this.store.db
        .prepare(
          "UPDATE plan_steps SET status='pending',error_code='PARSE_FAILED' WHERE run_id=? AND step_key=?",
        )
        .run(run.id, call.step_key);
      this.repo.status(run, 'paused', 'APPROVAL_STALE');
      this.repo.event(run, 'approval.resolved', '网页或字段已改变，旧批准已失效；重新观察后继续');
    })();
  }
  private async prepare(run: WorkRun, args: BrowserWorkToolArgs) {
    this.run(run.id);
    if (args.tool === 'browser.act') {
      const { tool: _, ...action } = args;
      this.row(run, args.tabId);
      return BrowserPreparedSchema.parse(
        await this.rpc(run, { op: 'prepare', tabId: args.tabId, action }),
      );
    }
    return null;
  }
  async execute(
    run: WorkRun,
    stepKey: string,
    raw: unknown,
    guard: () => void,
    signal?: AbortSignal,
  ): Promise<ResourceRef | null> {
    const args = BrowserWorkToolArgsSchema.parse(raw);
    this.run(run.id);
    guard();
    signal?.throwIfAborted();
    const key = canonicalHash({
      run: run.id,
      version: run.task_version,
      step: stepKey,
      turn: this.repo.row(run.id).calls,
      args,
    });
    const existing = this.store.db
      .prepare('SELECT id FROM tool_calls WHERE profile_id=? AND idempotency_key=?')
      .get(this.store.profileId, key) as { id: string } | undefined;
    if (existing) return this.dispatchCall(existing.id, guard, signal);
    const prepared = await this.prepare(run, args);
    guard();
    signal?.throwIfAborted();
    const id = newId(),
      now = this.store.now();
    this.store.db.transaction(() => {
      guard();
      this.run(run.id);
      const binding = prepared?.binding ?? canonicalHash(args);
      this.store.db
        .prepare(
          "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect,step_key,content_hash,lease_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'proposed','none',?,?,?)",
        )
        .run(
          id,
          this.store.profileId,
          now,
          now,
          run.id,
          run.task_version,
          id,
          args.tool,
          '1',
          JSON.stringify(args),
          canonicalHash(args),
          binding,
          key,
          stepKey,
          binding,
          run.lease_epoch,
        );
      if (prepared?.classification === 'submit') {
        const approvalId = newId();
        this.store.db
          .prepare(
            "INSERT INTO approvals(id,profile_id,created_at,updated_at,tool_call_id,task_version,args_hash,resource_hash,content_version_hash,decision,expires_at,preview_json) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)",
          )
          .run(
            approvalId,
            this.store.profileId,
            now,
            now,
            id,
            run.task_version,
            canonicalHash(args),
            binding,
            binding,
            now + 600000,
            JSON.stringify({
              schemaVersion: 1,
              tool: args.tool,
              target: prepared.target,
              before: prepared.snapshot.url,
              after: prepared.preview,
            }),
          );
        this.store.db.prepare('UPDATE tool_calls SET approval_id=? WHERE id=?').run(approvalId, id);
        this.repo.status(run, 'waiting_user', 'APPROVAL_REQUIRED');
        this.repo.event(run, 'approval.required', '请审阅网页目标和完整表单字段');
      }
      this.repo.event(run, 'tool.proposed', args.tool);
    })();
    if (prepared?.classification === 'submit') return null;
    return this.dispatchCall(id, guard, signal);
  }
  async dispatchCall(
    id: string,
    guard: () => void,
    signal?: AbortSignal,
  ): Promise<ResourceRef | null> {
    const call = this.call(id),
      run = this.run(call.run_id),
      args = BrowserWorkToolArgsSchema.parse(JSON.parse(call.args_json));
    guard();
    signal?.throwIfAborted();
    if (call.status === 'succeeded' && call.result_ref)
      return ResourceRefSchema.parse(JSON.parse(call.result_ref));
    if (['unknown', 'dispatched', 'pending'].includes(call.status))
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    if (!['proposed', 'approved'].includes(call.status))
      throw new StorageError('PERMISSION_DENIED');
    let prepared: BrowserPrepared | null | undefined;
    try {
      prepared = await this.prepare(run, args);
      if (prepared && prepared.binding !== call.content_hash)
        throw new StorageError('APPROVAL_STALE');
    } catch (error) {
      this.invalidate(call);
      throw error;
    }
    guard();
    signal?.throwIfAborted();
    let approved = false;
    this.store.db.transaction(() => {
      guard();
      this.run(run.id);
      if (!['proposed', 'approved'].includes(this.call(id).status))
        throw new StorageError('CONFLICT');
      if (call.approval_id) {
        const a = this.store.db
          .prepare('SELECT * FROM approvals WHERE id=? AND profile_id=?')
          .get(call.approval_id, this.store.profileId) as {
          decision: string;
          consumed_at: number | null;
          expires_at: number;
          content_version_hash: string;
        };
        if (a.decision === 'pending') return;
        if (
          a.decision !== 'approved' ||
          a.consumed_at !== null ||
          a.expires_at <= this.store.now() ||
          a.content_version_hash !== prepared?.binding
        )
          throw new StorageError('APPROVAL_STALE');
        if (
          this.store.db
            .prepare('UPDATE approvals SET consumed_at=? WHERE id=? AND consumed_at IS NULL')
            .run(this.store.now(), call.approval_id).changes !== 1
        )
          throw new StorageError('CONFLICT');
        approved = true;
      }
      if (call.approval_id && !approved) return;
      const current = this.repo.row(run.id),
        state = this.repo.state(current);
      if (this.repo.rootUsage(current).tools >= state.definition.budgetOverrides.maxTools)
        throw new StorageError('BUDGET_EXCEEDED');
      this.store.db.prepare('UPDATE runs SET tools=tools+1 WHERE id=?').run(run.id);
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='dispatched',lease_epoch=?,updated_at=? WHERE id=? AND status IN ('proposed','approved')",
        )
        .run(run.lease_epoch, this.store.now(), id);
      this.store.db
        .prepare(
          'INSERT INTO tool_call_attempts(id,profile_id,tool_call_id,attempt_no,started_at) VALUES(?,?,?,1,?)',
        )
        .run(newId(), this.store.profileId, id, this.store.now());
      this.repo.event(run, 'tool.dispatched', args.tool);
    })();
    if (call.approval_id && !approved) return null;
    try {
      let snapshot: BrowserSnapshot,
        state = 'observed';
      if (args.tool === 'browser.open') snapshot = await this.open(run, args.url);
      else if (args.tool === 'browser.observe') snapshot = await this.observe(run, args.tabId);
      else {
        const { tool: _, ...action } = args;
        const result = BrowserResultSchema.parse(
          await this.rpc(run, {
            op: 'act',
            tabId: args.tabId,
            action,
            binding: prepared!.binding,
            approved,
          }),
        );
        snapshot = this.save(run, result.snapshot);
        state = result.state;
      }
      guard();
      signal?.throwIfAborted();
      if (state === 'unknown') throw new StorageError('SIDE_EFFECT_UNKNOWN');
      return await this.artifacts.publishBytes(
        run,
        `网页观察-${id}.json`,
        Buffer.from(JSON.stringify({ kind: 'tapkit.browser', state, snapshot })),
        'application/json',
        guard,
        (ref) => {
          this.store.db
            .prepare(
              "UPDATE tool_calls SET status='succeeded',side_effect=?,result_ref=?,updated_at=? WHERE id=? AND status='dispatched'",
            )
            .run(approved ? 'committed' : 'none', JSON.stringify(ref), this.store.now(), id);
          this.store.db
            .prepare('UPDATE tool_call_attempts SET ended_at=? WHERE tool_call_id=?')
            .run(this.store.now(), id);
          this.repo.event(run, 'tool.finished', args.tool + '：' + state);
          if (state === 'takeover') {
            this.repo.status(run, 'waiting_user', 'APPROVAL_REQUIRED');
            this.repo.event(
              run,
              'approval.required',
              '页面需要人工接管；完成后交回Agent并继续任务',
            );
          }
        },
      );
    } catch (error) {
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status=?,side_effect=?,updated_at=? WHERE id=? AND status='dispatched'",
        )
        .run(
          approved ? 'unknown' : 'failed',
          approved ? 'unknown' : 'not_committed',
          this.store.now(),
          id,
        );
      if (approved) throw new StorageError('SIDE_EFFECT_UNKNOWN');
      throw error;
    }
  }
  async approval(request: Request): Promise<Reply | undefined> {
    if (!['approvals.decide', 'approvals.refresh', 'approvals.editDraft'].includes(request.command))
      return;
    const p = z.object({ approvalId: z.string().uuid() }).parse(request.payload);
    const a = this.store.db
      .prepare(
        'SELECT a.*,c.tool_name,c.run_id,c.step_key,c.args_json FROM approvals a JOIN tool_calls c ON c.id=a.tool_call_id WHERE a.id=? AND a.profile_id=?',
      )
      .get(p.approvalId, this.store.profileId) as
      | {
          id: string;
          tool_name: string;
          run_id: string;
          step_key: string;
          args_json: string;
          tool_call_id: string;
          decision: string;
          expires_at: number;
          task_version: number;
          consumed_at: number | null;
          args_hash: string;
          content_version_hash: string;
        }
      | undefined;
    if (!a?.tool_name.startsWith('browser.')) return;
    if (request.command !== 'approvals.decide') throw new StorageError('APPROVAL_STALE');
    const decision = WorkCommandSchemas['approvals.decide'].parse(request.payload),
      run = this.run(a.run_id);
    if (decision.scope !== 'once') throw new StorageError('PERMISSION_DENIED');
    let prepared: BrowserPrepared | null | undefined;
    if (decision.decision === 'approved') {
      try {
        prepared = await this.prepare(
          run,
          BrowserWorkToolArgsSchema.parse(JSON.parse(a.args_json)),
        );
        if (prepared?.binding !== a.content_version_hash) throw new StorageError('APPROVAL_STALE');
      } catch (error) {
        this.invalidate(this.call(a.tool_call_id));
        throw error;
      }
    }
    return this.store.receipt(request, () => {
      const current = this.run(run.id),
        fresh = this.store.db
          .prepare('SELECT decision,consumed_at FROM approvals WHERE id=?')
          .get(a.id) as { decision: string; consumed_at: number | null };
      this.repo.revision(current, request.expectedRevision);
      if (
        current.status !== 'waiting_user' ||
        fresh.decision !== 'pending' ||
        fresh.consumed_at !== null ||
        a.expires_at <= this.store.now() ||
        a.task_version !== current.task_version ||
        decision.argsHash !== a.args_hash ||
        decision.contentVersionHash !== a.content_version_hash ||
        (decision.decision === 'approved' && prepared?.binding !== a.content_version_hash)
      )
        throw new StorageError('APPROVAL_STALE');
      this.store.db
        .prepare('UPDATE approvals SET decision=?,decided_at=?,updated_at=? WHERE id=?')
        .run(decision.decision, this.store.now(), this.store.now(), a.id);
      this.store.db
        .prepare('UPDATE tool_calls SET status=? WHERE id=?')
        .run(decision.decision === 'approved' ? 'approved' : 'cancelled', a.tool_call_id);
      this.store.db
        .prepare("UPDATE plan_steps SET status='pending' WHERE run_id=? AND step_key=?")
        .run(run.id, a.step_key);
      this.repo.status(run, 'paused');
      if (decision.decision === 'approved') this.repo.status(run, 'queued');
      this.repo.event(run, 'approval.resolved', decision.decision);
      return ReplySchema.parse({
        ok: true,
        requestId: request.requestId,
        data: { work: this.repo.view(run.id) },
      });
    });
  }
}
function failureReply(id: string, error: unknown): Reply {
  const code =
    error instanceof z.ZodError
      ? 'VALIDATION_ERROR'
      : (ErrorCodeSchema.safeParse(error instanceof Error ? error.message : '').data ??
        'INTERNAL_ERROR');
  return ReplySchema.parse({
    ok: false,
    requestId: id,
    error: {
      code,
      message: '浏览器操作未完成，请重新观察页面或接管核对。',
      retryable: false,
      recoveryActions: [],
      traceId: newId(),
    },
  });
}
