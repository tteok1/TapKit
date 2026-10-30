import { test, expect } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { resolveApiConfig, WorkToolArgsSchema } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { analysisToolSchema } from '../../packages/core/src/office-tool-schema';
import { salesAnalysis } from '../fixtures/P07-02.data';
import {
  accountId,
  modelRequest,
  memoryNative,
  collect,
  events,
  sseFrames,
} from '../fixtures/P01-02.api';
test('P07-02 provider accepts the full bounded data schema and decodes the canonical tool name', async () => {
  const config = resolveApiConfig('openai-compatible', {
    apiFormat: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4.7-flashx',
  });
  const fileId = newId(),
    versionId = newId(),
    args = { fileId, versionId, spec: salesAnalysis(fileId, versionId) };
  const adapter = new ApiKeyAdapter(
    accountId,
    config,
    async () => 'synthetic-key',
    memoryNative().store,
    async (_url, init) => {
      expect(JSON.parse(String(init?.body)).tools[0].function.name).toBe('data_analyze');
      return sseFrames(
        events('openai-chat', true, false, JSON.stringify(args)).map((raw) => {
          const frame = structuredClone(raw) as any;
          if (frame?.choices?.[0]?.delta?.tool_calls)
            frame.choices[0].delta.tool_calls[0].function.name = 'data_analyze';
          return frame;
        }),
      );
    },
  );
  const request = modelRequest(config);
  request.tools = [
    {
      name: 'data.analyze',
      description: '固定数据分析',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          versionId: { type: 'string' },
          spec: analysisToolSchema,
        },
        required: ['fileId', 'versionId', 'spec'],
        additionalProperties: false,
      },
    },
  ];
  const result = await collect(adapter, request),
    tool = result.find((event) => event.type === 'tool_end');
  expect(tool).toMatchObject({ name: 'data.analyze', arguments: args });
  if (tool?.type !== 'tool_end') throw Error('missing tool');
  if (!tool.arguments || typeof tool.arguments !== 'object' || Array.isArray(tool.arguments))
    throw Error('invalid arguments');
  expect(WorkToolArgsSchema.parse({ tool: tool.name, ...tool.arguments }).tool).toBe(
    'data.analyze',
  );
});
