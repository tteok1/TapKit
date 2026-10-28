import { expect, test } from 'vitest';
import { validatePlan, defaultPlan } from '../../packages/workflows/src/work-plan';
import { WorkDefinitionSchema } from '../../packages/contracts/src';
const definition = WorkDefinitionSchema.parse({ goal: '总结资料' });
test('P06-01 T13 simple work has one step and explicit defaults', () => {
  expect(defaultPlan(definition)).toHaveLength(1);
  expect(definition.budgetOverrides.maxCalls).toBe(40);
});
test('P06-01 T13 selected steps include transitive dependencies independently of display order', () => {
  const [a] = defaultPlan(definition);
  const steps = [
    { ...a!, stepKey: 'c', dependencies: ['b'] },
    { ...a!, stepKey: 'b', dependencies: ['a'] },
    { ...a!, stepKey: 'a' },
  ];
  expect(validatePlan(steps, ['c']).selected).toEqual(['c', 'b', 'a']);
});
test('P06-01 T13 cycles, missing dependencies, duplicate keys, empty selection and overlong plans reject', () => {
  const [a] = defaultPlan(definition);
  for (const steps of [
    [{ ...a!, dependencies: [a!.stepKey] }],
    [{ ...a!, dependencies: ['missing'] }],
    [a!, a!],
    Array.from({ length: 13 }, (_, i) => ({ ...a!, stepKey: String(i) })),
  ])
    expect(() => validatePlan(steps)).toThrow('VALIDATION_ERROR');
  expect(() => validatePlan([a!], [])).toThrow('VALIDATION_ERROR');
});
