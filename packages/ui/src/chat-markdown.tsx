import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { safeChatURL, safeMermaidText } from './chat-safety';
export { safeChatURL } from './chat-safety';
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
            themes: ['github-dark'],
            engine: shiki.createJavaScriptRegexEngine(),
          });
          try {
            const result = highlighter.codeToTokens(text, { lang, theme: 'github-dark' });
            if (!stopped) setTokens(result.tokens);
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
        <button onClick={() => void navigator.clipboard.writeText(text)}>复制代码</button>
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
                  {'\n'}
                </span>
              ))
            : text}
        </code>
      </pre>
    </div>
  );
}
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
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: 'warn' }]]}
        urlTransform={safeChatURL}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  onLink?.(href);
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
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
          table: ({ children }) => (
            <div className="chat-table">
              <button
                onClick={(e) => {
                  const table = e.currentTarget.parentElement?.querySelector('table');
                  if (table)
                    void navigator.clipboard.writeText(
                      [...table.rows]
                        .map((r) => [...r.cells].map((c) => c.innerText).join('\t'))
                        .join('\n'),
                    );
                }}
              >
                复制表格
              </button>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
