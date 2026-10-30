import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import { modelWorkDriver } from '../../packages/core/src/work-driver';
import { DEFAULT_MODEL_PREFERENCES } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import type { ChatService } from '../../packages/core/src/chat-service';
import type { ModelService } from '../../packages/core/src/model-service';
import { validArguments } from '../../packages/providers/src/api/arguments';
import { salesAnalysis } from '../fixtures/P07-02.data';

test('P07-02 XLSX routing sends the complete analysis schema without unrelated document tool schemas', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'xlsx' }),
      fileId = newId(),
      versionId = newId();
    const args = { fileId, versionId, spec: salesAnalysis(fileId, versionId) };
    let captured: any;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(request: any) {
          captured = request.request;
          yield {
            type: 'model.event',
            event: { type: 'tool_end', callId: '1', name: 'data.analyze', arguments: args },
          };
          yield { type: 'model.event', event: { type: 'finish', reason: 'tool_calls' } };
        },
      },
    } as unknown as ModelService;
    const driver = modelWorkDriver(models, { blobs: f.blobs } as ChatService);
    const run = f.work.repo.row(view.runId);
    const output = await driver(run, f.work.repo.steps(run.id)[0]!, new AbortController().signal);
    expect(output.calls[0]?.tool).toBe('data.analyze');
    expect(captured.tools.map((t: any) => t.name)).toEqual(['data.analyze', 'user.ask']);
    expect(validArguments(args, captured.tools[0].parameters)).toBe(true);
    expect(captured.systemModules[0].text).not.toContain('报告等文档用document.create');
    f.store.db
      .prepare(
        "UPDATE runs SET work_json=json_set(work_json,'$.toolCatalogVersion','p07-tools-1') WHERE id=?",
      )
      .run(run.id);
    await driver(
      f.work.repo.row(run.id),
      f.work.repo.steps(run.id)[0]!,
      new AbortController().signal,
    );
    expect(captured.tools.some((t: any) => t.name === 'data.analyze')).toBe(false);
  } finally {
    await f.close();
  }
});
