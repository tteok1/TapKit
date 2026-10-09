import { pnpm } from './lib.mjs';
import { buildDesktop } from './desktop-build.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';
const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.length >= 2 && args[0] === '--grep' && args[1] === 'P00-03') {
  // P00-03 is a foundation-only task; its specification permits the same-tag real integration suite.
  pnpm(['test:integration', 'P00-03', ...args.slice(2)]);
} else {
  // A chat fixture can only exist in an explicit test build and isolated marked profile.
  const grep = args.indexOf('--grep');
  const chatFixture = grep < 0 || (args[grep + 1] ?? '').includes('P02');
  if (!chatFixture) pnpm(['exec', 'playwright', 'test', ...args]);
  else {
    const previous = process.env.TAPKIT_TEST_BUILD;
    try {
      process.env.TAPKIT_TEST_BUILD = '1';
      buildDesktop();
      if (
        !readFileSync(join(root, 'packages/core/dist/index.cjs'), 'utf8').includes(
          'installChatFixture',
        )
      )
        throw new Error('Isolated chat fixture missing from test build');
      pnpm(['exec', 'playwright', 'test', ...args]);
    } finally {
      // Always restore a production build, including after failed UI assertions.
      delete process.env.TAPKIT_TEST_BUILD;
      try {
        buildDesktop();
      } finally {
        if (previous !== undefined) process.env.TAPKIT_TEST_BUILD = previous;
      }
    }
  }
}
