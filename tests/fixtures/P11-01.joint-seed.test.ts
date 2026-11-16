import { test } from 'vitest';
import { realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { seedPerformanceHistory } from './P11-01.history';
import { seedPerformanceRetrieval } from './P11-01.retrieval';
import { retrievalFixture } from '../integration/P04-01.fixture';

async function seed(dir: string) {
  const fixture = await retrievalFixture(dir);
  try {
    seedPerformanceHistory(fixture.store);
    const { project } = await seedPerformanceRetrieval(fixture);
    const count = (sql: string) => (fixture.store.db.prepare(sql).get() as { n: number }).n;
    const base = {
      sessions: count('SELECT count(*) n FROM sessions'),
      messages: count('SELECT count(*) n FROM messages'),
      documents: count('SELECT count(*) n FROM parsed_documents'),
      chunks: count('SELECT count(*) n FROM chunks'),
    };
    const projectId = fixture.project('P11 联合索引');
    const selectedVersionIds: string[] = [];
    for (let i = 0; i < 16; i++) {
      const text = Array.from(
        { length: 12 },
        (_, section) =>
          `联合索引基准 文档${i} 段落${section}。` +
          '退款规则、研发排期和材料审阅均通过项目授权。'.repeat(12) +
          '\n\n',
      ).join('');
      const file = await fixture.put(projectId, text, `联合索引-${i}.txt`);
      selectedVersionIds.push(file.currentVersionId);
    }
    // This fixture represents existing data whose import notifications have
    // already been delivered. Keep the event log and start with an idle outbox.
    const settledEvents = fixture.store.db
      .prepare("UPDATE outbox SET state='done' WHERE state='pending'")
      .run().changes;
    return { project, base, settledEvents, indexWork: { projectId, selectedVersionIds } };
  } finally {
    fixture.store.close();
  }
}

test('P11-01 seed a fresh joint load profile', async () => {
  const dir = await realpath(process.env.TAPKIT_JOINT_FIXTURE_DIR ?? '');
  const part = relative(await realpath(resolve('.test-data')), dir);
  if (!/^P11-01 joint [A-Za-z0-9-]+$/.test(part) || part.includes(sep))
    throw Error('Unowned joint profile');
  await writeFile(join(dir, 'joint-fixture.json'), JSON.stringify(await seed(dir)), { flag: 'wx' });
}, 540_000);
