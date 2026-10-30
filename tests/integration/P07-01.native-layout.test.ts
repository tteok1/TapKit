import { expect, test } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { newId } from '../../packages/storage/src';
import { OfficeWorker, readExecutionCapabilities } from '../../packages/tools/src';
import { renderDocumentDraft } from '../../packages/workflows/src';
import { documentSamples } from '../fixtures/P07-01.documents';
import { pdfText } from './office-security-control';

test('P07-01 bounded layout candidates preserve a long report after isolated PDF rendering', async () => {
  const root = resolve('.'),
    caps = await readExecutionCapabilities(root);
  expect(caps.nativeExecution.status).toBe('available');
  expect(caps.officeRender.status).toBe('available');
  await mkdir('.test-data', { recursive: true });
  await mkdir('docs/evidence/P07-01/native-layout', { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P07-01 layout '));
  const spec = documentSamples[1]!;
  for (const attempt of [0, 1, 2]) {
    const inputRoot = join(base, `input-${attempt}`),
      workspace = join(base, `workspace-${attempt}`);
    await mkdir(inputRoot);
    await mkdir(workspace);
    const doc = await renderDocumentDraft(spec, async () => true, undefined, attempt);
    await writeFile(join(inputRoot, 'report.docx'), doc.docx);
    const versionId = newId(),
      output = await new OfficeWorker(root).render(
        { fileVersionId: versionId, format: 'pdf' },
        {
          fileVersionId: versionId,
          inputRoot,
          workspace,
          filename: 'report.docx',
          sha256: createHash('sha256').update(doc.docx).digest('hex'),
          requestId: newId(),
          runId: newId(),
          leaseEpoch: 1,
        },
      );
    const pdf = await readFile(output.path),
      text = (await pdfText(root, pdf)).replace(/\s+/gu, '');
    expect(text).toContain(spec.title.replace(/\s+/gu, ''));
    expect(text).toContain('98765.43');
    expect(text).toContain('第45项');
    await copyFile(
      output.path,
      resolve('docs/evidence/P07-01/native-layout', `attempt-${attempt}.pdf`),
    );
  }
}, 540000);
