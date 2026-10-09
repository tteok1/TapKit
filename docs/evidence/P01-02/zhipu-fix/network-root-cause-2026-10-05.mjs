// Bounded anonymous transport diagnostics. No Key, vault, model body or Electron.
import { readFileSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import tls from 'node:tls';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const host = 'open.bigmodel.cn';
const root = new URL('../../../../', import.meta.url);
const sourcePath = new URL('packages/providers/src/api/http.ts', root);
const outputPath = process.argv[2];
const postOnly = process.argv.includes('--post-only');
if (!outputPath) throw new Error('A report path is required.');
const safeError = (error) => ({
  name: typeof error?.name === 'string' ? error.name : null,
  code: typeof error?.code === 'string' ? error.code : null,
  syscall: typeof error?.syscall === 'string' ? error.syscall : null,
  publicCode: error?.detail?.code ?? null,
});
const report = {
  time: new Date().toISOString(), node: process.version,
  keyRead: false, modelRequests: 0, configurationChanged: false,
  env: Object.fromEntries(['TAPKIT_HTTP_PROXY', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'].map((name) => [name, Boolean(process.env[name])])),
  dns: null, tls: [], production: null,
};
try {
  report.dns = await lookup(host, { all: true, verbatim: true });
} catch (error) {
  report.dns = { error: safeError(error) };
}
if (Array.isArray(report.dns)) {
  const source = readFileSync(sourcePath, 'utf8');
  report.sourceSha256 = createHash('sha256').update(source).digest('hex');
  let events = [];
  const originalRequest = https.request;
  https.request = function (...args) {
    let request;
    try { request = originalRequest.apply(this, args); }
    catch (error) { events.push({ event: 'request-throw', error: safeError(error) }); throw error; }
    request.on('socket', (socket) => {
      events.push({ event: 'socket' });
      socket.on('connect', () => events.push({ event: 'tcp-connect' }));
      socket.on('secureConnect', () => events.push({ event: 'tls-connect', authorized: socket.authorized }));
      socket.on('error', (error) => events.push({ event: 'socket-error', error: safeError(error) }));
    });
    request.on('response', (response) => events.push({ event: 'response', status: response.statusCode }));
    request.on('error', (error) => events.push({ event: 'request-error', error: safeError(error) }));
    return request;
  };
  syncBuiltinESMExports();
  const module = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64'));
  const publicRows = report.dns.filter((row) => module.isPublicAddress(row.address));
  report.tls = await Promise.all((postOnly ? [] : publicRows.slice(0, 2)).map((row) => new Promise((resolve) => {
    const started = Date.now();
    const socket = tls.connect({ host: row.address, port: 443, servername: host, rejectUnauthorized: true });
    let tcpConnected = false;
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true; clearTimeout(timer); socket.destroy();
      resolve({ address: row.address, milliseconds: Date.now() - started, tcpConnected, ...value });
    };
    const timer = setTimeout(() => finish({ status: 'timeout' }), 8000);
    socket.on('connect', () => { tcpConnected = true; });
    socket.on('secureConnect', () => finish({ status: 'tls-ok', authorized: socket.authorized }));
    socket.on('error', (error) => finish({ status: 'error', error: safeError(error) }));
  })));
  const started = Date.now();
  try {
    // Same production DNS/IP/SNI/TLS/Agent path; GET models without credentials.
    // No model generation, body, Authorization or redirect follow.
    const path = postOnly ? '/api/paas/v4/chat/completions' : '/api/paas/v4/models';
    const method = postOnly ? 'POST' : 'GET';
    const response = await module.secureApiFetch('https://' + host + path, {
      method, headers: postOnly ? { accept: 'text/event-stream', 'content-type': 'application/json' } : { accept: 'application/json' },
      ...(postOnly ? { body: '{}' } : {}), signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    report.production = { method, path, status: response.status, milliseconds: Date.now() - started, events };
    await response.body?.cancel();
  } catch (error) {
    report.production = { error: safeError(error), milliseconds: Date.now() - started, events };
  } finally {
    https.request = originalRequest; syncBuiltinESMExports();
  }
}
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
