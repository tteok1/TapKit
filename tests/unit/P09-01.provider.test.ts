import { test, expect, vi } from 'vitest';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { resolveApiConfig } from '../../packages/contracts/src';
import { zhipuToolNames, zhipuToolMessages } from '../../packages/providers/src/api/zhipu-tools';
import { accountId, memoryNative, modelRequest, sseFrames, collect } from '../fixtures/P01-02.api';

test('P09-01 Zhipu sends a legal code-tool alias and restores only the declared canonical patch tool', async () => {
  const config = resolveApiConfig('openai-compatible', {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4.7-flashx',
  });
  const args = { patch: { path: 'sum.ts', baseHash: null, content: 'export const n = 1;\n' } };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.tools[0].function.name).toBe('code_applyPatch');
    return sseFrames([
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'patch-1',
                  type: 'function',
                  function: { name: 'code_applyPatch', arguments: JSON.stringify(args) },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      '[DONE]',
    ]);
  });
  const channel = new ApiKeyAdapter(
      accountId,
      config,
      async () => 'fixture-key',
      memoryNative().store,
      fetcher,
    ),
    request = modelRequest(config);
  request.tools = [
    {
      name: 'code.applyPatch',
      description: 'synthetic patch',
      parameters: {
        type: 'object',
        properties: {
          patch: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              baseHash: { type: ['string', 'null'] },
              content: { type: ['string', 'null'] },
            },
            required: ['path', 'baseHash', 'content'],
            additionalProperties: false,
          },
        },
        required: ['patch'],
        additionalProperties: false,
      },
    },
  ];
  const result = await collect(channel, request);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.find((r) => r.type === 'tool_end')).toMatchObject({
    name: 'code.applyPatch',
    arguments: args,
  });
  expect(result.at(-1)?.type).toBe('finish');
  expect(() =>
    zhipuToolNames([{ name: 'code.applyPatch' }, { name: 'code_applyPatch' }]),
  ).toThrow();
  expect(
    zhipuToolMessages([
      {
        role: 'assistant',
        tool_calls: [{ id: '1', function: { name: 'code.applyPatch', arguments: '{}' } }],
      },
    ])[0]!.tool_calls[0].function.name,
  ).toBe('code_applyPatch');
});
