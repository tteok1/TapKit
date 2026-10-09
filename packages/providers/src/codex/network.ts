import * as http from 'node:http';
import { CodexFailure } from './errors';

type ProxyEnv = { http_proxy?: string; https_proxy?: string; no_proxy?: string };
export function configureProviderNetwork(env: NodeJS.ProcessEnv = process.env): () => void {
  const manual = env.TAPKIT_HTTP_PROXY;
  const httpProxy = manual ?? env.http_proxy ?? env.HTTP_PROXY;
  const httpsProxy = manual ?? env.https_proxy ?? env.HTTPS_PROXY;
  if (!httpProxy && !httpsProxy && manual === undefined) return () => {};
  const proxyEnv: ProxyEnv = {
    ...(httpProxy ? { http_proxy: httpProxy } : {}),
    ...(httpsProxy ? { https_proxy: httpsProxy } : {}),
    // Node ignores an empty proxy map. A valid, bypassed endpoint creates
    // a fresh direct dispatcher; NO_PROXY=* prevents connecting to it.
    ...(manual === ''
      ? { http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', no_proxy: '*' }
      : { no_proxy: env.no_proxy ?? env.NO_PROXY ?? 'localhost,127.0.0.1,[::1]' }),
  };
  for (const address of [httpProxy, httpsProxy]) {
    if (!address) continue;
    try {
      const url = new URL(address);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('Invalid proxy');
    } catch {
      throw new CodexFailure({ code: 'NETWORK_ERROR', retryable: false });
    }
  }
  // Electron 44 embeds Node 24.20; the repo runtime is Node 24.21. This API
  // configures both global fetch and node:http without adding a proxy dependency.
  const configure = (
    http as typeof http & {
      setGlobalProxyFromEnv?: (env: ProxyEnv) => () => void;
    }
  ).setGlobalProxyFromEnv;
  if (!configure) throw new CodexFailure({ code: 'NETWORK_ERROR', retryable: false });
  try {
    return configure(proxyEnv);
  } catch {
    throw new CodexFailure({ code: 'NETWORK_ERROR', retryable: false });
  }
}
