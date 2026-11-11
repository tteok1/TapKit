import { extname, join } from 'node:path';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import {
  CodePathSchema,
  ErrorCodeSchema,
  ReplySchema,
  SiteCommandSchemas,
  SiteVersionSchema,
  type Reply,
  type Request,
  type SiteVersion,
  type SiteView,
  z,
} from '@tapkit/contracts';
import { failure, newId, StorageError } from '@tapkit/storage';
import {
  canonicalHash,
  codeCanonical,
  codeHash,
  codeTree,
  managedZip,
  SandboxError,
} from '@tapkit/tools';
import type { CodeRuntimeService } from './code-runtime';
import type { CodeService } from './code-service';
import { siteTemplate } from './site-template';

const mib = 1024 ** 2;
const staticTypes = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.png',
  '.jpeg',
  '.jpg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
]);
const packaged = z.strictObject({
  version: SiteVersionSchema,
  source: z.array(z.tuple([CodePathSchema, z.string().max(mib)])).max(1000),
  assets: z
    .array(z.strictObject({ path: CodePathSchema, base64: z.string().max(2800000) }))
    .max(200),
});
type Snapshot = z.infer<typeof packaged>;

export async function captureSiteAssets(root: string): Promise<Snapshot['assets']> {
  const paths = await codeTree(root);
  if (!paths.includes('index.html')) throw new StorageError('NOT_FOUND');
  if (paths.length > 200) throw new StorageError('OUTPUT_LIMIT_REACHED');
  const entries: Snapshot['assets'] = [];
  let total = 0;
  for (const path of paths) {
    if (!staticTypes.has(extname(path).toLowerCase())) continue;
    const file = join(root, path),
      before = await codeCanonical(file);
    if (before.nlink !== 1) throw new StorageError('PERMISSION_DENIED');
    if (before.size > 2 * mib || (total += before.size) > 8 * mib)
      throw new StorageError('OUTPUT_LIMIT_REACHED');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.nlink !== 1 || opened.size !== before.size)
        throw new StorageError('CONFLICT');
      const bytes = Buffer.alloc(before.size + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      const after = await codeCanonical(file);
      if (
        after.ino !== before.ino ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        bytesRead !== before.size
      )
        throw new StorageError('CONFLICT');
      entries.push({ path, base64: bytes.subarray(0, bytesRead).toString('base64') });
    } finally {
      await handle.close();
    }
  }
  return entries;
}

