import {
  HEARTBEAT_MS,
  EventEnvelopeSchema,
  JobPayloadSchema,
  type EventEnvelope,
} from '@tapkit/contracts';
import { Store, JobQueue, BlobStore, Outbox, newId, type Job } from '@tapkit/storage';
export class FoundationWorker {
  readonly queue: JobQueue;
  readonly outbox: Outbox;
  private readonly owner = newId();
  private timer: ReturnType<typeof setInterval> | undefined;
  private active: { job: Job; controller: AbortController; promise: Promise<void> } | undefined;
  private stopping = false;
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
    readonly publish: (event: EventEnvelope) => void,
    readonly parseFile?: (job: Job, signal: AbortSignal) => Promise<string>,
  ) {
    this.queue = new JobQueue(store);
    this.outbox = new Outbox(store);
  }
  start() {
    this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }
  tick() {
    if (this.stopping) return;
    try {
      for (let i = 0; i < 100; i++) {
        const row = this.outbox.claim(this.owner);
        if (!row) break;
        const event = this.store.db
          .prepare('SELECT payload_json FROM events WHERE id=?')
          .get(row.event_id) as { payload_json: string } | undefined;
        if (event) this.publish(EventEnvelopeSchema.parse(JSON.parse(event.payload_json)));
        this.outbox.ack(row);
      }
      if (this.active) {
        const row = this.store.db
          .prepare('SELECT status FROM jobs WHERE id=?')
          .get(this.active.job.id) as { status: string };
        if (row.status === 'cancelled') this.active.controller.abort();
        return;
      }
      const job = this.queue.claim(this.owner);
      if (job) {
        const controller = new AbortController();
        const promise = this.execute(job, controller).finally(() => {
          this.active = undefined;
        });
        this.active = { job, controller, promise };
      }
    } catch {
      console.error('TAPKIT_WORKER_RETRY');
    }
  }
  private async execute(job: Job, controller: AbortController) {
    const heartbeat = setInterval(() => {
      if (!this.queue.heartbeat(job)) controller.abort();
    }, HEARTBEAT_MS);
    try {
      const payload = JobPayloadSchema.parse(JSON.parse(job.payload_json));
      // New job kinds must never fall through to unrelated blob collection.
      let result: string;
      if (payload.kind === 'data.backup')
        result = await this.blobs.backup(job.id, controller.signal);
      else if (payload.kind === 'blob.gc') result = String(await this.blobs.gc(controller.signal));
      else if (this.parseFile) result = await this.parseFile(job, controller.signal);
      else throw new Error('FILE_PARSE_HANDLER_NOT_REGISTERED');
      if (!controller.signal.aborted) this.queue.finish(job, 'completed', result);
    } catch {
      if (!controller.signal.aborted) this.queue.finish(job, 'failed');
    } finally {
      clearInterval(heartbeat);
      if (this.stopping) this.queue.release(job);
    }
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.active?.controller.abort();
    await this.active?.promise;
    await this.blobs.settled;
  }
}
