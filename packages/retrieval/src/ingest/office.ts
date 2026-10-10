import { posix } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
  FILE_LIMITS,
  FileLimitsSchema,
  FileRelativePathSchema,
  ParsedDocumentSchema,
  type FileLimits,
  type ParsedDocument,
} from '@tapkit/contracts';
import { BoundedArchive } from './archive';
import { assertFileSize, columnName, decodeText, emptyDocument, ParseError } from './text';

type ParsedBlock = ParsedDocument['blocks'][number];
type Node = {
  name: string;
  namespace: string;
  attributes: Record<string, string>;
  children: Node[];
  text: string;
};
type Ordered = Record<string, unknown>;
const local = (name: string) => name.split(':').at(-1)!;
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  maxNestedTags: 100,
});
function xml(bytes: Buffer): Node {
  const source = decodeText(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new ParseError('EXTERNAL_ENTITY');
  if (XMLValidator.validate(source) !== true) throw new ParseError('CORRUPT_FILE');
  let count = 0;
  function convert(values: Ordered[], depth: number, inherited: Record<string, string>): Node[] {
    if (depth > 100) throw new ParseError('CORRUPT_FILE');
    const result: Node[] = [];
    for (const value of values) {
      if (++count > 8_000_000) throw new ParseError('OUTPUT_LIMIT');
      for (const [key, content] of Object.entries(value)) {
        if (key === ':@' || key.startsWith('?') || key.startsWith('#')) continue;
        if (!Array.isArray(content)) throw new ParseError('CORRUPT_FILE');
        const attributes: Record<string, string> = Object.create(null);
        const rawAttributes = (value[':@'] ?? {}) as Ordered;
        const namespaces = { ...inherited };
        for (const [name, attr] of Object.entries(rawAttributes)) {
          if (name === 'xmlns') namespaces[''] = String(attr);
          else if (name.startsWith('xmlns:')) namespaces[name.slice(6)] = String(attr);
        }
        const prefix = key.includes(':') ? key.split(':')[0]! : '';
        if (prefix && !namespaces[prefix]) throw new ParseError('CORRUPT_FILE');
        for (const [name, attr] of Object.entries(rawAttributes)) {
          if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
          const plain = name.includes(':') && local(name) === 'id' ? 'relationshipId' : local(name);
          if (Object.hasOwn(attributes, plain)) throw new ParseError('CORRUPT_FILE');
          attributes[plain] = String(attr);
        }
        result.push({
          name: local(key),
          namespace: namespaces[prefix] ?? '',
          attributes,
          children: convert(content as Ordered[], depth + 1, namespaces),
          text: (content as Ordered[]).map((c) => c['#text'] ?? '').join(''),
        });
      }
    }
    return result;
  }
  try {
    const roots = convert(parser.parse(source) as Ordered[], 0, {
      xml: 'http://www.w3.org/XML/1998/namespace',
    });
    if (roots.length !== 1) throw new ParseError('CORRUPT_FILE');
    return roots[0]!;
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError('CORRUPT_FILE');
  }
}
function officeRoot(
  root: Node,
  name: string,
  family: 'wordprocessingml' | 'spreadsheetml' | 'presentationml',
) {
  if (
    root.name !== name ||
    ![
      `http://schemas.openxmlformats.org/${family}/2006/main`,
      `http://purl.oclc.org/ooxml/${family}/main`,
    ].includes(root.namespace)
  )
    throw new ParseError('MAGIC_MISMATCH');
}
function child(node: Node, name: string) {
  return node.children.find((c) => c.name === name);
}
function* descendants(node: Node, name: string): Generator<Node> {
  for (const c of node.children) {
    if (c.name === name) yield c;
    yield* descendants(c, name);
  }
}
function text(node: Node): string {
  if (node.name === 't' || node.name === 'v' || node.name === 'f') return node.text;
  if (node.name === 'tab') return '\t';
  if (node.name === 'br' || node.name === 'cr') return '\n';
  // Word field instructions, embedded objects and deleted text are never executed or indexed.
  if (['instrText', 'del', 'object', 'oleObj', 'altChunk'].includes(node.name)) return '';
  return node.children.map(text).join('');
}
type Relation = { type: string; target: string | null };
class OfficePackage {
  readonly warnings = new Set<string>();
  private constructor(readonly archive: BoundedArchive) {}
  static async open(bytes: Buffer, limits: FileLimits) {
    assertFileSize(bytes, limits);
    if (
      bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    ) {
      throw new ParseError(
        bytes.includes(Buffer.from('EncryptedPackage', 'utf16le'))
          ? 'ENCRYPTED_FILE'
          : 'MAGIC_MISMATCH',
      );
    }
    if (bytes.subarray(0, 4).toString('hex') !== '504b0304') throw new ParseError('MAGIC_MISMATCH');
    const archive = await BoundedArchive.open(bytes, limits),
      pkg = new OfficePackage(archive);
    try {
      for (const [path, entry] of archive.entries) {
        // Generators can include an empty embeddings/ directory without any
        // OLE payload. Real embedding files and active relationships remain blocked.
        if (
          /vbaProject|activeX/i.test(path) ||
          (/embeddings\//i.test(path) && (!path.endsWith('/') || entry.uncompressedSize !== 0))
        )
          throw new ParseError('MACRO_FORMAT');
        if (/\.xml$|\.rels$/i.test(path)) {
          // Inspect every XML part before using any content, including unused relationships.
          const root = await pkg.read(path);
          if (path.endsWith('.rels')) pkg.relationshipsFrom(root, path);
          if (path === '[Content_Types].xml') {
            if (root.name !== 'Types') throw new ParseError('CORRUPT_FILE');
            for (const item of root.children)
              if (/macroEnabled|vbaProject|activeX/i.test(item.attributes.ContentType ?? ''))
                throw new ParseError('MACRO_FORMAT');
          }
        }
      }
      if (!archive.has('[Content_Types].xml') || !archive.has('_rels/.rels'))
        throw new ParseError('CORRUPT_FILE');
      return pkg;
    } catch (error) {
      archive.close();
      throw error;
    }
  }
  async read(path: string) {
    return xml(await this.archive.read(path));
  }
  private relationshipsFrom(root: Node, path: string): Map<string, Relation> {
    if (root.name !== 'Relationships') throw new ParseError('CORRUPT_FILE');
    const result = new Map<string, Relation>();
    const sourceDirectory = path === '_rels/.rels' ? '' : posix.dirname(posix.dirname(path));
    for (const node of root.children) {
      if (node.name !== 'Relationship') continue;
      const { Id: id, Type: type, Target: target, TargetMode: mode } = node.attributes;
      if (!id || !type || !target || result.has(id)) throw new ParseError('CORRUPT_FILE');
      if (/vbaProject|activeX|oleObject|package$/i.test(type)) throw new ParseError('MACRO_FORMAT');
      if (mode === 'External') {
        this.warnings.add('EXTERNAL_RELATIONSHIP_IGNORED');
        result.set(id, { type, target: null });
        continue;
      }
      if (mode && mode !== 'Internal') throw new ParseError('CORRUPT_FILE');
      if (/^[a-z][a-z\d+.-]*:|^\/\/|[\\#?%]/i.test(target)) throw new ParseError('UNSAFE_ARCHIVE');
      const resolved = posix.normalize(
        target.startsWith('/') ? target.slice(1) : posix.join(sourceDirectory, target),
      );
      if (!FileRelativePathSchema.safeParse(resolved).success)
        throw new ParseError('UNSAFE_ARCHIVE');
      result.set(id, { type, target: resolved });
    }
    return result;
  }
  async relationships(part: string) {
    const path = part
      ? posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels')
      : '_rels/.rels';
    return this.archive.has(path)
      ? this.relationshipsFrom(await this.read(path), path)
      : new Map<string, Relation>();
  }
  async main(extension: string) {
    const mains = [...(await this.relationships('')).values()].filter((r) =>
      /\/officeDocument$/.test(r.type),
    );
    if (mains.length !== 1 || !mains[0]!.target) throw new ParseError('CORRUPT_FILE');
    const part = mains[0]!.target!,
      types = await this.read('[Content_Types].xml');
    const expected = {
      docx: 'wordprocessingml.document.main+xml',
      xlsx: 'spreadsheetml.sheet.main+xml',
      pptx: 'presentationml.presentation.main+xml',
    }[extension];
    if (
      !expected ||
      !types.children.some(
        (n) =>
          n.name === 'Override' &&
          n.attributes.PartName === '/' + part &&
          n.attributes.ContentType === 'application/vnd.openxmlformats-officedocument.' + expected,
      )
    )
      throw new ParseError('MAGIC_MISMATCH');
    return part;
  }
}
function push(doc: ParsedDocument, block: Omit<ParsedBlock, 'id'>) {
  if (doc.blocks.length >= 200000 || block.text.length > 1_000_000)
    throw new ParseError('OUTPUT_LIMIT');
  doc.blocks.push({ id: 'block-' + (doc.blocks.length + 1), ...block });
}
async function word(pkg: OfficePackage, main: string, limits: FileLimits) {
  const root = await pkg.read(main),
    body = child(root, 'body'),
    doc = emptyDocument('docx');
  officeRoot(root, 'document', 'wordprocessingml');
  if (!body) throw new ParseError('CORRUPT_FILE');
  const levels = new Map<string, number>(),
    relations = await pkg.relationships(main);
  for (const rel of relations.values())
    if (/\/styles$/.test(rel.type) && rel.target) {
      for (const style of (await pkg.read(rel.target)).children) {
        const outline = child(child(style, 'pPr') ?? style, 'outlineLvl')?.attributes.val;
        const name = child(style, 'name')?.attributes.val ?? style.attributes.styleId ?? '';
        const level =
          outline === undefined
            ? Number(/heading\s*([1-6])/i.exec(name)?.[1])
            : Number(outline) + 1;
        if (Number.isInteger(level) && level >= 1 && level <= 6 && style.attributes.styleId)
          levels.set(style.attributes.styleId, level);
      }
    }
  let offset = 0;
  let cells = 0;
  function visit(node: Node) {
    if (node.name === 'del' || node.name === 'altChunk') return;
    if (node.name === 'p' || node.name === 'tbl') {
      if (node.name === 'tbl') {
        let rows = 0;
        for (const row of descendants(node, 'tr')) {
          if (++rows > limits.maxRows) throw new ParseError('TABLE_LIMIT');
          const columns = row.children.filter((c) => c.name === 'tc').length;
          cells += columns;
          if (columns > limits.maxColumns || cells > limits.maxCells)
            throw new ParseError('TABLE_LIMIT');
        }
      }
      const value =
        node.name === 'tbl'
          ? [...descendants(node, 'tr')]
              .map((r) =>
                r.children
                  .filter((c) => c.name === 'tc')
                  .map((c) => [...descendants(c, 'p')].map(text).join('\n'))
                  .join('\t'),
              )
              .join('\n')
          : text(node);
      const props = child(node, 'pPr'),
        style = props && child(props, 'pStyle')?.attributes.val;
      const direct = props && child(props, 'outlineLvl')?.attributes.val;
      const level =
        direct === undefined
          ? style && (levels.get(style) ?? Number(/^Heading([1-6])$/i.exec(style)?.[1]))
          : Number(direct) + 1;
      const heading = typeof level === 'number' && level >= 1 && level <= 6;
      const paragraphId = 'paragraph-' + (doc.blocks.length + 1);
      push(doc, {
        kind: node.name === 'tbl' ? 'table' : heading ? 'heading' : 'paragraph',
        text: value,
        locator: { kind: 'text', start: offset, end: offset + value.length, paragraphId },
        ...(heading ? { level } : {}),
      });
      offset += value.length + 1;
    } else for (const c of node.children) visit(c);
  }
  visit(body);
  return doc;
}
function coordinate(reference: string, limits: FileLimits) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(reference);
  if (!match) throw new ParseError('CORRUPT_FILE');
  const column = [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    row = Number(match[2]);
  if (row > limits.maxRows || column > limits.maxColumns) throw new ParseError('TABLE_LIMIT');
  return { row, column };
}
async function spreadsheet(pkg: OfficePackage, main: string, limits: FileLimits) {
  const root = await pkg.read(main),
    sheets = child(root, 'sheets'),
    doc = emptyDocument('sheet');
  officeRoot(root, 'workbook', 'spreadsheetml');
  if (!sheets || sheets.children.length > 1000) throw new ParseError('CORRUPT_FILE');
  const relations = await pkg.relationships(main),
    strings: string[] = [];
  for (const rel of relations.values())
    if (/\/sharedStrings$/.test(rel.type) && rel.target) {
      const shared = await pkg.read(rel.target);
      officeRoot(shared, 'sst', 'spreadsheetml');
      for (const item of shared.children.filter((n) => n.name === 'si')) {
        const value = text(item);
        if (strings.length >= limits.maxCells || value.length > 1_000_000)
          throw new ParseError('TABLE_LIMIT');
        strings.push(value);
      }
    }
  let count = 0;
  for (const s of sheets.children) {
    const rel = relations.get(s.attributes.relationshipId ?? '');
    if (
      s.name !== 'sheet' ||
      !rel?.target ||
      !/\/worksheet$/.test(rel.type) ||
      !s.attributes.sheetId ||
      !s.attributes.name
    )
      throw new ParseError('CORRUPT_FILE');
    const sheet: ParsedDocument['sheets'][number] = {
      id: s.attributes.sheetId,
      name: s.attributes.name,
      rows: 0,
      columns: 0,
      cells: [],
      mergedRanges: [],
    };
    const source = await pkg.read(rel.target),
      data = child(source, 'sheetData');
    officeRoot(source, 'worksheet', 'spreadsheetml');
    if (!data) throw new ParseError('CORRUPT_FILE');
    const dimension = child(source, 'dimension')?.attributes.ref;
    if (dimension) for (const ref of dimension.split(':')) coordinate(ref, limits);
    for (const merge of child(source, 'mergeCells')?.children ?? []) {
      if (
        merge.name !== 'mergeCell' ||
        !/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(merge.attributes.ref ?? '')
      )
        throw new ParseError('CORRUPT_FILE');
      if (sheet.mergedRanges!.length >= 20000) throw new ParseError('TABLE_LIMIT');
      const [a, b] = merge.attributes.ref!.split(':').map((ref) => coordinate(ref, limits));
      if (!a || !b || a.row > b.row || a.column > b.column) throw new ParseError('CORRUPT_FILE');
      sheet.rows = Math.max(sheet.rows, b.row);
      sheet.columns = Math.max(sheet.columns, b.column);
      sheet.mergedRanges!.push(merge.attributes.ref!);
    }
    const ends = new Map<number, number>();
    const ranges = sheet
      .mergedRanges!.map((range) => {
        const [a, b] = range.split(':').map((ref) => coordinate(ref, limits));
        return { a: a!, b: b! };
      })
      .sort((x, y) => x.a.row - y.a.row);
    for (const { a, b } of ranges)
      for (let c = a.column; c <= b.column; c++) {
        if ((ends.get(c) ?? 0) >= a.row) throw new ParseError('CORRUPT_FILE');
        ends.set(c, b.row);
      }
    const seen = new Set<string>();
    for (const row of data.children) {
      if (row.name !== 'row') continue;
      const rowIndex = Number(row.attributes.r);
      if (!Number.isInteger(rowIndex) || rowIndex < 1) throw new ParseError('CORRUPT_FILE');
      if (rowIndex > limits.maxRows) throw new ParseError('TABLE_LIMIT');
      const cells: string[] = [];
      for (const c of row.children.filter((n) => n.name === 'c')) {
        if (++count > limits.maxCells) throw new ParseError('TABLE_LIMIT');
        const reference = c.attributes.r ?? '',
          position = coordinate(reference, limits);
        if (seen.has(reference) || position.row !== rowIndex) throw new ParseError('CORRUPT_FILE');
        seen.add(reference);
        const cached = child(c, 'v'),
          formula = child(c, 'f');
        let value: string | number | boolean | null = cached?.text ?? null;
        if (c.attributes.t === 's') {
          if (!cached || !/^\d+$/.test(cached.text) || strings[Number(cached.text)] === undefined)
            throw new ParseError('CORRUPT_FILE');
          value = strings[Number(cached.text)]!;
        } else if (c.attributes.t === 'inlineStr') value = text(child(c, 'is') ?? c);
        else if (c.attributes.t === 'b' && cached) {
          if (!['0', '1'].includes(cached.text)) throw new ParseError('CORRUPT_FILE');
          value = cached.text === '1';
        } else if ((!c.attributes.t || c.attributes.t === 'n') && cached) {
          if (!cached.text.trim() || !Number.isFinite(Number(cached.text)))
            throw new ParseError('CORRUPT_FILE');
          value = Number(cached.text);
        } else if (
          c.attributes.t &&
          !['str', 'e', 'd', 's', 'inlineStr', 'b', 'n'].includes(c.attributes.t)
        )
          throw new ParseError('CORRUPT_FILE');
        if (
          (typeof value === 'string' && value.length > 1_000_000) ||
          (formula && formula.text.length > 8192)
        )
          throw new ParseError('TABLE_LIMIT');
        if (formula && formula.attributes.t === 'shared')
          pkg.warnings.add('SHARED_FORMULA_NOT_EXPANDED');
        if (formula && !cached) pkg.warnings.add('FORMULA_CACHE_MISSING');
        sheet.rows = Math.max(sheet.rows, position.row);
        sheet.columns = Math.max(sheet.columns, position.column);
        sheet.cells.push({
          ...position,
          value,
          calculated: !formula || !!cached,
          ...(formula ? { formula: formula.text } : {}),
        });
        cells[position.column - 1] = value === null ? '' : String(value);
      }
      sheet.rows = Math.max(sheet.rows, rowIndex);
      if (cells.length)
        push(doc, {
          kind: 'table',
          text: cells.join('\t'),
          locator: {
            kind: 'sheet',
            sheetId: sheet.id,
            range: `A${rowIndex}:${columnName(cells.length)}${rowIndex}`,
          },
        });
    }
    doc.sheets.push(sheet);
  }
  return doc;
}
async function presentation(pkg: OfficePackage, main: string, limits: FileLimits) {
  const root = await pkg.read(main),
    list = child(root, 'sldIdLst'),
    doc = emptyDocument('pptx');
  officeRoot(root, 'presentation', 'presentationml');
  if (!list || list.children.length > 10000) throw new ParseError('CORRUPT_FILE');
  const relations = await pkg.relationships(main);
  let cells = 0;
  for (const s of list.children) {
    const rel = relations.get(s.attributes.relationshipId ?? '');
    if (s.name !== 'sldId' || !rel?.target || !/\/slide$/.test(rel.type))
      throw new ParseError('CORRUPT_FILE');
    const slide = await pkg.read(rel.target),
      index = doc.slides.length;
    officeRoot(slide, 'sld', 'presentationml');
    let title = '',
      notes = '';
    for (const shape of descendants(slide, 'sp')) {
      const shapeId = [...descendants(shape, 'cNvPr')][0]?.attributes.id;
      const value = [...descendants(shape, 'p')].map(text).join('\n');
      const placeholder = [...descendants(shape, 'ph')][0]?.attributes.type;
      if (['title', 'ctrTitle'].includes(placeholder ?? '')) title = value.slice(0, 2000);
      if (value)
        push(doc, {
          kind: 'paragraph',
          text: value,
          locator: { kind: 'slide', slideIndex: index, ...(shapeId ? { shapeId } : {}) },
        });
    }
    for (const table of descendants(slide, 'tbl')) {
      let rows = 0;
      for (const row of descendants(table, 'tr')) {
        if (++rows > limits.maxRows) throw new ParseError('TABLE_LIMIT');
        const columns = row.children.filter((c) => c.name === 'tc').length;
        cells += columns;
        if (columns > limits.maxColumns || cells > limits.maxCells)
          throw new ParseError('TABLE_LIMIT');
      }
      const value = [...descendants(table, 'tr')]
        .map((r) =>
          r.children
            .filter((c) => c.name === 'tc')
            .map((c) => [...descendants(c, 'p')].map(text).join('\n'))
            .join('\t'),
        )
        .join('\n');
      if (value)
        push(doc, { kind: 'table', text: value, locator: { kind: 'slide', slideIndex: index } });
    }
    for (const note of (await pkg.relationships(rel.target)).values())
      if (/\/notesSlide$/.test(note.type) && note.target) {
        const source = await pkg.read(note.target);
        officeRoot(source, 'notes', 'presentationml');
        notes = [...descendants(source, 'sp')]
          .filter(
            (n) =>
              !['sldNum', 'dt', 'hdr', 'ftr', 'sldImg'].includes(
                [...descendants(n, 'ph')][0]?.attributes.type ?? '',
              ),
          )
          .map((n) => [...descendants(n, 'p')].map(text).join('\n'))
          .join('\n');
        if (notes)
          push(doc, { kind: 'notes', text: notes, locator: { kind: 'slide', slideIndex: index } });
      }
    doc.slides.push({ index, title, notes });
  }
  return doc;
}
export async function parseOfficeFile(
  bytes: Buffer,
  extension: 'docx' | 'xlsx' | 'pptx',
  rawLimits: FileLimits = FILE_LIMITS,
) {
  const limits = FileLimitsSchema.parse(rawLimits),
    pkg = await OfficePackage.open(bytes, limits);
  try {
    const main = await pkg.main(extension);
    const doc =
      extension === 'docx'
        ? await word(pkg, main, limits)
        : extension === 'xlsx'
          ? await spreadsheet(pkg, main, limits)
          : await presentation(pkg, main, limits);
    doc.quality.warnings = [...pkg.warnings];
    if (!doc.blocks.some((b) => b.text.trim())) doc.quality.warnings.push('NO_TEXT_CONTENT');
    return ParsedDocumentSchema.parse(doc);
  } finally {
    pkg.archive.close();
  }
}
