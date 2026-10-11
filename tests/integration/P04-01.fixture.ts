import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BlobStore, FileRepository, openStore, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ProjectService } from '../../packages/core/src/project-service';
import {
  ParsedDocumentSchema,
  FILE_PARSER_VERSION,
  type ParsedDocument,
} from '../../packages/contracts/src';
export async function retrievalFixture() {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P04-01 synthetic ')),
    store = await openStore(root);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store),
    projects = new ProjectService(files);
  const project = (name = '甲') => {
    const reply = core.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'projects.create',
      payload: { name },
    });
    if (!reply.ok) throw new Error(reply.error.code);
    return (reply.data as { entityId: string }).entityId;
  };
  const put = async (
    projectId: string,
    text: string,
    name = 'fixture.txt',
    document?: ParsedDocument,
  ) => {
    const blob = await blobs.put(Buffer.from(text), 'text/plain');
    const file = files.importBlob({
      blobId: blob.id,
      name,
      relativePath: name,
      owner: { type: 'project', id: projectId },
    }).file;
    store.db
      .prepare("UPDATE jobs SET next_attempt_at=9999999999999 WHERE kind<>'file.parse'")
      .run();
    const jobId = files.queueParse(file.currentVersionId);
    store.db.prepare('UPDATE jobs SET next_attempt_at=9999999999999 WHERE id<>?').run(jobId);
    store.db.prepare('UPDATE jobs SET next_attempt_at=0 WHERE id=?').run(jobId);
    const job = files.jobs.claim('synthetic P04-01')!;
    files.beginParse(job, file.currentVersionId);
    const doc =
      document ??
      ParsedDocumentSchema.parse({
        schemaVersion: 1,
        parserVersion: FILE_PARSER_VERSION,
        format: 'text',
        blocks: [
          { id: 'b', kind: 'text', text, locator: { kind: 'text', start: 0, end: text.length } },
        ],
        pages: [],
        sheets: [],
        slides: [],
        entries: [],
        quality: { needsOcr: false, warnings: [] },
      });
    await files.completeParse(job, file.currentVersionId, doc, new AbortController().signal);
    files.jobs.finish(job, 'completed', file.currentVersionId);
    return files.get(file.id);
  };
  return { root, store, blobs, files, core, projects, project, put };
}
