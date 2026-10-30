import { FILE_LIMITS } from '../../packages/contracts/src';
import { renderSlideDeck } from '../../packages/workflows/src';
import { newId } from '../../packages/storage/src';
import { BoundedArchive } from '../../packages/retrieval/src/ingest/archive';
import { officeZip } from './P03-office';
import { sampleDeck } from './P07-03.slides';
export async function chartDeckFixture() {
  const spec = sampleDeck();
  spec.slides[4] = {
    ...spec.slides[4]!,
    layout: 'chart',
    bullets: [],
    chartRef: { fileId: newId(), versionId: newId(), chartId: 'fixture' },
  };
  return renderSlideDeck(spec, {
    chart: async () => ({
      type: 'bar',
      series: [{ name: '销售额', labels: ['华东', '华南'], values: [0.7, 1.05] }],
    }),
  });
}
export async function zipParts(bytes: Buffer) {
  const archive = await BoundedArchive.open(bytes, FILE_LIMITS),
    parts: Record<string, Buffer> = {};
  try {
    for (const path of archive.entries.keys())
      if (!path.endsWith('/')) parts[path] = await archive.read(path);
    return parts;
  } finally {
    archive.close();
  }
}
export async function badChartCache(
  bytes: Buffer,
  kind: 'formula' | 'nested' | 'external' | 'defined',
) {
  const parts = await zipParts(bytes),
    key = Object.keys(parts).find((n) => /^ppt\/embeddings\/[^/]+\.xlsx$/i.test(n))!;
  const workbook = await zipParts(parts[key]!);
  if (kind === 'formula') {
    const sheet = Object.keys(workbook).find((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n))!;
    workbook[sheet] = Buffer.from(
      workbook[sheet]!.toString().replace(
        /<c(?:\s[^>]*)?>/,
        (match) => match + '<f>WEBSERVICE("https://example.invalid")</f>',
      ),
    );
  } else if (kind === 'nested')
    workbook['xl/embeddings/oleObject1.bin'] = Buffer.from('synthetic blocked object');
  else if (kind === 'external')
    workbook['_rels/.rels'] = Buffer.from(
      workbook['_rels/.rels']!.toString().replace(
        '<Relationship ',
        '<Relationship TargetMode="External" ',
      ),
    );
  else
    workbook['xl/workbook.xml'] = Buffer.from(
      workbook['xl/workbook.xml']!.toString().replace(
        '</workbook>',
        '<definedNames><definedName name="_xlnm.Auto_Open">synthetic</definedName></definedNames></workbook>',
      ),
    );
  parts[key] = await officeZip(workbook);
  return officeZip(parts);
}
