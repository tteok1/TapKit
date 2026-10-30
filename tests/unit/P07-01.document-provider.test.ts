import { expect, test } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { resolveApiConfig } from '../../packages/contracts/src';
import {
  documentSpecToolSchema,
  documentSectionToolSchema,
} from '../../packages/core/src/document-tool-schema';
import {
  accountId,
  modelRequest,
  memoryNative,
  collect,
  events,
  sseFrames,
} from '../fixtures/P01-02.api';

test('P07-01 Zhipu adapter accepts the complete structured document call and preserves its canonical tool name', async () => {
  const config = resolveApiConfig('openai-compatible', {
    apiFormat: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4.7-flashx',
  });
  const args = {
    name: '报告.docx',
    spec: {
      schemaVersion: 1,
      title: '验收报告',
      audience: '读者',
      language: '中文',
      sections: [
        { blockId: 'one', heading: '摘要', blocks: [{ type: 'paragraph', text: '金额 123.45' }] },
      ],
      citations: [],
      style: {
        template: 'report',
        theme: 'formal',
        fields: { name: '', date: '', brand: '' },
        tableOfContents: false,
        pageNumbers: true,
      },
    },
  };
  const adapter = new ApiKeyAdapter(
    accountId,
    config,
    async () => 'synthetic-key',
    memoryNative().store,
    async (_url, init) => {
      expect(JSON.parse(String(init?.body)).tools[0].function.name).toBe('document_create');
      return sseFrames(
        events('openai-chat', true, false, JSON.stringify(args)).map((raw) => {
          const frame = structuredClone(raw) as any;
          if (frame?.choices?.[0]?.delta?.tool_calls)
            frame.choices[0].delta.tool_calls[0].function.name = 'document_create';
          return frame;
        }),
      );
    },
  );
  const request = modelRequest(config);
  request.tools = [
    {
      name: 'document.create',
      description: '文档',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' }, spec: documentSpecToolSchema },
        required: ['name', 'spec'],
        additionalProperties: false,
      },
    },
  ];
  const result = await collect(adapter, request);
  expect(result.find((event) => event.type === 'tool_end')).toMatchObject({
    name: 'document.create',
    arguments: args,
  });
  expect(result.at(-1)?.type).toBe('finish');
  expect(documentSectionToolSchema.properties.blocks).toBeDefined();
});
