import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect } from 'vitest';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { newId } from '../../packages/storage/src';
import { OfficeWorker, readExecutionCapabilities } from '../../packages/tools/src';
import { renderDocumentDraft } from '../../packages/workflows/src';
import { documentSamples } from '../fixtures/P07-01.documents';
import { pdfText } from './office-security-control';

const root = resolve('.');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test.each(documentSamples.map((spec, index) => ({ spec, index })))(
  'P07-01 T07 native rendered representative document $index',
  async ({ spec, index }) => {
    const caps = await readExecutionCapabilities(root);
    expect(caps.nativeExecution.status).toBe('available');
    expect(caps.officeRender.status).toBe('available');
    await mkdir('.test-data', { recursive: true });
    await mkdir('docs/evidence/P07-01/native-render', { recursive: true });
    const base = await mkdtemp(resolve('.test-data', 'P07-01 native report '));
    const inputRoot = join(base, 'input'),
      workspace = join(base, 'workspace');
    await mkdir(inputRoot);
    await mkdir(workspace);
    const generated = await renderDocumentDraft(spec, async () => true);
    await writeFile(join(inputRoot, 'report.docx'), generated.docx);
    const fileVersionId = newId();
    const output = await new OfficeWorker(root).render(
      { fileVersionId, format: 'pdf' },
      {
        fileVersionId,
        inputRoot,
        workspace,
        filename: 'report.docx',
        sha256: sha(generated.docx),
        requestId: newId(),
        runId: newId(),
        leaseEpoch: 1,
      },
    );
    const pdf = await readFile(output.path);
    const text = (await pdfText(root, pdf)).replace(/\s+/gu, '');
    expect(text).toContain(spec.title.replace(/\s+/gu, ''));
    const marker = ['123.45', '98765.43', '89.25'][index]!;
    expect(text).toContain(marker);
    expect((await readFile(join(inputRoot, 'report.docx'))).equals(generated.docx)).toBe(true);
    await copyFile(
      output.path,
      resolve('docs/evidence/P07-01/native-render', `report-${index + 1}.pdf`),
    );
  },
  180000,
);
