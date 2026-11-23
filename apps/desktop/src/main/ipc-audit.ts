import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reply } from '@tapkit/contracts';

/** Keep completed IPC metadata durable and ordered without blocking Host events. */
export class IpcAudit {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly dataDir: string) {}

  write(requestId: string, command: string, reply: Reply): Promise<void> {
    // Snapshot only public metadata; never retain the reply payload or credentials.
    const line =
      JSON.stringify({
        requestId,
        command,
        ok: reply.ok,
        ...(reply.ok ? {} : { code: reply.error.code }),
      }) + '\n';
    const work = this.tail
      .catch(() => {})
      .then(async () => {
        const directory = join(this.dataDir, 'logs');
        const log = join(directory, 'ipc.jsonl');
        await mkdir(directory, { recursive: true });
        try {
          if ((await stat(log)).size > 1_048_576)
            await rename(log, join(directory, 'ipc-' + Date.now() + '.jsonl'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        for (const name of await readdir(directory)) {
          const match = /^ipc-(\d+)\.jsonl$/.exec(name);
          if (match && Number(match[1]) < Date.now() - 14 * 86_400_000)
            await unlink(join(directory, name));
        }
        await appendFile(log, line);
      });
    this.tail = work;
    return work;
  }

  flush() {
    return this.tail;
  }
}
