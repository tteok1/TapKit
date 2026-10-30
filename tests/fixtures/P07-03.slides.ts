import { SlideDeckSpecSchema } from '../../packages/contracts/src';
export function sampleDeck(
  theme: 'light_business' | 'dark_presentation' = 'light_business',
  aspectRatio: '16:9' | '4:3' = '16:9',
) {
  return SlideDeckSpecSchema.parse({
    schemaVersion: 1,
    title: 'P07 合成办公示例',
    theme,
    aspectRatio,
    slides: Array.from({ length: 10 }, (_, i) => ({
      id: 'page-' + (i + 1),
      layout: i === 0 ? 'title' : i % 5 === 3 ? 'table' : i % 5 === 2 ? 'two_columns' : 'body',
      title:
        i === 1
          ? '中文与English混排：围绕已提供数字说明统计口径并保持可编辑文本'
          : '示例第' + (i + 1) + '页',
      bullets:
        i % 5 === 3
          ? []
          : ['这是合成示例，不代表真实经营结论。', '示例金额 123.45 元，目标数值 2026 保持不变。'],
      rightBullets:
        i % 5 === 2 ? ['Notes 与来源应按实际材料补充。', '没有提供的事实不得编造。'] : [],
      ...(i % 5 === 3
        ? {
            table: {
              headers: ['地区', '金额（元）', '说明'],
              rows: [
                ['华东', '0.70', '示例'],
                ['华南', '1.05', '示例'],
              ],
            },
          }
        : {}),
      notes: '第' + (i + 1) + '页讲者备注：此为合成示例，用于检查格式，不作真实事实承诺。',
    })),
  });
}
