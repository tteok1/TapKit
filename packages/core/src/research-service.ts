import {
  ResearchSpecSchema,
  ResearchProgressSchema,
  ResearchWorkToolArgsSchema,
  ResearchCommandSchemas,
  ResearchReplySchema,
  WebSourceSchema,
  ReplySchema,
  ErrorCodeSchema,
  type ResearchSpec,
  type ResearchProgress,
  type ResearchSource,
  type ResearchWorkToolArgs,
  type ResourceRef,
  type Request,
  type Reply,
  type WorkDefinition,
  type WebOptions,
  z,
} from '@tapkit/contracts';
import { StorageError, newId, type WorkRun } from '@tapkit/storage';
import {
  canonicalResearchUrl,
  researchUrlAllowed,
  researchSourceUsable,
  researchQuery,
  verifyResearchFinding,
  renderResearchReport,
  researchEvidenceHash,
  researchHash,
  researchDocumentSpec,
  researchEvidenceCatalog,
  researchCloseoutReady,
} from '@tapkit/workflows';
import { canonicalHash, catalogAllowsTool, parseWorkTool } from '@tapkit/tools';
import { publicUrl } from '@tapkit/network';
import type { WorkArtifacts } from './work-artifacts';
import type { WebService } from './web-service';
import type { ChatService } from './chat-service';
import { createWorkDocument } from './work-document';
import { setTimeout as delay } from 'node:timers/promises';

type ReaderChat = Pick<ChatService, 'material' | 'blobs' | 'store'>;
type Call = {
  id: string;
  tool_name: string;
  args_json: string;
  status: string;
  result_ref: string | null;
  step_key: string;
  task_version: number;
};
const semanticErrors = new Set([
  'UNKNOWN_QUESTION',
  'SOURCE_NOT_USABLE',
  'SOURCE_QUESTION_MISMATCH',
  'QUOTE_NOT_IN_SOURCE',
  'FACT_QUOTE_NEEDS_SENTENCE_CONTEXT',
  'EVIDENCE_REQUIRED',
  'GAP_CANNOT_ASSERT_EVIDENCE',
  'FACT_MUST_BE_A_VERBATIM_EXCERPT',
  'DISTINCT_CONFLICT_EVIDENCE_REQUIRED',
  'UNSUPPORTED_NUMBER_OR_DATE',
]);

