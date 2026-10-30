import PptxGenJS from 'pptxgenjs';
import { createHash } from 'node:crypto';
import {
  SlideDeckSpecSchema,
  SlideSpecSchema,
  ParsedDocumentSchema,
  type SlideAction,
  type SlideDeckSpec,
  type SlideSpec,
} from '@tapkit/contracts';
import { checkedDocumentImage } from './document-image';

const weight = (s: string) =>
  Array.from(s).reduce((n, c) => n + (/[\u0000-\u007f]/.test(c) ? 0.55 : 1), 0);
function pieces(value: string, capacity: number) {
  const result: string[] = [];
  let part = '',
    used = 0;
  for (const c of value) {
    const w = weight(c);
    if (used + w > capacity && part) {
      const tail = /[+-]?\d[\d.,%]*$/.exec(part)?.[0];
      if (tail && /[\d.,%]/.test(c)) {
        if (tail === part) throw Error('SLIDE_TOKEN_TOO_LONG');
        result.push(part.slice(0, -tail.length));
        part = tail;
        used = weight(tail);
      } else {
        result.push(part);
        part = '';
        used = 0;
      }
    }
    part += c;
    used += w;
  }
  if (part) result.push(part);
  return result;
}
function paginate(items: string[], lineWidth: number) {
  const pages: string[][] = [[]];
  let lines = 0;
  for (const value of items.flatMap((v) => pieces(v, lineWidth * 3))) {
    const needed =
      value
        .split('\n')
        .reduce((n, line) => n + Math.max(1, Math.ceil(weight(line) / lineWidth)), 0) + 0.4;
    if (lines + needed > 11 && pages.at(-1)!.length) {
      pages.push([]);
      lines = 0;
    }
    pages.at(-1)!.push(value);
    lines += needed;
  }
  return pages;
}
export function normalizeSlideDeck(raw: unknown): SlideDeckSpec {
  const deck = SlideDeckSpecSchema.parse(raw),
    slides: SlideSpec[] = [];
  for (const original of deck.slides) {
    const s = structuredClone(original),
      prefix = s.id.slice(0, 64);
    const titleLimit = deck.aspectRatio === '16:9' ? 60 : 42;
    if (Array.from(s.title).length > titleLimit) {
      slides.push(
        SlideSpecSchema.parse({
          ...s,
          id: prefix + '-title',
          layout: 'body',
          title:
            Array.from(s.title)
              .slice(0, titleLimit - 2)
              .join('') + '…',
          bullets: [s.title],
          rightBullets: [],
          table: undefined,
          chartRef: undefined,
          imageVersionId: undefined,
        }),
      );
      s.title =
        Array.from(s.title)
          .slice(0, titleLimit - 2)
          .join('') + '…';
    }
    const width = deck.aspectRatio === '16:9' ? 43 : 30;
    if (s.layout === 'table') {
      const cellWidth = Math.floor(
        (deck.aspectRatio === '16:9' ? 45 : 32) / s.table!.headers.length,
      );
      if (s.table!.headers.some((v) => weight(v) > cellWidth * 3))
        throw Error('SLIDE_TABLE_HEADER_TOO_LONG');
      const rows = s.table!.rows.flatMap((row) => {
        const parts = row.map((v) => pieces(v, cellWidth * 2));
        return Array.from({ length: Math.max(1, ...parts.map((p) => p.length)) }, (_, i) =>
          parts.map((p) => p[i] ?? ''),
        );
      });
      for (let i = 0; i < Math.max(1, rows.length); i += 4)
        slides.push({
          ...s,
          id: i ? prefix + '-p' + (i / 4 + 1) : s.id,
          table: { headers: s.table!.headers, rows: rows.slice(i, i + 4) },
        });
    } else if (s.layout === 'chart') slides.push(s);
    else {
      const lineWidth =
        s.layout === 'two_columns'
          ? Math.floor(width / 2) - 2
          : s.imageVersionId
            ? Math.floor(width * 0.6)
            : width;
      const left = paginate(s.bullets, lineWidth),
        right = paginate(s.rightBullets, lineWidth);
      for (let i = 0; i < Math.max(left.length, right.length); i++)
        slides.push({
          ...s,
          id: i ? prefix + '-p' + (i + 1) : s.id,
          bullets: left[i] ?? [],
          rightBullets: right[i] ?? [],
        });
    }
  }
  return SlideDeckSpecSchema.parse({ ...deck, slides });
}
export function slideHashes(raw: unknown) {
  return Object.fromEntries(
    SlideDeckSpecSchema.parse(raw).slides.map((s) => [
      s.id,
      createHash('sha256')
        .update(JSON.stringify(SlideSpecSchema.parse(s)))
        .digest('hex'),
    ]),
  );
}
export function reviseSlideDeck(raw: unknown, actions: SlideAction[]) {
  const deck = SlideDeckSpecSchema.parse(raw),
    slides = structuredClone(deck.slides);
  for (const action of actions) {
    if (action.op === 'insert') {
      if (action.index > slides.length) throw Error('SLIDE_NOT_FOUND');
      slides.splice(action.index, 0, action.slide);
      continue;
    }
    const index = slides.findIndex((s) => s.id === action.slideId);
    if (index < 0) throw Error('SLIDE_NOT_FOUND');
    if (action.op === 'replace') {
      if (action.slide.id !== action.slideId) throw Error('SLIDE_ID_MISMATCH');
      slides[index] = action.slide;
    } else if (action.op === 'delete') slides.splice(index, 1);
    else if (action.op === 'duplicate')
      slides.splice(index + 1, 0, { ...structuredClone(slides[index]!), id: action.newId });
    else {
      if (action.index >= slides.length) throw Error('SLIDE_NOT_FOUND');
      const [s] = slides.splice(index, 1);
      slides.splice(action.index, 0, s!);
    }
  }
  return normalizeSlideDeck({ ...deck, slides });
}
export type SlideChart = {
  type: 'bar' | 'line' | 'area' | 'pie';
  xLabel?: string;
  yLabel?: string;
  series: Array<{ name: string; labels: string[]; values: number[] }>;
};
export async function renderSlideDeck(
  raw: unknown,
  assets: {
    image?: (id: string) => Promise<Buffer>;
    chart?: (ref: NonNullable<SlideSpec['chartRef']>) => Promise<SlideChart>;
  } = {},
) {
  const spec = normalizeSlideDeck(raw),
    pptx = new PptxGenJS(),
    wide = spec.aspectRatio === '16:9',
    width = wide ? 13.333333 : 10,
    height = 7.5;
  pptx.defineLayout({ name: 'TAPKIT', width, height });
  pptx.layout = 'TAPKIT';
  pptx.author = '';
  pptx.subject = spec.title;
  pptx.title = spec.title;
  pptx.company = '';
  pptx.theme = { headFontFace: 'Noto Sans CJK SC', bodyFontFace: 'Noto Sans CJK SC' };
  const dark = spec.theme === 'dark_presentation',
    bg = dark ? '14201A' : 'FFFFFF',
    ink = dark ? 'F4F8F5' : '18271F',
    accent = dark ? 'A5CFAF' : '3F6B53';
  for (const [index, s] of spec.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: bg };
    const titleSize = weight(s.title) > (wide ? 30 : 23) ? 26 : 32;
    slide.addText(s.title, {
      x: 0.6,
      y: 0.35,
      w: width - 1.2,
      h: 1,
      fontFace: 'Noto Sans CJK SC',
      fontSize: titleSize,
      bold: true,
      color: ink,
      breakLine: false,
      margin: 0,
      valign: 'top',
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.6,
      y: 1.45,
      w: width - 1.2,
      h: 0,
      line: { color: accent, width: 1.2 },
    });
    const body = (items: string[], x: number, w: number) => {
      if (items.length)
        slide.addText(
          items.map((text, i) => ({
            text,
            options: { breakLine: i < items.length - 1, bullet: { indent: 18 }, hanging: 4 },
          })),
          {
            x,
            y: 1.8,
            w,
            h: 4.65,
            fontFace: 'Noto Sans CJK SC',
            fontSize: 20,
            color: ink,
            margin: 0,
            paraSpaceAfter: 8,
            valign: 'top',
            lineSpacingMultiple: 1.15,
          },
        );
    };
    if (s.layout === 'table')
      slide.addTable(
        [s.table!.headers, ...s.table!.rows].map((row) => row.map((text) => ({ text }))),
        {
          x: 0.6,
          y: 1.8,
          w: width - 1.2,
          h: 4.5,
          fontFace: 'Noto Sans CJK SC',
          fontSize: 18,
          color: ink,
          fill: { color: bg },
          border: { color: accent, pt: 0.7 },
          margin: 8,
          autoPage: false,
        },
      );
    else if (s.layout === 'chart') {
      if (!assets.chart) throw Error('CHART_AUTHORIZATION_REQUIRED');
      const chart = await assets.chart(s.chartRef!);
      slide.addChart(pptx.ChartType[chart.type], chart.series, {
        x: 0.7,
        y: 1.8,
        w: width - 1.4,
        h: 4.6,
        showLegend: chart.series.length > 1,
        showTitle: false,
        showCatAxisTitle: !!chart.xLabel,
        ...(chart.xLabel ? { catAxisTitle: chart.xLabel } : {}),
        catAxisTitleColor: ink,
        catAxisTitleFontFace: 'Noto Sans CJK SC',
        catAxisTitleFontSize: 18,
        showValAxisTitle: !!chart.yLabel,
        ...(chart.yLabel ? { valAxisTitle: chart.yLabel } : {}),
        valAxisTitleColor: ink,
        valAxisTitleFontFace: 'Noto Sans CJK SC',
        valAxisTitleFontSize: 18,
        showValue: true,
        dataLabelColor: ink,
        dataLabelFontFace: 'Noto Sans CJK SC',
        dataLabelFontSize: 18,
        catAxisLabelFontSize: 18,
        valAxisLabelFontSize: 18,
        dataLabelFormatCode: '0.00########',
        valAxisLabelFormatCode: '0.00########',
        chartColors: [accent, '557CA8', 'B77935'],
        legendFontFace: 'Noto Sans CJK SC',
        catAxisLabelFontFace: 'Noto Sans CJK SC',
        valAxisLabelFontFace: 'Noto Sans CJK SC',
        catAxisLabelColor: ink,
        valAxisLabelColor: ink,
        showLabel: chart.type === 'pie',
      });
    } else if (s.layout === 'two_columns') {
      body(s.bullets, 0.6, (width - 1.6) / 2);
      body(s.rightBullets, width / 2 + 0.2, (width - 1.6) / 2);
    } else {
      body(s.bullets, 0.7, s.imageVersionId ? (width - 1.4) * 0.6 : width - 1.4);
      if (s.imageVersionId) {
        if (!assets.image) throw Error('IMAGE_AUTHORIZATION_REQUIRED');
        const bytes = await assets.image(s.imageVersionId),
          image = checkedDocumentImage(bytes),
          scale = Math.min((width * 0.26) / image.width, 3 / image.height);
        slide.addImage({
          data: 'image/png;base64,' + bytes.toString('base64'),
          x: width * 0.67,
          y: 2,
          w: image.width * scale,
          h: image.height * scale,
        });
      }
    }
    slide.addText(String(index + 1), {
      x: width - 1.15,
      y: 7.0,
      w: 0.5,
      h: 0.25,
      fontFace: 'Noto Sans CJK SC',
      fontSize: 12,
      color: accent,
      align: 'right',
      margin: 0,
    });
    slide.addNotes(s.notes);
  }
  const bytes = Buffer.from((await pptx.write({ outputType: 'nodebuffer' })) as Uint8Array);
  if (bytes.length > 100 * 1024 * 1024 || bytes.subarray(0, 2).toString() !== 'PK')
    throw Error('OUTPUT_LIMIT_REACHED');
  return { spec, bytes, hashes: slideHashes(spec) };
}
export function validateSlidePdf(raw: unknown, rawParsed: unknown) {
  const spec = SlideDeckSpecSchema.parse(raw),
    parsed = ParsedDocumentSchema.parse(rawParsed);
  if (parsed.format !== 'pdf' || parsed.pages.length !== spec.slides.length) return false;
  const clean = (text: string) => text.normalize('NFKC').replace(/\s/g, '');
  const ratio = spec.aspectRatio === '16:9' ? 16 / 9 : 4 / 3;
  for (const [i, s] of spec.slides.entries()) {
    const page = parsed.pages[i]!;
    if (Math.abs(page.width / page.height - ratio) > 0.02) return false;
    const text = clean(
      parsed.blocks
        .filter((b) => b.locator.kind === 'pdf' && b.locator.pageIndex === i)
        .map((b) => b.text)
        .join(''),
    );
    if (!text.includes(clean(s.title))) return false;
    const numbers =
      [
        ...s.bullets,
        ...s.rightBullets,
        ...(s.table ? [...s.table.headers, ...s.table.rows.flat()] : []),
      ]
        .join(' ')
        .match(/\d+(?:[.,]\d+)*/g) ?? [];
    if (numbers.some((n) => !text.includes(n))) return false;
  }
  return parsed.blocks.every(
    (b) =>
      b.locator.kind === 'pdf' &&
      b.locator.rects?.length &&
      b.locator.rects.every(
        (r) => r.x > 0.001 && r.y > 0.001 && r.x + r.width < 0.999 && r.y + r.height < 0.999,
      ),
  );
}
