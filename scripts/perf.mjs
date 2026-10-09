import { pnpm } from './lib.mjs';
// P02's real fixture is the first implemented performance scope. Later stages
// extend this entry point with document retrieval and whole-application sampling.
console.log('P02-03: 10,000 sessions / 100,000 messages; Core list/search pagination and P50/P95.');
pnpm([
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  '--project',
  'perf',
  ...process.argv.slice(2).filter((a) => a !== '--'),
]);
