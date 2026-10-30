import { expect, test } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fixture } from './P06.fixture';
import { sampleDeck } from '../fixtures/P07-03.slides';
import { solidPng } from '../fixtures/P07-01.images';
import { renderSlideDeck, validateSlidePdf } from '../../packages/workflows/src';
import { newId } from '../../packages/storage/src';
import { readExecutionCapabilities, OfficeWorker } from '../../packages/tools/src';
import { PreviewStaging } from '../../packages/core/src/preview-staging';
import { FileParser } from '../../packages/core/src/file-parser';

for (const [theme, ratio] of [
  ['light_business', '16:9'],
  ['dark_presentation', '16:9'],
  ['light_business', '4:3'],
] as const) {
  test(
    'P07-03 native ten-slide five-layout ' + theme + ' ' + ratio,
    async () => {
      const f = await fixture(),
        staging = new PreviewStaging(f.store, 'work');
      let directory: string | undefined,
        settled = true;
      try {
        const root = resolve('.'),
          caps = await readExecutionCapabilities(root);
        expect(caps.officeRender.status).toBe('available');
        const spec = sampleDeck(theme, ratio);
        spec.slides[4] = {
          ...spec.slides[4]!,
          layout: 'chart',
          bullets: [],
          chartRef: { fileId: newId(), versionId: newId(), chartId: 'fixture' },
        };
        spec.slides[5] = { ...spec.slides[5]!, layout: 'body', imageVersionId: newId() };
        const draft = await renderSlideDeck(spec, {
          image: async () => solidPng(),
          chart: async () => ({
            type: 'bar',
            series: [{ name: '销售额（元）', labels: ['华东', '华南'], values: [0.7, 1.05] }],
          }),
        });
        expect(draft.spec.slides).toHaveLength(10);
        const evidence = resolve(
          'docs/evidence/P07-03/native',
          theme + '-' + ratio.replace(':', 'x'),
        );
        await mkdir(evidence, { recursive: true });
        await writeFile(join(evidence, 'deck.pptx'), draft.bytes);
        await writeFile(join(evidence, 'spec.json'), JSON.stringify(draft.spec, null, 2));
        const versionId = newId();
        directory = await staging.create(versionId);
        const inputRoot = join(directory, 'input'),
          workspace = join(directory, 'workspace');
        await mkdir(inputRoot);
        await mkdir(workspace);
        await writeFile(join(inputRoot, 'source.pptx'), draft.bytes, { flag: 'wx' });
        settled = false;
        const output = await new OfficeWorker(root).render(
          { fileVersionId: versionId, format: 'pdf' },
          {
            fileVersionId: versionId,
            inputRoot,
            filename: 'source.pptx',
            workspace,
            sha256: createHash('sha256').update(draft.bytes).digest('hex'),
            requestId: newId(),
            runId: newId(),
            leaseEpoch: 1,
          },
          { signal: new AbortController().signal },
        );
        settled = true;
        const pdf = await readFile(output.path);
        await writeFile(join(evidence, 'deck.pdf'), pdf);
        const parsed = await new FileParser(root, f.files, caps).inspectWorkPdf(
          directory,
          versionId,
          pdf,
          true,
          () => {},
          new AbortController().signal,
          {
            started: () => {
              settled = false;
            },
            settled: () => {
              settled = true;
            },
          },
        );
        await writeFile(join(evidence, 'parsed.json'), JSON.stringify(parsed));
        const valid = validateSlidePdf(draft.spec, parsed);
        await writeFile(
          join(evidence, 'quality.json'),
          JSON.stringify({
            pages: parsed.pages.length,
            valid,
            paintedImages: parsed.paintedImages,
          }),
        );
        expect(parsed.pages).toHaveLength(10);
        expect(valid).toBe(true);
        expect(parsed.paintedImages).toBeGreaterThanOrEqual(1);
        const chartText = parsed.blocks
          .filter((b) => b.locator.kind === 'pdf' && b.locator.pageIndex === 4)
          .map((b) => b.text)
          .join(' ');
        expect(chartText).toContain('0.7');
        expect(chartText).toContain('1.05');
        expect((await readFile(join(inputRoot, 'source.pptx'))).equals(draft.bytes)).toBe(true);
      } finally {
        if (directory && settled) await staging.release(directory);
        await f.close();
      }
    },
    240000,
  );
}
