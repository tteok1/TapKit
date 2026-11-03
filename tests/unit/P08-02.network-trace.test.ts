import { mkdtemp } from '../../scripts/test-temp.mjs';
import { expect, test } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { newId } from '../../packages/storage/src';
import { createApiTransportTraceWriter } from '../../packages/core/src/tool-trace';

test('P08-02 API transport stages require explicit matching profile/case and do not create default logs', async () => {
  const dir = await mkdtemp(resolve('.test-data', 'P08-02 network guard ')),
    profile = newId(),
    caseId = newId();
  expect(createApiTransportTraceWriter(dir, profile, {})).toBeUndefined();
  expect(
    createApiTransportTraceWriter(dir, profile, {
      TAPKIT_API_TRANSPORT_TRACE: 'P08-02',
      TAPKIT_TOOL_TRACE_PROFILE: newId(),
      TAPKIT_TOOL_TRACE_CASE: caseId,
    }),
  ).toBeUndefined();
  expect(await readdir(dir)).toEqual([]);
});
test('P08-02 API transport stages export bounded timing only and refuse private or unknown fields', async () => {
  const dir = await mkdtemp(resolve('.test-data', 'P08-02 network trace ')),
    profile = newId(),
    caseId = newId(),
    requestId = newId();
  const env = {
    TAPKIT_API_TRANSPORT_TRACE: 'P08-02',
    TAPKIT_TOOL_TRACE_PROFILE: profile,
    TAPKIT_TOOL_TRACE_CASE: caseId,
  };
  const sink = createApiTransportTraceWriter(dir, profile, env)!;
  expect(sink).toBeTypeOf('function');
  sink({ requestId, stage: 'request_finished', elapsedMs: 8 });
  sink({ requestId, stage: 'response_headers', elapsedMs: 10 });
  sink({ requestId, stage: 'private-marker', elapsedMs: 1 });
  sink({ requestId, stage: 'request_error', elapsedMs: -1 });
  sink({ requestId, stage: 'request_error', elapsedMs: 1, body: 'private-marker' } as never);
  const file = join(dir, 'logs', 'api-transport-' + caseId + '.jsonl'),
    text = await readFile(file, 'utf8');
  expect(text).not.toContain('private-marker');
  expect(
    text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .slice(1)
      .map((row) => row.stage),
  ).toEqual(['request_finished', 'response_headers']);
  expect(createApiTransportTraceWriter(dir, profile, env)).toBeUndefined();
  expect(await readFile(file, 'utf8')).toBe(text);
});
