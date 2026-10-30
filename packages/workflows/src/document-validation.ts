import { DocumentSpecSchema, ParsedDocumentSchema } from '@tapkit/contracts';

/** Content checks shared by initial and repaired render candidates. */
export function validateDocumentContent(
  rawSpec: unknown,
  rawParsed: unknown,
  format: 'docx' | 'pdf' = 'docx',
  imageIntegrityChecked = false,
): boolean {
  const spec = DocumentSpecSchema.parse(rawSpec);
  const parsed = ParsedDocumentSchema.parse(rawParsed);
  if (
    parsed.format !== format ||
    parsed.quality.needsOcr ||
    (format === 'pdf' && !parsed.pages.length)
  )
    return false;
  // PDF text items and line wraps may split words or numbers across blocks.
  const normalize = (value: string) => value.replace(/\s+/gu, '');
  const text = normalize(parsed.blocks.map((block) => block.text).join(' '));
  if (!text) return false;
  const required = [
    spec.title,
    spec.audience,
    spec.style.fields.name,
    spec.style.fields.date,
    spec.style.fields.brand,
    ...spec.sections.map((section) => section.heading),
    ...spec.citations.map((citation) => citation.label),
  ];
  for (const section of spec.sections) {
    for (const block of section.blocks) {
      if (block.type === 'paragraph' || block.type === 'code') required.push(block.text);
      else if (block.type === 'bullets') required.push(...block.items);
      else if (block.type === 'table') required.push(...block.columns, ...block.rows.flat());
      else if (block.type === 'image') {
        if (!imageIntegrityChecked) return false;
        required.push(block.alt || '图片');
      } else return false;
    }
  }
  return required.every((value) => !normalize(value) || text.includes(normalize(value)));
}

/** A page-edge check is conservative and does not detect every visual overlap. */
export function validateDocumentPdfLayout(rawParsed: unknown): boolean {
  const parsed = ParsedDocumentSchema.parse(rawParsed);
  if (parsed.format !== 'pdf' || !parsed.pages.length) return false;
  if (
    parsed.pages.some((page) => Math.abs(page.width - 595) > 5 || Math.abs(page.height - 842) > 5)
  )
    return false;
  for (const block of parsed.blocks) {
    if (
      block.locator.kind !== 'pdf' ||
      block.locator.pageIndex >= parsed.pages.length ||
      !block.locator.rects?.length
    )
      return false;
    if (
      block.locator.rects.some(
        (rect) =>
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.x <= 0.001 ||
          rect.y <= 0.001 ||
          rect.x + rect.width >= 0.999 ||
          rect.y + rect.height >= 0.999,
      )
    )
      return false;
  }
  return true;
}

/** Text and PDF page-edge checks; these do not detect every visual overlap. */
export function validateDocumentStructure(
  rawSpec: unknown,
  rawParsed: unknown,
  format: 'docx' | 'pdf' = 'docx',
  imageIntegrityChecked = false,
): boolean {
  return (
    validateDocumentContent(rawSpec, rawParsed, format, imageIntegrityChecked) &&
    (format !== 'pdf' || validateDocumentPdfLayout(rawParsed))
  );
}
