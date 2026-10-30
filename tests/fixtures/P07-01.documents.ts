import { DocumentSpecSchema } from '../../packages/contracts/src';

const ref = {
  kind: 'file' as const,
  fileId: '0199b35d-9700-7000-8000-000000000001',
  versionId: '0199b35d-9700-7000-8000-000000000002',
};
export const documentSamples = [
  DocumentSpecSchema.parse({
    schemaVersion: 1,
    title: '年度运营报告',
    audience: '管理团队',
    language: '简体中文',
    style: {
      template: 'report',
      fields: { name: '张三', date: '2026-10-28', brand: '示例机构' },
      tableOfContents: true,
      pageNumbers: true,
    },
    citations: [{ label: '公开合成资料', ref }],
    sections: [
      {
        blockId: 'summary',
        heading: '摘要',
        blocks: [
          {
            type: 'paragraph',
            text: '本年度完成目标 42 项，预算 123.45 万元。中文标点、English 与数字均需清晰可读。',
          },
        ],
      },
      {
        blockId: 'body',
        heading: '主要结论',
        blocks: [{ type: 'bullets', items: ['收入保持稳定。', '后续工作需要持续核验。'] }],
      },
    ],
  }),
  DocumentSpecSchema.parse({
    schemaVersion: 1,
    title: '长期实施方案',
    audience: '项目团队',
    language: '简体中文',
    style: {
      template: 'proposal',
      fields: { name: '', date: '2026-10-28', brand: '' },
      tableOfContents: true,
      pageNumbers: true,
    },
    citations: [],
    sections: [
      {
        blockId: 'goal',
        heading: '目标',
        blocks: [
          { type: 'paragraph', text: '在保持数据安全和版本可追溯的前提下，完成分阶段实施。' },
        ],
      },
      {
        blockId: 'steps',
        heading: '实施步骤',
        blocks: Array.from({ length: 45 }, (_, i) => ({
          type: 'paragraph' as const,
          text: `第 ${i + 1} 项：核对输入、执行变更、复核结果并记录负责人。这里包含中文标点，确保跨页时正文不丢失。`,
        })),
      },
      {
        blockId: 'acceptance',
        heading: '验收',
        blocks: [{ type: 'paragraph', text: '最后验收数字：98765.43；所有步骤均需独立核对。' }],
      },
    ],
  }),
  DocumentSpecSchema.parse({
    schemaVersion: 1,
    title: '会议纪要与跨页表格',
    audience: '参会人员',
    language: '简体中文',
    style: {
      template: 'minutes',
      fields: { name: '记录人', date: '2026-10-28', brand: '' },
      tableOfContents: false,
      pageNumbers: true,
    },
    citations: [],
    sections: [
      {
        blockId: 'topics',
        heading: '议题',
        blocks: [{ type: 'paragraph', text: '讨论计划、资源和质量检查。' }],
      },
      {
        blockId: 'actions',
        heading: '待办',
        blocks: [
          {
            type: 'table',
            columns: ['编号', '事项', '金额'],
            rows: Array.from({ length: 90 }, (_, i) => [
              String(i + 1),
              `中文待办事项 ${i + 1}`,
              (i + 0.25).toFixed(2),
            ]),
          },
        ],
      },
      {
        blockId: 'end',
        heading: '结论',
        blocks: [{ type: 'paragraph', text: '末项编号 90，金额 89.25，数据保持原样。' }],
      },
    ],
  }),
];
