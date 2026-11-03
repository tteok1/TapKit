// Match the literal Markdown representation, including entity escaping and quote lines.
// Raw source offsets and hashes are verified separately against archived snapshots.
export function researchQuoteBlock(quote) {
  return (
    '> ' +
    quote
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[\\`*_{}[\]#!|]/g, '\\$&')
      .replace(/\n/g, '\n> ')
  );
}
