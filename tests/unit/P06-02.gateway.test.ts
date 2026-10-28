import { test, expect } from 'vitest';
import { canonicalHash, parseWorkTool, workToolsForMode } from '../../packages/tools/src/registry';
import {
  zhipuToolName,
  zhipuToolNames,
  zhipuToolMessages,
} from '../../packages/providers/src/api/zhipu-tools';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { resolveApiConfig } from '../../packages/contracts/src';
import {
  accountId,
  modelRequest,
  memoryNative,
  collect,
  events,
  sseFrames,
  tool,
} from '../fixtures/P01-02.api';
test.each(['artifact.write', 'workspace.patch', 'python.analyze', 'office.convert', 'user.ask'])(
  'P06-02 actual Zhipu codec round-trips %s with a complete tool call',
  async (name) => {
    const config = resolveApiConfig('openai-compatible', {
        apiFormat: 'openai-chat',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        modelId: 'glm-4.7-flashx',
      }),
      wire = name.replace('.', '_');
    let sent = false;
    const adapter = new ApiKeyAdapter(
      accountId,
      config,
      async () => 'synthetic-key',
      memoryNative().store,
      async (_url, init) => {
        sent = true;
        expect(JSON.parse(String(init?.body)).tools[0].function.name).toBe(wire);
        return sseFrames(
          events('openai-chat', true).map((raw) => {
            const frame = structuredClone(raw) as any;
            if (frame?.choices?.[0]?.delta?.tool_calls)
              frame.choices[0].delta.tool_calls[0].function.name = wire;
            return frame;
          }),
        );
      },
    );
    const request = modelRequest(config);
    request.tools = [{ ...tool, name }];
    const result = await collect(adapter, request);
    expect(sent).toBe(true);
    expect(result.find((e) => e.type === 'tool_end')).toMatchObject({ name });
    expect(result.at(-1)?.type).toBe('finish');
  },
);
test.each(['artifact.write', 'workspace.patch', 'python.analyze', 'office.convert', 'user.ask'])(
  'P06-02 Zhipu maps %s only at the protocol boundary and restores its canonical identity',
  (name) => {
    const wire = name.replace('.', '_');
    expect(zhipuToolName(name)).toBe(wire);
    expect(zhipuToolNames([{ name }]).get(wire)).toBe(name);
    expect(
      zhipuToolMessages([
        { role: 'assistant', tool_calls: [{ id: 'call', function: { name, arguments: '{}' } }] },
      ])[0]!.tool_calls[0].function.name,
    ).toBe(wire);
  },
);
test('P06-02 T14 all business fields bind canonical hashes; ordering alone does not change a preview', () => {
  expect(canonicalHash({ content: 'a', target: 'x' })).toBe(
    canonicalHash({ target: 'x', content: 'a' }),
  );
  for (const value of [
    { content: 'b', target: 'x' },
    { content: 'a', target: 'y' },
    { content: 'a', target: 'x', amount: 1 },
  ])
    expect(canonicalHash(value)).not.toBe(canonicalHash({ content: 'a', target: 'x' }));
});
test('P06-02 T19 fragmented, arbitrary exec, extra amount, absolute names and excessive output are rejected', () => {
  for (const args of [
    '{"tool":"artifact.write"',
    { tool: 'exec', script: 'x' },
    { tool: 'artifact.write', name: 'C:\\secret.md', content: 'x' },
    { tool: 'artifact.write', name: 'a.md', content: 'x', amount: 2 },
    { tool: 'artifact.write', name: 'a.md', content: 'x'.repeat(64001) },
  ])
    expect(() => parseWorkTool(args)).toThrow();
  expect(workToolsForMode('chat').every((s) => s.mode === 'artifact_write')).toBe(true);
  expect(workToolsForMode('work').map((s) => s.name)).toContain('python.analyze');
});
