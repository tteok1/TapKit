import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, tableToTSV, tableCellText } from './clipboard';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { safeChatURL, safeMermaidText } from './chat-safety';
export { safeChatURL } from './chat-safety';
function Table({ children }: { children: ReactNode }) {
  const table = useRef<HTMLTableElement>(null);
  return (
    <div className="chat-table">
      <CopyButton
        label="复制表格"
        text={() => {
          if (!table.current) throw new Error('TABLE_UNAVAILABLE');
          return tableToTSV(
            [...table.current.rows].map((row) => [...row.cells].map(tableCellText)),
          );
        }}
      />
      <div className="chat-table-scroll">
        <table ref={table}>{children}</table>
      </div>
    </div>
  );
}
function Code({ text, language }: { text: string; language: string }) {
  const [tokens, setTokens] = useState<{ content: string; color?: string }[][]>();
  const [diagram, setDiagram] = useState('');
  useEffect(() => {
    let stopped = false;
    setTokens(undefined);
    setDiagram('');
    if (text.length > 32_000) return;
    if (language === 'mermaid') {
      if (!safeMermaidText(text)) return;
      void import('mermaid')
        .then(async ({ default: mermaid }) => {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            htmlLabels: false,
            flowchart: { htmlLabels: false },
            maxTextSize: 32000,
            suppressErrorRendering: true,
          });
          const { svg } = await mermaid.render('diagram-' + crypto.randomUUID(), text);
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          const allowed = new Set([
            'svg',
            'g',
            'path',
            'rect',
            'circle',
            'ellipse',
            'line',
            'polyline',
            'polygon',
            'text',
            'tspan',
            'defs',
            'marker',
            'title',
            'desc',
          ]);
          for (const element of [...doc.querySelectorAll('*')]) {
            if (!allowed.has(element.tagName.toLowerCase())) {
              element.remove();
              continue;
            }
            for (const attr of [...element.attributes]) {
              if (
                /^on|href|style/i.test(attr.name) ||
                /(?:https?:|data:|javascript:|@import)/i.test(attr.value)
              )
                element.removeAttribute(attr.name);
            }
            if (['rect', 'circle', 'ellipse', 'polygon'].includes(element.tagName.toLowerCase())) {
              element.setAttribute('fill', '#f8fafc');
              element.setAttribute('stroke', '#475569');
            }
            if (element.tagName.toLowerCase() === 'path') element.setAttribute('stroke', '#475569');
            if (['text', 'tspan'].includes(element.tagName.toLowerCase()))
              element.setAttribute('fill', '#0f172a');
          }
          doc.documentElement.setAttribute('width', '100%');
          doc.documentElement.setAttribute('height', '100%');
          doc.documentElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          if (!stopped) setDiagram(new XMLSerializer().serializeToString(doc.documentElement));
        })
        .catch(() => {});
    } else {
      void import('shiki')
        .then(async (shiki) => {
          if (!(language in shiki.bundledLanguages)) return;
          const lang = language as keyof typeof shiki.bundledLanguages;
          const highlighter = await shiki.createHighlighter({
            langs: [lang],
            themes: ['github-light', 'github-dark'],
            engine: shiki.createJavaScriptRegexEngine(),
          });
          try {
            const result = highlighter.codeToTokensWithThemes(text, {
              lang,
              themes: { light: 'github-light', dark: 'github-dark' },
            });
            if (!stopped)
              setTokens(
                result.map((line) =>
                  line.map((token) => ({
                    content: token.content,
                    color: `light-dark(${token.variants.light?.color ?? 'var(--ink)'}, ${token.variants.dark?.color ?? 'var(--ink)'})`,
                  })),
                ),
              );
          } finally {
            highlighter.dispose();
          }
        })
        .catch(() => {});
    }
    return () => {
      stopped = true;
    };
  }, [text, language]);
  return (
    <div className="chat-code">
      <div>
        <span>{language || '代码'}</span>
        <CopyButton label="复制代码" text={text} />
      </div>
      {diagram && (
        <iframe
          title="静态图表"
          sandbox=""
          srcDoc={
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>html,body{height:100%;margin:0;overflow:hidden}svg{display:block;max-width:calc(100% - 1px)}</style>' +
            diagram
          }
        />
      )}
      <pre>
        <code>
          {tokens
            ? tokens.map((line, i) => (
                <span key={i}>
                  {line.map((token, j) => (
                    <span key={j} style={{ color: token.color }}>
                      {token.content}
                    </span>
                  ))}
                  {i < tokens.length - 1 ? '\n' : ''}
                </span>
              ))
            : text}
        </code>
      </pre>
    </div>
  );
}
const OpenLinkContext = createContext<((url: string) => void) | undefined>(undefined);
function MarkdownLink({ href, children }: { href?: string | undefined; children?: ReactNode }) {
  const onLink = useContext(OpenLinkContext);
  return href ? (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onLink?.(href);
      }}
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
const markdownComponents: Components = {
  a: MarkdownLink,
  img: ({ alt }) => (
    <span className="chat-media">图片：{alt || '外部图片'}（外部图片未自动加载）</span>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) =>
    className || String(children).includes('\n') ? (
      <Code
        language={className?.replace('language-', '') ?? ''}
        text={String(children).replace(/\n$/, '')}
      />
    ) : (
      <code>{children}</code>
    ),
  table: ({ children }) => <Table>{children}</Table>,
};
export function ChatMarkdown({
  text,
  streaming,
  onLink,
}: {
  text: string;
  streaming?: boolean;
  onLink?: (url: string) => void;
}) {
  if (streaming) return <pre className="chat-stream">{text}</pre>;
  return (
    <div className="chat-markdown">
      <OpenLinkContext.Provider value={onLink}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { trust: false, strict: 'warn' }]]}
          urlTransform={safeChatURL}
          components={markdownComponents}
        >
          {text}
        </ReactMarkdown>
      </OpenLinkContext.Provider>
    </div>
  );
}