export async function siteArchive(source: Snapshot['source']) {
  const secret =
    /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|github_pat_[\w]{20,}|gh[pousr]_[\w]{20,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']/i;
  const entries = source.filter(
    ([path]) =>
      CodePathSchema.safeParse(path).success &&
      !path.split('/').some((part) => /^(?:dist|coverage|cache|secrets?|\.git.*)$/i.test(part)),
  );
  if (
    !entries.some(([path]) => path === 'package-lock.json') ||
    !entries.some(([path]) => path === 'README.md')
  )
    throw new StorageError('NOT_FOUND');
  if (entries.some(([, content]) => secret.test(content)))
    throw new StorageError('PERMISSION_DENIED');
  return managedZip(entries.map(([name, content]) => ({ name, bytes: Buffer.from(content) })));
}

export class SiteService {
  private building = new Set<string>();
  constructor(
    private code: CodeService,
    private runtime: CodeRuntimeService,
  ) {}

  private get snapshots() {
    return join(this.code.store.dataDir, 'site-versions');
  }
  private async snapshot(runId: string, versionId: string) {
    const info = this.code.siteInfo(runId);
    const version = info.versions.find((item) => item.id === versionId);
    if (!version) throw new StorageError('NOT_FOUND');
    const path = join(this.snapshots, versionId + '.json'),
      stat = await codeCanonical(path);
    if (stat.nlink !== 1 || stat.size > 48 * mib) throw new StorageError('PERMISSION_DENIED');
    const snapshot = packaged.parse(JSON.parse(await readFile(path, 'utf8')));
    if (
      snapshot.version.id !== versionId ||
      snapshot.version.sourceHash !== version.sourceHash ||
      codeHash(JSON.stringify(snapshot.source.map(([path, text]) => [path, codeHash(text)]))) !==
        version.sourceHash
    )
      throw new StorageError('CONFLICT');
    return snapshot;
  }
  private async view(runId: string): Promise<SiteView> {
    const { brief, versions } = this.code.siteInfo(runId);
    const { sourceHash } = await this.code.executionWorkspace(runId);
    return { runId, brief, versions, sourceHash };
  }
  private async build(runId: string, prepareDependencies: boolean): Promise<SiteView> {
    if (this.building.has(runId)) throw new StorageError('CONFLICT');
    this.building.add(runId);
    try {
      const info = this.code.siteInfo(runId);
      if (info.versions.length >= 16) throw new StorageError('OUTPUT_LIMIT_REACHED');
      if (prepareDependencies) {
        const profile = await this.runtime.prepare(runId, 'node', true);
        if (profile.state !== 'ready') throw new StorageError('FEATURE_NOT_AVAILABLE');
      }
      const versionId = newId();
      const out = '.tapkit-runtime/site-dist/' + versionId;
      const source = await this.code.siteSource(runId);
      const process = await this.runtime.start(
        runId,
        {
          runtime: 'node',
          argv: ['npm', 'run', 'build', '--', '--outDir', out],
          cwd: '.',
          timeoutMs: 90000,
        },
        false,
      );
      const result = await this.runtime.finished(runId, process.id);
      const view = await this.view(runId);
      view.build = {
        processId: result.id,
        state: result.state === 'succeeded' ? 'succeeded' : 'failed',
        exitCode: result.exitCode,
      };
      const output = join(source.root, out);
      try {
        if (result.state !== 'succeeded' || result.exitCode !== 0) return view;
        if (source.sourceHash !== result.sourceHash || source.sourceHash !== view.sourceHash)
          throw new StorageError('CONFLICT');
        const assets = await captureSiteAssets(output);
        const version: SiteVersion = {
          id: versionId,
          sourceHash: source.sourceHash,
          processId: process.id,
          createdAt: this.code.store.now(),
        };
        await mkdir(this.snapshots, { recursive: true });
        await codeCanonical(this.snapshots, true);
        const file = join(this.snapshots, versionId + '.json');
        await writeFile(file, JSON.stringify({ version, source: source.entries, assets }), {
          flag: 'wx',
        });
        try {
          await this.code.recordSiteVersion(runId, version);
        } catch (error) {
          await rm(file, { force: true });
          throw error;
        }
        view.versions = [version, ...view.versions];
        return view;
      } finally {
        // Only the fresh, privately named output for this build may be removed.
        const parent = join(source.root, '.tapkit-runtime', 'site-dist');
        if (
          await codeCanonical(parent, true).then(
            () => true,
            () => false,
          )
        )
          await rm(output, { recursive: true, force: true }).catch(() => {});
      }
    } finally {
      this.building.delete(runId);
    }
  }
  async dispatch(request: Request): Promise<Reply> {
    const { requestId, command, payload } = request;
    const { store } = this.code;
    let reserved = false;
    const settle = (reply: Reply) => {
      if (reserved)
        store.db
          .prepare(
            "UPDATE request_receipts SET state='completed',reply_json=? WHERE profile_id=? AND request_id=?",
          )
          .run(JSON.stringify({ schemaVersion: 1, reply }), store.profileId, requestId);
      return reply;
    };
    try {
      const schema = SiteCommandSchemas[command as keyof typeof SiteCommandSchemas];
      if (!schema) throw new StorageError('FEATURE_NOT_AVAILABLE');
      const input = schema.parse(payload);
      const { runId } = input;
      const run = this.code.siteRun(runId);
      if (command !== 'site.status') {
        const hash = canonicalHash({ command, input });
        const receipt = store.db
          .prepare(
            'SELECT payload_hash,state,reply_json FROM request_receipts WHERE profile_id=? AND request_id=?',
          )
          .get(store.profileId, requestId) as
          { payload_hash: string; state: string; reply_json: string | null } | undefined;
        if (receipt) {
          if (receipt.payload_hash !== hash) throw new StorageError('CONFLICT');
          if (receipt.state !== 'completed' || !receipt.reply_json)
            throw new StorageError('SIDE_EFFECT_UNKNOWN');
          return ReplySchema.parse(JSON.parse(receipt.reply_json).reply);
        }
        store.db
          .prepare(
            "INSERT INTO request_receipts(profile_id,request_id,command,payload_hash,state,reply_json,expires_at,owner_session_id) VALUES(?,?,?,?,'pending',NULL,?,?)",
          )
          .run(store.profileId, requestId, command, hash, store.now() + 86400000, run.session_id);
        reserved = true;
      }
      let site: SiteView;
      switch (command) {
        case 'site.status':
          site = await this.view(runId);
          break;
        case 'site.create': {
          const { brief } = SiteCommandSchemas[command].parse(payload);
          await this.code.createSiteWorkspace(runId, brief, siteTemplate(brief));
          site = await this.view(runId);
          break;
        }
        case 'site.build':
          site = await this.build(
            runId,
            SiteCommandSchemas[command].parse(payload).prepareDependencies,
          );
          break;
        case 'site.restore': {
          const { versionId, expectedSourceHash } = SiteCommandSchemas[command].parse(payload);
          const snapshot = await this.snapshot(runId, versionId);
          await this.code.restoreSite(runId, expectedSourceHash, snapshot.source);
          site = await this.view(runId);
          break;
        }
        case 'site.copy': {
          const { versionId, targetRunId } = SiteCommandSchemas[command].parse(payload);
          if (this.code.siteRun(runId).session_id !== this.code.siteRun(targetRunId).session_id)
            throw new StorageError('PERMISSION_DENIED');
          const { brief } = this.code.siteInfo(runId);
          const snapshot = await this.snapshot(runId, versionId);
          await this.code.createSiteWorkspace(
            targetRunId,
            brief,
            Object.fromEntries(snapshot.source),
          );
          site = await this.view(targetRunId);
          break;
        }
        default:
          throw new StorageError('FEATURE_NOT_AVAILABLE');
      }
      return settle(ReplySchema.parse({ requestId, ok: true, data: { site } }));
    } catch (error) {
      return settle(this.error(requestId, error));
    }
  }
  async transfer(
    requestId: string,
    runId: string,
    versionId: string,
    kind: 'assets' | 'check' | 'archive',
  ): Promise<Reply> {
    try {
      const { lease, versions } = this.code.siteInfo(runId);
      if (!versions.some((version) => version.id === versionId))
        throw new StorageError('NOT_FOUND');
      const siteTransfer =
        kind === 'check'
          ? { kind, lease }
          : kind === 'assets'
            ? { kind, lease, entries: (await this.snapshot(runId, versionId)).assets }
            : {
                kind,
                base64: (
                  await siteArchive((await this.snapshot(runId, versionId)).source)
                ).toString('base64'),
              };
      return ReplySchema.parse({ requestId, ok: true, data: { siteTransfer } });
    } catch (error) {
      return this.error(requestId, error);
    }
  }
  private error(id: string, error: unknown) {
    const code = ErrorCodeSchema.safeParse(error instanceof Error ? error.message : error);
    return failure(
      id,
      error instanceof StorageError
        ? error.code
        : error instanceof SandboxError
          ? 'SANDBOX_UNAVAILABLE'
          : error instanceof z.ZodError
            ? 'VALIDATION_ERROR'
            : code.success
              ? code.data
              : 'INTERNAL_ERROR',
    );
  }
}
