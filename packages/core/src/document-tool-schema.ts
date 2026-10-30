// The provider boundary accepts a deliberately small JSON Schema subset. The
// shared DocumentSpecSchema remains the authoritative validation at dispatch.
const text = (maxLength: number) => ({ type: 'string', maxLength });
const list = (items: unknown, maxItems: number) => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const block = {
  anyOf: [
    object({ type: { const: 'paragraph' }, text: text(100000) }, ['type', 'text']),
    object({ type: { const: 'bullets' }, items: list(text(100000), 200) }, ['type', 'items']),
    object(
      {
        type: { const: 'table' },
        columns: list(text(100000), 30),
        rows: list(list(text(100000), 30), 200),
      },
      ['type', 'columns', 'rows'],
    ),
    object({ type: { const: 'image' }, fileVersionId: text(64), alt: text(1000) }, [
      'type',
      'fileVersionId',
      'alt',
    ]),
    object({ type: { const: 'code' }, language: text(80), text: text(100000) }, [
      'type',
      'language',
      'text',
    ]),
  ],
};
export const documentSectionToolSchema = object(
  {
    blockId: text(128),
    heading: text(500),
    blocks: list(block, 1000),
  },
  ['blockId', 'heading', 'blocks'],
);
const fields = object({ name: text(500), date: text(100), brand: text(500) }, [
  'name',
  'date',
  'brand',
]);
const style = object(
  {
    template: { type: 'string', enum: ['report', 'proposal', 'minutes'] },
    theme: { type: 'string', enum: ['formal', 'minimal'] },
    fields,
    tableOfContents: { type: 'boolean' },
    pageNumbers: { type: 'boolean' },
  },
  ['template', 'fields', 'tableOfContents', 'pageNumbers'],
);
export const documentSpecToolSchema = object(
  {
    schemaVersion: { const: 1 },
    title: text(500),
    audience: text(500),
    language: text(80),
    sections: list(documentSectionToolSchema, 200),
    citations: list(
      object(
        {
          label: text(500),
          ref: { type: 'object', description: 'Copy an exact reference supplied with this task.' },
        },
        ['label', 'ref'],
      ),
      200,
    ),
    style,
  },
  ['schemaVersion', 'title', 'audience', 'language', 'sections'],
);
