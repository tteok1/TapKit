import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  AnalysisSpecSchema,
  AnalysisResultSchema,
  type ResourceRef,
} from '../../packages/contracts/src';
import { readExecutionCapabilities } from '../../packages/tools/src';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { fixture } from './P06.fixture';

test('P07-02 native multiple XLSX/CSV inputs preserve dates and literal strings across cleaning, join and CSV-safe exports', async () => {
  const f = await fixture();
  try {
    const require = createRequire(resolve('packages/workflows/package.json'));
    const { Workbook } = require('exceljs');
    const book = new Workbook(),
      sheet = book.addWorksheet('Sales');
    sheet.addRow(['地区', '人员', '数量', '单价', '日期', '备注']);
    sheet.addRow([
      '华东',
      '销售:甲',
      3,
      0.1,
      new Date('2026-10-01T00:00:00.000Z'),
      '=HYPERLINK("https://example.invalid")',
    ]);
    sheet.addRow(['华东', '销售:乙', 2, 0.2, new Date('2026-10-02T00:00:00.000Z'), '@literal']);
    sheet.addRow(['华南', '销售:丙', null, 1.05, new Date('2026-10-01T00:00:00.000Z'), '-literal']);
    const inputBytes = [
      Buffer.from(await book.xlsx.writeBuffer()),
      Buffer.from(
        '地区,分组,时刻\n华东,东部,2026-10-01T00:00:00Z\n华南,南部,2026-10-01T00:00:00Z\n',
      ),
      Buffer.from('值\n1\n1\n1\n1\n99\n'),
    ];
    const refs: Array<Extract<ResourceRef, { kind: 'file' }>> = [];
    for (const [index, bytes] of inputBytes.entries()) {
      const name = index === 0 ? '销售.xlsx' : index === 1 ? '地区.csv' : '异常示例.csv',
        blob = await f.blobs.put(bytes);
      const file = f.files.importBlob({
        blobId: blob.id,
        name,
        relativePath: name,
        owner: { type: 'session', id: f.sessionId },
      }).file;
      refs.push({ kind: 'file', fileId: file.id, versionId: file.version.id });
    }
    const view = await f.create({
      format: 'xlsx',
      goal: '合并销售与地区表，允许重复键连接，补缺、拆分、分类并保留日期和原值',
      refs,
    });
    f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
    const run = f.work.repo.row(view.runId);
    const spec = AnalysisSpecSchema.parse({
      schemaVersion: 1,
      title: '清洗与合并',
      question: '保留每笔记录',
      methodology:
        '数量缺失填0；按人员冒号拆分，角色销售归为内部；销售地区允许重复键，地区维表唯一，左连接；单价降序。',
      datasets: [
        {
          id: 'sales',
          ...refs[0],
          sheet: 'Sales',
          columns: ['地区', '人员', '数量', '单价', '日期', '备注'].map((key) => ({
            key,
            label: key,
            type: ['数量', '单价'].includes(key) ? 'number' : key === '日期' ? 'date' : 'string',
          })),
        },
        {
          id: 'regions',
          ...refs[1],
          columns: ['地区', '分组', '时刻'].map((key) => ({
            key,
            label: key,
            type: key === '时刻' ? 'date' : 'string',
          })),
        },
        { id: 'profile', ...refs[2], columns: [{ key: '值', label: '值', type: 'number' }] },
      ].map(({ kind: _, ...d }) => d),
      operations: [
        { op: 'fill', dataset: 'sales', output: 'filled', field: '数量', value: 0 },
        {
          op: 'split',
          dataset: 'filled',
          output: 'split',
          field: '人员',
          separator: ':',
          columns: ['角色', '姓名'],
        },
        {
          op: 'classify',
          dataset: 'split',
          output: 'classified',
          field: '角色',
          column: '人群',
          groups: [{ values: ['销售'], label: '内部' }],
          otherwise: '其他',
        },
        {
          op: 'classify',
          dataset: 'classified',
          output: 'priced',
          field: '单价',
          column: '价格档',
          groups: [{ values: [0.1], label: '低价' }],
          otherwise: '普通',
        },
        {
          op: 'join',
          dataset: 'priced',
          output: 'joined',
          right: 'regions',
          leftKey: '地区',
          rightKey: '地区',
          how: 'left',
          duplicateKeys: 'allow',
        },
        {
          op: 'filter',
          dataset: 'joined',
          output: 'filtered',
          filters: [{ field: '数量', op: 'between', min: 0, max: 3 }],
        },
        { op: 'sort', dataset: 'filtered', output: 'sorted', field: '单价', descending: true },
        {
          op: 'select',
          dataset: 'sorted',
          output: 'clean',
          columns: [
            '地区',
            '分组',
            '姓名',
            '人群',
            '数量',
            '单价',
            '日期',
            '备注',
            '时刻',
            '价格档',
          ],
        },
        {
          op: 'filter',
          dataset: 'clean',
          output: 'onePrice',
          filters: [{ field: '单价', op: 'eq', value: 0.1 }],
        },
      ],
      outputs: ['clean', 'onePrice'],
      charts: [
        {
          schemaVersion: 1,
          id: 'quantity',
          type: 'line',
          datasetId: 'clean',
          groupField: '分组',
          xField: '姓名',
          yFields: ['数量'],
          title: '员工数量',
        },
      ],
    });
    const caps = await readExecutionCapabilities(resolve('.'));
    expect(caps.officeRender.status).toBe('available');
    const gateway = new WorkToolGateway(
      f.artifacts,
      new WorkNativeTools(resolve('.'), f.artifacts, caps),
    );
    const ref = await gateway.execute(
      run,
      view.steps[0]!.stepKey,
      { tool: 'data.analyze', fileId: refs[0]!.fileId, versionId: refs[0]!.versionId, spec },
      () => {},
    );
    if (ref?.kind !== 'file') throw Error('result');
    const raw = await f.files.original(ref.fileId, { versionId: ref.versionId }),
      result = AnalysisResultSchema.parse(JSON.parse(raw.bytes.toString()));
    const rows = result.spreadsheet.sheets[0]!.rows;
    expect(result.spreadsheet.sheets[1]?.rows).toHaveLength(1);
    expect(result.spreadsheet.sheets[1]?.rows[0]?.[2]).toBe('甲');
    expect(result.spreadsheet.sheets[1]?.rows[0]?.[9]).toBe('低价');
    expect(rows.every((row) => row[8] === '2026-10-01T08:00:00+08:00')).toBe(true);
    expect(rows.map((r) => [r[0], r[1], r[2], r[3], r[4]])).toEqual([
      ['华南', '南部', '丙', '内部', 0],
      ['华东', '东部', '乙', '内部', 2],
      ['华东', '东部', '甲', '内部', 3],
    ]);
    expect(result.profiles[0]?.columns.find((c) => c.key === '数量')?.missing).toBe(1);
    expect(result.profiles[2]?.columns[0]?.outliers).toBe(1);
    const csv = result.exports.find((e) => e.name.endsWith('.csv'))!;
    const bytes = (await f.files.original(csv.fileId, { versionId: csv.versionId })).bytes;
    expect(bytes.toString()).toContain("'=HYPERLINK");
    expect(bytes.toString()).toContain("'@literal");
    expect(bytes.toString()).toContain("'-literal");
    for (let i = 0; i < refs.length; i++)
      expect(
        (await f.files.original(refs[i]!.fileId, { versionId: refs[i]!.versionId })).bytes.equals(
          inputBytes[i]!,
        ),
      ).toBe(true);
    expect(await gateway.verify(run, [ref])).toBe(true);
    await mkdir('docs/evidence/P07-02/native-transform', { recursive: true });
    await writeFile('docs/evidence/P07-02/native-transform/result.json', raw.bytes);
    for (const output of result.exports)
      await writeFile(
        resolve('docs/evidence/P07-02/native-transform', output.name),
        (await f.files.original(output.fileId, { versionId: output.versionId })).bytes,
      );
  } finally {
    await f.close();
  }
}, 360000);
