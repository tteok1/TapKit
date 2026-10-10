import Database from 'better-sqlite3';
import { eraseFileDerivedContent } from './file-cleanup';
import { eraseSessionContent, eraseMessageContent } from './session-cleanup';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, access, readdir, rename, copyFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS,
  IdSchema,
  BackupManifestSchema,
  DeletionJournalEntrySchema,
  SettingsDocumentSchema,
  ReplySchema,
  ReplyDocumentSchema,
  EventEnvelopeSchema,
  type Reply,
  type Request,
  type EventEnvelope,
  type ErrorCode,
} from '@tapkit/contracts';
import initialSql from '../../../migrations/0001_core.sql?raw';
import codexSql from '../../../migrations/0002_codex.sql?raw';
import apiSql from '../../../migrations/0003_api_providers.sql?raw';
import usageSql from '../../../migrations/0004_usage.sql?raw';
import desktopSql from '../../../migrations/0005_desktop.sql?raw';
import chatSql from '../../../migrations/0006_chat.sql?raw';
import historySql from '../../../migrations/0007_chat_history.sql?raw';
import filesSql from '../../../migrations/0008_files.sql?raw';
import generatedNoteLinksSql from '../../../migrations/0009_generated_note_links.sql?raw';
import filePreviewSql from '../../../migrations/0010_file_preview.sql?raw';
import projectsSql from '../../../migrations/0011_projects.sql?raw';

let startupTraceSequence = 0;
function startupTrace(scope: string) {
  if (process.env.TAPKIT_STARTUP_DIAGNOSTICS !== '1') return (_stage: string) => {};
  const trace = ++startupTraceSequence;
  const start = performance.now();
  let previous = start;
  return (stage: string) => {
    const clockMs = performance.now();
    try {
      console.info(
        'TAPKIT_STARTUP_DIAGNOSTIC',
        JSON.stringify({
          scope,
          trace,
          stage,
          pid: process.pid,
          clockMs,
          elapsedMs: clockMs - start,
          stepMs: clockMs - previous,
        }),
      );
    } catch {
      // Optional CI diagnostics must not change storage behavior.
    }
    previous = clockMs;
  };
}

