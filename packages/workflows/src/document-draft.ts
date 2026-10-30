import { DocumentSpecSchema, type DocumentSpec } from '@tapkit/contracts';

export const DocumentDraftSchema = DocumentSpecSchema;
export type DocumentDraft = DocumentSpec;

/** Readable review text for one section; preserves all text and table cells. */
export function formatDocumentSection(section: DocumentDraft['sections'][number]): string {
  return [
    section.heading,
    ...section.blocks.map((block) => {
      switch (block.type) {
        case 'paragraph':
          return block.text;
        case 'code':
          return block.text;
        case 'bullets':
          return block.items.map((item) => `• ${item}`).join('\n');
        case 'table':
          return [block.columns, ...block.rows].map((row) => row.join(' | ')).join('\n');
        case 'image':
          return `图片：${block.alt}`;
      }
    }),
  ].join('\n\n');
}

/** Bounded model context; never passes an invalid JSON fragment as a complete document. */
export function documentModelContext(spec: DocumentDraft, goal: string, maxChars: number) {
  const full = JSON.stringify(spec);
  if (full.length <= maxChars) return { truncated: false, content: full };
  const focused = spec.sections.find(
    (section) =>
      goal.includes(section.blockId) ||
      (section.heading.length >= 2 && goal.includes(section.heading)),
  );
  const overview: { blockId: string; heading: string }[] = [];
  let used = 0;
  for (const section of spec.sections) {
    const item = { blockId: section.blockId, heading: section.heading.slice(0, 100) };
    const size = JSON.stringify(item).length;
    if (used + size > Math.min(6000, Math.floor(maxChars / 3))) break;
    overview.push(item);
    used += size;
  }
  const base = {
    title: spec.title.slice(0, 200),
    sections: overview,
    omittedSections: spec.sections.length - overview.length,
  };
  const focusedJson = focused ? JSON.stringify(focused) : '';
  const candidate =
    focused && JSON.stringify(base).length + focusedJson.length + 200 <= maxChars
      ? { ...base, focusedSection: focused }
      : base;
  return { truncated: true, content: JSON.stringify(candidate) };
}

const templateSections = {
  report: ['摘要', '正文'],
  proposal: ['目标', '步骤', '资源', '验收'],
  minutes: ['议题', '结论', '待办'],
} as const;

/** Creates a fixed outline; content is deliberately empty until supplied by the user or model. */
export function documentOutline(input: {
  title: string;
  audience: string;
  language: string;
  template: DocumentDraft['style']['template'];
}): DocumentDraft {
  return DocumentDraftSchema.parse({
    schemaVersion: 1,
    title: input.title,
    audience: input.audience,
    language: input.language,
    style: {
      template: input.template,
      fields: { name: '', date: '', brand: '' },
      tableOfContents: false,
      pageNumbers: true,
    },
    citations: [],
    sections: templateSections[input.template].map((heading, index) => ({
      blockId: `section-${index + 1}`,
      heading,
      blocks: [],
    })),
  });
}

/** Computes a candidate only. The caller must compare and commit the version atomically. */
export function reviseDocumentSection(
  raw: unknown,
  baseVersion: string,
  currentVersion: string,
  blockId: string,
  replacement: DocumentDraft['sections'][number],
): DocumentDraft {
  if (baseVersion !== currentVersion) throw new Error('VERSION_CONFLICT');
  const draft = DocumentDraftSchema.parse(raw);
  const index = draft.sections.findIndex((section) => section.blockId === blockId);
  if (index < 0 || replacement.blockId !== blockId) throw new Error('VALIDATION_ERROR');
  const sections = [...draft.sections];
  sections[index] = replacement;
  return DocumentDraftSchema.parse({ ...draft, sections });
}

/** Changes only named cover fields, never arbitrary occurrences in body text. */
export function replaceDocumentFields(
  raw: unknown,
  fields: Partial<DocumentDraft['style']['fields']>,
): DocumentDraft {
  const draft = DocumentDraftSchema.parse(raw);
  return DocumentDraftSchema.parse({
    ...draft,
    style: { ...draft.style, fields: { ...draft.style.fields, ...fields } },
  });
}
