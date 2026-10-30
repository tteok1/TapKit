import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { AnalysisSpecSchema } from '../../packages/contracts/src';
import { NativeSandboxExecutor, readExecutionCapabilities } from '../../packages/tools/src';
import { mkdir, writeFile } from 'node:fs/promises';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { fixture } from './P06.fixture';
import { salesCsv, salesAnalysis } from '../fixtures/P07-02.data';
import { officeZip, xlsxFixture } from '../fixtures/P03-office';

test.each(['duplicate_join', 'zero_division', 'cell_limit', 'external_link'] as const)(
  'P07-02 native T07/T19 %s refuses publication and preserves the original',
  async (scenario) => {
    const f = await fixture();
    try {
      const extension = scenario === 'external_link' ? 'xlsx' : 'csv';
      const bytes =
        scenario === 'cell_limit'
          ? Buffer.from(
              Array.from({ length: 20 }, (_, i) => '列' + i).join(',') +
                '\n' +
                (Array(20).fill('1').join(',') + '\n').repeat(100001),
            )
          : scenario === 'external_link'
            ? await officeZip({
                ...xlsxFixture(),
                'xl/externalLinks/externalLink1.xml': '<externalLink />',
              })
            : Buffer.from(salesCsv);
      const blob = await f.blobs.put(bytes),
        source = f.files.importBlob({
          blobId: blob.id,
          name: '数据.' + extension,
          relativePath: '数据.' + extension,
          owner: { type: 'session', id: f.sessionId },
        }).file;
      const view = await f.create({
        format: 'xlsx',
        refs: [{ kind: 'file', fileId: source.id, versionId: source.version.id }],
      });
      f.store.db
        .prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?")
        .run(view.runId);
      const run = f.work.repo.row(view.runId),
        initial = salesAnalysis(source.id, source.version.id);
      initial.charts = [];
      if (scenario === 'duplicate_join') {
        initial.operations = [
          {
            op: 'join',
            dataset: 'sales',
            output: 'joined',
            right: 'sales',
            leftKey: '地区',
            rightKey: '地区',
            how: 'left',
            duplicateKeys: 'reject',
          },
        ];
        initial.outputs = ['joined'];
      }
      if (scenario === 'zero_division') {
        initial.operations = [
          {
            op: 'calculate',
            dataset: 'sales',
            output: 'calculated',
            column: '除零',
            left: '数量',
            operator: 'divide',
            right: 0,
            scale: 2,
            formula: true,
          },
        ];
        initial.outputs = ['calculated'];
      }
      if (scenario === 'cell_limit') {
        initial.datasets[0]!.columns = Array.from({ length: 20 }, (_, i) => ({
          key: '列' + i,
          label: '列' + i,
          type: 'number',
          unit: '',
        }));
        initial.operations = [];
        initial.outputs = ['sales'];
      }
      const spec = AnalysisSpecSchema.parse(initial),
        caps = await readExecutionCapabilities(resolve('.'));
      expect(caps.nativeExecution.status).toBe('available');
      const base = new NativeSandboxExecutor(resolve('.'));
      const gateway = new WorkToolGateway(
        f.artifacts,
        new WorkNativeTools(resolve('.'), f.artifacts, caps, {
          execute: async (request, options) => {
            const result = await base.execute(request, options);
            const last = result.events.at(-1);
            await mkdir('docs/evidence/P07-02/native-limits', { recursive: true });
            await writeFile(
              'docs/evidence/P07-02/native-limits/' + scenario + '.json',
              JSON.stringify({
                event: last?.event,
                exitCode: last?.data.exitCode,
                status: last?.data.status,
                stderr:
                  typeof last?.data.stderr === 'string' ? last.data.stderr.slice(-16000) : null,
              }),
            );
            return result;
          },
        }),
      );
      await expect(
        gateway.execute(
          run,
          view.steps[0]!.stepKey,
          { tool: 'data.analyze', fileId: source.id, versionId: source.version.id, spec },
          () => {},
        ),
      ).rejects.toThrow(
        scenario === 'cell_limit'
          ? 'OUTPUT_LIMIT_REACHED'
          : scenario === 'external_link'
            ? 'FORMAT_UNSUPPORTED'
            : 'PARSE_FAILED',
      );
      expect(
        (await f.files.original(source.id, { versionId: source.version.id })).bytes.equals(bytes),
      ).toBe(true);
      expect(
        f.store.db.prepare('SELECT 1 FROM file_versions WHERE created_by_run_id=?').get(run.id),
      ).toBeUndefined();
      expect(
        f.store.db
          .prepare("SELECT 1 FROM events WHERE run_id=? AND event_type='tool.validation'")
          .get(run.id),
      ).toBeDefined();
    } finally {
      await f.close();
    }
  },
  180000,
);
