import { WorkToolArgsSchema, type WorkToolArgs } from '@tapkit/contracts';
import { createHash } from 'node:crypto';
export const WORK_TOOL_CATALOG_VERSION = 'p06-tools-1';
export const WORK_TOOL_SPECS = {
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
  return args;
}
export function workToolsForMode(mode: 'chat' | 'work') {
  return Object.values(WORK_TOOL_SPECS).filter(
    (tool) => mode === 'work' || tool.mode === 'artifact_write',
  );
}
