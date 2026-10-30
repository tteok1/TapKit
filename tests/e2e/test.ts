import { test as base } from '@playwright/test';
import { cleanupTestDirectories } from '../../scripts/test-temp.mjs';

export * from '@playwright/test';
export const test = base.extend<object, { temporaryDirectories: void }>({
  temporaryDirectories: [
    async ({}, use) => {
      try {
        await use();
      } finally {
        // Worker teardown runs after file/test hooks have closed Electron and SQLite.
        await cleanupTestDirectories();
      }
    },
    { scope: 'worker', auto: true },
  ],
});
