import { PlanStepInputSchema, type PlanStepInput, type WorkDefinition } from '@tapkit/contracts';

/** Stable keys, explicit edges; display order never grants permission to skip prerequisites. */
export function validatePlan(raw: PlanStepInput[], selected?: string[]) {
  const steps = raw.map((step) => PlanStepInputSchema.parse(step));
  if (!steps.length || steps.length > 12) throw new Error('VALIDATION_ERROR');
  const byKey = new Map(steps.map((s) => [s.stepKey, s]));
  if (byKey.size !== steps.length) throw new Error('VALIDATION_ERROR');
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key) || !byKey.has(key)) throw new Error('VALIDATION_ERROR');
    if (visited.has(key)) return;
    visiting.add(key);
    const dependencies = byKey.get(key)!.dependencies;
    if (new Set(dependencies).size !== dependencies.length) throw new Error('VALIDATION_ERROR');
    dependencies.forEach(visit);
    visiting.delete(key);
    visited.add(key);
  }
  steps.forEach((s) => visit(s.stepKey));
  visited.clear();
  (selected ?? steps.map((s) => s.stepKey)).forEach(visit);
  if (!visited.size) throw new Error('VALIDATION_ERROR');
  return { steps, selected: steps.filter((s) => visited.has(s.stepKey)).map((s) => s.stepKey) };
}
export function defaultPlan(definition: WorkDefinition): PlanStepInput[] {
  return Array.from({ length: definition.quantity }, (_, index) => ({
    stepKey: 'deliver-' + (index + 1),
    title:
      definition.quantity === 1
        ? definition.goal.slice(0, 240)
        : `成果 ${index + 1}：${definition.goal.slice(0, 220)}`,
    dependencies: [],
    inputRefs: definition.refs,
    outputContract: { kind: 'files', formats: [definition.format] },
    acceptance: definition.acceptance.length
      ? definition.acceptance
      : [{ kind: 'file_exists', format: definition.format, minCount: 1 }],
    optional: false,
  }));
}
export const WORK_TERMINAL = [
  'completed',
  'partial',
  'failed',
  'budget_stopped',
  'cancelled',
] as const;
