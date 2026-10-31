import { expect, test } from 'vitest';
import {
  BrowserActionSchema,
  BrowserHostRequestSchema,
  BrowserWorkToolArgsSchema,
  WorkDefinitionSchema,
} from '../../packages/contracts/src';
import { catalogAllowsTool } from '../../packages/tools/src/registry';
import { publicUrl } from '../../packages/network/src';
import { zhipuToolNames } from '../../packages/providers/src/api/zhipu-tools';
const id = '0199b35d-9700-7000-8000-000000000001';
test('P08-01 Zhipu wire aliases round-trip the declared browser tools and reject collisions', () => {
  for (const name of ['browser.open', 'browser.observe', 'browser.act'])
    expect(zhipuToolNames([{ name }]).get(name.replace('.', '_'))).toBe(name);
  expect(() => zhipuToolNames([{ name: 'browser.open' }, { name: 'browser_open' }])).toThrow();
});
test('P08-01 tool and private bridge reject arbitrary code, paths and protocol parameters', () => {
  expect(
    BrowserActionSchema.safeParse({
      tabId: id,
      snapshotId: id,
      action: 'evaluate',
      code: 'process.exit()',
    }).success,
  ).toBe(false);
  expect(
    BrowserWorkToolArgsSchema.safeParse({
      tool: 'browser.open',
      url: 'https://example.com',
      partition: 'persist:Chrome',
    }).success,
  ).toBe(false);
  expect(
    BrowserHostRequestSchema.safeParse({
      op: 'act',
      runId: id,
      rootRunId: id,
      cdp: 'Runtime.evaluate',
    }).success,
  ).toBe(false);
  expect(WorkDefinitionSchema.parse({ goal: '既有工作' }).browserEnabled).toBe(false);
  for (const catalog of ['p06-tools-1', 'p07-tools-1', 'p07-tools-2', 'p07-tools-3'])
    expect(catalogAllowsTool(catalog, 'browser.act')).toBe(false);
  expect(catalogAllowsTool('p08-tools-1', 'browser.act')).toBe(true);
  expect(catalogAllowsTool('p07-tools-3', 'slides.create')).toBe(true);
});
test.each([
  'http://127.0.0.1',
  'http://[::1]',
  'http://169.254.169.254',
  'https://localhost',
  'file:///C:/secrets',
  'tapkit-artifact://asset/a',
  'javascript:alert(1)',
  'https://user:secret@example.com',
  'http://example.com:8080',
])('P08-01 T19 browser and Node public URL gate rejects %s', (url) => {
  expect(() => publicUrl(url)).toThrow();
});
