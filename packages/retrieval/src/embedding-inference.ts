import { Worker } from 'node:worker_threads';

type Pending = {
  resolve: (value: unknown) => void;
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
      const reply = message as {
        type?: string;
        id?: number;
        value?: unknown;
        protocolVersion?: number;
      };
      if (reply.type === 'ready') {
        if (reply.protocolVersion !== 1) {
          this.fail(new Error('INDEX_NOT_READY'));
          return;
        }
        clearTimeout(this.startupTimer);
        this.resolveReady();
        if (!this.pending.size) this.worker.unref();
        return;
      }
      if (!Number.isSafeInteger(reply.id)) return;
      if (reply.type === 'error') this.finish(reply.id!, new Error('INVALID_EMBEDDING'));
      else if (reply.type === 'result') this.finish(reply.id!, undefined, reply.value, true);
    });
  }

  healthy() {
    return !this.closed;
  }

  private finish(id: number, error?: unknown, value?: unknown, success = false) {
    const pending = this.pending.get(id);
    if (!pending) return; // A cancelled window may finish later; it cannot reach its caller.
    this.pending.delete(id);
    pending.cleanup();
    if (!this.pending.size) this.worker.unref();
    if (success) pending.resolve(value);
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

  private async request<T>(
    payload: Record<string, unknown>,
    decode: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (this.closed) throw new Error('INDEX_NOT_READY');
    await this.ready;
    signal?.throwIfAborted();
    if (this.closed) throw this.closeReason;
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId;
      const cancel = () => this.finish(id, signal!.reason);
      this.pending.set(id, {
        resolve: (value) => {
          try {
            resolve(decode(value));
          } catch {
            const error = new Error('INVALID_EMBEDDING');
            reject(error);
            this.fail(error);
          }
        },
        reject,
        cleanup: () => signal?.removeEventListener('abort', cancel),
      });
      signal?.addEventListener('abort', cancel, { once: true });
      this.worker.ref();
      try {
        this.worker.postMessage({ ...payload, id });
      } catch {
        this.fail(new Error('INDEX_NOT_READY'));
      }
    });
  }

  run(ids: number[], signal?: AbortSignal) {
    return this.request(
      { type: 'run', ids },
      (value) => {
        if (!(value instanceof Float32Array) || value.length !== this.dims) throw new Error();
        return value;
      },
      signal,
    );
  }

  count(text: string, signal?: AbortSignal) {
    return this.request(
      { type: 'count', text },
      (value) => {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
          throw new Error();
        return value;
      },
      signal,
    );
  }

  encode(text: string, signal?: AbortSignal) {
    return this.request(
      { type: 'encode', text },
      (value) => {
        if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id) && id >= 0))
          throw new Error();
        return value as number[];
      },
      signal,
    );
  }

  async dispose() {
    this.fail(new DOMException('Embedding service stopped', 'AbortError'));
    await this.termination;
  }
}
