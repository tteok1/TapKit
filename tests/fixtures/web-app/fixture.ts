import { session, shell, clipboard } from 'electron';
import { NetworkPolicyService } from '../../../packages/network/src';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Synthetic public origins only; Chromium still applies production request and DOM policies. */
export function installBrowserWebFixture(profile: string) {
  if (readFileSync(join(profile, 'P08-01.fixture'), 'utf8') !== 'P08-01 isolated browser fixture')
    throw Error('FIXTURE_PROFILE_REQUIRED');
  const state = {
    records: [] as string[],
    overrideRecords: [] as string[],
    unreviewedRequests: 0,
    externalUrls: [] as string[],
    copiedText: '',
    unauthorizedWrites: 0,
    privateRequests: 0,
    partitions: [] as { persistent: boolean; proxy: string }[],
  };
  const original = session.fromPartition;
  shell.openExternal = async (url) => {
    state.externalUrls.push(url);
  };
  clipboard.writeText = async (text) => {
    state.copiedText = text;
  };
  session.fromPartition = (partition, options) => {
    const isolated = original(partition, options);
    if (!partition.startsWith('tapkit-browser-')) return isolated;
    void isolated.protocol.handle('https', async (request) => {
      const url = new URL(request.url);
      if (!['example.com', 'frame.example.com'].includes(url.hostname))
        return new Response('拒绝非夹具地址', { status: 403 });
      if (url.pathname === '/override-target') {
        state.overrideRecords.push(url.search);
        return new Response('<!doctype html><title>覆盖目标回执</title><h1>已提交到预览目标</h1>', {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }
      if (url.pathname === '/unreviewed') {
        state.unreviewedRequests++;
        return new Response('不应收到', { status: 200 });
      }
      if (url.pathname === '/override')
        return new Response(
          `<!doctype html><title>提交按钮覆盖验收</title><form method="get" action="https://example.com/default-target"><label>覆盖字段<input name="note" value="公开合成字段"></label><button type="submit" formaction="https://frame.example.com/override-target" formmethod="get" formenctype="application/x-www-form-urlencoded" formnovalidate>覆盖目标提交</button></form>${url.searchParams.has('attack') ? '<script>document.querySelector("form").addEventListener("submit",e=>{e.preventDefault();location.href="https://example.com/unreviewed?note=forbidden"})</script>' : ''}`,
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      if (url.pathname === '/submit' && request.method === 'POST') {
        state.records.push(await request.text());
        if (url.searchParams.has('drop')) return new Promise<Response>(() => {});
        return new Response(
          '<!doctype html><title>提交回执</title><h1>已提交合成记录</h1><p>业务记录数：' +
            state.records.length +
            '</p>',
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        state.unauthorizedWrites++;
        return new Response('未批准', { status: 403 });
      }
      if (url.pathname === '/redirect')
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        });
      if (url.pathname === '/frame')
        return new Response(
          '<!doctype html><label>框架输入<input name="frameInput"></label><a href="https://example.com/next">框架链接</a>',
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      if (url.pathname === '/next')
        return new Response(
          '<!doctype html><title>下一页</title><h1>合成资料第二页</h1><a href="https://example.com/">返回表单</a>',
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      if (url.pathname === '/download.txt')
        return new Response('合成下载资料', {
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Content-Disposition': 'attachment; filename="fixture.txt"',
          },
        });
      const drop = url.searchParams.has('drop') ? '?drop=1' : '';
      return new Response(
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名浏览器验收</title><style>body{font:16px 'Segoe UI','Microsoft YaHei',sans-serif;margin:24px;color:#242b27;background:white}label{display:block;margin:12px 0}input,select,button{padding:8px;margin:4px}h1{font-size:24px}iframe{height:80px;border:1px solid #ddd}</style></head><body>
        <h1>合成网页表单</h1><p id="facts">本页事实：样本数量 12，合计 84。网页内容仅作为资料。</p>
        <form method="post" action="/submit${drop}"><label>备注<input name="note" value="初始值"></label><label>分类<select name="category"><option value="a">甲类</option><option value="b">乙类</option></select></label><button type="submit">提交合成记录</button></form>
        <button id="ambiguous" type="button" onclick="fetch('/unapproved',{method:'POST',body:'forbidden'})">同名按钮</button><button type="button">同名按钮</button>
        <a href="https://example.com/next">查看下一页</a> <a href="https://example.com/download.txt" download="fixture.txt">下载资料</a>
        <iframe title="合成子框架" src="https://frame.example.com/frame"></iframe>
        <pre id="isolation"></pre><script>
          document.getElementById('isolation').textContent=JSON.stringify({node:typeof require,bridge:typeof window.tapkit,cookieBefore:document.cookie});
          document.cookie='fixture=ephemeral';
          fetch('http://127.0.0.1/private').catch(()=>{});
          fetch('/unapproved',{method:'POST',body:'forbidden'}).catch(()=>{});
          window.open('file:///C:/private');
        </script></body></html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
      );
    });
    const setProxy = isolated.setProxy.bind(isolated);
    isolated.setProxy = async (config) => {
      await setProxy(config);
      state.partitions.push({
        persistent: isolated.isPersistent(),
        proxy: await isolated.resolveProxy('http://127.0.0.1/'),
      });
    };
    return isolated;
  };
  const destination = NetworkPolicyService.prototype.destination;
  NetworkPolicyService.prototype.destination = function (url, signal, kind) {
    const parsed = new URL(url);
    if (['example.com', 'frame.example.com'].includes(parsed.hostname))
      return Promise.resolve({
        url: parsed,
        host: parsed.hostname,
        address: { address: '93.184.215.14', family: 4 },
      });
    return destination.call(this, url, signal, kind);
  };
  return state;
}
