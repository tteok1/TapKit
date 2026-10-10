import { expect, test } from 'vitest';
import {
  ProjectCommandSchemas,
  ProjectScopeSchema,
  ProjectDefaultsSchema,
} from '../../packages/contracts/src';
import { ReadGateway } from '../../packages/tools/src/read-gateway';
const id = '0195abc0-0000-7000-8000-000000000001';
test('P03-03 T19 project DTO rejects injected grants, unsafe defaults and unbounded material lists', () => {
  expect(ProjectScopeSchema.parse({})).toEqual({ selectedVersionIds: null, projectOnly: false });
  expect(
    ProjectCommandSchemas['projects.update'].safeParse({
      projectId: id,
      patch: { allowGlobalHistory: true, grants: ['exec'] },
    }).success,
  ).toBe(false);
  expect(
    ProjectCommandSchemas['projects.sessionScope'].safeParse({
      sessionId: id,
      scope: { selectedVersionIds: Array(21).fill(id) },
    }).success,
  ).toBe(false);
  expect(
    ProjectDefaultsSchema.safeParse({
      model: null,
      answer: { language: 'auto', length: 'normal', tone: 'natural', format: 'auto' },
      tools: ['exec.run'],
    }).success,
  ).toBe(false);
});
test('P03-03 T19 knowledge tool closes arguments and denies access without a project capability', async () => {
  let reads = 0;
  const gateway = new ReadGateway({
    alive: () => {},
    file: async () => '',
    history: () => [],
    knowledge: async () => {
      reads++;
      return { hits: [] };
    },
  });
  await expect(
    gateway.execute('knowledge.query', { query: 'x', projectId: id }, id, []),
  ).rejects.toThrow();
  expect(reads).toBe(0);
  expect(await gateway.execute('knowledge.query', { query: '唯一标记', limit: 1 }, id, [])).toBe(
    '{"hits":[]}',
  );
  const ordinary = new ReadGateway({ alive: () => {}, file: async () => '', history: () => [] });
  await expect(ordinary.execute('knowledge.query', { query: 'x' }, id, [])).rejects.toThrow(
    'PERMISSION_DENIED',
  );
});
