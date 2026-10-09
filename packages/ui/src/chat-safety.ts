export function safeChatURL(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}
export const safeMermaidText = (text: string) =>
  text.length <= 32000 &&
  !/%%\s*\{|click\s|href\s|(?:https?|data|javascript)\s*:|\b(?:img|image|icon)\s*:|<\/?(?:script|iframe|img|svg|html)\b/i.test(
    text,
  );
