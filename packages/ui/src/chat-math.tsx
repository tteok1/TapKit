import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { MarkdownBody, type MarkdownTextProps } from './chat-markdown';

export function MathMarkdown(props: MarkdownTextProps) {
  return (
    <MarkdownBody
      {...props}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { trust: false, strict: 'warn' }]]}
    />
  );
}
