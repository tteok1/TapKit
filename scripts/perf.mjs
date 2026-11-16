import { pnpm } from './lib.mjs';
console.log(
  'Core list/search (10,000 sessions / 100,000 messages) and hybrid retrieval (2,000 documents / 20,000 chunks).',
);
const args = process.argv.slice(2).filter((a) => a !== '--');
const desktop = args.includes('--desktop');
pnpm([
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  '--project',
  'perf',
  ...args.filter((a) => a !== '--desktop'),
]);
if (desktop) pnpm(['exec', 'playwright', 'test', '--config', 'tests/perf/playwright.config.ts']);
