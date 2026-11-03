import { app } from 'electron';
import { writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { connect as tlsConnect, checkServerIdentity } from 'node:tls';
import { resolve } from 'node:path';
import { NetworkPolicyService, publicAddress, pinnedSocket } from '../../packages/network/src';
import { resolveNetworkProxy, apiFetchForNetwork } from '../../packages/providers/src/api/http';
import { resolveSystemProxy } from '../../apps/desktop/src/main/system-proxy';
import { AnonymousReader, configureAnonymousNetwork } from '../../apps/desktop/src/main/browser';
import { WebTools, extractPage } from '../../packages/tools/src/web';

// Explicit no-model diagnostic. Public test queries only; no account, vault, or model access.
configureAnonymousNetwork();
app.setPath('userData', resolve('.test-data/P08-02-network-electron'));
const network = JSON.parse(process.env.TAPKIT_P08_NETWORK_SETTINGS!);
delete process.env.TAPKIT_P08_NETWORK_SETTINGS;
const directOnly = process.env.TAPKIT_P08_DIRECT_DIAG === '1';
if (directOnly) {
  network.mode = 'direct';
  network.proxyURL = '';
}
const report: Record<string, unknown> = {
  scope: 'same production transport, no model requests',
  mode: network.mode,
  checks: [],
};
const checks = report.checks as Record<string, unknown>[];
const searchOnly = process.env.TAPKIT_P08_SEARCH_DIAG === '1';
const routingCheck = process.env.TAPKIT_P08_ROUTING_DIAG === '1';
const safeCode = (error: unknown) => {
  const e = error as { code?: string; message?: string; detail?: { diagnosticCode?: string } };
  return (
    e.detail?.diagnosticCode ??
    e.code ??
    (/^[A-Z_]{3,55}$/.test(e.message ?? '')
      ? e.message
      : (/ERR_[A-Z_]+/.exec(e.message ?? '')?.[0] ?? 'UNKNOWN_ERROR'))
  );
};
void (async () => {
  await app.whenReady();
  if (process.env.TAPKIT_P08_TLS_DIAG === '1') {
    const url = new URL('https://open.bigmodel.cn/'),
      addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw Error('PERMISSION_DENIED');
    const proxy = await resolveNetworkProxy(
      network,
      url,
      async (value) => (await resolveSystemProxy({ url: value })).proxyURL,
      AbortSignal.timeout(10000),
    );
    const checks: Record<string, unknown>[] = [];
    for (const [route, proxyURL] of [
      ['direct', ''],
      ['configured', proxy],
    ] as const) {
      for (const [index, address] of addresses.slice(0, 4).entries()) {
        const started = Date.now(),
          row: Record<string, unknown> = {
            route,
            proxyUsed: !!proxyURL,
            addressIndex: index,
            family: address.family,
            public: true,
          };
        let remote: import('node:net').Socket | undefined,
          tls: import('node:tls').TLSSocket | undefined;
        try {
          const signal = AbortSignal.timeout(10000);
          remote = await pinnedSocket({ url, host: url.hostname, address }, proxyURL, signal);
          row.tcpMs = Date.now() - started;
          tls = tlsConnect({
            socket: remote,
            servername: url.hostname,
            rejectUnauthorized: true,
            checkServerIdentity: (_name, cert) => checkServerIdentity(url.hostname, cert),
          });
          await new Promise<void>((done, reject) => {
            const abort = () => {
              tls?.destroy();
              reject(Error('CANCELLED'));
            };
            signal.addEventListener('abort', abort, { once: true });
            tls!.once('secureConnect', () => {
              signal.removeEventListener('abort', abort);
              done();
            });
            tls!.once('error', (error) => {
              signal.removeEventListener('abort', abort);
              reject(error);
            });
          });
          row.tlsVerified = true;
        } catch (error) {
          row.error = safeCode(error);
        } finally {
          tls?.destroy();
          remote?.destroy();
        }
        row.elapsedMs = Date.now() - started;
        checks.push(row);
      }
    }
    const httpChecks: Record<string, unknown>[] = [];
    for (const route of ['direct', 'configured'] as const) {
      const stages: { stage: string; elapsedMs: number }[] = [],
        started = Date.now();
      const allowed = new Set([
        'dns_complete',
        'proxy_resolved',
        'socket_assigned',
        'tcp_connected',
        'tls_connected',
        'request_finished',
        'response_headers',
        'request_error',
      ]);
      try {
        const fetch = apiFetchForNetwork(
          route === 'direct' ? { mode: 'direct', proxyURL: '' } : network,
          async (value) => (await resolveSystemProxy({ url: value })).proxyURL,
          (stage, elapsedMs) => {
            if (allowed.has(stage)) stages.push({ stage, elapsedMs });
          },
          10000,
        );
        const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(12000) });
        await response.body?.cancel();
        httpChecks.push({
          route,
          transport: 'production API HTTP transport',
          status: response.status,
          elapsedMs: Date.now() - started,
          stages,
        });
      } catch (error) {
        httpChecks.push({
          route,
          transport: 'production API HTTP transport',
          error: safeCode(error),
          elapsedMs: Date.now() - started,
          stages,
        });
      }
      try {
        const reply = await new NetworkPolicyService({
          proxy: async () => (route === 'direct' ? '' : proxy),
        }).request(url.href, { signal: AbortSignal.timeout(10000), limit: 128000 });
        httpChecks.push({
          route,
          transport: 'production anonymous HTTP transport',
          status: reply.status,
          bytes: reply.bytes.length,
        });
      } catch (error) {
        httpChecks.push({
          route,
          transport: 'production anonymous HTTP transport',
          error: safeCode(error),
        });
      }
    }
    const value = {
      scope:
        'TCP/TLS handshake plus unauthenticated GET of public https://open.bigmodel.cn/ only; no API endpoint, account, key, model request, body logging or connection-button click',
      checks,
      httpChecks,
    };
    writeFileSync(
      resolve('docs/evidence/P08-02/model-transport-diagnosis.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
    console.log(JSON.stringify(value));
    app.quit();
    return;
  }
  const urls = directOnly
    ? [
        'https://www.bing.com/search?q=' +
          encodeURIComponent('IANA What resources does IANA coordinate?'),
        'https://www.iana.org/',
        'https://larus.net/cn/blog/what-is-iana/',
      ]
    : routingCheck
      ? [
          'https://www.bing.com/search?q=iana',
          'https://www.bing.com/search?q=IANA+example+domains&form=QBLH',
          'https://www.bing.com/search?q=IANA%20example%20domains&ensearch=1',
        ]
      : searchOnly
        ? ['IANA example domains', 'RFC 2606', 'site:iana.org example domains'].map(
            (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q),
          )
        : [
            'https://example.com/',
            'https://www.bing.com/search?q=' +
              encodeURIComponent(
                'IANA example domains documentation RFC 2606 What are example domains reserved for?',
              ),
          ];
  for (const url of urls) {
    const check: Record<string, unknown> = { url },
      started = Date.now();
    checks.push(check);
    try {
      const addresses = await lookup(new URL(url).hostname, { all: true, verbatim: true });
      check.dns = addresses.map((a) => ({ family: a.family, public: publicAddress(a.address) }));
      const proxy = await resolveNetworkProxy(
        network,
        new URL(url),
        async (value) => (await resolveSystemProxy({ url: value })).proxyURL,
        AbortSignal.timeout(10000),
      );
      check.proxyResolved = true;
      check.proxyUsed = !!proxy;
      const wire = await new NetworkPolicyService({ proxy: async () => proxy }).request(url);
      check.static = {
        status: wire.status,
        bytes: wire.bytes.length,
        finalHost: new URL(wire.url).hostname,
      };
      if (directOnly && new URL(url).hostname !== 'www.bing.com') {
        const page = extractPage(wire.bytes.toString('utf8'), wire.url);
        check.extraction = { title: page.title, chars: page.text.length, links: page.links.length };
      }
    } catch (error) {
      check.staticError = safeCode(error);
    }
    if (!searchOnly && !routingCheck && !directOnly)
      try {
        const proxy = await resolveNetworkProxy(
          network,
          new URL(url),
          async (value) => (await resolveSystemProxy({ url: value })).proxyURL,
          AbortSignal.timeout(10000),
        );
        const page = await new AnonymousReader().read('diagnostic-' + checks.length, url, proxy);
        check.dynamic = { bytes: page.html.length, finalHost: new URL(page.url).hostname };
      } catch (error) {
        check.dynamicError = safeCode(error);
      }
    if (new URL(url).hostname === 'www.bing.com') {
      try {
        const tools = new WebTools(
          new NetworkPolicyService({
            proxy: async (target, signal) =>
              resolveNetworkProxy(
                network,
                target,
                async (value) => (await resolveSystemProxy({ url: value })).proxyURL,
                signal,
              ),
          }),
        );
        const page = await tools.read(
          { url, maxChars: 20000 },
          { mode: 'on', domains: ['bing.com'], excludeDomains: [] },
          AbortSignal.timeout(40000),
        );
        check.extraction = {
          chars: page.text.length,
          links: page.links.length,
          publicLinks: page.links
            .flatMap((link) => {
              try {
                let target = new URL(link);
                const encoded = target.searchParams.get('u');
                if (
                  target.hostname.endsWith('bing.com') &&
                  target.pathname === '/ck/a' &&
                  encoded?.startsWith('a1')
                )
                  target = new URL(Buffer.from(encoded.slice(2), 'base64url').toString('utf8'));
                return /(?:^|\.)(?:iana\.org|rfc-editor\.org)$/.test(target.hostname)
                  ? [target.href]
                  : [];
              } catch {
                return [];
              }
            })
            .slice(0, 10),
        };
        writeFileSync(
          resolve(
            'docs/evidence/P08-02/network-search-extraction' +
              (directOnly
                ? '-direct-full'
                : routingCheck
                  ? '-route-' + checks.length
                  : searchOnly
                    ? '-' + checks.length
                    : '') +
              '.json',
          ),
          JSON.stringify({ url, text: page.text, links: page.links }, null, 2) + '\n',
        );
      } catch (error) {
        check.extractionError = safeCode(error);
      }
    }
    if (routingCheck && checks.length === 1) {
      try {
        const direct = new WebTools(new NetworkPolicyService());
        const page = await direct.read(
          { url, maxChars: 20000 },
          { mode: 'on', domains: ['bing.com'], excludeDomains: [] },
          AbortSignal.timeout(20000),
        );
        check.direct = { chars: page.text.length, links: page.links.length };
        writeFileSync(
          resolve('docs/evidence/P08-02/network-search-direct.json'),
          JSON.stringify({ url, text: page.text, links: page.links }, null, 2) + '\n',
        );
      } catch (error) {
        check.directError = safeCode(error);
      }
    }
    check.elapsedMs = Date.now() - started;
    writeFileSync(
      resolve(
        'docs/evidence/P08-02/network-diagnosis' +
          (directOnly ? '-direct-full' : routingCheck ? '-routes' : searchOnly ? '-queries' : '') +
          '.json',
      ),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(JSON.stringify(check));
  }
  app.quit();
})();
