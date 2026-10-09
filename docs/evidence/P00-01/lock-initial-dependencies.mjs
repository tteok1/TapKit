import fs from 'node:fs/promises';
const exact = {
'electron':'44.3.0','electron-vite':'5.0.0','react':'19.3.0','react-dom':'19.3.0','typescript':'7.0.2','vite':'8.3.0','tailwindcss':'4.3.3','@tailwindcss/vite':'4.3.3','lucide-react':'1.46.0','zustand':'5.0.15','@tanstack/react-query':'5.102.8','@tanstack/react-virtual':'3.14.13','react-router':'8.3.1','better-sqlite3':'13.0.3','zod':'4.6.5','@mariozechner/pi-ai':'0.73.1','@huggingface/transformers':'4.2.0','pdfjs-dist':'6.3.289','mammoth':'1.12.3','exceljs':'4.4.0','fast-xml-parser':'5.11.1','docx':'9.7.1','pptxgenjs':'4.0.1','@tiptap/react':'3.31.3','@tiptap/starter-kit':'3.31.3','@tiptap/extension-table':'3.31.3','@tiptap/extension-link':'3.31.3','@tiptap/extension-image':'3.31.3','@xterm/xterm':'6.0.0','vitest':'5.0.0','@playwright/test':'1.63.0','electron-builder':'26.15.3','pnpm':'12.4.1'};
const paired = ['react-markdown','remark-gfm','remark-math','rehype-katex','katex','shiki','mermaid','yauzl','yazl','@types/node','@types/react','@types/react-dom','@types/better-sqlite3','@electron/rebuild','prettier','eslint','typescript-eslint','@eslint/js','semver','yaml'];
const packages = {};
await Promise.all([...Object.keys(exact),...paired].map(async name => {
 const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${exact[name] ?? (name === '@types/node' ? '24.13.4' : 'latest')}`;
 const r = await fetch(url); if (!r.ok) throw Error(`${name}: ${r.status}`);
 const m = await r.json(); packages[name] = { version:m.version, integrity:m.dist.integrity, tarball:m.dist.tarball, license:m.license, engines:m.engines ?? {}, peerDependencies:m.peerDependencies ?? {}, source:url };
 console.log(`${name}@${m.version}`);
}));
await fs.writeFile('dependency-baseline.json', JSON.stringify({schemaVersion:1,lockedAt:new Date().toISOString(),registry:'https://registry.npmjs.org',packages:Object.fromEntries(Object.entries(packages).sort())},null,2)+'\n',{flag:'wx'});
const queries = {node:'https://nodejs.org/dist/index.json',python:'https://www.python.org/ftp/python/',rust:'https://static.rust-lang.org/dist/channel-rust-stable.toml',libreoffice:'https://download.documentfoundation.org/libreoffice/stable/',git:'https://api.github.com/repos/git-for-windows/git/releases/latest'};
await Promise.all(Object.entries(queries).map(async([key,url])=>{let r=await fetch(url);let body=await r.text();if(!r.ok)throw Error(`${key}:${r.status}`);await fs.writeFile(`docs/evidence/P00-01/${key}-release-source.txt`,body);console.log(`${key} source saved`);}));