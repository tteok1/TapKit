# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P01-01.utility.spec.ts >> P01-01 desktop utility Core probes text and tools when the SSE MIME header is missing
- Location: tests\e2e\P01-01.utility.spec.ts:9:3

# Error details

```
Error: {"taskId":"P01-01","status":"failed","requestCount":0,"errorCode":"NETWORK_ERROR","reason":"proxy_resolution_failed"}

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { mkdtemp, mkdir } from 'node:fs/promises';
  3  | import { resolve } from 'node:path';
  4  | import { createRequire } from 'node:module';
  5  | import { spawnSync } from 'node:child_process';
  6  | import { lockedEnv, root } from '../../scripts/lib.mjs';
  7  | 
  8  | for (const mode of ['success', 'gateway', 'missing-mime'])
  9  |   test(
  10 |     'P01-01 desktop utility Core ' +
  11 |       (mode === 'gateway'
  12 |         ? 'returns safe gateway diagnostics through IPC'
  13 |         : mode === 'missing-mime'
  14 |           ? 'probes text and tools when the SSE MIME header is missing'
  15 |           : 'probes text and tools through the compiled model API'),
  16 |     async () => {
  17 |       await mkdir('.test-data', { recursive: true });
  18 |       const directory = await mkdtemp(resolve('.test-data', 'P01-01-utility-'));
  19 |       const env: NodeJS.ProcessEnv = lockedEnv({
  20 |         TAPKIT_CORE_DATA_DIR: directory,
  21 |         TAPKIT_APP_ROOT: root,
  22 |         TAPKIT_UTILITY_FIXTURE: mode,
  23 |       });
  24 |       delete env.ELECTRON_RUN_AS_NODE;
  25 |       const result = spawnSync(
  26 |         createRequire(import.meta.url)('electron'),
  27 |         [resolve('tests/fixtures/P01-01.utility.cjs')],
  28 |         {
  29 |           cwd: root,
  30 |           env,
  31 |           windowsHide: true,
  32 |           timeout: 30000,
  33 |           encoding: 'utf8',
  34 |         },
  35 |       );
  36 |       expect(Boolean(result.error), 'utility fixture failed to start').toBe(false);
  37 |       const diagnostic = result.stdout.match(/\{"taskId":"P01-01"[^\n]+/)?.[0] ?? 'startup';
> 38 |       expect(result.status, diagnostic).toBe(0);
     |                                         ^ Error: {"taskId":"P01-01","status":"failed","requestCount":0,"errorCode":"NETWORK_ERROR","reason":"proxy_resolution_failed"}
  39 |       expect(result.stdout).toContain('"requestCount":' + (mode === 'gateway' ? '1' : '2'));
  40 |       if (mode === 'gateway') expect(result.stdout).toContain('"reason":"unexpected_content_type"');
  41 |       expect(result.stdout).not.toMatch(/private token|<html>|\.mock|mock-refresh/);
  42 |     },
  43 |   );
  44 | 
```