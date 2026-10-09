// Fail closed for unsupported schema features; the tools used by P01-02 have
// object/string/array/number constraints. Full tool registry validation belongs to P05.
export function validArguments(
  value: unknown,
  schema: Record<string, unknown>,
  depth = 0,
): boolean {
  if (depth > 32) return false;
  const supported = new Set([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'const',
    'description',
    'title',
    'default',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'anyOf',
    'oneOf',
    'allOf',
  ]);
  if (Object.keys(schema).some((key) => !supported.has(key))) return false;
  const nested = (candidate: unknown, rule: unknown) =>
    Boolean(
      rule &&
      typeof rule === 'object' &&
      !Array.isArray(rule) &&
      validArguments(candidate, rule as Record<string, unknown>, depth + 1),
    );
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const)
    if (schema[key] !== undefined) {
      if (!Array.isArray(schema[key])) return false;
      const count = schema[key].filter((rule) => nested(value, rule)).length;
      if (key === 'anyOf' ? !count : key === 'oneOf' ? count !== 1 : count !== schema[key].length)
        return false;
    }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  )
    return false;
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (
    schema.type !== undefined &&
    !types.some((type) =>
      type === 'null'
        ? value === null
        : type === 'object'
          ? !!value && typeof value === 'object' && !Array.isArray(value)
          : type === 'array'
            ? Array.isArray(value)
            : type === 'integer'
              ? typeof value === 'number' && Number.isInteger(value)
              : type === 'number'
                ? typeof value === 'number' && Number.isFinite(value)
                : type === 'string'
                  ? typeof value === 'string'
                  : type === 'boolean'
                    ? typeof value === 'boolean'
                    : false,
    )
  )
    return false;
  if (typeof value === 'string') {
    if (
      (typeof schema.minLength === 'number' && [...value].length < schema.minLength) ||
      (typeof schema.maxLength === 'number' && [...value].length > schema.maxLength)
    )
      return false;
    // Arbitrary regexes are intentionally unavailable at the API boundary.
    if (schema.pattern !== undefined) return false;
  }
  if (
    typeof value === 'number' &&
    ((typeof schema.minimum === 'number' && value < schema.minimum) ||
      (typeof schema.maximum === 'number' && value > schema.maximum))
  )
    return false;
  if (Array.isArray(value)) {
    if (
      (typeof schema.minItems === 'number' && value.length < schema.minItems) ||
      (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
    )
      return false;
    if (schema.items !== undefined && !value.every((item) => nested(item, schema.items)))
      return false;
  } else if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>,
      properties = (schema.properties ?? {}) as Record<string, unknown>;
    if (
      Array.isArray(schema.required) &&
      schema.required.some((key) => typeof key !== 'string' || !Object.hasOwn(object, key))
    )
      return false;
    for (const [key, item] of Object.entries(object)) {
      if (Object.hasOwn(properties, key)) {
        if (!nested(item, properties[key])) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (
        typeof schema.additionalProperties === 'object' &&
        !nested(item, schema.additionalProperties)
      )
        return false;
    }
  }
  return true;
}
