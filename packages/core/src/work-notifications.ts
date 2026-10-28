import {
  NotificationPrefsSchema,
  WorkNotificationSchema,
  WorkCommandSchemas,
  ReplySchema,
  type Request,
  type Reply,
  type z,
} from '@tapkit/contracts';
import { Store, StorageError, newId } from '@tapkit/storage';
type Prefs = z.infer<typeof NotificationPrefsSchema>;
type Row = {
  id: string;
  source_event_id: string;
  kind: string;
  title: string;
  body_summary: string;
  target_json: string;
  read_at: number | null;
  created_at: number;
};
const titles: Record<string, string> = {
  completed: '工作任务已完成',
  partial: '工作任务部分完成',
  failed: '工作任务需要处理',
  waiting_user: '工作任务等待输入',
  budget_stopped: '工作任务达到预算',
  permission: '工作任务权限发生变化',
  artifact: '工作成果已准备好',
};
export class WorkNotifications {
  constructor(readonly store: Store) {}
  preferences(): Prefs {
    const row = this.store.db
      .prepare(
        "SELECT value_json FROM settings WHERE profile_id=? AND scope_type='profile' AND scope_id=? AND key='work.notifications' AND deleted_at IS NULL",
      )
      .get(this.store.profileId, this.store.profileId) as { value_json: string } | undefined;
    return NotificationPrefsSchema.parse(row ? JSON.parse(row.value_json).values : {});
  }
  sync() {
    this.store.db.transaction(() => {
      const last =
        (
          this.store.db
            .prepare(
              "SELECT last_seq FROM work_consumers WHERE profile_id=? AND consumer='notifications'",
            )
            .get(this.store.profileId) as { last_seq: number } | undefined
        )?.last_seq ?? 0;
      const rows = this.store.db
        .prepare(
          "SELECT id,seq,event_type,payload_json,created_at FROM events WHERE profile_id=? AND stream_id='profile' AND seq>? ORDER BY seq LIMIT 500",
        )
        .all(this.store.profileId, last) as {
        id: string;
        seq: number;
        event_type: string;
        payload_json: string;
        created_at: number;
      }[];
      for (const row of rows) {
        const event = JSON.parse(row.payload_json),
          payload = event.payload;
        if (payload.kind !== 'work' || row.event_type === 'notification.created') continue;
        const run = this.store.db
          .prepare(
            'SELECT r.id,r.root_run_id,r.session_id,r.task_id,r.status,r.task_version,t.current_version,t.deleted_at,s.deleted_at session_deleted FROM runs r JOIN tasks t ON t.id=r.task_id JOIN sessions s ON s.id=r.session_id WHERE r.id=? AND r.profile_id=?',
          )
          .get(payload.runId, this.store.profileId) as
          | {
              id: string;
              root_run_id: string;
              session_id: string;
              task_id: string;
              status: string;
              task_version: number;
              current_version: number;
              deleted_at: number | null;
              session_deleted: number | null;
            }
          | undefined;
        if (
          !run ||
          run.deleted_at !== null ||
          run.session_deleted !== null ||
          (run.current_version !== payload.taskVersion &&
            !(
              run.task_version === payload.taskVersion &&
              run.status === 'completed' &&
              row.event_type === 'run.status' &&
              payload.summary === 'completed'
            ))
        )
          continue;
        const kind =
          row.event_type === 'approval.required'
            ? 'waiting_user'
            : row.event_type === 'approval.resolved' && payload.summary.includes('撤销')
              ? 'permission'
              : row.event_type === 'artifact.ready'
                ? 'artifact'
                : row.event_type === 'run.status'
                  ? (String(payload.summary).split('：')[0] ?? '')
                  : '';
        if (!titles[kind]) continue;
        const id = newId(),
          key = [
            run.root_run_id,
            payload.taskVersion,
            kind,
            Math.floor(row.created_at / 5000),
          ].join(':'),
          target = JSON.stringify({
            schemaVersion: 1,
            runId: run.id,
            sessionId: run.session_id,
            taskId: run.task_id,
          });
        const result = this.store.db
          .prepare(
            `INSERT INTO notifications(id,profile_id,created_at,updated_at,source_event_id,kind,title,body_summary,target_json,dedupe_key) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(dedupe_key) DO UPDATE SET source_event_id=excluded.source_event_id,updated_at=excluded.updated_at,target_json=excluded.target_json,read_at=NULL WHERE notifications.source_event_id<>excluded.source_event_id`,
          )
          .run(
            id,
            this.store.profileId,
            row.created_at,
            this.store.now(),
            row.id,
            kind,
            titles[kind],
            kind === 'waiting_user'
              ? '请在任务中回答问题或审阅具体操作。'
              : kind === 'budget_stopped'
                ? '请核对用量、时间上限或调整后新建任务。'
                : kind === 'permission'
                  ? '撤权已阻止依赖该权限的新调用。'
                  : '请打开任务查看验证结果与接续位置。',
            target,
            key,
          );
        if (result.changes) {
          const saved = this.store.db
            .prepare('SELECT id FROM notifications WHERE dedupe_key=?')
            .get(key) as { id: string };
          this.store.emit('notification.created', {
            kind: 'work',
            runId: run.id,
            taskVersion: payload.taskVersion,
            summary: titles[kind],
            notificationId: saved.id,
          });
        }
      }
      if (rows.length)
        this.store.db
          .prepare(
            "INSERT INTO work_consumers(profile_id,consumer,last_seq) VALUES(?,'notifications',?) ON CONFLICT(profile_id,consumer) DO UPDATE SET last_seq=excluded.last_seq",
          )
          .run(this.store.profileId, rows.at(-1)!.seq);
    })();
  }
  private view(row: Row) {
    const target = JSON.parse(row.target_json);
    return WorkNotificationSchema.parse({
      id: row.id,
      runId: target.runId,
      sessionId: target.sessionId,
      kind: row.kind,
      title: row.title,
      summary: row.body_summary,
      read: row.read_at !== null,
      createdAt: row.created_at,
    });
  }
  unread() {
    return (
      this.store.db
        .prepare(
          'SELECT count(*) n FROM notifications WHERE profile_id=? AND deleted_at IS NULL AND read_at IS NULL',
        )
        .get(this.store.profileId) as { n: number }
    ).n;
  }
  private preferenceRevision() {
    return (
      (
        this.store.db
          .prepare(
            "SELECT revision FROM settings WHERE profile_id=? AND scope_type='profile' AND scope_id=? AND key='work.notifications' AND deleted_at IS NULL",
          )
          .get(this.store.profileId, this.store.profileId) as { revision: number } | undefined
      )?.revision ?? 1
    );
  }
  private quiet(p: Prefs) {
    const { timezone } = this.store.db
      .prepare('SELECT timezone FROM profiles WHERE id=?')
      .get(this.store.profileId) as { timezone: string };
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(this.store.now()),
    );
    return p.quietStart === p.quietEnd
      ? false
      : p.quietStart < p.quietEnd
        ? hour >= p.quietStart && hour < p.quietEnd
        : hour >= p.quietStart || hour < p.quietEnd;
  }
  claimDesktop() {
    this.sync();
    return this.store.db.transaction(() => {
      const p = this.preferences(),
        quiet = this.quiet(p),
        rows = this.store.db
          .prepare(
            'SELECT * FROM notifications WHERE profile_id=? AND deleted_at IS NULL AND desktop_claimed_at IS NULL ORDER BY created_at,id LIMIT 100',
          )
          .all(this.store.profileId) as Row[];
      const result: z.infer<typeof WorkNotificationSchema>[] = [];
      for (const row of rows) {
        this.store.db
          .prepare(
            'UPDATE notifications SET desktop_claimed_at=? WHERE id=? AND desktop_claimed_at IS NULL',
          )
          .run(this.store.now(), row.id);
        const target = JSON.parse(row.target_json),
          task = this.store.db
            .prepare('SELECT muted,deleted_at FROM tasks WHERE id=? AND profile_id=?')
            .get(target.taskId, this.store.profileId) as
            { muted: number; deleted_at: number | null } | undefined;
        if (
          p.desktop &&
          !quiet &&
          task &&
          !task.muted &&
          task.deleted_at === null &&
          p.kinds.includes(row.kind as Prefs['kinds'][number])
        )
          result.push(this.view(row));
      }
      return result;
    })();
  }
  dispatch(request: Request): Reply {
    this.sync();
    const ok = (data: unknown) =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data });
    if (request.command === 'notifications.preferences') {
      const p = WorkCommandSchemas['notifications.preferences'].parse(request.payload);
      if (p.values)
        return this.store.receipt(request, () => {
          const revision = this.preferenceRevision();
          if (request.expectedRevision !== revision) throw new StorageError('CONFLICT', revision);
          const row = this.store.db
            .prepare(
              "SELECT revision FROM settings WHERE scope_type='profile' AND scope_id=? AND key='work.notifications'",
            )
            .get(this.store.profileId) as { revision: number } | undefined;
          this.store.db
            .prepare(
              "INSERT INTO settings(id,profile_id,created_at,updated_at,scope_type,scope_id,key,value_json,revision) VALUES(?,?,?,?,'profile',?,'work.notifications',?,?) ON CONFLICT(scope_type,scope_id,key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at",
            )
            .run(
              newId(),
              this.store.profileId,
              this.store.now(),
              this.store.now(),
              this.store.profileId,
              JSON.stringify({ schemaVersion: 1, values: p.values }),
              (row?.revision ?? 1) + 1,
            );
          return ok({
            notificationPreferences: this.preferences(),
            revision: this.preferenceRevision(),
          });
        });
      return ok({
        notificationPreferences: this.preferences(),
        revision: this.preferenceRevision(),
      });
    }
    if (request.command === 'notifications.list') {
      const p = WorkCommandSchemas['notifications.list'].parse(request.payload);
      return ok({
        notifications: (
          this.store.db
            .prepare(
              'SELECT * FROM notifications WHERE profile_id=? AND deleted_at IS NULL AND (? IS NULL OR kind=?) AND (?=0 OR read_at IS NULL) ORDER BY created_at DESC,id DESC LIMIT 100',
            )
            .all(this.store.profileId, p.kind ?? null, p.kind ?? null, +!!p.unread) as Row[]
        ).map((r) => this.view(r)),
        unreadCount: this.unread(),
      });
    }
    const command =
      request.command === 'notifications.read'
        ? 'notifications.read'
        : request.command === 'notifications.delete'
          ? 'notifications.delete'
          : null;
    if (!command) throw new StorageError('FEATURE_NOT_AVAILABLE');
    const p = WorkCommandSchemas[command].parse(request.payload);
    return this.store.receipt(request, () => {
      if (p.all)
        this.store.db
          .prepare(
            `UPDATE notifications SET ${command === 'notifications.read' ? 'read_at' : 'deleted_at'}=?,revision=revision+1 WHERE profile_id=? AND deleted_at IS NULL`,
          )
          .run(this.store.now(), this.store.profileId);
      else
        for (const id of p.ids ?? []) {
          this.store.db
            .prepare(
              `UPDATE notifications SET ${command === 'notifications.read' ? 'read_at' : 'deleted_at'}=?,revision=revision+1 WHERE id=? AND profile_id=? AND deleted_at IS NULL`,
            )
            .run(this.store.now(), id, this.store.profileId);
        }
      this.store.emit('workspace.updated', { kind: 'workspace', entityId: this.store.profileId });
      return ok({ notifications: [], unreadCount: this.unread() });
    });
  }
}
