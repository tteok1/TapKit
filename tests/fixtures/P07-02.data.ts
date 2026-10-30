import { AnalysisSpecSchema } from '../../packages/contracts/src';
export const salesCsv =
  '地区,数量,单价,日期\n华东,3,0.10,2026-10-01\n华东,2,0.20,2026-10-02\n华南,1,1.05,2026-10-01\n华南,1,1.05,2026-10-01\n';
export function salesAnalysis(fileId: string, versionId: string) {
  return AnalysisSpecSchema.parse({
    schemaVersion: 1,
    title: '销售汇总',
    question: '按地区汇总去重后的销售额',
    methodology: '完全重复行只保留首行；数量乘单价，金额四舍五入到分；按地区求和。',
    datasets: [
      {
        id: 'sales',
        fileId,
        versionId,
        columns: [
          { key: '地区', label: '地区', type: 'string' },
          { key: '数量', label: '数量', type: 'number', scale: 0 },
          { key: '单价', label: '单价', type: 'number', unit: '元', scale: 2 },
          { key: '日期', label: '日期', type: 'date' },
        ],
      },
    ],
    operations: [
      {
        op: 'deduplicate',
        dataset: 'sales',
        output: 'unique',
        keys: ['地区', '数量', '单价', '日期'],
      },
      {
        op: 'calculate',
        dataset: 'unique',
        output: 'detail',
        column: '金额',
        left: '数量',
        operator: 'multiply',
        right: '单价',
        scale: 2,
      },
      {
        op: 'aggregate',
        dataset: 'detail',
        output: 'summary',
        groupBy: ['地区'],
        metrics: [{ field: '金额', as: '销售额', function: 'sum', scale: 2 }],
      },
    ],
    outputs: ['detail', 'summary'],
    charts: [
      {
        schemaVersion: 1,
        id: 'revenue',
        type: 'bar',
        datasetId: 'summary',
        xField: '地区',
        yFields: ['销售额'],
        title: '分地区销售额',
        yLabel: '元',
      },
    ],
  });
}
