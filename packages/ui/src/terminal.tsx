import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

export function TerminalSurface({
  text,
  generation,
  interactive,
  onData,
  onResize,
}: {
  text: string;
  generation: string;
  interactive: boolean;
  onData: (text: string) => void;
  onResize: (cols: number, rows: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal>(null);
  const callbacks = useRef({ onData, onResize });
  callbacks.current = { onData, onResize };
  const rendered = useRef({ generation: '', text: '' });
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    Terminal.strings.promptLabel = '终端输入';
    const term = new Terminal({
      fontFamily: "Consolas, 'Cascadia Mono', 'Microsoft YaHei UI', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      scrollback: 1000,
      convertEol: true,
      allowProposedApi: false,
      disableStdin: true,
      screenReaderMode: true,
      cursorBlink: false,
      minimumContrastRatio: 4.5,
      windowOptions: {},
      linkHandler: { activate: () => {} },
    });
    terminal.current = term;
    term.open(element);
    const theme = () => {
      const css = getComputedStyle(element),
        color = (key: string, fallback: string) => css.getPropertyValue(key).trim() || fallback;
      term.options.theme = {
        background: color('--code-surface', '#f6f8f6'),
        foreground: color('--ink', '#242b27'),
        cursor: color('--focus', '#47765b'),
        selectionBackground: color('--accent-surface', '#e8f1ea'),
      };
    };
    const fit = () => {
      // Use the grid actually rendered by xterm, after font/DPI rounding. The host
      // includes padding and the viewport may reserve a vertical scrollbar.
      const screen = element.querySelector<HTMLElement>('.xterm-screen'),
        viewport = element.querySelector<HTMLElement>('.xterm-viewport'),
        inner = term.element;
      if (!screen || !viewport || !inner) return;
      const cellWidth = parseFloat(screen.style.width) / term.cols,
        cellHeight = parseFloat(screen.style.height) / term.rows;
      if (!(cellWidth > 0 && cellHeight > 0)) return;
      const scrollbar = Math.max(0, viewport.offsetWidth - viewport.clientWidth);
      const cols = Math.max(
        20,
        Math.min(400, Math.floor((inner.clientWidth - scrollbar - 1) / cellWidth)),
      );
      const rows = Math.max(5, Math.min(200, Math.floor((inner.clientHeight - 1) / cellHeight)));
      if (term.cols !== cols || term.rows !== rows) {
        term.resize(cols, rows);
        callbacks.current.onResize(cols, rows);
      }
    };
    theme();
    fit();
    const render = term.onRender(fit);
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    const ancestor = element.closest('.desktop-shell') ?? document.documentElement;
    const observer = new MutationObserver(theme);
    observer.observe(ancestor, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    const input = term.onData((value) => callbacks.current.onData(value));
    return () => {
      resize.disconnect();
      observer.disconnect();
      input.dispose();
      render.dispose();
      term.dispose();
      terminal.current = null;
      rendered.current = { generation: '', text: '' };
    };
  }, []);
  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    if (rendered.current.generation !== generation || !text.startsWith(rendered.current.text)) {
      term.reset();
      rendered.current = { generation, text: '' };
    }
    const delta = text.slice(rendered.current.text.length);
    if (delta) term.write(delta);
    rendered.current = { generation, text };
    term.options.disableStdin = !interactive;
    term.options.cursorBlink = interactive;
  }, [text, generation, interactive]);
  useEffect(() => {
    const term = terminal.current;
    if (term && interactive) callbacks.current.onResize(term.cols, term.rows);
  }, [interactive]);
  return (
    <div
      ref={host}
      className="terminal-surface"
      role="region"
      aria-label={interactive ? '交互终端，输入内容发送到隔离进程' : '运行输出'}
    />
  );
}
