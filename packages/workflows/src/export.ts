import { Marked } from 'marked';
import type { ExportDocument } from '@tapkit/contracts';
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export function redactExport(value: string) {
  return value
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [已移除]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|tvly-[A-Za-z0-9_-]{8,})/g, '[凭据已移除]')
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret|token|密码|密钥)\s*[：:=]\s*)["']?[^\s"'`,;，；<>]+["']?/gi,
      '$1[已移除]',
    )
    .replace(/\b[A-Za-z]:[\\/][^\s"'`<>，；。)\]]*/g, '[本机路径已移除]')
    .replace(/\\\\[^\s"'`<>，；。)\]]+/g, '[本机路径已移除]')
    .replace(
      /(?:file|tapkit-artifact|tapkit|blob|javascript|data):[^\s"'`<>，；。)\]]+/gi,
      '[内部或执行链接已移除]',
    )
    .replace(
      /(?:^|\s)\/(?:Users|home|tmp|var|private|etc)\/[^\s"'`<>，；。)\]]*/g,
      ' [本机路径已移除]',
    );
}
function safeMarkdown(value: string) {
  let fence = '';
  return value
    .split('\n')
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker[0]!;
        else if (marker[0] === fence) fence = '';
        return line;
      }
      if (fence || /^ {4}/.test(line)) return line;
      return line
        .split(/(`+[^`]*`+)/g)
        .map((part) =>
          part.startsWith('`')
            ? part
            : part.replaceAll('<', '&lt;').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1（图片未包含）'),
        )
        .join('');
    })
    .join('\n');
}
function safeUrl(raw: string, allowed: Set<string>, files: Set<string>) {
  if (/^#source-[1-9]\d{0,3}$/.test(raw)) return raw;
  if (files.has(raw) && !/[\\\x00-\x1f]|\.\.|%2e|%2f|%5c/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return allowed.has(url.href) ? url.href : '';
  } catch {
    return '';
  }
}
export function renderExport(doc: ExportDocument, fontData = '') {
  const allowed = new Set(
    doc.sources.flatMap((source) =>
      source.url && source.available ? [new URL(source.url).href] : [],
    ),
  );
  const fileUrl = (path: string) =>
    'attachments/' + path.split('/').map(encodeURIComponent).join('/');
  const files = new Set(doc.files.map((file) => fileUrl(file.relativePath)));
  const markdown =
    '# ' +
    safeMarkdown(doc.title.replace(/[\r\n]/g, ' ')) +
    '\n\n' +
    doc.messages
      .map(
        (message) =>
          '## ' +
          (message.role === 'user' ? '用户' : 'TapKit') +
          (message.status === 'final' ? '' : '（未完成版本）') +
          '\n\n' +
          safeMarkdown(message.text),
      )
      .join('\n\n') +
    (doc.sources.length
      ? '\n\n## 来源\n\n' +
        doc.sources
          .map(
            (source) =>
              `<a id="source-${source.number}"></a>\n\n### 来源 ${source.number}：${safeMarkdown(source.title.replace(/[\r\n]/g, ' '))}\n\n${safeMarkdown(source.detail)}\n\n${source.url ?? ''}\n\n${safeMarkdown(source.excerpt)}\n\n${source.available ? '' : '来源无法核验，请返回原会话补充材料。'}`,
          )
          .join('\n\n')
      : '') +
    (doc.files.length
      ? '\n\n## 包内文件\n\n' +
        doc.files.map((file) => `[${file.name}](${fileUrl(file.relativePath)})`).join('\n\n')
      : '') +
    (doc.process.length
      ? '\n\n## 公开过程摘要\n\n' +
        doc.process.map((line) => '- ' + safeMarkdown(redactExport(line))).join('\n')
      : '');
  const parser = new Marked({ gfm: true, async: false });
  parser.use({
    renderer: {
      html({ text }) {
        return /^<a id="source-[1-9]\d{0,3}"><\/a>\s*$/.test(text) ? text : escape(text);
      },
      image({ text }) {
        return '<span>' + escape(text) + '（图片未包含）</span>';
      },
      link({ href, tokens }) {
        const url = safeUrl(href, allowed, files),
          label = this.parser.parseInline(tokens);
        return url ? `<a href="${escape(url)}" rel="noreferrer noopener">${label}</a>` : label;
      },
    },
  });
  const body = parser.parse(markdown, { async: false });
  const font = /^[A-Za-z0-9+/]+=*$/.test(fontData)
    ? `@font-face{font-family:TapKitExport;src:url(data:font/otf;base64,${fontData}) format('opentype');font-weight:100 900}`
    : '';
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(doc.title)}</title><style>${font}
    *{box-sizing:border-box}html{color-scheme:light}body{margin:0 auto;padding:24px;max-width:900px;color:#242b27;background:#fff;font:16px/1.75 TapKitExport,'Microsoft YaHei',sans-serif;overflow-wrap:anywhere}h1{font-size:28px}h2{font-size:22px;margin-top:32px}h3{font-size:18px}h1,h2,h3{break-after:avoid}a{color:#3c6650}pre{padding:12px;border:1px solid #e1e9e3;white-space:pre-wrap;overflow-wrap:anywhere}code{font-family:monospace,TapKitExport;white-space:pre-wrap}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #66736b;padding:6px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}blockquote{margin-left:0;padding-left:12px;border-left:1px solid #66736b}p{orphans:3;widows:3}@page{size:A4;margin:18mm}@media print{body{max-width:none;padding:0;font-size:11pt}pre{font-size:9pt}a{color:inherit;text-decoration:none}}
    </style></head><body>${body}</body></html>`;
  const text = markdown
    .replace(/<a id="source-\d+"><\/a>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1（图片未包含）')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^```[^\n]*\n/gm, '')
    .replace(/^```\s*$/gm, '');
  return { markdown, text, html };
}
