import { JobPayloadSchema, LEASE_MS, type JobPayload } from '@tapkit/contracts';
import { Store, newId, StorageError } from './foundation';
export type Job = {
  id: string;
  kind: JobPayload['kind'];
  payload_json: string;
  lease_epoch: number;
  lease_owner: string;
  status: string;
  cancel_requested_at: number | null;
};
export class JobQueue {
  constructor(readonly store: Store) {}
  enqueue(payload: JobPayload, dedupeKey: string) {
    payload = JobPayloadSchema.parse(payload);
    if (!dedupeKey || dedupeKey.length > 240) throw new StorageError('VALIDATION_ERROR');
    const old = this.store.db
      .prepare('SELECT id,payload_json FROM jobs WHERE dedupe_key=?')
      .get(dedupeKey) as { id: string; payload_json: string } | undefined;
    const json = JSON.stringify(payload);
    if (old) {
      if (old.payload_json !== json) throw new StorageError('CONFLICT');
      return old.id;
    }
    const id = newId(),
      now = this.store.now();
    this.store.db
      .prepare(
        "INSERT INTO jobs(id,profile_id,created_at,updated_at,kind,dedupe_key,payload_json,status,next_attempt_at) VALUES (?,?,?,?,?,?,?,'queued',?)",
      )
      .run(id, this.store.profileId, now, now, payload.kind, dedupeKey, json, now);
    return id;
  }
  claim(owner: string): Job | undefined {
    return this.store.db.transaction(() => {
      const now = this.store.now();
      const row = this.store.db
        .prepare(
          "SELECT id FROM jobs WHERE deleted_at IS NULL AND cancel_requested_at IS NULL AND ((status='queued' AND next_attempt_at<=?) OR (status='running' AND lease_expires_at<=?)) ORDER BY next_attempt_at,id LIMIT 1",
        )
        .get(now, now) as { id: string } | undefined;
      if (!row) return;
      return this.store.db
        .prepare(
          "UPDATE jobs SET status='running',attempts=attempts+1,lease_epoch=lease_epoch+1,lease_owner=?,lease_expires_at=?,updated_at=? WHERE id=? RETURNING *",
        )
        .get(owner, now + LEASE_MS, now, row.id) as Job;
    })();
  }
  heartbeat(job: Job) {
    return (
      this.store.db
        .prepare(
          "UPDATE jobs SET lease_expires_at=? WHERE id=? AND lease_owner=? AND lease_epoch=? AND status='running' AND cancel_requested_at IS NULL AND lease_expires_at>?",
        )
        .run(
          this.store.now() + LEASE_MS,
          job.id,
          job.lease_owner,
          job.lease_epoch,
          this.store.now(),
        ).changes === 1
    );
  }
  finish(job: Job, status: 'completed' | 'failed', resultRef?: string) {
    return this.store.db.transaction(() => {
      const changed = this.store.db
        .prepare(
          "UPDATE jobs SET status=?,result_ref=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND lease_owner=? AND lease_epoch=? AND status='running' AND cancel_requested_at IS NULL AND lease_expires_at>?",
        )
        .run(
          status,
          resultRef ?? null,
          this.store.now(),
          job.id,
          job.lease_owner,
          job.lease_epoch,
          this.store.now(),
        ).changes;
      if (changed) this.store.emit('job.updated', { kind: 'job', entity: { id: job.id, status } });
      return changed === 1;
    })();
  }
  cancel(id: string) {
    return this.store.db.transaction(() => {
      const row = this.store.db
        .prepare('SELECT status FROM jobs WHERE id=? AND profile_id=? AND deleted_at IS NULL')
        .get(id, this.store.profileId) as { status: string } | undefined;
      if (!row) throw new StorageError('NOT_FOUND');
      if (['completed', 'failed', 'cancelled', 'unknown'].includes(row.status)) return row.status;
      this.store.db
        .prepare(
          "UPDATE jobs SET cancel_requested_at=?,status='cancelled',revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(this.store.now(), this.store.now(), id);
      const parse = this.store.db
        .prepare(
          "SELECT json_extract(payload_json,'$.fileVersionId') version_id FROM jobs WHERE id=? AND kind='file.parse'",
        )
        .get(id) as { version_id: string } | undefined;
      if (parse) {
        this.store.db
          .prepare(
            "UPDATE file_versions SET parse_status='cancelled',error_code='CANCELLED',error_reason='CANCELLED' WHERE id=? AND profile_id=? AND parse_status IN('pending','parsing')",
          )
          .run(parse.version_id, this.store.profileId);
        this.store.db
          .prepare(
            "UPDATE files SET status='imported',revision=revision+1,updated_at=? WHERE current_version_id=? AND profile_id=?",
          )
          .run(this.store.now(), parse.version_id, this.store.profileId);
      }
      this.store.emit('job.updated', { kind: 'job', entity: { id, status: 'cancelled' } });
      return 'cancelled';
    })();
  }
  release(job: Job) {
    this.store.db
      .prepare(
        "UPDATE jobs SET status='queued',lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND lease_owner=? AND lease_epoch=? AND status='running'",
      )
      .run(job.id, job.lease_owner, job.lease_epoch);
  }
}
export class Outbox {
  constructor(readonly store: Store) {}
  claim(owner: string) {
    return this.store.db.transaction(() => {
      const now = this.store.now();
      const row = this.store.db
        .prepare(
          "SELECT o.id FROM outbox o JOIN events e ON e.id=o.event_id WHERE (o.state='pending' AND o.next_attempt_at<=?) OR (o.state='delivering' AND o.lease_until<=?) ORDER BY e.seq LIMIT 1",
        )
        .get(now, now) as { id: string } | undefined;
      if (!row) return;
      return this.store.db
        .prepare(
          "UPDATE outbox SET state='delivering',lease_epoch=lease_epoch+1,lease_owner=?,lease_until=?,attempts=attempts+1 WHERE id=? RETURNING *",
        )
        .get(owner, now + LEASE_MS, row.id) as {
        id: string;
        event_id: string;
        lease_owner: string;
        lease_epoch: number;
      };
    })();
  }
  heartbeat(row: { id: string; lease_owner: string; lease_epoch: number }) {
    return (
      this.store.db
        .prepare(
          "UPDATE outbox SET lease_until=? WHERE id=? AND lease_owner=? AND lease_epoch=? AND state='delivering' AND lease_until>?",
        )
        .run(
          this.store.now() + LEASE_MS,
          row.id,
          row.lease_owner,
          row.lease_epoch,
          this.store.now(),
        ).changes === 1
    );
  }
  ack(row: { id: string; lease_owner: string; lease_epoch: number }) {
    return (
      this.store.db
        .prepare(
          "UPDATE outbox SET state='done',lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=? AND lease_epoch=? AND lease_until>? AND state='delivering'",
        )
        .run(row.id, row.lease_owner, row.lease_epoch, this.store.now()).changes === 1
    );
  }
}
