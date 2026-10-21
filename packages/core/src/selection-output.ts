/** Selection transforms have source links, but never knowledge-query evidence. */
export function selectionOutput(text: string, source: string, streaming: boolean) {
  let result = text.replace(/\[\[evidence:[^\r\n]*?(?:\]\]|$)(?:\r?\n)?/g, (marker) => {
    // Translating documentation or code must preserve protocol examples in the selected original.
    return source.includes(marker.trimEnd()) ? marker : '';
  });
  if (streaming) {
    // Hold incomplete marker prefixes across provider chunks, including a single opening bracket.
    for (const pending of [result.lastIndexOf('[['), result.lastIndexOf('[')]) {
      if (pending < 0) continue;
      const tail = result.slice(pending);
      if (
        '[[evidence:'.startsWith(tail) ||
        (tail.startsWith('[[evidence:') && !tail.includes(']]'))
      )
        result = result.slice(0, pending);
    }
  }
  return result;
}
