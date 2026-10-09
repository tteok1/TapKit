import { it } from 'vitest';
import { auditBoundaries } from '../../scripts/check-boundaries.mjs';
it('P00-01 parses and audits the real TypeScript package graph', async () => {
  await auditBoundaries();
});
