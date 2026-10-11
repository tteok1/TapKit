import {
  CheckpointStateSchema,
  ContextFields,
  type CheckpointState,
  type ContextSource,
} from '@tapkit/contracts';

export type SourceMessage = ContextSource & { role: string; text: string; seq: number };
export function keyLiterals(text: string): string[] {
  // Split once; an unanchored sentence regex with two greedy spans is quadratic
  // on long passages without negations. Keep extraction linear in source size.
  const ids = (text.match(/[A-Za-z0-9_.:/-]+/g) ?? []).filter((s) => /\d/.test(s));
  const amounts = text.match(/[¥￥$€]\s*[\d,.]+|\d[\d,.]*\s*(?:元|美元|天|日|月|年|%|％)/gu) ?? [];
  const conditions = text
    .split(/[。！？\n]/u)
    .filter((s) => /(?:不|禁止|不得|不要|仅|只能|必须)/u.test(s));
  return [...new Set([...ids, ...amounts, ...conditions])];
}
export function checkpoint(
  messages: SourceMessage[],
  execution: CheckpointState['execution_refs'] = [],
): CheckpointState {
  const users = messages.filter((m) => m.role === 'user');
  const facts = (rows: SourceMessage[], trim = false) =>
    rows
      .filter((m) => m.text)
      .map((m) => ({
        text: trim ? m.text.slice(0, 400) : m.text,
        sources: [{ id: m.id, revision: m.revision }],
      }));
  // Every original user statement remains exact. Assistant output is an index into originals.
  return CheckpointStateSchema.parse({
    schemaVersion: 1,
    goal: facts(users.slice(-1)),
    constraints: facts(users.slice(0, -1)),
    decisions: [],
    completed: facts(messages.filter((m) => m.role === 'assistant').slice(-3), true),
    active: [],
    next: [],
    artifacts: [],
    evidence: facts(messages.filter((m) => m.role === 'tool').slice(-3), true),
    open_questions: [],
    execution_refs: execution,
    literals: [...new Set(messages.flatMap((m) => keyLiterals(m.text)))],
  });
}
export function validateCheckpoint(
  candidate: unknown,
  sources: SourceMessage[],
  execution: CheckpointState['execution_refs'],
  required: string[],
): CheckpointState {
  const state = CheckpointStateSchema.parse(candidate);
  const allowed = new Map(sources.map((m) => [m.id, m]));
  for (const field of ContextFields)
    for (const fact of state[field]) {
      for (const ref of fact.sources) {
        const source = allowed.get(ref.id);
        if (!source || source.revision !== ref.revision) throw new Error('CONFLICT');
      }
      if (!fact.sources.some((ref) => allowed.get(ref.id)!.text.includes(fact.text)))
        throw new Error('VALIDATION_ERROR');
    }
  const text = JSON.stringify(state);
  for (const literal of state.literals)
    if (!sources.some((s) => s.text.includes(literal))) throw new Error('VALIDATION_ERROR');
  const stateFacts = ContextFields.flatMap((f) => state[f]);
  for (const user of sources.filter((s) => s.role === 'user'))
    if (!stateFacts.some((f) => f.text === user.text && f.sources.some((r) => r.id === user.id)))
      throw new Error('VALIDATION_ERROR');
  if (required.some((l) => !text.includes(JSON.stringify(l).slice(1, -1))))
    throw new Error('VALIDATION_ERROR');
  if (JSON.stringify(state.execution_refs) !== JSON.stringify(execution))
    throw new Error('CONFLICT');
  return state;
}
export async function validatedCompaction(
  generate: (retry: boolean) => unknown | Promise<unknown>,
  validate: (candidate: unknown) => CheckpointState,
  previous: CheckpointState | null,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return {
        state: validate(await generate(attempt > 0)),
        accepted: true,
        attempts: attempt + 1,
      };
    } catch {
      /* Retry once; never overwrite valid state on failure. */
    }
  }
  return { state: previous, accepted: false, attempts: 2 };
}
