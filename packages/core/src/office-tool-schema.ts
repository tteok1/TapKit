import { z, AnalysisSpecSchema, SlideDeckSpecSchema, SlideActionSchema } from '@tapkit/contracts';
// Provider-compatible schema subset; dispatch still runs the full strict shared validator.
function boundedSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>,
    output: Record<string, unknown> = {};
  for (const name of [
    'type',
    'const',
    'enum',
    'required',
    'additionalProperties',
    'minItems',
    'maxItems',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'description',
  ])
    if (Object.hasOwn(input, name)) output[name] = input[name];
  if (input.properties)
    output.properties = Object.fromEntries(
      Object.entries(input.properties as Record<string, unknown>).map(([k, v]) => [
        k,
        boundedSchema(v),
      ]),
    );
  for (const name of ['items', 'anyOf', 'oneOf'])
    if (input[name])
      output[name] = Array.isArray(input[name])
        ? input[name].map(boundedSchema)
        : boundedSchema(input[name]);
  return output;
}
export const analysisToolSchema = boundedSchema(
  z.toJSONSchema(AnalysisSpecSchema, { io: 'input', unrepresentable: 'any' }),
);
export const slideToolSchema = boundedSchema(
  z.toJSONSchema(SlideDeckSpecSchema, { io: 'input', unrepresentable: 'any' }),
);
export const slideActionsToolSchema = boundedSchema(
  z.toJSONSchema(z.array(SlideActionSchema).min(1).max(50), {
    io: 'input',
    unrepresentable: 'any',
  }),
);
