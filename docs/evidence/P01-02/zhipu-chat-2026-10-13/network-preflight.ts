import { lookup } from 'node:dns/promises';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  ApiFailure,
  isPublicAddress,
  secureApiFetch,
} from '../../../../packages/providers/src/api/http';

async function main() {
  const root = resolve(process.argv[2] ?? '.');
  const endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const report: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    endpoint,
    credentialUsed: false,
    modelRequests: 0,
    method: 'GET',
    productionTransport: true,
    publicDNS: null,
    nonPublicAddressClass: null,
    transportReached: false,
    anonymousHttpStatus: null,
    errorCode: null,
  };
  try {
    const addresses = await lookup('open.bigmodel.cn', { all: true, verbatim: true });
    report.publicDNS =
      addresses.length > 0 && addresses.every((row) => isPublicAddress(row.address));
    if (!report.publicDNS)
      report.nonPublicAddressClass = addresses.some((row) => /^198\.(18|19)\./.test(row.address))
        ? 'benchmark-range-fake-ip'
        : 'private-or-special';
    if (!report.publicDNS) throw new ApiFailure({ code: 'PERMISSION_DENIED', retryable: false });
    // No Authorization header, Key, POST body or model prompt. Do not read response content.
    const response = await secureApiFetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(25_000),
    });
    report.transportReached = true;
    report.anonymousHttpStatus = response.status;
    await response.body?.cancel();
  } catch (error) {
    report.errorCode = error instanceof ApiFailure ? error.detail.code : 'NETWORK_ERROR';
  }
  if (!process.argv.includes('--check-only'))
    writeFileSync(
      join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/network-preflight-with-dns.json'),
      JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx' },
    );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.transportReached ? 0 : 1;
}
void main();
