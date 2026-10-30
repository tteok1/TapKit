// Included only by an explicit test build; production builds remove this module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DescriptorSchema,
  SlideDeckSpecSchema,
  type SlideAction,
  type ProviderAdapter,
} from '@tapkit/contracts';
import { newId } from '@tapkit/storage';
import type { ModelService } from './model-service';
import { conservativeCandidate } from '../../context/src';
export function installChatFixture(models: ModelService) {
  const store = models.store;
  if (readFileSync(join(store.dataDir, 'P02-02.fixture'), 'utf8') !== 'P02-02 isolated fixture')
    throw new Error('FIXTURE_PROFILE_REQUIRED');
  const accounts = store.db.prepare('SELECT id,label FROM provider_accounts').all() as {
    id: string;
    label: string;
  }[];
  if (accounts.some((a) => a.label !== 'P02-02 synthetic fixture'))
    throw new Error('FIXTURE_PROFILE_REQUIRED');
  const accountId = accounts[0]?.id ?? newId();
  if (!accounts.length)
    store.db
      .prepare(
        "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id) VALUES(?,?,?,?,'openai-compatible','P02-02 synthetic fixture','api_key',?,'ready','openai-chat','https://fixture.invalid/v1','fixture-model')",
      )
      .run(accountId, store.profileId, store.now(), store.now(), newId());
  const descriptor = DescriptorSchema.parse({
    accountId,
    providerId: 'openai-compatible',
    modelId: 'fixture-model',
    displayName: '隔离测试模型',
    contextWindow: 128000,
    maxOutput: 8192,
    toolCalls: 'documented',
    verification: 'probed',
    accountLabel: 'P02-02 synthetic fixture',
    status: 'ready',
    reasoningLevels: ['off'],
    modalities: ['text'],
    parallelTools: 'unknown',
    jsonOutput: 'unknown',
    scenario: 'fixture',
    price: null,
    quotaRemaining: null,
    quotaResetAt: null,
  });
  const networkFailures = new Set<string>();
  const adapter: ProviderAdapter = {
    id: 'openai-compatible',
    listModels: async () => [],
    checkConnection: async () => {
      throw new Error('FIXTURE_ONLY');
    },
    classifyError: () => ({ code: 'STREAM_INTERRUPTED', retryable: false }),
    async *stream(request, signal) {
      if (request.systemModules.some((module) => module.id === 'tapkit.work')) {
        signal.throwIfAborted();
        const payload = JSON.parse(
          request.messages.findLast((m) => m.role === 'user')?.text ?? '{}',
        ) as {
          goal?: string;
          slideOptions?: { aspectRatio: string; theme: string; pageCount: number };
          step?: {
            stepKey: string;
            inputRefs?: { kind: string; fileId: string; versionId: string }[];
          };
          priorOutputs?: { kind: string; fileId: string; versionId: string }[];
        };
        const source = payload.priorOutputs?.find((ref) => ref.kind === 'file');
        if (
          payload.goal?.includes('P07数据') &&
          (!request.tools.some((t) => t.name === 'slides.create') || !source) &&
          request.tools.some((tool) => tool.name === 'data.analyze')
        ) {
          const input = payload.step?.inputRefs?.find((ref) => ref.kind === 'file');
          if (!input) throw Error('P07 data fixture requires a selected source');
          const keepDuplicates = payload.goal.includes('保留重复行');
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'data.analyze',
            arguments: {
              fileId: input.fileId,
              versionId: input.versionId,
              spec: {
                schemaVersion: 1,
                title: '销售汇总',
                question: '按地区汇总销售额',
                methodology:
                  (keepDuplicates ? '保留重复行；' : '完全重复行只保留首行；') +
                  '数量乘单价，金额四舍五入到分；按地区求和。',
                datasets: [
                  {
                    id: 'sales',
                    fileId: input.fileId,
                    versionId: input.versionId,
                    columns: [
                      { key: '地区', label: '地区', type: 'string' },
                      { key: '数量', label: '数量', type: 'number', scale: 0 },
                      { key: '单价', label: '单价', type: 'number', scale: 2, unit: '元' },
                      { key: '日期', label: '日期', type: 'date' },
                    ],
                  },
                ],
                operations: [
                  ...(keepDuplicates
                    ? []
                    : [
                        {
                          op: 'deduplicate',
                          dataset: 'sales',
                          output: 'unique',
                          keys: ['地区', '数量', '单价', '日期'],
                        },
                      ]),
                  {
                    op: 'calculate',
                    dataset: keepDuplicates ? 'sales' : 'unique',
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
              },
            },
          };
          yield { type: 'text_delta', blockId: 'work', text: '销售汇总和图表已生成。' };
          yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
          return;
        }
        if (request.tools.some((t) => t.name === 'slides.create')) {
          const previous = request.messages.flatMap((message) => {
            try {
              const value = JSON.parse(message.text);
              return value.kind === 'slide_deck_spec' ? [value] : [];
            } catch {
              return [];
            }
          })[0];
          let args: unknown, name: string;
          if (previous) {
            const spec = SlideDeckSpecSchema.parse(previous.spec),
              goal = payload.goal ?? '',
              page = Number(/当前演示文稿第(\d+)页/.exec(goal)?.[1] ?? 2) - 1,
              old = spec.slides[page]!;
            let actions: SlideAction[];
            if (goal.includes('复制当前演示'))
              actions = [{ op: 'duplicate', slideId: old.id, newId: 'copy-' + newId() }];
            else if (goal.includes('删除当前演示')) actions = [{ op: 'delete', slideId: old.id }];
            else if (goal.includes('移动到第'))
              actions = [
                {
                  op: 'move',
                  slideId: old.id,
                  index: Number(/移动到第(\d+)页/.exec(goal)?.[1] ?? 1) - 1,
                },
              ];
            else if (goal.includes('之后插入'))
              actions = [
                {
                  op: 'insert',
                  index: page + 1,
                  slide: {
                    ...old,
                    id: 'insert-' + newId(),
                    layout: 'body',
                    title: /标题“([^”]+)”/.exec(goal)?.[1] ?? '新增页',
                    bullets: ['新增示例内容'],
                    rightBullets: [],
                    table: undefined,
                    chartRef: undefined,
                    imageVersionId: undefined,
                  },
                },
              ];
            else
              actions = [
                {
                  op: 'replace',
                  slideId: old.id,
                  slide: {
                    ...old,
                    title: /标题修改为“([^”]+)”/.exec(goal)?.[1] ?? '局部修改',
                    bullets: (
                      /正文逐条替换为：\n([\s\S]*?)\n右栏/.exec(goal)?.[1] ?? old.bullets.join('\n')
                    )
                      .split('\n')
                      .filter(Boolean),
                    rightBullets: (
                      /右栏逐条替换为：\n([\s\S]*?)\n讲者/.exec(goal)?.[1] ??
                      old.rightBullets.join('\n')
                    )
                      .split('\n')
                      .filter(Boolean),
                    notes: /讲者备注替换为：\n([\s\S]*?)\n保留本页/.exec(goal)?.[1] ?? old.notes,
                  },
                },
              ];
            name = 'slides.revise';
            args = {
              fileId: previous.fileId,
              versionId: previous.versionId,
              revision: previous.revision,
              actions,
            };
          } else {
            name = 'slides.create';
            args = {
              name: '示例演示.pptx',
              spec: {
                schemaVersion: 1,
                title: 'P07 示例演示',
                aspectRatio: payload.slideOptions?.aspectRatio ?? '16:9',
                theme: payload.slideOptions?.theme ?? 'light_business',
                slides: Array.from({ length: payload.slideOptions?.pageCount ?? 10 }, (_, i) => ({
                  id: 'page-' + (i + 1),
                  layout:
                    i === 0
                      ? 'title'
                      : i === 2
                        ? 'two_columns'
                        : i === 3
                          ? 'table'
                          : i === 4 && source
                            ? 'chart'
                            : 'body',
                  title: '示例第' + (i + 1) + '页',
                  bullets:
                    i === 3 || (i === 4 && source)
                      ? []
                      : ['合成示例用于格式检查。', '金额123.45元，保留给定事实。'],
                  rightBullets: i === 2 ? ['English与中文混排', '备注保留在原生PPTX中。'] : [],
                  ...(i === 3
                    ? {
                        table: {
                          headers: ['地区', '销售额'],
                          rows: [
                            ['华东', '0.70'],
                            ['华南', '1.05'],
                          ],
                        },
                      }
                    : {}),
                  ...(i === 4 && source
                    ? {
                        chartRef: {
                          fileId: source.fileId,
                          versionId: source.versionId,
                          chartId: 'revenue',
                        },
                      }
                    : {}),
                  notes: '讲者备注：第' + (i + 1) + '页合成示例，不代表真实验收结论。',
                })),
              },
            };
          }
          yield { type: 'tool_end', callId: newId(), name, arguments: args };
          yield {
            type: 'text_delta',
            blockId: 'work',
            text: '演示文稿已生成，保留原生文字和备注。',
          };
          yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
          return;
        }
        if (
          payload.goal?.includes('P07文档') &&
          request.tools.some((tool) => tool.name === 'document.create')
        ) {
          const prior = request.messages.flatMap((message) => {
            if (message.role !== 'user') return [];
            try {
              const value = JSON.parse(message.text);
              return value.kind === 'document_spec' ? [value] : [];
            } catch {
              return [];
            }
          })[0] as { fileId: string; versionId: string; revision: number } | undefined;
          if (payload.goal.includes('PDF') && (prior || source)) {
            const doc = prior ?? source!;
            yield {
              type: 'tool_end',
              callId: newId(),
              name: 'office.convert',
              arguments: { fileId: doc.fileId, versionId: doc.versionId },
            };
          } else if (
            payload.goal.includes('P07图片') &&
            payload.step?.inputRefs?.some((ref) => ref.kind === 'file')
          ) {
            const image = payload.step.inputRefs.find((ref) => ref.kind === 'file')!;
            yield {
              type: 'tool_end',
              callId: newId(),
              name: 'document.create',
              arguments: {
                name: 'P07图片.docx',
                spec: {
                  schemaVersion: 1,
                  title: 'P07 图片报告',
                  audience: '测试读者',
                  language: '中文',
                  sections: [
                    {
                      blockId: 'image',
                      heading: '素材',
                      blocks: [
                        { type: 'image', fileVersionId: image.versionId, alt: '合成绿色方块' },
                      ],
                    },
                  ],
                  citations: [],
                },
              },
            };
          } else if (payload.goal.includes('修改') && prior) {
            yield {
              type: 'tool_end',
              callId: newId(),
              name: 'document.revise',
              arguments: {
                fileId: prior.fileId,
                versionId: prior.versionId,
                revision: prior.revision,
                blockId: 'summary',
                replacement: {
                  blockId: 'summary',
                  heading: '摘要',
                  blocks: [{ type: 'paragraph', text: '修改后的中文摘要，金额 123.45 元。' }],
                },
              },
            };
          } else {
            yield {
              type: 'tool_end',
              callId: newId(),
              name: 'document.create',
              arguments: {
                name: 'P07报告.docx',
                spec: {
                  schemaVersion: 1,
                  title: 'P07 验收报告',
                  audience: '测试读者',
                  language: '中文',
                  sections: [
                    {
                      blockId: 'summary',
                      heading: '摘要',
                      blocks: [{ type: 'paragraph', text: '原始中文摘要，金额 123.45 元。' }],
                    },
                    {
                      blockId: 'detail',
                      heading: '明细',
                      blocks: [{ type: 'table', columns: ['项目', '数量'], rows: [['甲', '42']] }],
                    },
                  ],
                  citations: [],
                  style: {
                    template: 'report',
                    fields: { name: '', date: '', brand: '' },
                    tableOfContents: false,
                    pageNumbers: true,
                  },
                },
              },
            };
          }
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        if (payload.goal?.includes('P06审批') && payload.step?.stepKey === 'deliver-2' && source) {
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'workspace.patch',
            arguments: {
              fileId: source.fileId,
              versionId: source.versionId,
              content: '# 修订成果\n\n已按审阅后的具体内容生成新版本。',
            },
          };
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        yield {
          type: 'tool_end',
          callId: newId(),
          name: 'artifact.write',
          arguments: {
            name: '工作成果.md',
            content: '# 隔离工作验收\n\n这是实际保存并验证的本地成果。',
          },
        };
        yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
        return;
      }
      const last = request.messages.findLast((m) => m.role === 'user');
      const text = last?.role === 'user' ? last.text : '';
      const backgroundCall = request.systemModules.some((module) =>
        ['tapkit.title', 'tapkit.memory.extract'].includes(module.id),
      );
      if (text.includes('P05项目') && !backgroundCall) {
        const result = request.messages
          .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
          .findLast((m) => m.role === 'tool' && m.name === 'knowledge.query');
        if (!result && request.tools.some((tool) => tool.name === 'knowledge.query')) {
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'knowledge.query',
            arguments: { query: '退款期限', limit: 3 },
          };
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        const hit =
          result?.role === 'tool'
            ? (JSON.parse(result.text) as { hits?: { evidence?: { id: string; text: string } }[] })
                .hits?.[0]?.evidence
            : undefined;
        yield {
          type: 'text_delta',
          blockId: 'text',
          text: hit
            ? hit.text.split(/[。；\n]/)[0] + '[[evidence:' + hit.id + ']]'
            : '资料不足，无法查证。',
        };
        yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
        return;
      }
      if (text.includes('P05来源') && !backgroundCall) {
        const current = request.messages.slice(
          request.messages.findLastIndex((m) => m.role === 'user') + 1,
        );
        const result = current.findLast((m) => m.role === 'tool' && m.name === 'web.read');
        const available = request.tools.some((tool) => tool.name === 'web.read');
        if (!result && available) {
          yield {
            type: 'tool_end',
            callId: newId(),
            name: 'web.read',
            arguments: { url: text.match(/https?:\/\/[^\s]+/)?.[0] ?? 'https://example.com/' },
          };
          yield { type: 'finish', reason: 'tool_calls', nativeStateRef: '' };
          return;
        }
        const page =
          result?.role === 'tool'
            ? (JSON.parse(result.text) as { sourceId?: string; error?: string })
            : undefined;
        yield {
          type: 'text_delta',
          blockId: 'text',
          text: page?.sourceId
            ? '公开价格 42 元[[web:' + page.sourceId + ']]'
            : page?.error
              ? '无法读取来源：' + page.error + '，请补充材料或更换来源。'
              : '当前未启用联网，无法查证。',
        };
        yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
        return;
      }
      yield { type: 'start', attemptId: request.attemptId };
      if (
        request.systemModules.some((m) => m.id === 'tapkit.title') &&
        text.includes('标题故障验收') &&
        !networkFailures.has(request.branchId)
      ) {
        networkFailures.add(request.branchId);
        yield {
          type: 'error',
          partial: false,
          error: {
            code: 'NETWORK_ERROR',
            retryable: true,
            diagnosticCode: 'response_headers_timeout',
          },
        };
        return;
      }
      if (text.includes('网络重试诊断')) {
        if (!networkFailures.has(request.logicalCallId)) {
          networkFailures.add(request.logicalCallId);
          yield {
            type: 'error',
            partial: false,
            error: {
              code: 'NETWORK_ERROR',
              retryable: true,
              diagnosticCode: 'response_headers_timeout',
            },
          };
          return;
        }
        await new Promise<void>((_resolve, reject) => {
          const cancel = () => reject(new Error('CANCELLED'));
          if (signal.aborted) cancel();
          else signal.addEventListener('abort', cancel, { once: true });
        });
      }
      const echoTranslation =
        process.env.TAPKIT_TRANSLATION_ECHO_FIXTURE === '1' &&
        request.systemModules.some(
          (m) => m.id === 'message.selection' && m.text.includes('动作代码：translate'),
        );
      const answer = echoTranslation
        ? (JSON.parse(text.slice(text.lastIndexOf('\n') + 1)).text as string)
        : request.systemModules.some((m) => m.id === 'tapkit.memory.extract')
          ? JSON.stringify(conservativeCandidate(text))
          : text.includes('恶意渲染')
            ? '# 安全标题\n\n|列|值|\n|---|---|\n|中文|1|\n\n$$x^2+1$$\n\n```javascript\nconst value = 1;\n```\n\n```mermaid\ngraph TD\nA[输入] --> B[输出]\n```\n\n[危险链接](javascript:alert(1))\n<img src="https://fixture.invalid/evil.png" onerror="window.fixturePwned=true">'
            : '隔离测试回复：' + text.slice(0, 80);
      yield { type: 'text_delta', blockId: 'text', text: answer.slice(0, 5) };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', cancel);
            resolve();
          },
          text.includes('慢速') ? 4000 : 100,
        );
        const cancel = () => {
          clearTimeout(timer);
          reject(new Error('CANCELLED'));
        };
        signal.addEventListener('abort', cancel, { once: true });
      });
      signal.throwIfAborted();
      yield { type: 'text_delta', blockId: 'text', text: answer.slice(5) };
      yield {
        type: 'usage',
        usage: {
          inputTotal: 20,
          inputCachedSubset: 0,
          outputTotal: 40,
          reasoningSubset: 0,
          source: 'actual',
        },
      };
      yield { type: 'finish', reason: 'stop', nativeStateRef: '' };
    },
  };
  models.catalog = async () => [descriptor];
  models.router.deps.adapter = () => adapter;
}
