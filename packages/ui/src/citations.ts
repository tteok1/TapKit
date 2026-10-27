import type { ResourceRef } from '@tapkit/contracts';
/** Only persisted, Core-verified refs can become interactive source links. */
export function citationMarkdown(
  text: string,
  refs: ResourceRef[],
  label: string,
  pending: string,
) {
  let fileIndex = 0;
  const files = refs.flatMap((ref, index) => (ref.kind === 'file' ? [index] : []));
  return text.replace(/\[\[(web|evidence):([^\]]+)\]\]/g, (_marker, kind: string, id: string) => {
    const index =
      kind === 'web'
        ? refs.findIndex((ref) => ref.kind === 'web' && ref.sourceId === id)
        : (files[fileIndex++] ?? -1);
    return index >= 0 ? `[${label} ${index + 1}](#tapkit-citation-${index})` : pending;
  });
}