export function newId(now = Date.now()): string {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6);
  b[6] = (b[6]! & 15) | 112;
  b[8] = (b[8]! & 63) | 128;
  const h = b.toString('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}
export class StorageError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly currentRevision?: number,
  ) {
    super(code);
  }
}
export function failure(requestId: string, code: ErrorCode, currentRevision?: number): Reply {
  const messages: Partial<Record<ErrorCode, string>> = {
    CONFLICT: '数据已更改，请重新加载后再试。',
    VALIDATION_ERROR: '请求参数或协议版本无效。',
    PERMISSION_DENIED: '无权访问该资源。',
    FEATURE_NOT_AVAILABLE: '此功能尚未实现。',
    DATABASE_RECOVERY_REQUIRED: '数据库需要恢复；原始数据已保留。',
    AUTH_REQUIRED: '系统加密不可用，凭据未保存。',
    NOT_FOUND: '资源不存在或已删除。',
    CANCELLED: '操作已取消。',
  };
  return ReplySchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: messages[code] ?? '操作未完成，请稍后重试。',
      retryable: code === 'INTERNAL_ERROR',
      recoveryActions: [],
      traceId: newId(),
      ...(currentRevision === undefined ? {} : { currentRevision }),
    },
  });
}
export type Migration = { version: number; sql: string };
export const migrations: Migration[] = [
  { version: 1, sql: initialSql },
  { version: 2, sql: codexSql },
  { version: 3, sql: apiSql },
  { version: 4, sql: usageSql },
  { version: 5, sql: desktopSql },
  { version: 6, sql: chatSql },
  { version: 7, sql: historySql },
  { version: 8, sql: filesSql },
  { version: 9, sql: generatedNoteLinksSql },
  { version: 10, sql: filePreviewSql },
  { version: 11, sql: projectsSql },
];
export const SCHEMA_VERSION = 11;
export async function migrate(db: Database.Database, backupDirectory: string, steps = migrations) {
  const trace = startupTrace('storage.migrate');
  trace('version.begin');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > (steps.at(-1)?.version ?? 0)) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  for (const migration of steps.filter((m) => m.version > version)) {
    if (migration.version !== (db.pragma('user_version', { simple: true }) as number) + 1)
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    trace('backup-directory.begin');
    await mkdir(backupDirectory, { recursive: true });
    trace('backup.begin');
    await db.backup(
      join(backupDirectory, 'pre-migration-' + migration.version + '-' + newId() + '.sqlite'),
    );
    trace('schema-transaction.begin');
    const rebuildAccounts = migration.version === 3;
    if (rebuildAccounts) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(migration.sql);
        if (
          (db.pragma('foreign_key_check') as unknown[]).length ||
          db.pragma('integrity_check', { simple: true }) !== 'ok'
        )
          throw new StorageError('DATABASE_RECOVERY_REQUIRED');
        db.pragma('user_version = ' + migration.version);
      })();
    } finally {
      if (rebuildAccounts) db.pragma('foreign_keys = ON');
    }
    trace('schema-transaction.complete');
  }
  trace('complete');
}
export class Store {
  readonly profileId: string;
  constructor(
    public readonly db: Database.Database,
    public readonly dataDir: string,
    readonly now: () => number = Date.now,
    readonly volatile = false,
  ) {
    this.profileId = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM profiles').get() as { id: string } | undefined;
      if (existing) return existing.id;
      const id = newId(),
        time = now();
      db.prepare(
        'INSERT INTO profiles(id,display_name,locale,timezone,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      ).run(id, '本地用户', 'zh-CN', Intl.DateTimeFormat().resolvedOptions().timeZone, time, time);
      db.prepare(
        'INSERT INTO settings(id,profile_id,created_at,updated_at,scope_type,scope_id,key,value_json) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        newId(),
        id,
        time,
        time,
        'profile',
        id,
        'preferences',
        JSON.stringify(
          SettingsDocumentSchema.parse({ schemaVersion: 1, values: DEFAULT_SETTINGS }),
        ),
      );
      return id;
    })();
  }
  get settings() {
    const row = this.db
      .prepare(
        "SELECT value_json,revision FROM settings WHERE profile_id=? AND scope_type='profile' AND scope_id=? AND key='preferences' AND deleted_at IS NULL",
      )
      .get(this.profileId, this.profileId) as { value_json: string; revision: number };
    return {
      values: SettingsDocumentSchema.parse(JSON.parse(row.value_json)).values,
      revision: row.revision,
    };
  }
  bootstrap() {
    const row = this.db
      .prepare('SELECT id,display_name,locale,timezone,revision FROM profiles WHERE id=?')
      .get(this.profileId) as {
      id: string;
      display_name: string;
      locale: 'zh-CN';
      timezone: string;
      revision: number;
    };
    return {
      profile: {
        id: row.id,
        displayName: row.display_name,
        locale: row.locale,
        timezone: row.timezone,
        revision: row.revision,
      },
      settings: this.settings,
      capabilities: ['storage', 'settings', 'vault', 'jobs', 'events', 'backup'] as const,
      recoveringRuns: [],
      unreadCount: 0,
    };
  }
  receipt(request: Request, work: () => Reply): Reply {
    // Stable key order means semantically equal validated payloads share the receipt.
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)]),
            )
          : value;
    const hash = createHash('sha256')
      .update(
        JSON.stringify(
          canonical({
            command: request.command,
            payload: request.payload,
            expectedRevision: request.expectedRevision,
          }),
        ),
      )
      .digest('hex');
    return this.db.transaction(() => {
      const old = this.db
        .prepare(
          'SELECT payload_hash,state,reply_json FROM request_receipts WHERE profile_id=? AND request_id=?',
        )
        .get(this.profileId, request.requestId) as
        { payload_hash: string; state: string; reply_json: string | null } | undefined;
      if (old) {
        if (old.payload_hash !== hash) throw new StorageError('CONFLICT');
        if (old.state !== 'completed' || !old.reply_json)
          throw new StorageError('SIDE_EFFECT_UNKNOWN');
        return ReplyDocumentSchema.parse(JSON.parse(old.reply_json)).reply;
      }
      const reply = ReplySchema.parse(work());
      this.db
        .prepare(
          'INSERT INTO request_receipts(profile_id,request_id,command,payload_hash,state,reply_json,expires_at,owner_session_id) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          this.profileId,
          request.requestId,
          request.command,
          hash,
          'completed',
          JSON.stringify(ReplyDocumentSchema.parse({ schemaVersion: 1, reply })),
          this.now() + 86_400_000,
          typeof (request.payload as { sessionId?: unknown })?.sessionId === 'string'
            ? (request.payload as { sessionId: string }).sessionId
            : null,
        );
      return reply;
    })();
  }
  emit(
    type: EventEnvelope['type'],
    payload: EventEnvelope['payload'],
    causationId?: string,
  ): EventEnvelope {
    if (!this.db.inTransaction) throw new Error('Events must be committed with their state');
    const row = this.db
      .prepare("SELECT coalesce(max(seq),0)+1 AS seq FROM events WHERE stream_id='profile'")
      .get() as { seq: number };
    const event = EventEnvelopeSchema.parse({
      eventId: newId(),
      streamId: 'profile',
      seq: row.seq,
      schemaVersion: 1,
      type,
      occurredAt: this.now(),
      payload,
    });
    this.db
      .prepare(
        'INSERT INTO events(id,profile_id,stream_id,seq,event_type,schema_version,causation_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        event.eventId,
        this.profileId,
        event.streamId,
        event.seq,
        type,
        1,
        causationId ?? null,
        JSON.stringify(event),
        event.occurredAt,
      );
    this.db
      .prepare(
        "INSERT INTO outbox(id,event_id,topic,payload_ref,state,next_attempt_at) VALUES (?,?,?,?,'pending',?)",
      )
      .run(newId(), event.eventId, 'ui.event', event.eventId, this.now());
    return event;
  }
  replay(afterSeq: number, limit: number) {
    const rows = this.db
      .prepare(
        "SELECT payload_json FROM events WHERE profile_id=? AND stream_id='profile' AND seq>? ORDER BY seq LIMIT ?",
      )
      .all(this.profileId, afterSeq, limit + 1) as { payload_json: string }[];
    const items = rows
      .slice(0, limit)
      .map((r) => EventEnvelopeSchema.parse(JSON.parse(r.payload_json)));
    return {
      items,
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                sortValue: items.at(-1)!.seq,
                id: items.at(-1)!.eventId,
                filterHash: 'profile',
              }),
            ).toString('base64url')
          : null,
    };
  }
  close() {
    this.db.close();
  }
}

