// Imported only by the explicit synthetic chat test build.
import { Session } from 'node:inspector';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventEnvelope } from '@tapkit/contracts';

export async function startPerformanceFixture(directory: string) {
  if ((await readFile(join(directory, 'P02-02.fixture'), 'utf8')) !== 'P02-02 isolated fixture')
    throw Error('FIXTURE_PROFILE_REQUIRED');
  const session = new Session();
  session.connect();
  function post<T>(method: string) {
    return new Promise<T>((resolve, reject) =>
      session.post(method, (error, value) => (error ? reject(error) : resolve(value as T))),
    );
  }
  await post('Profiler.enable');
  await post('Profiler.start');
  const startedAt = Date.now();
  const published: {
    type: string;
    kind: string;
    seq: number;
    occurredAt: number;
    publishedAt: number;
  }[] = [];
  return {
    published(event: EventEnvelope) {
      if (published.length < 2000)
        published.push({
          type: event.type,
          kind: event.payload.kind,
          seq: event.seq,
          occurredAt: event.occurredAt,
          publishedAt: Date.now(),
        });
    },
    async stop() {
      const { profile } = await post<{ profile: unknown }>('Profiler.stop');
      session.disconnect();
      await writeFile(
        join(directory, 'P11-01-core-profile.json'),
        JSON.stringify({ startedAt, stoppedAt: Date.now(), published, profile }),
      );
    },
  };
}
