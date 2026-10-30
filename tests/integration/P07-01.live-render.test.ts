import { mkdtemp } from '../../scripts/test-temp.mjs';
import { expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { newId } from '../../packages/storage/src';
import { OfficeWorker, readExecutionCapabilities } from '../../packages/tools/src';
import { pdfText } from './office-security-control';

test.skipIf(process.env.TAPKIT_P07_RENDER_CHECK !== '1')(
  'P07-01 real model DOCX renders through the isolated Office worker',
  async () => {
    const root = resolve('.');
    const report = JSON.parse(await readFile('docs/evidence/P07-01/live-task-report.json', 'utf8'));
    expect(report.status).toBe('passed');
    expect(report.credentialRemoved).toBe(true);
    const profile = JSON.parse(await readFile('.test-data/P07-01-live-profile.json', 'utf8'));
    expect(
      resolve(profile.directory).startsWith(resolve('.test-data') + '\\P07-01-live-profile-'),
    ).toBe(true);
    const db = new DatabaseSync(join(profile.directory, 'db/app.sqlite'), { readOnly: true });
    const row = db
      .prepare(
        "SELECT v.id AS version_id,b.sha256 FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.created_by_run_id=? AND v.extension='docx' AND v.parse_status='ready'",
      )
      .get(report.runId) as { version_id: string; sha256: string };
    db.close();
    expect(row).toBeDefined();
    expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    const bytes = await readFile(
      join(profile.directory, 'blobs/sha256', row.sha256.slice(0, 2), row.sha256),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
    const caps = await readExecutionCapabilities(root);
    expect(caps.officeRender.status).toBe('available');
    const base = await mkdtemp(resolve('.test-data', 'P07-01 live render ')),
      inputRoot = join(base, 'input'),
      workspace = join(base, 'workspace');
    await mkdir(inputRoot);
    await mkdir(workspace);
    await writeFile(join(inputRoot, 'report.docx'), bytes);
    const output = await new OfficeWorker(root).render(
      { fileVersionId: row.version_id, format: 'pdf' },
      {
        fileVersionId: row.version_id,
        inputRoot,
        workspace,
        filename: 'report.docx',
        sha256: row.sha256,
        requestId: newId(),
        runId: newId(),
        leaseEpoch: 1,
      },
    );
    const pdf = await readFile(output.path),
      text = (await pdfText(root, pdf)).replace(/\s+/gu, '');
    expect(text).toContain('P07示例报告');
    expect(text).toContain('123.45');
    expect(text).toContain('没有进行真实验收');
    expect(text).toContain('仅用于格式检查');
    await mkdir('docs/evidence/P07-01/live-render', { recursive: true });
    await copyFile(output.path, resolve('docs/evidence/P07-01/live-render/report.pdf'));
  },
  180000,
);
