import { expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './P06.fixture';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import {
  DocumentSpecSchema,
  FILE_PARSER_VERSION,
  type ExecutionCapabilities,
} from '../../packages/contracts/src';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';

const capabilities: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'available' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'unused' },
};
const spec = DocumentSpecSchema.parse({
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '金额 123.45 元' }] },
  ],
});
const started = {
  event: 'started',
  data: {
    appContainer: true,
    networkCapabilities: 0,
    appContainerSid: 'synthetic',
    identitySid: 'synthetic',
    job: { killOnClose: true, breakaway: false },
  },
};
const finished = { event: 'finished', data: { status: 'exited', exitCode: 0, activeProcesses: 0 } };

test.each(['repair', 'exhausted', 'missing', 'unknown'] as const)(
  'P07-01 layout %s has bounded attempts and safe publication',
  async (scenario) => {
    const f = await fixture();
    try {
      const view = await f.create();
      f.store.db.prepare('UPDATE runs SET lease_epoch=1 WHERE id=?').run(view.runId);
      const run = f.work.repo.row(view.runId);
      const blob = await f.blobs.put(Buffer.from('original docx'));
      const file = f.files.importBlob({
        blobId: blob.id,
        name: 'source.docx',
        relativePath: 'source.docx',
        owner: { type: 'session', id: f.sessionId },
      }).file;
      const pdf = Buffer.from('%PDF-1.7\nsynthetic\n%%EOF');
      let renders = 0,
        inspections = 0;
      const attempts: number[] = [],
        states: string[] = [];
      const executor = {
        async execute(request: any) {
          if (request.operation === 'office.render') {
            renders++;
            await writeFile(join(request.payload.workspace, 'source.pdf'), pdf);
          } else {
            inspections++;
            if (scenario === 'unknown') throw Error('worker state unknown');
            const input = JSON.parse(
              await readFile(join(request.payload.inputRoot, 'input.json'), 'utf8'),
            );
            const parsed = emptyDocument('pdf');
            parsed.pages.push({ width: 595, height: 842 });
            const text = scenario === 'missing' ? '报告 正文' : '报告 读者 正文 金额 123.45 元';
            const clipped = scenario !== 'repair' || inspections < 3;
            parsed.blocks.push({
              id: 'p',
              kind: 'text',
              text,
              locator: {
                kind: 'pdf',
                pageIndex: 0,
                rects: [{ x: clipped ? 0 : 0.1, y: 0.1, width: 0.3, height: 0.03 }],
              },
            });
            await writeFile(
              join(request.payload.workspace, 'parsed.json'),
              JSON.stringify({
                schemaVersion: 1,
                fileVersionId: input.fileVersionId,
                parserVersion: FILE_PARSER_VERSION,
                sourceSha256: input.sha256,
                document: parsed,
              }),
            );
          }
          return { exitCode: 0, events: [started, finished] };
        },
      };
      const native = new WorkNativeTools(resolve('.'), f.artifacts, capabilities, executor);
      let committed = 0;
      const promise = native.execute(
        run,
        { tool: 'office.convert', fileId: file.id, versionId: file.version.id },
        () => {},
        () => {
          committed++;
        },
        new AbortController().signal,
        (value) => states.push(value.state),
        {
          spec,
          candidate: async (attempt) => {
            attempts.push(attempt);
            return Buffer.from('candidate ' + attempt);
          },
        },
      );
      if (scenario === 'repair') {
        expect((await promise).kind).toBe('file');
        expect(attempts).toEqual([1, 2]);
        expect(renders).toBe(3);
        expect(committed).toBe(1);
        expect(states.at(-1)).toBe('finished');
      } else {
        await expect(promise).rejects.toMatchObject({
          code: scenario === 'unknown' ? 'SIDE_EFFECT_UNKNOWN' : 'PARSE_FAILED',
        });
        expect(committed).toBe(0);
        expect(renders).toBe(scenario === 'exhausted' ? 3 : 1);
        expect(attempts).toEqual(scenario === 'exhausted' ? [1, 2] : []);
        expect(states.at(-1)).toBe(scenario === 'unknown' ? 'unknown' : 'running');
      }
      expect(
        (await f.files.original(file.id, { versionId: file.version.id })).bytes.toString(),
      ).toBe('original docx');
    } finally {
      await f.close();
    }
  },
  90000,
);