async function restoreLatestSnapshot(dataDir: string) {
  const base = join(dataDir, 'backups');
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return false;
  }
  const candidates: {
    directory: string;
    manifest: ReturnType<typeof BackupManifestSchema.parse>;
  }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !IdSchema.safeParse(entry.name).success)
      continue;
    try {
      const directory = join(base, entry.name);
      const manifest = BackupManifestSchema.parse(
        JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
      );
      if (manifest.id !== entry.name) continue;
      candidates.push({ directory, manifest });
    } catch {
      /* Incomplete snapshots are never eligible. */
    }
  }
  candidates.sort(
    (a, b) =>
      b.manifest.createdAt - a.manifest.createdAt || b.manifest.id.localeCompare(a.manifest.id),
  );
  for (const candidate of candidates) {
    let snapshot: Database.Database | undefined;
    try {
      snapshot = new Database(join(candidate.directory, 'app.sqlite'), {
        readonly: true,
        fileMustExist: true,
      });
      if (
        !migrations
          .map((m) => m.version)
          .includes(snapshot.pragma('user_version', { simple: true }) as number) ||
        snapshot.pragma('integrity_check', { simple: true }) !== 'ok' ||
        (snapshot.pragma('foreign_key_check') as unknown[]).length
      )
        continue;
      const inventory = snapshot
        .prepare(
          "SELECT sha256,relative_key,size_bytes FROM blobs WHERE state='ready' ORDER BY sha256",
        )
        .all();
      if (JSON.stringify(inventory) !== JSON.stringify(candidate.manifest.blobs)) continue;
      for (const blob of candidate.manifest.blobs) {
        const bytes = await readFile(join(dataDir, blob.relative_key));
        if (
          bytes.length !== blob.size_bytes ||
          createHash('sha256').update(bytes).digest('hex') !== blob.sha256
        )
          throw new Error('Invalid backup blob');
      }
    } catch {
      continue;
    } finally {
      snapshot?.close();
    }
    // Validate the deletion journal before replacing anything. Corrupt journals fail closed.
    await deletionJournal(dataDir);
    const directory = join(dataDir, 'db'),
      temporary = join(directory, 'restore-' + newId() + '.sqlite');
    await copyFile(join(candidate.directory, 'app.sqlite'), temporary);
    const handle = await open(temporary, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const quarantine = join(directory, 'quarantine', newId());
    await mkdir(quarantine, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const original = join(directory, 'app.sqlite' + suffix);
      if (await fileExists(original))
        await rename(original, join(quarantine, 'app.sqlite' + suffix));
    }
    await rename(temporary, join(directory, 'app.sqlite'));
    return true;
  }
  return false;
}
async function deletionJournal(dataDir: string) {
  const path = join(dataDir, 'db/deletions.jsonl');
  if (!(await fileExists(path))) return [];
  const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
  if (lines.length > 100_000) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  return lines.map((line) => DeletionJournalEntrySchema.parse(JSON.parse(line)));
}
async function applyDeletionJournal(store: Store) {
  const entries = await deletionJournal(store.dataDir);
  store.db.transaction(() => {
    for (const entry of entries) {
      if (entry.profileId !== store.profileId) continue;
      if (entry.entityType === 'message') {
        eraseMessageContent(store, entry.entityId, entry.deletedAt, entry.keepAsNote);
        store.db
          .prepare(
            "INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES(?,?,?,?,'message',?,0) ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
          )
          .run(newId(), store.profileId, entry.deletedAt, entry.deletedAt, entry.entityId);
        continue;
      }
      if (entry.entityType === 'session') {
        eraseSessionContent(store, entry.entityId, entry.deletedAt);
        store.db
          .prepare(
            "INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES(?,?,?,?,'session',?,0) ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
          )
          .run(newId(), store.profileId, entry.deletedAt, entry.deletedAt, entry.entityId);
        continue;
      }
      store.db
        .prepare('UPDATE files SET deleted_at=coalesce(deleted_at,?) WHERE id=? AND profile_id=?')
        .run(entry.deletedAt, entry.entityId, store.profileId);
      eraseFileDerivedContent(store, entry.entityId, entry.deletedAt);
      store.db
        .prepare(
          'UPDATE file_versions SET deleted_at=coalesce(deleted_at,?) WHERE file_id=? AND profile_id=?',
        )
        .run(entry.deletedAt, entry.entityId, store.profileId);
      store.db
        .prepare(
          "INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES (?,?,?,?,'file',?,0) ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
        )
        .run(newId(), store.profileId, entry.deletedAt, entry.deletedAt, entry.entityId);
    }
  })();
}
export async function openStore(
  dataDir: string,
  now: () => number = Date.now,
  allowRecovery = true,
): Promise<Store> {
  const trace = startupTrace('storage.open');
  trace('directory.begin');
  await mkdir(join(dataDir, 'db'), { recursive: true });
  trace('restore-check.begin');
  if (!(await fileExists(join(dataDir, 'db/app.sqlite')))) {
    const restored = allowRecovery && (await restoreLatestSnapshot(dataDir));
    if (!restored && (await fileExists(join(dataDir, 'db/quarantine'))))
      throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  }
  let db: Database.Database | undefined;
  let newer = false;
  try {
    trace('native-open.begin');
    db = new Database(join(dataDir, 'db/app.sqlite'));
    trace('integrity.begin');
    newer = (db.pragma('user_version', { simple: true }) as number) > SCHEMA_VERSION;
    if (newer) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('Corrupt database');
  } catch {
    trace('native-or-integrity.failed');
    db?.close();
    if (!newer && allowRecovery && (await restoreLatestSnapshot(dataDir)))
      return openStore(dataDir, now, false);
    throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  }
  try {
    trace('pragmas.begin');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = FULL');
    trace('migration.begin');
    await migrate(db, join(dataDir, 'backups/migrations'));
    trace('profile.begin');
    const store = new Store(db, dataDir, now);
    trace('deletion-journal.begin');
    await applyDeletionJournal(store);
    trace('complete');
    return store;
  } catch {
    trace('initialization.failed');
    db.close();
    throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  }
}
export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}