/** Research is a bounded Work capability, not another scheduler or model runtime. */
export class ResearchService {
  readonly repo;
  private readonly queues = new Map<string, Promise<void>>();
  convert?: (
    run: WorkRun,
    step: string,
    ref: ResourceRef,
    guard: () => void,
    signal?: AbortSignal,
  ) => Promise<ResourceRef | null>;
  constructor(
    readonly artifacts: WorkArtifacts,
    readonly web: WebService,
    readonly chat: ReaderChat,
  ) {
    this.repo = artifacts.repo;
  }
  get store() {
    return this.repo.store;
  }
  validateDefinition(definition: WorkDefinition) {
    if (!definition.research) return;
    const spec = ResearchSpecSchema.parse(definition.research);
    if (definition.quantity !== 1) throw new StorageError('VALIDATION_ERROR');
    if (spec.outputFormat !== definition.format) throw new StorageError('VALIDATION_ERROR');
    for (const version of spec.localVersions)
      if (
        !definition.refs.some(
          (r) =>
            r.kind === 'file' && r.fileId === version.fileId && r.versionId === version.versionId,
        )
      )
        throw new StorageError('PERMISSION_DENIED');
    for (const url of spec.seedUrls) {
      publicUrl(url);
      if (!researchUrlAllowed(spec, url)) throw new StorageError('PERMISSION_DENIED');
    }
  }
  state(run: WorkRun, active = false) {
    const current = this.repo.row(run.id),
      state = this.repo.state(current);
    this.repo.session(current.session_id);
    if (!state.definition.research || !catalogAllowsTool(state.toolCatalogVersion, 'research.read'))
      throw new StorageError('FEATURE_NOT_AVAILABLE');
    if (active) {
      const task = this.store.db
        .prepare('SELECT current_version FROM tasks WHERE id=?')
        .get(run.task_id) as { current_version: number };
      if (task.current_version !== run.task_version || current.task_version !== run.task_version)
        throw new StorageError('CANCELLED');
    }
    return {
      current,
      definition: state.definition,
      spec: ResearchSpecSchema.parse(state.definition.research),
      progress: ResearchProgressSchema.parse(state.research ?? {}),
    };
  }
  private save(run: WorkRun, progress: ResearchProgress) {
    const current = this.repo.row(run.id),
      state = this.repo.state(current);
    if (state.research?.earlyFinish) progress.earlyFinish = true;
    progress.revision = Math.max(progress.revision, state.research?.revision ?? 1) + 1;
    if (Buffer.byteLength(JSON.stringify(progress)) > 256000)
      throw new StorageError('OUTPUT_LIMIT_REACHED');
    state.research = ResearchProgressSchema.parse(progress);
    this.repo.save(current, state);
  }
  rootCounts(run: WorkRun) {
    const row = this.store.db
      .prepare(
        "SELECT coalesce(sum(coalesce(json_extract(work_json,'$.research.searches'),0)),0) searches,coalesce(sum(coalesce(json_extract(work_json,'$.research.reads'),0)),0) reads FROM runs WHERE root_run_id=? AND profile_id=?",
      )
      .get(run.root_run_id, this.store.profileId) as { searches: number; reads: number };
    return row;
  }
  private webOptions(run: WorkRun, spec: ResearchSpec, search = false): WebOptions {
    if (
      !spec.webEnabled ||
      this.web.options(run.session_id).mode === 'off' ||
      this.web.projectOnly(run.session_id)
    )
      throw new StorageError('PERMISSION_DENIED');
    return {
      mode: 'on',
      domains: search ? ['bing.com'] : spec.includeDomains,
      excludeDomains: spec.excludeDomains,
    };
  }
  async material(run: WorkRun, source: ResearchSource) {
    if (source.status !== 'ready' || !source.ref || !source.contentHash)
      throw new StorageError('NOT_FOUND');
    let text: string,
      links: string[] = [];
    if (source.kind === 'web') {
      if (source.ref.kind !== 'web') throw new StorageError('CONFLICT');
      const owner = this.store.db
        .prepare(
          'SELECT r.root_run_id FROM web_sources w JOIN runs r ON r.id=w.run_id WHERE w.id=? AND w.profile_id=?',
        )
        .get(source.ref.sourceId, this.store.profileId) as { root_run_id: string } | undefined;
      if (!owner || owner.root_run_id !== run.root_run_id)
        throw new StorageError('PERMISSION_DENIED');
      const page = await this.web.source(run.session_id, source.ref.sourceId);
      if (page.revision !== source.ref.revision) throw new StorageError('CONFLICT');
      text = page.text;
      links = page.links;
    } else {
      if (source.ref.kind !== 'file') throw new StorageError('CONFLICT');
      // Recheck current project/session permissions, but keep the frozen extraction below.
      await this.chat.material(source.ref, run.session_id);
      // A permanent original-file deletion also removes this frozen extraction.
      const bytes = await this.artifacts.blobs.readResearchSource(source.id, run.root_run_id);
      const snapshot = z
        .strictObject({ schemaVersion: z.literal(1), text: z.string().max(60000) })
        .parse(JSON.parse(bytes.toString('utf8')));
      text = snapshot.text;
    }
    if (researchHash(text) !== source.contentHash) throw new StorageError('CONFLICT');
    return { source, text, links };
  }
  private async allowedUrl(
    run: WorkRun,
    spec: ResearchSpec,
    progress: ResearchProgress,
    url: string,
  ) {
    const normalized = canonicalResearchUrl(publicUrl(url).href);
    if (!researchUrlAllowed(spec, url)) throw new StorageError('PERMISSION_DENIED');
    const allowed = [
      ...spec.seedUrls,
      ...progress.queries.flatMap((q) => q.candidates.map((c) => c.url)),
      ...progress.sources.flatMap((s) => (s.url ? [s.url] : [])),
    ];
    if (allowed.some((v) => canonicalResearchUrl(v) === normalized)) return;
    for (const source of progress.sources) {
      if (source.kind !== 'web' || !researchSourceUsable(spec, source)) continue;
      const material = await this.material(run, source);
      if (material.links.some((v) => canonicalResearchUrl(v) === normalized)) return;
    }
    throw new StorageError('PERMISSION_DENIED');
  }
  private async search(run: WorkRun, questionKey: string, guard: () => void, signal: AbortSignal) {
    const { spec, progress } = this.state(run, true);
    const question = spec.questions.find((q) => q.key === questionKey);
    if (!question) throw Error('UNKNOWN_QUESTION');
    const options = this.webOptions(run, spec, true);
    const rounds = this.store.db
      .prepare('SELECT work_json FROM runs WHERE root_run_id=? AND profile_id=?')
      .all(run.root_run_id, this.store.profileId) as { work_json: string }[];
    const round =
      rounds.reduce((n, r) => {
        const prior = JSON.parse(r.work_json),
          priorSpec = prior.definition?.research;
        if (
          priorSpec?.topic !== spec.topic ||
          !priorSpec.questions?.some(
            (q: { key: string; text: string }) => q.key === questionKey && q.text === question.text,
          )
        )
          return n;
        return (
          n +
          (prior.research?.queries ?? []).filter(
            (q: { questionKey: string }) => q.questionKey === questionKey,
          ).length
        );
      }, 0) + 1;
    if (round > 3) throw new StorageError('BUDGET_EXCEEDED');
    const query = researchQuery(spec, questionKey, round);
    if (
      /(?:sk-[a-z0-9]{8,}|Bearer\s+\S{8,}|(?:api[_ -]?key|password|密码|密钥)\s*[:=]\s*\S+|[A-Z]:[\\/])/i.test(
        query,
      )
    )
      throw new StorageError('PERMISSION_DENIED');
    this.store.db.transaction(() => {
      guard();
      if (this.rootCounts(run).searches >= 8 || round > 3)
        throw new StorageError('BUDGET_EXCEEDED');
      progress.searches++;
      progress.queries.push({
        questionKey,
        round,
        query,
        at: this.store.now(),
        status: 'running',
        candidates: [],
        error: null,
      });
      this.save(run, progress);
    })();
    const entry = progress.queries.at(-1)!;
    try {
      const page = await this.web.tools.read(
        { url: 'https://www.bing.com/search?q=' + encodeURIComponent(query), maxChars: 20000 },
        options,
        signal,
      );
      guard();
      signal.throwIfAborted();
      this.webOptions(run, spec, true);
      const urls = new Set<string>();
      for (const link of page.links) {
        try {
          let url = new URL(link);
          if (url.hostname.endsWith('bing.com') && url.pathname === '/ck/a') {
            const target = url.searchParams.get('u');
            if (target?.startsWith('a1') && target.length < 8000)
              url = new URL(Buffer.from(target.slice(2), 'base64url').toString('utf8'));
          }
          const host = url.hostname.toLowerCase();
          if (host === 'bing.com' || host.endsWith('.bing.com') || host === 'go.microsoft.com')
            continue;
          const candidate = publicUrl(url.href).href;
          if (researchUrlAllowed(spec, candidate)) urls.add(candidate);
        } catch {
          /* Candidates remain untrusted; invalid and private URLs are omitted. */
        }
      }
      entry.candidates = [...urls]
        .slice(0, 8)
        .map((url) => ({ url, title: new URL(url).hostname }));
      entry.status = 'ready';
    } catch (error) {
      guard();
      signal.throwIfAborted();
      entry.status = 'unavailable';
      entry.error = this.code(error);
    }
    guard();
    this.save(run, progress);
    return {
      state: entry.status,
      query,
      candidates: entry.candidates,
      error: entry.error,
      citationReady: false,
    };
  }
  private async read(
    run: WorkRun,
    args: Extract<ResearchWorkToolArgs, { tool: 'research.read' }>,
    guard: () => void,
    signal: AbortSignal,
  ): Promise<{ state: string; sourceId: string; error?: string | null; reused?: boolean }> {
    const { spec, progress, definition } = this.state(run, true);
    if (args.source.kind === 'candidate') {
      const candidate =
        progress.queries[args.source.queryIndex]?.candidates[args.source.candidateIndex];
      if (!candidate) throw new StorageError('PERMISSION_DENIED');
      return this.read(
        run,
        { ...args, source: { kind: 'url', url: candidate.url } },
        guard,
        signal,
      );
    }
    if (args.source.kind === 'source') {
      const original = args.source;
      const source = progress.sources.find((s) => s.id === original.sourceId);
      if (!source || source.excluded || spec.excludedSources.includes(source.id))
        throw Error('SOURCE_NOT_USABLE');
      if (source.kind === 'web' && source.url)
        return this.read(run, { ...args, source: { kind: 'url', url: source.url } }, guard, signal);
      if (source.ref?.kind === 'file')
        return this.read(
          run,
          {
            ...args,
            source: { kind: 'file', fileId: source.ref.fileId, versionId: source.ref.versionId },
          },
          guard,
          signal,
        );
      throw Error('SOURCE_NOT_USABLE');
    }
    if (!spec.questions.some((q) => q.key === args.questionKey)) throw Error('UNKNOWN_QUESTION');
    const canonical =
      args.source.kind === 'url'
        ? canonicalResearchUrl(args.source.url)
        : 'file:' + args.source.versionId;
    if (
      progress.sources.some(
        (s) => s.canonical === canonical && (s.excluded || spec.excludedSources.includes(s.id)),
      )
    )
      throw Error('SOURCE_NOT_USABLE');
    if (args.source.kind === 'url') {
      this.webOptions(run, spec);
      await this.allowedUrl(run, spec, progress, args.source.url);
    } else if (
      !spec.localVersions.some(
        (v) =>
          args.source.kind === 'file' &&
          v.fileId === args.source.fileId &&
          v.versionId === args.source.versionId,
      )
    )
      throw new StorageError('PERMISSION_DENIED');
    if (args.source.kind === 'file' && this.isResearchOutput(args.source.versionId))
      throw new StorageError('PERMISSION_DENIED');
    const previous = progress.sources.find(
      (s) => s.canonical === canonical && !s.excluded && !spec.excludedSources.includes(s.id),
    );
    if (previous && !args.refresh) {
      if (!previous.questionKeys.includes(args.questionKey))
        previous.questionKeys.push(args.questionKey);
      progress.lastRead = { sourceId: previous.id, offset: args.offset };
      progress.sources = progress.sources.filter((s) => s.id !== previous.id).concat(previous);
      guard();
      this.save(run, progress);
      return { state: previous.status, sourceId: previous.id, reused: true };
    }
    this.store.db.transaction(() => {
      guard();
      if (this.rootCounts(run).reads >= 40 || progress.sources.length >= 40)
        throw new StorageError('BUDGET_EXCEEDED');
      progress.reads++;
      this.save(run, progress);
    })();
    const id = newId(),
      source: ResearchSource = {
        id,
        kind: args.source.kind === 'url' ? 'web' : 'file',
        ref: null,
        questionKeys: [args.questionKey],
        title: args.source.kind === 'url' ? new URL(args.source.url).hostname : '本地固定资料',
        url: args.source.kind === 'url' ? args.source.url : null,
        canonical,
        contentHash: null,
        fetchedAt: this.store.now(),
        publishedAt: null,
        status: 'unavailable',
        excluded: false,
        error: null,
        truncated: false,
      };
    try {
      if (args.source.kind === 'url') {
        const page = await this.web.tools.read(
          { url: args.source.url, maxChars: 20000 },
          this.webOptions(run, spec),
          signal,
        );
        guard();
        signal.throwIfAborted();
        this.webOptions(run, spec);
        if (!researchUrlAllowed(spec, page.url)) throw new StorageError('PERMISSION_DENIED');
        const text = page.text.slice(0, 60000);
        const { maxChars: _maxChars, ...pageData } = page;
        const snapshot = WebSourceSchema.parse({
          ...pageData,
          sourceId: id,
          revision: 1,
          text,
          contentHash: researchHash(text),
        });
        // Do not include transport-only maxChars in the strict stored snapshot.
        source.title = snapshot.title;
        source.url = snapshot.url;
        source.canonical = canonicalResearchUrl(snapshot.url);
        if (
          progress.sources.some(
            (s) =>
              s.canonical === source.canonical &&
              (s.excluded || spec.excludedSources.includes(s.id)),
          )
        )
          throw new StorageError('PERMISSION_DENIED');
        source.contentHash = snapshot.contentHash;
        source.fetchedAt = snapshot.fetchedAt;
        source.publishedAt = snapshot.publishedAt ?? null;
        source.truncated = page.text.length > text.length;
        const blob = await this.artifacts.blobs.put(
          Buffer.from(JSON.stringify(snapshot)),
          'application/vnd.tapkit.web+json',
        );
        guard();
        signal.throwIfAborted();
        this.store.db
          .prepare(
            "INSERT INTO web_sources(id,profile_id,session_id,run_id,url,canonical_url,title,fetched_at,http_status,snapshot_blob_id,content_hash,access_type) VALUES(?,?,?,?,?,?,?,?,200,?,?,'public')",
          )
          .run(
            id,
            this.store.profileId,
            run.session_id,
            run.id,
            snapshot.url,
            source.canonical,
            snapshot.title,
            snapshot.fetchedAt,
            blob.id,
            snapshot.contentHash,
          );
        source.ref = { kind: 'web', sourceId: id, revision: 1 };
      } else {
        const selected = definition.refs.find(
          (r) =>
            r.kind === 'file' &&
            args.source.kind === 'file' &&
            r.fileId === args.source.fileId &&
            r.versionId === args.source.versionId,
        );
        if (!selected || selected.kind !== 'file') throw new StorageError('PERMISSION_DENIED');
        const file = this.artifacts.files.get(selected.fileId, { versionId: selected.versionId });
        if (this.isResearchOutput(selected.versionId)) throw new StorageError('PERMISSION_DENIED');
        const material = await this.chat.material(selected, run.session_id);
        guard();
        signal.throwIfAborted();
        if (material.state !== 'ready' || !material.text?.trim())
          throw new StorageError('INDEX_NOT_READY');
        const text = material.text.slice(0, 60000);
        const blob = await this.artifacts.blobs.put(
          Buffer.from(JSON.stringify({ schemaVersion: 1, text })),
          'application/vnd.tapkit.research-source+json',
        );
        guard();
        signal.throwIfAborted();
        if (
          !this.store.db
            .prepare(
              'SELECT 1 FROM file_versions v JOIN files f ON f.id=v.file_id WHERE v.id=? AND f.id=? AND f.profile_id=? AND v.deleted_at IS NULL AND f.deleted_at IS NULL',
            )
            .get(selected.versionId, selected.fileId, this.store.profileId)
        )
          throw new StorageError('PERMISSION_DENIED');
        this.store.db
          .prepare(
            'INSERT INTO research_snapshots(id,profile_id,run_id,file_version_id,snapshot_blob_id,content_hash,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            id,
            this.store.profileId,
            run.id,
            selected.versionId,
            blob.id,
            researchHash(text),
            this.store.now(),
          );
        source.ref = selected;
        source.title = file.name;
        source.contentHash = researchHash(text);
        source.truncated = material.text.length > text.length;
      }
      source.status = 'ready';
    } catch (error) {
      guard();
      signal.throwIfAborted();
      if (error instanceof StorageError && error.code === 'PERMISSION_DENIED') throw error;
      source.error = this.code(error);
    }
    guard();
    const duplicate =
      source.status === 'ready' &&
      progress.sources.find(
        (s) =>
          s.canonical === source.canonical &&
          s.contentHash === source.contentHash &&
          s.publishedAt === source.publishedAt,
      );
    if (duplicate) {
      if (!duplicate.questionKeys.includes(args.questionKey))
        duplicate.questionKeys.push(args.questionKey);
      if (source.kind === 'web' && source.ref?.kind === 'web')
        this.store.db.prepare('DELETE FROM web_sources WHERE id=?').run(source.ref.sourceId);
      if (source.kind === 'file')
        this.store.db.prepare('DELETE FROM research_snapshots WHERE id=?').run(id);
    } else progress.sources.push(source);
    progress.lastRead = { sourceId: duplicate ? duplicate.id : source.id, offset: args.offset };
    this.save(run, progress);
    return {
      state: source.status,
      sourceId: duplicate ? duplicate.id : source.id,
      error: source.error,
    };
  }
  private isResearchOutput(versionId: string) {
    return !!this.store.db
      .prepare(
        "SELECT 1 FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=? AND r.profile_id=? AND json_extract(r.work_json,'$.definition.research') IS NOT NULL",
      )
      .get(versionId, this.store.profileId);
  }
  private async record(
    run: WorkRun,
    args: Extract<ResearchWorkToolArgs, { tool: 'research.record' }>,
    guard: () => void,
  ) {
    const { spec, progress } = this.state(run, true),
      material = new Map<string, Awaited<ReturnType<ResearchService['material']>>>();
    for (const finding of args.findings)
      for (const quote of [...finding.supports, ...finding.opposes]) {
        if (material.has(quote.sourceId)) continue;
        const source = progress.sources.find((s) => s.id === quote.sourceId);
        if (!source) throw Error('SOURCE_NOT_USABLE');
        material.set(source.id, await this.material(run, source));
        guard();
      }
    const findings = args.findings.map((f) => verifyResearchFinding(f, spec, material, newId()));
    const existing = new Map(
      progress.findings.map((f) => [canonicalHash({ ...f, id: undefined }), f]),
    );
    const verified = findings.map((finding) => {
      const key = canonicalHash({ ...finding, id: undefined });
      const old = existing.get(key);
      if (old) return old;
      existing.set(key, finding);
      return finding;
    });
    if (existing.size > 60) throw new StorageError('OUTPUT_LIMIT_REACHED');
    progress.findings = [...existing.values()];
    progress.lastIssue = null;
    guard();
    this.save(run, progress);
    return {
      verified: verified.map((f) => ({ id: f.id, kind: f.kind, questionKey: f.questionKey })),
    };
  }
  private async revalidate(run: WorkRun) {
    const { spec, progress } = this.state(run),
      material = new Map<string, Awaited<ReturnType<ResearchService['material']>>>();
    for (const finding of progress.findings) {
      for (const quote of [...finding.supports, ...finding.opposes]) {
        const source = progress.sources.find((s) => s.id === quote.sourceId);
        if (!source) throw Error('SOURCE_NOT_USABLE');
        if (!material.has(source.id)) material.set(source.id, await this.material(run, source));
      }
      const checked = verifyResearchFinding(
        {
          questionKey: finding.questionKey,
          kind: finding.kind,
          text: finding.text,
          supports: finding.supports.map(({ sourceId, quote }) => ({ sourceId, quote })),
          opposes: finding.opposes.map(({ sourceId, quote }) => ({ sourceId, quote })),
        },
        spec,
        material,
        finding.id,
      );
      if (canonicalHash(checked) !== canonicalHash(finding)) throw new StorageError('CONFLICT');
    }
    return { spec, progress };
  }
  async report(run: WorkRun, step: string, guard: () => void, signal?: AbortSignal, early = false) {
    let { spec, progress } = await this.revalidate(run);
    if (early) progress.earlyFinish = true;
    guard();
    const sourceHash = researchEvidenceHash(spec, progress);
    if (progress.report?.ready && progress.report.sourceHash === sourceHash)
      return progress.report.primary;
    const output = renderResearchReport(spec, progress);
    let report = progress.report;
    if (!report || report.sourceHash !== sourceHash) {
      const primary = await this.artifacts.publishBytes(
        run,
        '研究报告.md',
        Buffer.from(output.markdown),
        'text/markdown',
        guard,
      );
      const manifest = await this.artifacts.publishBytes(
        run,
        '研究来源清单.json',
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            topic: spec.topic,
            sources: progress.sources,
            findings: progress.findings,
          }),
        ),
        'application/json',
        guard,
      );
      progress.report = {
        primary,
        refs: [primary, manifest],
        sourceHash,
        contentHash: researchHash(output.markdown),
        quality: output.quality,
        generatedAt: this.store.now(),
        ready: false,
      };
      guard();
      this.save(run, progress);
      report = progress.report;
    }
    if (!early && spec.outputFormat !== 'md') {
      let docx = report.refs.find(
        (ref) =>
          ref.kind === 'file' &&
          this.artifacts.files.get(ref.fileId, { versionId: ref.versionId }).version.extension ===
            'docx',
      );
      if (!docx) {
        docx = await createWorkDocument(
          this.chat,
          this.artifacts.files,
          this.artifacts.blobs,
          run,
          '研究报告.docx',
          researchDocumentSpec(spec, progress, this.repo.state(run).definition),
          guard,
          () => {},
        );
        report.refs.push(docx);
        progress.report = report;
        guard();
        this.save(run, progress);
      }
      const deadline = Date.now() + 120000;
      if (docx.kind !== 'file') throw new StorageError('CONFLICT');
      while (
        this.artifacts.files.get(docx.fileId, { versionId: docx.versionId }).version.parseStatus !==
        'ready'
      ) {
        guard();
        signal?.throwIfAborted();
        const version = this.artifacts.files.get(docx.fileId, {
          versionId: docx.versionId,
        }).version;
        if (version.parseStatus === 'failed') {
          const code = ErrorCodeSchema.safeParse(version.errorCode);
          throw new StorageError(code.success ? code.data : 'PARSE_FAILED');
        }
        if (Date.now() > deadline) throw new StorageError('PARSE_FAILED');
        await delay(100);
      }
      if (spec.outputFormat === 'pdf') {
        if (!this.convert) throw new StorageError('FEATURE_NOT_AVAILABLE');
        const pdf = await this.convert(run, step, docx, guard, signal);
        if (!pdf) throw new StorageError('SIDE_EFFECT_UNKNOWN');
        if (!report.refs.some((r) => canonicalHash(r) === canonicalHash(pdf)))
          report.refs.push(pdf);
      }
    }
    guard();
    signal?.throwIfAborted();
    ({ spec, progress } = await this.revalidate(run));
    guard();
    if (researchEvidenceHash(spec, progress) !== sourceHash) throw new StorageError('CONFLICT');
    progress.report = { ...report, ready: true, quality: early ? 'partial' : report.quality };
    this.save(run, progress);
    return report.primary;
  }
  private code(error: unknown) {
    return error instanceof StorageError
      ? error.code
      : error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
        ? error.message
        : 'WEB_UNAVAILABLE';
  }
  parameterIssue(run: WorkRun, issue: string) {
    const errors = this.store.db.transaction(() => {
      const { progress } = this.state(run, true);
      progress.parameterErrors++;
      progress.lastIssue = issue;
      this.save(run, progress);
      this.repo.event(run, 'tool.validation', '研究参数需要修正：' + issue);
      return progress.parameterErrors;
    })();
    if (errors > 2) throw new StorageError('PARSE_FAILED');
  }
  async execute(
    run: WorkRun,
    step: string,
    raw: unknown,
    guard: () => void,
    signal = new AbortController().signal,
  ): Promise<ResourceRef> {
    const key = run.root_run_id ?? run.id;
    const before = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, tail);
    await before;
    try {
      signal.throwIfAborted();
      return await this.executeExclusive(run, step, raw, guard, signal);
    } finally {
      release();
      if (this.queues.get(key) === tail) this.queues.delete(key);
    }
  }
  private async executeExclusive(
    run: WorkRun,
    step: string,
    raw: unknown,
    guard: () => void,
    signal = new AbortController().signal,
  ): Promise<ResourceRef> {
    const args = ResearchWorkToolArgsSchema.parse(parseWorkTool(raw));
    this.state(run, true);
    guard();
    signal.throwIfAborted();
    const key = canonicalHash({
      run: run.id,
      version: run.task_version,
      step,
      turn: this.repo.row(run.id).calls,
      args,
    });
    const old = this.store.db
      .prepare(
        'SELECT id,status,result_ref FROM tool_calls WHERE profile_id=? AND idempotency_key=?',
      )
      .get(this.store.profileId, key) as Call | undefined;
    if (old?.result_ref && old.status === 'succeeded')
      return JSON.parse(old.result_ref) as ResourceRef;
    const id = old?.id ?? newId(),
      now = this.store.now();
    this.store.db.transaction(() => {
      guard();
      const { definition } = this.state(run, true);
      if (this.repo.rootUsage(run).tools >= definition.budgetOverrides.maxTools)
        throw new StorageError('BUDGET_EXCEEDED');
      if (old) throw new StorageError('CONFLICT');
      this.store.db
        .prepare(
          "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect,step_key,content_hash,lease_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'dispatched','none',?,?,?)",
        )
        .run(
          id,
          this.store.profileId,
          now,
          now,
          run.id,
          run.task_version,
          id,
          args.tool,
          '1',
          JSON.stringify(args),
          canonicalHash(args),
          canonicalHash(this.repo.state(run).definition.research),
          key,
          step,
          canonicalHash(args),
          run.lease_epoch,
        );
      this.store.db.prepare('UPDATE runs SET tools=tools+1 WHERE id=?').run(run.id);
      this.store.db
        .prepare(
          'INSERT INTO tool_call_attempts(id,profile_id,tool_call_id,attempt_no,started_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), this.store.profileId, id, 1, now);
      this.repo.event(run, 'tool.dispatched', args.tool);
    })();
    try {
      let result: unknown, primary: ResourceRef | undefined;
      try {
        if (args.tool === 'research.search')
          result = await this.search(run, args.questionKey, guard, signal);
        else if (args.tool === 'research.read') result = await this.read(run, args, guard, signal);
        else if (args.tool === 'research.record') result = await this.record(run, args, guard);
        else primary = await this.report(run, step, guard, signal);
      } catch (error) {
        guard();
        signal.throwIfAborted();
        if (!(error instanceof Error) || !semanticErrors.has(error.message)) throw error;
        const { progress } = this.state(run, true);
        progress.parameterErrors++;
        progress.lastIssue = error.message;
        this.save(run, progress);
        if (progress.parameterErrors > 2) throw new StorageError('PARSE_FAILED');
        result = {
          error: error.message,
          correction:
            '只使用已读sourceId和包含完整否定/句子上下文的逐字原文；无法支持的结论改为证据缺口。',
        };
      }
      if (args.tool !== 'research.report') {
        const { progress } = this.state(run, true);
        const hash = canonicalHash({
          queries: progress.queries,
          sources: [...progress.sources].sort((a, b) => a.id.localeCompare(b.id)),
          findings: progress.findings,
          lastRead: progress.lastRead,
        });
        const previous = progress.stagnation;
        const repeats = previous?.hash === hash ? previous.repeats + 1 : 0;
        if (repeats >= 4) throw new StorageError('BUDGET_EXCEEDED');
        progress.stagnation = { hash, repeats, replanned: previous?.replanned || repeats === 3 };
        if (repeats === 3)
          progress.lastIssue =
            'REPLAN_REQUIRED：连续三次没有新证据，请改查其他来源或保存部分报告。';
        this.save(run, progress);
      }
      const committed = (ref: ResourceRef) => {
        guard();
        this.store.db
          .prepare(
            "UPDATE tool_calls SET status='succeeded',side_effect='committed',result_ref=?,updated_at=? WHERE id=? AND status='dispatched'",
          )
          .run(JSON.stringify(ref), this.store.now(), id);
        this.store.db
          .prepare('UPDATE tool_call_attempts SET ended_at=? WHERE tool_call_id=?')
          .run(this.store.now(), id);
        this.repo.event(run, 'tool.finished', args.tool);
      };
      if (primary) {
        this.store.db.transaction(() => committed(primary!))();
        return primary;
      }
      return await this.artifacts.publishBytes(
        run,
        '研究回执-' + id + '.json',
        Buffer.from(JSON.stringify({ kind: 'tapkit.research', result })),
        'application/json',
        guard,
        committed,
      );
    } catch (error) {
      try {
        guard();
        const { progress } = this.state(run, true);
        if (args.tool === 'research.search') {
          for (const query of progress.queries)
            if (query.status === 'running') {
              query.status = 'unavailable';
              query.error = this.code(error);
            }
          this.save(run, progress);
        }
      } catch {
        /* A revoked lease cannot write late progress. */
      }
      this.store.db
        .prepare(
          "UPDATE tool_calls SET status='failed',side_effect='not_committed',updated_at=? WHERE id=? AND status='dispatched'",
        )
        .run(this.store.now(), id);
      this.store.db
        .prepare('UPDATE tool_call_attempts SET ended_at=? WHERE tool_call_id=?')
        .run(this.store.now(), id);
      throw error;
    }
  }
  async verify(run: WorkRun) {
    try {
      const { spec, progress } = await this.revalidate(run),
        report = progress.report;
      if (
        !report?.ready ||
        report.sourceHash !== researchEvidenceHash(spec, progress) ||
        report.primary.kind !== 'file'
      )
        return false;
      const { bytes } = await this.artifacts.files.original(report.primary.fileId, {
        versionId: report.primary.versionId,
        owner: { type: 'task', id: run.task_id },
      });
      return researchHash(bytes.toString('utf8')) === report.contentHash;
    } catch {
      return false;
    }
  }
  artifactRefs(run: WorkRun, refs: ResourceRef[]) {
    return this.state(run).progress.report?.ready
      ? this.state(run).progress.report!.refs
      : refs.slice(-1);
  }
  completion(run: WorkRun): 'completed' | 'partial' {
    return this.state(run).progress.report?.quality === 'complete' ? 'completed' : 'partial';
  }
  async resume(
    run: WorkRun,
    step: string,
    guard: () => void,
    options: { allowDispatch?: boolean; signal?: AbortSignal } = {},
  ) {
    guard();
    const { progress } = this.state(run);
    if (progress.report?.ready) {
      if (!(await this.verify(run))) throw new StorageError('CONFLICT');
      return progress.report.refs;
    }
    if (progress.report && options.allowDispatch !== false) {
      await this.report(run, step, guard, options.signal);
      return this.state(run).progress.report!.refs;
    }
    return undefined;
  }
  requestEarlyFinish(run: WorkRun) {
    const { progress } = this.state(run, true);
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name NOT LIKE 'research.%' AND status IN('dispatched','pending','unknown')",
        )
        .get(run.id)
    )
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    progress.earlyFinish = true;
    this.save(run, progress);
  }
  cancelReadOnly(run: WorkRun) {
    this.store.db
      .prepare(
        "UPDATE tool_calls SET status='cancelled',side_effect='not_committed' WHERE run_id=? AND tool_name LIKE 'research.%' AND status IN('proposed','dispatched','pending')",
      )
      .run(run.id);
    this.store.db
      .prepare(
        "UPDATE tool_call_attempts SET ended_at=coalesce(ended_at,?) WHERE tool_call_id IN(SELECT id FROM tool_calls WHERE run_id=? AND tool_name LIKE 'research.%' AND status='cancelled')",
      )
      .run(this.store.now(), run.id);
    const { progress } = this.state(run);
    for (const query of progress.queries)
      if (query.status === 'running') {
        query.status = 'unavailable';
        query.error = 'CANCELLED';
      }
    this.save(run, progress);
  }
  async finishEarly(run: WorkRun, guard: () => void) {
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM tool_calls WHERE run_id=? AND status IN('dispatched','pending','unknown') AND tool_name NOT LIKE 'research.%'",
        )
        .get(run.id)
    )
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    const { spec, progress } = this.state(run, true);
    progress.earlyFinish = true;
    const material = new Map<string, Awaited<ReturnType<ResearchService['material']>>>();
    for (const source of progress.sources) {
      if (!researchSourceUsable(spec, source)) continue;
      try {
        material.set(source.id, await this.material(run, source));
        guard();
      } catch {
        source.status = 'unavailable';
        source.error = 'SOURCE_NOT_USABLE';
      }
    }
    progress.findings = progress.findings.map((finding) => {
      try {
        return verifyResearchFinding(
          {
            questionKey: finding.questionKey,
            kind: finding.kind,
            text: finding.text,
            supports: finding.supports.map(({ sourceId, quote }) => ({ sourceId, quote })),
            opposes: finding.opposes.map(({ sourceId, quote }) => ({ sourceId, quote })),
          },
          spec,
          material,
          finding.id,
        );
      } catch {
        return {
          id: finding.id,
          questionKey: finding.questionKey,
          kind: 'gap' as const,
          text: '此问题尚无足够可核验的原文证据。',
          supports: [],
          opposes: [],
          distinctSourceGroups: 0,
        };
      }
    });
    guard();
    this.cancelReadOnly(run);
    this.save(run, progress);
    await this.report(run, 'deliver-1', guard, undefined, true);
    return this.state(run).progress.report!.refs;
  }
  recover(run: WorkRun) {
    const { progress } = this.state(run);
    for (const query of progress.queries)
      if (query.status === 'running') {
        query.status = 'unavailable';
        query.error = 'STREAM_INTERRUPTED';
      }
    this.save(run, progress);
    this.store.db
      .prepare(
        "UPDATE tool_calls SET status='failed',side_effect='not_committed' WHERE run_id=? AND tool_name LIKE 'research.%' AND status IN('proposed','dispatched','pending')",
      )
      .run(run.id);
    this.store.db
      .prepare(
        "UPDATE tool_call_attempts SET ended_at=coalesce(ended_at,?) WHERE tool_call_id IN(SELECT id FROM tool_calls WHERE run_id=? AND tool_name LIKE 'research.%' AND status='failed')",
      )
      .run(this.store.now(), run.id);
  }
  async context(run: WorkRun) {
    const { spec, progress } = this.state(run),
      usable = progress.sources.filter((s) => researchSourceUsable(spec, s)).slice(-8),
      materials = [];
    const allowance = Math.floor(24000 / Math.max(1, usable.length) / 3);
    for (const source of usable) {
      const item = await this.material(run, source);
      const offset = progress.lastRead?.sourceId === source.id ? progress.lastRead.offset : 0;
      const excerpt = item.text.slice(offset, offset + allowance);
      materials.push({
        source: {
          id: source.id,
          kind: source.kind,
          title: source.title.slice(0, 160),
          urlPreview: source.url?.slice(0, 180),
          publishedAt: source.publishedAt,
          fetchedAt: source.fetchedAt,
          questionKeys: source.questionKeys,
        },
        offset,
        text: excerpt,
        evidence: researchEvidenceCatalog(source, item.text, offset, allowance),
        nextOffset: offset + excerpt.length < item.text.length ? offset + excerpt.length : null,
        truncated: source.truncated || offset > 0 || excerpt.length < item.text.length,
      });
    }
    return {
      trust: 'tool_result_data',
      kind: 'research_current_state',
      spec,
      root: this.rootCounts(run),
      materials,
      sourceIndex: progress.sources.map((s) => ({
        id: s.id,
        title: s.title.slice(0, 160),
        urlPreview: s.url?.slice(0, 180),
        questionKeys: s.questionKeys,
        status: s.status,
        publishedAt: s.publishedAt,
        error: s.error,
        excluded: s.excluded || spec.excludedSources.includes(s.id),
        source: { kind: 'source', sourceId: s.id },
      })),
      queries: progress.queries
        .map((q, queryIndex) => ({
          questionKey: q.questionKey,
          query: q.query,
          status: q.status,
          error: q.error,
          candidates: q.candidates.map((c, candidateIndex) => ({
            title: c.title.slice(0, 160),
            urlPreview: c.url.slice(0, 180),
            source: { kind: 'candidate', queryIndex, candidateIndex },
          })),
        }))
        .slice(-3),
      findings: progress.findings.slice(-20).map((f) => ({
        id: f.id,
        questionKey: f.questionKey,
        kind: f.kind,
        text: f.text.slice(0, 180),
        sources: [...f.supports, ...f.opposes].map((q) => q.sourceId),
      })),
      lastIssue: progress.lastIssue,
      report: progress.report ?? null,
    };
  }
  closeout(run: WorkRun) {
    const { spec, progress } = this.state(run, true);
    if (!progress.report?.ready && researchCloseoutReady(spec, progress))
      return {
        text: 'Core已按证据进度进入报告核验与导出。',
        calls: [{ tool: 'research.report' as const }],
        finished: true,
      };
    return undefined;
  }
  async dispatch(request: Request): Promise<Reply> {
    const ok = (data: unknown) =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data });
    if (request.command === 'research.get') {
      const p = ResearchCommandSchemas['research.get'].parse(request.payload),
        run = this.repo.row(p.runId),
        { spec, progress } = this.state(run),
        root = this.rootCounts(run);
      const sources = progress.sources.slice(p.sourceOffset, p.sourceOffset + 8),
        findings = progress.findings.slice(p.findingOffset, p.findingOffset + 3).map((f) => ({
          ...f,
          supports: f.supports.map(({ quote: _quote, ...q }) => q),
          opposes: f.opposes.map(({ quote: _quote, ...q }) => q),
        }));
      const view = {
        spec,
        progress: {
          ...progress,
          sources,
          findings,
          queries: progress.queries.map((q) => ({
            ...q,
            query: q.query.slice(0, 200),
            candidates: [],
          })),
        },
        rootSearches: root.searches,
        rootReads: root.reads,
        totalSources: progress.sources.length,
        totalFindings: progress.findings.length,
        nextSourceOffset: null as number | null,
        nextFindingOffset: null as number | null,
      };
      while (
        Buffer.byteLength(JSON.stringify(view)) > 60000 &&
        (findings.length > 1 || sources.length > 1)
      ) {
        if (findings.length > 1) findings.pop();
        else sources.pop();
      }
      if (p.sourceOffset + sources.length < progress.sources.length)
        view.nextSourceOffset = p.sourceOffset + sources.length;
      if (p.findingOffset + findings.length < progress.findings.length)
        view.nextFindingOffset = p.findingOffset + findings.length;
      return ok(ResearchReplySchema.parse({ research: view }));
    }
    if (request.command === 'research.source') {
      const p = ResearchCommandSchemas['research.source'].parse(request.payload),
        run = this.repo.row(p.runId),
        { progress } = this.state(run);
      const source = progress.sources.find((s) => s.id === p.sourceId);
      if (!source) throw new StorageError('PERMISSION_DENIED');
      const material = await this.material(run, source);
      const finding = p.findingId ? progress.findings.find((f) => f.id === p.findingId) : undefined;
      if (p.findingId && !finding) throw new StorageError('NOT_FOUND');
      const quote = finding
        ? [...finding.supports, ...finding.opposes].filter((q) => q.sourceId === source.id)[
            p.quoteIndex
          ]
        : undefined;
      if (finding && !quote) throw new StorageError('NOT_FOUND');
      const offset = quote ? Math.max(0, quote.start - 800) : 0;
      return ok(
        ResearchReplySchema.parse({
          researchSource: source,
          text: material.text.slice(offset, offset + 12000),
          offset,
          highlights: quote ? [quote] : [],
        }),
      );
    }
    throw new StorageError('FEATURE_NOT_AVAILABLE');
  }
}
