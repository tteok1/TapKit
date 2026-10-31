import {
  WorkToolArgsSchema,
  WORK_TOOL_CATALOG_VERSION,
  LEGACY_WORK_TOOL_CATALOG_VERSION,
  DOCUMENT_WORK_TOOL_CATALOG_VERSION,
  DATA_WORK_TOOL_CATALOG_VERSION,
  SLIDES_WORK_TOOL_CATALOG_VERSION,
  type WorkToolArgs,
} from '@tapkit/contracts';
import { createHash } from 'node:crypto';
export { WORK_TOOL_CATALOG_VERSION };
export const WORK_TOOL_SPECS = {
  'browser.open': {
    name: 'browser.open',
    version: '1',
    mode: 'read',
    retry: 'safe',
    timeoutMs: 20000,
    maxOutputBytes: 65536,
  },
  'browser.observe': {
    name: 'browser.observe',
    version: '1',
    mode: 'read',
    retry: 'safe',
    timeoutMs: 10000,
    maxOutputBytes: 65536,
  },
  'browser.act': {
    name: 'browser.act',
    version: '1',
    mode: 'external_write',
    retry: 'reconcile_first',
    timeoutMs: 20000,
    maxOutputBytes: 65536,
  },
  'slides.create': {
    name: 'slides.create',
    version: '1',
    mode: 'artifact_write',
    retry: 'safe',
    timeoutMs: 360000,
    maxOutputBytes: 65536,
  },
  'slides.revise': {
    name: 'slides.revise',
    version: '1',
    mode: 'workspace_write',
    retry: 'reconcile_first',
    timeoutMs: 360000,
    maxOutputBytes: 65536,
  },
  'data.analyze': {
    name: 'data.analyze',
    version: '1',
    mode: 'execute',
    retry: 'safe',
    timeoutMs: 360000,
    maxOutputBytes: 65536,
  },
  'document.create': {
    name: 'document.create',
    version: '1',
    mode: 'artifact_write',
    retry: 'safe',
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  },
  'document.revise': {
    name: 'document.revise',
    version: '1',
    mode: 'workspace_write',
    retry: 'reconcile_first',
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  },
  'document.fields': {
    name: 'document.fields',
    version: '1',
    mode: 'workspace_write',
    retry: 'reconcile_first',
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  },
  'python.analyze': {
    name: 'python.analyze',
    version: '1',
    mode: 'execute',
    retry: 'safe',
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  },
  'office.convert': {
    name: 'office.convert',
    version: '1',
    mode: 'execute',
    retry: 'safe',
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  },
  'artifact.write': {
    name: 'artifact.write',
    version: '1',
    mode: 'artifact_write',
    retry: 'safe',
    timeoutMs: 30000,
    maxOutputBytes: 65536,
  },
  'workspace.patch': {
    name: 'workspace.patch',
    version: '1',
    mode: 'workspace_write',
    retry: 'reconcile_first',
    timeoutMs: 30000,
    maxOutputBytes: 65536,
  },
} as const;
export function catalogAllowsTool(catalog: string, name: keyof typeof WORK_TOOL_SPECS) {
  if (name.startsWith('browser.')) return catalog === WORK_TOOL_CATALOG_VERSION;
  return (
    catalog === WORK_TOOL_CATALOG_VERSION ||
    catalog === SLIDES_WORK_TOOL_CATALOG_VERSION ||
    (catalog === DATA_WORK_TOOL_CATALOG_VERSION && !name.startsWith('slides.')) ||
    (catalog === DOCUMENT_WORK_TOOL_CATALOG_VERSION &&
      name !== 'data.analyze' &&
      !name.startsWith('slides.')) ||
    (catalog === LEGACY_WORK_TOOL_CATALOG_VERSION &&
      name !== 'data.analyze' &&
      name !== 'document.create' &&
      name !== 'document.revise' &&
      name !== 'document.fields' &&
      !name.startsWith('slides.'))
  );
}
export function canonicalHash(value: unknown): string {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, normalize(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}
export function parseWorkTool(raw: unknown): WorkToolArgs {
  const args = WorkToolArgsSchema.parse(raw);
  if ('content' in args && Buffer.byteLength(args.content) > 64000)
    throw Error('OUTPUT_LIMIT_REACHED');
  if (args.tool === 'document.create' && Buffer.byteLength(JSON.stringify(args.spec)) > 400000)
    throw Error('OUTPUT_LIMIT_REACHED');
  if (
    (args.tool === 'slides.create' && Buffer.byteLength(JSON.stringify(args.spec)) > 400000) ||
    (args.tool === 'slides.revise' && Buffer.byteLength(JSON.stringify(args.actions)) > 64000)
  )
    throw Error('OUTPUT_LIMIT_REACHED');
  if (
    args.tool === 'document.revise' &&
    Buffer.byteLength(JSON.stringify(args.replacement)) > 64000
  )
    throw Error('OUTPUT_LIMIT_REACHED');
  return args;
}
export function workToolsForMode(mode: 'chat' | 'work') {
  return Object.values(WORK_TOOL_SPECS).filter(
    (tool) =>
      mode === 'work' ||
      (tool.mode === 'artifact_write' &&
        tool.name !== 'document.create' &&
        !tool.name.startsWith('slides.')),
  );
}
