import { describe, expect, test } from 'vitest';
import { siteTemplate } from '../../packages/core/src/site-template';
import { CoreCommandSchema, SiteCommandSchemas } from '../../packages/contracts/src';

const brief = {
  goal: '工作室 <script>文字</script>',
  audience: '本地读者',
  pages: ['首页', '关于'],
  style: 'paper' as const,
};

describe('P09-04 website templates', () => {
  test('HTML escapes the brief, links pages and locks the dependency-free build', () => {
    const files = siteTemplate({ ...brief, template: 'html' });
    expect(files['index.html']).toContain('&lt;script&gt;文字&lt;/script&gt;');
    expect(files['index.html']).toContain('href="./page-2.html"');
    expect(files['page-2.html']).toContain('<h1>关于</h1>');
    expect(JSON.parse(files['package-lock.json']!).lockfileVersion).toBe(3);
    expect(files['build.mjs']).toContain('page-2.html');
  });

  test('React template locks exact versions and persists navigation and local interaction', () => {
    const files = siteTemplate({ ...brief, template: 'react' });
    const manifest = JSON.parse(files['package.json']!);
    const lock = JSON.parse(files['package-lock.json']!);
    expect(lock.packages[''].dependencies).toEqual(manifest.dependencies);
    expect(lock.packages[''].devDependencies).toEqual(manifest.devDependencies);
    expect(manifest.scripts.build).toBe('node build.mjs');
    expect(manifest.scripts['build:vite']).toBe('vite build --base ./');
    expect(files['build.mjs']).toContain('react/cjs/react.production.js');
    expect(lock.packages['node_modules/rollup'].name).toBe('@rollup/wasm-node');
    expect(files['app.js']).toContain('localStorage.setItem');
    expect(JSON.parse(files['content.js']!.replace('export default ', '')).pages).toEqual([
      '首页',
      '关于',
    ]);
  });

  test('renderer cannot supply a host path or transfer private assets', () => {
    const runId = '01930000-0000-7000-8000-000000000001';
    expect(SiteCommandSchemas['site.build'].safeParse({ runId, path: 'C:/private' }).success).toBe(
      false,
    );
    expect(
      CoreCommandSchema.safeParse({
        type: 'site.transfer',
        requestId: runId,
        runId,
        versionId: runId,
        kind: 'assets',
      }).success,
    ).toBe(false);
  });
});
