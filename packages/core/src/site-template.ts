import type { SiteBrief } from '@tapkit/contracts';
import reactLock from './site-react-lock.json' with { type: 'json' };

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const pagesFor = (brief: SiteBrief) =>
  brief.pages.map((title, i) => ({
    title,
    file: i ? 'page-' + (i + 1) + '.html' : 'index.html',
  }));

function document(title: string, body: string, assets: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${assets}
</head>
<body>
${body}
</body>
</html>
`;
}

const htmlBuild = `import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const out = process.argv[2] === '--outDir' ? process.argv[3] : 'dist';
await mkdir(out, { recursive: true });
for (const file of FILES) await copyFile(file, join(out, file));
`;
const interactive = `const key = 'site-notes';
const field = document.querySelector('#notes');
field.value = localStorage.getItem(key) ?? '';
field.addEventListener('input', () => localStorage.setItem(key, field.value));
`;
const reactApp = `import React, { createRoot, useState } from './runtime.js';
import content from './content.js';

const h = React.createElement;
function Site() {
  const selected = Number(new URLSearchParams(location.search).get('page'));
  const page = Number.isInteger(selected) && content.pages[selected] ? selected : 0;
  const [notes, setNotes] = useState(() => localStorage.getItem('site-notes') ?? '');
  return h(React.Fragment, null,
    h('header', null, h('strong', null, content.goal),
      h('nav', { 'aria-label': '页面' }, content.pages.map((title, i) =>
        h('a', { key: i, href: '?page=' + i, 'aria-current': i === page ? 'page' : undefined }, title)))),
    h('main', null, h('h1', null, content.pages[page]),
      content.audience && h('p', null, content.audience),
      h('label', { htmlFor: 'notes' }, '本地笔记'),
      h('textarea', { id: 'notes', rows: 3, value: notes, onChange: (event) => {
        setNotes(event.target.value);
        localStorage.setItem('site-notes', event.target.value);
      } })));
}
createRoot(document.getElementById('root')).render(h(Site));
`;
const reactBuild = `import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = process.argv[2] === '--outDir' ? process.argv[3] : 'dist';
await mkdir(outDir, { recursive: true });
for (const name of ['index.html', 'style.css', 'content.js', 'app.js'])
  await copyFile(name, join(outDir, name));

// Link the locked production modules without launching dependency scripts or native bundlers.
const sources = {
  react: 'react/cjs/react.production.js',
  'react-dom': 'react-dom/cjs/react-dom.production.js',
  'react-dom/client': 'react-dom/cjs/react-dom-client.production.js',
  scheduler: 'scheduler/cjs/scheduler.production.js',
};
const factories = [];
for (const [name, path] of Object.entries(sources)) {
  const code = await readFile(join('node_modules', path), 'utf8');
  factories.push(JSON.stringify(name) + ': (module, exports, require) => {\\n' + code + '\\n}');
}
await writeFile(join(outDir, 'runtime.js'), [
  'const factories = {' + factories.join(',\\n') + '};',
  'const modules = Object.create(null);',
  'function load(name) {',
  '  if (modules[name]) return modules[name].exports;',
  '  const factory = Object.hasOwn(factories, name) && factories[name];',
  '  if (!factory) throw new Error("Unknown module " + name);',
  '  const module = modules[name] = { exports: {} };',
  '  factory(module, module.exports, load);',
  '  return module.exports;',
  '}',
  'const React = load("react");',
  'export default React;',
  'export const useState = React.useState;',
  'export const createRoot = load("react-dom/client").createRoot;',
].join('\\n'));
`;

export function siteTemplate(brief: SiteBrief): Record<string, string> {
  const isReact = brief.template === 'react';
  const manifest = {
    name: 'tapkit-site',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'node build.mjs',
      ...(isReact ? { 'build:vite': 'vite build --base ./' } : {}),
    },
    ...(isReact
      ? {
          dependencies: reactLock.packages[''].dependencies,
          devDependencies: reactLock.packages[''].devDependencies,
          overrides: {
            rollup: 'npm:@rollup/wasm-node@' + reactLock.packages['node_modules/rollup'].version,
          },
        }
      : {}),
  };
  const toJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const files: Record<string, string> = {
    'package.json': toJson(manifest),
    'package-lock.json': toJson(
      isReact
        ? reactLock
        : {
            name: manifest.name,
            version: manifest.version,
            lockfileVersion: 3,
            requires: true,
            packages: { '': { name: manifest.name, version: manifest.version } },
          },
    ),
    'README.md':
      '# 网站源码\n\n使用 Node.js 24 执行 `npm ci --ignore-scripts`，再执行 `npm run build`。\n\n将 `dist` 目录交给本地静态文件服务，打开 `index.html`。\n' +
      (isReact
        ? '\n也可以在独立的开发环境执行 `npm run build:vite`，用 Vite 打包同一套源码。\n'
        : ''),
    'style.css': `:root{color-scheme:light;--paper:${brief.style === 'studio' ? '#eaf1ed' : '#faf5ea'};--ink:${brief.style === 'studio' ? '#153c31' : '#392d20'};font:16px/1.65 system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);background:var(--paper)}
header,main{width:min(100% - 2rem,56rem);margin-inline:auto}
header{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;padding-block:1.25rem;border-bottom:1px solid currentColor}
nav{display:flex;flex-wrap:wrap;gap:1rem}
a{color:inherit;text-underline-offset:.25em}
a[aria-current]{font-weight:700}
main{padding-block:clamp(2rem,8vw,5rem)}
h1{font-size:clamp(2rem,7vw,4.5rem);line-height:1.08;letter-spacing:-.035em;overflow-wrap:anywhere;margin-block:0 .45em}
label{display:block;margin-top:2rem}
textarea{font:inherit;display:block;width:min(100%,36rem);padding:.5rem;color:inherit;background:white;border:1px solid currentColor;border-radius:.3rem}
:focus-visible{outline:2px solid currentColor;outline-offset:3px}
`,
  };
  if (isReact)
    return {
      ...files,
      'index.html': document(
        brief.goal,
        '<div id="root"></div>',
        '<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script>',
      ),
      'app.js': reactApp,
      'build.mjs': reactBuild,
      'content.js':
        'export default ' +
        toJson({ goal: brief.goal, audience: brief.audience, pages: brief.pages }),
      'runtime.js':
        "export { default, useState } from 'react';\nexport { createRoot } from 'react-dom/client';\n",
    };
  const pages = pagesFor(brief);
  for (const { title, file } of pages) {
    const nav = pages
      .map(
        (entry) =>
          `<a href="./${entry.file}"${entry.file === file ? ' aria-current="page"' : ''}>${escapeHtml(entry.title)}</a>`,
      )
      .join('');
    files[file] = document(
      title,
      `<header><strong>${escapeHtml(brief.goal)}</strong><nav aria-label="页面">${nav}</nav></header>
<main><h1>${escapeHtml(title)}</h1>${brief.audience ? `<p>${escapeHtml(brief.audience)}</p>` : ''}
<label for="notes">本地笔记</label><textarea id="notes" rows="3"></textarea></main>`,
      '<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script>',
    );
  }
  return {
    ...files,
    'app.js': interactive,
    'build.mjs': htmlBuild.replace(
      'FILES',
      JSON.stringify([...pages.map((p) => p.file), 'style.css', 'app.js']),
    ),
  };
}
