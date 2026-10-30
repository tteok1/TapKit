import { expect, test } from 'vitest';
import { AnalysisResultSchema } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { salesAnalysis } from '../fixtures/P07-02.data';
import { DATA_SCRIPT_HASH, renderDataHtml } from '../../packages/core/src/work-data';

test('P07-02 HTML escapes supplied text and includes detailed rows only after explicit selection', () => {
  const spec = salesAnalysis(newId(), newId());
  spec.charts = [];
  spec.methodology = '<script>example</script>';
  const result = AnalysisResultSchema.parse({
    schemaVersion: 1,
    kind: 'tapkit.analysis',
    spec,
    scriptHash: DATA_SCRIPT_HASH,
    inputs: spec.datasets.map(({ fileId, versionId }) => ({
      fileId,
      versionId,
      sha256: '0'.repeat(64),
    })),
    profiles: [{ datasetId: 'sales', rows: 1, duplicates: 0, columns: [] }],
    warnings: [],
    spreadsheet: {
      schemaVersion: 1,
      sheets: [
        {
          id: 'detail',
          name: '数据',
          columns: [{ key: 'a', label: 'a', type: 'string' }],
          rows: [['detail-only-value']],
        },
      ],
    },
  });
  const page = renderDataHtml(result, []);
  expect(page).toContain('&lt;script&gt;example&lt;/script&gt;');
  expect(page).not.toContain('<script>');
  expect(page).not.toContain('detail-only-value');
  result.spec.includeDetailsInHtml = true;
  expect(renderDataHtml(result, [])).toContain('detail-only-value');
});
