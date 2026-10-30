import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import { modelWorkDriver } from '../../packages/core/src/work-driver';
import { DEFAULT_MODEL_PREFERENCES } from '../../packages/contracts/src';
import type { ChatService } from '../../packages/core/src/chat-service';
import { ChatService as RealChatService } from '../../packages/core/src/chat-service';
import { createWorkDocument } from '../../packages/core/src/work-document';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import type { ModelService } from '../../packages/core/src/model-service';
import { validArguments } from '../../packages/providers/src/api/arguments';

const spec = {
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [{ blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '内容' }] }],
};

test('P07-01 model driver advertises a structured document tool only for the new catalog', async () => {
  const f = await fixture();
  try {
    const view = await f.create({
      format: 'docx',
      documentOptions: { template: 'proposal', length: 'concise' },
      budgetOverrides: { maxCalls: 1 },
    });
    let captured: any, capturedRoute: any;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(request: any) {
          capturedRoute = request;
          captured = request.request;
          yield {
            type: 'attempt',
            attemptId: 'fixture',
            attemptNo: 1,
            model: { providerId: 'fixture', modelId: 'fixture', accountId: null },
          };
          yield {
            type: 'model.event',
            attemptId: 'fixture',
            event: {
              type: 'tool_end',
              callId: '1',
              name: 'document.create',
              arguments: { name: '报告.docx', spec },
            },
          };
          yield {
            type: 'model.event',
            attemptId: 'fixture',
            event: { type: 'finish', reason: 'tool_calls' },
          };
        },
      },
    } as unknown as ModelService;
    const driver = modelWorkDriver(models, { blobs: f.blobs } as ChatService);
    const run = f.work.repo.row(view.runId);
    const output = await driver(run, f.work.repo.steps(run.id)[0]!, new AbortController().signal);
    expect(output.calls[0]?.tool).toBe('document.create');
    expect(captured.outputLimit).toBe(2048);
    expect(capturedRoute.need.outputTokens).toBe(2048);
    expect(capturedRoute.singleAttempt).toBe(true);
    const docTool = captured.tools.find((tool: any) => tool.name === 'document.create');
    const payload = JSON.parse(
      captured.messages.findLast((message: any) => message.role === 'user').text,
    );
    expect(payload.documentTemplateOutline).toEqual(['目标', '步骤', '资源', '验收']);
    expect(docTool.parameters.properties.spec.properties.sections).toBeDefined();
    expect(JSON.stringify(docTool.parameters)).not.toContain('"$ref"');
    expect(validArguments({ name: '报告.docx', spec }, docTool.parameters)).toBe(true);
    expect(
      validArguments({ name: '报告.docx', spec: { ...spec, sections: 'bad' } }, docTool.parameters),
    ).toBe(false);
    const revisionTool = captured.tools.find((tool: any) => tool.name === 'document.revise');
    expect(
      validArguments(
        {
          fileId: 'id',
          versionId: 'id',
          revision: 1,
          blockId: 'one',
          replacement: spec.sections[0],
        },
        revisionTool.parameters,
      ),
    ).toBe(true);
    const fieldsTool = captured.tools.find((tool: any) => tool.name === 'document.fields');
    expect(
      validArguments(
        { fileId: 'id', versionId: 'id', revision: 1, fields: { name: '新姓名' } },
        fieldsTool.parameters,
      ),
    ).toBe(true);
    f.store.db
      .prepare(
        "UPDATE runs SET work_json=json_set(work_json,'$.toolCatalogVersion','p06-tools-1') WHERE id=?",
      )
      .run(run.id);
    const oldRun = f.work.repo.row(run.id);
    // The driver must not declare the new capability to a pre-existing P06 run.
    await driver(oldRun, f.work.repo.steps(run.id)[0]!, new AbortController().signal);
    expect(captured.tools.some((tool: any) => tool.name === 'document.create')).toBe(false);
    f.store.db
      .prepare(
        "UPDATE runs SET work_json=json_set(work_json,'$.toolCatalogVersion','p07-tools-1','$.definition.documentOptions.template','report') WHERE id=?",
      )
      .run(run.id);
    await driver(
      f.work.repo.row(run.id),
      f.work.repo.steps(run.id)[0]!,
      new AbortController().signal,
    );
    const noSources = JSON.parse(
      captured.messages.findLast((message: any) => message.role === 'user').text,
    );
    expect(noSources.documentTemplateOutline).toEqual(['摘要', '正文']);
    expect(captured.systemModules[0].text).toContain('未提供资料时不得声称有资料来源');
    expect(captured.systemModules[0].text).toContain('不得把未提供的验收过程');
  } finally {
    await f.close();
  }
});

test('P07-01 model driver supplies the current task document and fixed version for revision', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ goal: '修改摘要', format: 'docx' });
    const run = f.work.repo.row(view.runId);
    const chat = new RealChatService(f.store, f.blobs, {} as never);
    const ref = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '报告.docx',
      spec,
      () => {},
      () => {},
    );
    if (ref.kind !== 'file') throw Error('not a file');
    const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
    const job = f.files.jobs.claim('driver-document')!;
    f.files.beginParse(job, ref.versionId);
    await f.files.completeParse(
      job,
      ref.versionId,
      await parseOfficeFile(bytes, 'docx'),
      new AbortController().signal,
    );
    f.files.jobs.finish(job, 'completed');
    let request: any;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(value: any) {
          request = value.request;
          yield {
            type: 'model.event',
            attemptId: 'fixture',
            event: { type: 'finish', reason: 'stop' },
          };
        },
      },
    } as unknown as ModelService;
    await modelWorkDriver(models, chat)(
      run,
      f.work.repo.steps(run.id)[0]!,
      new AbortController().signal,
    );
    const context = request.messages
      .filter((message: any) => message.role === 'user')
      .map((message: any) => {
        try {
          return JSON.parse(message.text);
        } catch {
          return {};
        }
      })
      .find((value: any) => value.kind === 'document_spec');
    expect(context.fileId).toBe(ref.fileId);
    expect(context.versionId).toBe(ref.versionId);
    expect(JSON.parse(context.content).sections[0].blockId).toBe('one');
    expect(request.tools.some((tool: any) => tool.name === 'document.revise')).toBe(true);
  } finally {
    await f.close();
  }
});
