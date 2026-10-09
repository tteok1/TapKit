import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { lockedEnv, root } from '../../scripts/lib.mjs';

for (const mode of ['success', 'gateway', 'missing-mime'])
  test(
    'P01-01 desktop utility Core ' +
      (mode === 'gateway'
        ? 'returns safe gateway diagnostics through IPC'
        : mode === 'missing-mime'
          ? 'probes text and tools when the SSE MIME header is missing'
          : 'probes text and tools through the compiled model API'),
    async () => {
      await mkdir('.test-data', { recursive: true });
      const directory = await mkdtemp(resolve('.test-data', 'P01-01-utility-'));
      const env: NodeJS.ProcessEnv = lockedEnv({
        TAPKIT_CORE_DATA_DIR: directory,
        TAPKIT_APP_ROOT: root,
        TAPKIT_UTILITY_FIXTURE: mode,
      });
      delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(
        createRequire(import.meta.url)('electron'),
        [resolve('tests/fixtures/P01-01.utility.cjs')],
        {
          cwd: root,
          env,
          windowsHide: true,
          timeout: 30000,
          encoding: 'utf8',
        },
      );
      expect(Boolean(result.error), 'utility fixture failed to start').toBe(false);
      const diagnostic = result.stdout.match(/\{"taskId":"P01-01"[^\n]+/)?.[0] ?? 'startup';
      expect(result.status, diagnostic).toBe(0);
      expect(result.stdout).toContain('"requestCount":' + (mode === 'gateway' ? '1' : '2'));
      if (mode === 'gateway') expect(result.stdout).toContain('"reason":"unexpected_content_type"');
      expect(result.stdout).not.toMatch(/private token|<html>|\.mock|mock-refresh/);
    },
  );
