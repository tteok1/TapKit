import { Worker } from 'node:worker_threads';

type Pending = {
  resolve: (values: Float32Array) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

/** The Node ONNX binding runs synchronously; keep it off Core's command/event loop. */
export class EmbeddingInference {
  readonly ready: Promise<void>;
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private closed = false;
  private closeReason: unknown;
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;
  private startupTimer: ReturnType<typeof setTimeout>;
  private termination: Promise<number> | undefined;

  constructor(
    entry: string,
    directory: string,
    readonly dims: number,
    sessionOptions: { intraOpNumThreads: number; interOpNumThreads: number },
    private readonly onClose: () => void,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker = new Worker(entry, { workerData: { directory, dims, sessionOptions } });
    this.startupTimer = setTimeout(() => this.fail(new Error('INDEX_NOT_READY')), 30_000);
    this.startupTimer.unref();
    this.worker.on('error', () => this.fail(new Error('INDEX_NOT_READY')));
    this.worker.on('exit', () => this.fail(new Error('INDEX_NOT_READY')));
    this.worker.on('message', (message: unknown) => {
      if (this.closed || !message || typeof message !== 'object') return;
      const reply = message as { type?: string; id?: number; values?: unknown };
      if (reply.type === 'ready') {
        clearTimeout(this.startupTimer);
        this.resolveReady();
        if (!this.pending.size) this.worker.unref();
        return;
      }
      if (!Number.isSafeInteger(reply.id)) return;
      if (reply.type === 'error') this.finish(reply.id!, new Error('INVALID_EMBEDDING'));
      else if (reply.type === 'result') {
        if (!(reply.values instanceof Float32Array) || reply.values.length !== this.dims) {
          this.fail(new Error('INVALID_EMBEDDING'));
          return;
        }
        this.finish(reply.id!, undefined, reply.values);
      }
    });
  }

  healthy() {
    return !this.closed;
  }

  private finish(id: number, error?: unknown, values?: Float32Array) {
    const pending = this.pending.get(id);
    if (!pending) return; // A cancelled window may finish later; it cannot reach its caller.
    this.pending.delete(id);
    pending.cleanup();
    if (!this.pending.size) this.worker.unref();
    if (values) pending.resolve(values);
    else pending.reject(error);
  }

  private fail(error: unknown) {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = error;
    clearTimeout(this.startupTimer);
    this.rejectReady(error);
    for (const id of this.pending.keys()) this.finish(id, error);
    this.onClose();
    this.termination ??= this.worker.terminate();
  }

  async run(ids: number[], signal?: AbortSignal): Promise<Float32Array> {
    signal?.throwIfAborted();
    if (this.closed) throw new Error('INDEX_NOT_READY');
    await this.ready;
    signal?.throwIfAborted();
    if (this.closed) throw this.closeReason;
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const cancel = () => this.finish(id, signal!.reason);
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', cancel),
      });
      signal?.addEventListener('abort', cancel, { once: true });
      this.worker.ref();
      try {
        this.worker.postMessage({ type: 'run', id, ids });
      } catch {
        this.fail(new Error('INDEX_NOT_READY'));
      }
    });
  }

  async dispose() {
    this.fail(new DOMException('Embedding service stopped', 'AbortError'));
    await this.termination;
  }
}
