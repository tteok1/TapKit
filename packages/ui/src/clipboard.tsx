import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

const ClipboardContext = createContext<(text: string) => Promise<void>>((text) =>
  navigator.clipboard.writeText(text),
);
export function ClipboardProvider({
  writeText,
  children,
}: {
  writeText: (text: string) => Promise<void>;
  children: ReactNode;
}) {
  return <ClipboardContext.Provider value={writeText}>{children}</ClipboardContext.Provider>;
}
export function CopyButton({ label, text }: { label: string; text: string | (() => string) }) {
  const copy = useContext(ClipboardContext);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  const description =
    state === 'copied' ? '已' + label : state === 'failed' ? '复制失败，请重试' : label;
  const Icon = state === 'copied' ? Check : Copy;
  return (
    <button
      type="button"
      className="chat-copy icon-button"
      aria-label={description}
      data-tooltip={description}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        void Promise.resolve()
          .then(() => copy(typeof text === 'function' ? text() : text))
          .then(() => setState('copied'))
          .catch(() => setState('failed'));
      }}
    >
      <Icon className="ui-icon" size={18} strokeWidth={1.65} aria-hidden="true" />
    </button>
  );
}

// Quoted TSV preserves tabs, quotes and multi-line cells in spreadsheet paste.
export function tableToTSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[\t\r\n"]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell))
        .join('\t'),
    )
    .join('\n');
}
export function tableCellText(cell: HTMLElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  // KaTeX renders accessible MathML and visual HTML for the same formula.
  for (const math of clone.querySelectorAll('.katex'))
    math.replaceWith(
      math.querySelector('annotation[encoding="application/x-tex"]')?.textContent ??
        math.textContent ??
        '',
    );
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
  return clone.textContent ?? '';
}
