import { mkdtemp } from '../../scripts/test-temp.mjs';
import { expect, it } from 'vitest';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { newId } from '../../packages/storage/src';
import {
  ZhipuToolTraceRecorder,
  ZhipuToolTraceSchema,
  type ZhipuToolTrace,
} from '../../packages/providers/src/api/tool-trace';
import { createToolTraceWriter } from '../../packages/core/src/tool-trace';

it('P02-02 tool trace exports only bounded enums/counts and a valid attempt ID', () => {
  const secret = 'private-marker-do-not-export';
  const records: ZhipuToolTrace[] = [];
  const recorder = new ZhipuToolTraceRecorder(secret, (value) => records.push(value));
  recorder.prepared({
    tools: [
      { function: { name: 'history.search', arguments: secret } },
      { function: { name: secret } },
    ],
    tool_choice: { type: secret },
    messages: [{ content: secret }],
    authorization: secret,
  });
  recorder.http(200);
  recorder.frame({
    choices: [
      {
        delta: {
          content: secret,
          reasoning_content: secret,
          tool_calls: [
            { function: { name: 'history.search', arguments: secret } },
            { function: { name: secret } },
          ],
        },
        message: {
          tool_calls: [{ function: { name: secret } }],
          function_call: { arguments: secret },
        },
        finish_reason: secret,
      },
    ],
    error: { message: secret },
  });
  recorder.finish();
  recorder.publish();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    attemptId: null,
    request: {
      fetchInvoked: true,
      toolCount: 2,
      knownToolNames: ['history.search'],
      otherToolCount: 1,
      toolChoice: 'other',
    },
    response: {
      httpStatus: 200,
      deltaToolItems: 2,
      messageToolItems: 1,
      otherToolNameItems: 2,
      finishReasons: ['other'],
      textFrames: 1,
      legacyFunctionFrames: 1,
      deliveredToolEnds: 0,
      outcome: 'finished',
    },
  });
  expect(JSON.stringify(records)).not.toContain(secret);
});

it('P02-02 trace callbacks cannot fail provider execution and schema rejects extra payload fields', () => {
  const recorder = new ZhipuToolTraceRecorder(newId(), () => {
    throw new Error('private-error');
  });
  expect(() => recorder.publish()).not.toThrow();
  expect(
    ZhipuToolTraceSchema.safeParse({ ...recorder.summary, body: 'private-body' }).success,
  ).toBe(false);
});

it('P02-02 trace writer requires explicit matching profile/case and does not overwrite a case', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P02-02-tool-trace-'));
  const profile = newId(),
    caseId = newId();
  const env = {
    TAPKIT_TOOL_TRACE: 'P02-02',
    TAPKIT_TOOL_TRACE_PROFILE: profile,
    TAPKIT_TOOL_TRACE_CASE: caseId,
  };
  expect(createToolTraceWriter(dir, profile, {})).toBeUndefined();
  expect(
    createToolTraceWriter(dir, profile, { ...env, TAPKIT_TOOL_TRACE_PROFILE: newId() }),
  ).toBeUndefined();
  expect(
    createToolTraceWriter(dir, profile, { ...env, TAPKIT_TOOL_TRACE_CASE: '../private-path' }),
  ).toBeUndefined();
  expect(createToolTraceWriter('relative', profile, env)).toBeUndefined();
  expect(await readdir(dir)).toEqual([]);
  const writer = createToolTraceWriter(dir, profile, env)!;
  expect(writer).toBeTypeOf('function');
  const recorder = new ZhipuToolTraceRecorder(newId(), writer);
  recorder.prepared({ tools: [{ function: { name: 'history.search' } }] });
  recorder.http(200);
  recorder.delivered();
  recorder.finish();
  recorder.publish();
  writer({ ...recorder.summary, body: 'private-body' } as ZhipuToolTrace);
  const path = join(dir, 'logs', 'tool-trace-' + caseId + '.jsonl');
  const before = await readFile(path, 'utf8');
  const rows = before
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ kind: 'opened', profileId: profile, caseId });
  expect(rows[1]).toMatchObject({
    kind: 'attempt',
    trace: { request: { knownToolNames: ['history.search'] }, response: { deliveredToolEnds: 1 } },
  });
  expect(before).not.toContain('private-body');
  expect(createToolTraceWriter(dir, profile, env)).toBeUndefined();
  expect(await readFile(path, 'utf8')).toBe(before);
});
