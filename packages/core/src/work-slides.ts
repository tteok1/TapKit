import {
  AnalysisResultSchema,
  SlideDeckSpecSchema,
  type WorkToolArgs,
  type ResourceRef,
  type SlideDeckSpec,
} from '@tapkit/contracts';
import { SlideRepository, StorageError, type WorkRun } from '@tapkit/storage';
import { renderSlideDeck, reviseSlideDeck, slideHashes, type SlideChart } from '@tapkit/workflows';
import type { WorkArtifacts } from './work-artifacts';
import type { ChatService } from './chat-service';
import { resolveWorkDocumentImage } from './work-document';
import { analysisPage, dataSources } from './work-data';
import type { WorkNativeTools } from './work-native';

type Chat = Pick<ChatService, 'store' | 'blobs' | 'material'>;
type Args = Extract<WorkToolArgs, { tool: 'slides.create' | 'slides.revise' }>;
export async function resolveSlideChart(
  artifacts: WorkArtifacts,
  run: WorkRun,
  ref: NonNullable<SlideDeckSpec['slides'][number]['chartRef']>,
): Promise<SlideChart> {
  const repo = artifacts.repo,
    current = repo.row(run.id),
    session = repo.session(run.session_id);
  const origin = artifacts.files.store.db
    .prepare(
      'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=?',
    )
    .get(ref.versionId) as { root_run_id: string } | undefined;
  if (
    origin?.root_run_id !== run.root_run_id &&
    !repo
      .state(current)
      .definition.refs.some(
        (r) =>
          r.kind === 'file' &&
          r.fileId === ref.fileId &&
          r.versionId === ref.versionId &&
          !r.locator &&
          !r.selection,
      )
  )
    throw new StorageError('PERMISSION_DENIED');
  let file;
  try {
    file = artifacts.files.get(ref.fileId, {
      versionId: ref.versionId,
      owner: { type: 'session', id: run.session_id },
    });
  } catch (error) {
    if (
      !(error instanceof StorageError) ||
      error.code !== 'PERMISSION_DENIED' ||
      !session.project_id
    )
      throw error;
    file = artifacts.files.get(ref.fileId, {
      versionId: ref.versionId,
      owner: { type: 'project', id: session.project_id },
    });
  }
  const receipt = artifacts.files.store.db
    .prepare(
      "SELECT 1 FROM tool_calls WHERE profile_id=? AND tool_name='data.analyze' AND status='succeeded' AND json_extract(result_ref,'$.versionId')=?",
    )
    .get(artifacts.files.store.profileId, ref.versionId);
  if (file.kind !== 'artifact' || file.version.extension !== 'json' || !receipt)
    throw new StorageError('FORMAT_UNSUPPORTED');
  const raw = await artifacts.files.original(ref.fileId, { versionId: ref.versionId });
  const value = AnalysisResultSchema.parse(JSON.parse(raw.bytes.toString('utf8')));
  dataSources(artifacts, run, value.spec);
  const chart = analysisPage(value, { offset: 0, filters: [] }).charts.find(
    (c) => c.spec.id === ref.chartId,
  );
  if (!chart || chart.spec.type === 'scatter' || chart.rows.length > 1000)
    throw new StorageError('FORMAT_UNSUPPORTED');
  const x = chart.columns.findIndex((c) => c.key === chart.spec.xField),
    labels = chart.rows.map((r) => String(r[x] ?? ''));
  const series = chart.spec.yFields.map((field) => {
    const i = chart.columns.findIndex((c) => c.key === field),
      values = chart.rows.map((r) => r[i]);
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
      throw new StorageError('FORMAT_UNSUPPORTED');
    return { name: chart.columns[i]!.label, labels, values: values as number[] };
  });
  const xLabel = chart.spec.xLabel || chart.columns[x]?.label,
    yLabel = chart.spec.yLabel || chart.columns.find((c) => c.key === chart.spec.yFields[0])?.unit;
  return {
    type: chart.spec.type,
    series,
    ...(xLabel ? { xLabel } : {}),
    ...(yLabel ? { yLabel } : {}),
  };
}
async function assets(
  artifacts: WorkArtifacts,
  chat: Chat,
  run: WorkRun,
  spec: SlideDeckSpec,
  guard: () => void,
) {
  for (const s of spec.slides) {
    guard();
    if (s.imageVersionId) await resolveWorkDocumentImage(chat, run, s.imageVersionId, guard);
    if (s.chartRef) await resolveSlideChart(artifacts, run, s.chartRef);
  }
  guard();
}
export async function verifyWorkSlideSources(
  artifacts: WorkArtifacts,
  chat: Chat,
  run: WorkRun,
  spec: SlideDeckSpec,
) {
  try {
    await assets(artifacts, chat, run, spec, () => {});
    return true;
  } catch {
    return false;
  }
}
export async function publishWorkSlides(
  artifacts: WorkArtifacts,
  chat: Chat,
  native: WorkNativeTools,
  run: WorkRun,
  args: Args,
  guard: () => void,
  committed: (ref: ResourceRef) => void,
  signal: AbortSignal,
  identity?: Parameters<WorkNativeTools['execute']>[5],
) {
  const repo = new SlideRepository(artifacts.files),
    owner = { type: 'task' as const, id: run.task_id },
    store = artifacts.files.store;
  let raw: SlideDeckSpec, name: string;
  if (args.tool === 'slides.create') {
    const options = artifacts.repo.state(artifacts.repo.row(run.id)).definition.slideOptions;
    raw = SlideDeckSpecSchema.parse({
      ...args.spec,
      ...(options ? { aspectRatio: options.aspectRatio, theme: options.theme } : {}),
    });
    if (options && raw.slides.length !== options.pageCount)
      throw new StorageError('VALIDATION_ERROR');
    name = args.name;
  } else {
    const previous = repo.read(args.fileId, args.versionId, owner);
    const current = artifacts.files.get(args.fileId, { owner });
    if (current.currentVersionId !== args.versionId || current.revision !== args.revision)
      throw new StorageError('CONFLICT');
    raw = reviseSlideDeck(previous.spec, args.actions);
    name = artifacts.files.get(args.fileId, { versionId: args.versionId, owner }).name;
  }
  await assets(artifacts, chat, run, raw, guard);
  const draft = await renderSlideDeck(raw, {
    image: (id) => resolveWorkDocumentImage(chat, run, id, guard),
    chart: (ref) => resolveSlideChart(artifacts, run, ref),
  });
  const rendered = await native.renderSlidesCandidate(
    run,
    draft.bytes,
    draft.spec,
    guard,
    signal,
    identity,
  );
  const pptxBlob = await artifacts.blobs.put(
      draft.bytes,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ),
    pdfBlob = await artifacts.blobs.put(rendered.pdf, 'application/pdf');
  await assets(artifacts, chat, run, draft.spec, guard);
  const own = (store.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n,
    other = store.db.pragma('data_version', { simple: true });
  return store.db
    .transaction(() => {
      guard();
      signal.throwIfAborted();
      if (
        own !== (store.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n ||
        other !== store.db.pragma('data_version', { simple: true })
      )
        throw new StorageError('CONFLICT');
      if (args.tool === 'slides.revise')
        repo.assertBase(args.fileId, args.versionId, args.revision, owner);
      const used = store.db
        .prepare(
          'SELECT coalesce(sum(v.size_bytes),0) AS n FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE r.root_run_id=? AND v.deleted_at IS NULL',
        )
        .get(run.root_run_id) as { n: number };
      if (used.n + draft.bytes.length + rendered.pdf.length > 2 * 1024 ** 3)
        throw new StorageError('BUDGET_EXCEEDED');
      const file = artifacts.files.importBlob({
        blobId: pptxBlob.id,
        name,
        relativePath: name,
        ...(args.tool === 'slides.revise' ? { replaceId: args.fileId } : {}),
        generatedByRunId: run.id,
        owner: { type: 'session', id: run.session_id },
      }).file;
      const pdfName = name.replace(/\.pptx$/i, '.pdf');
      const pdf = artifacts.files.importBlob({
        blobId: pdfBlob.id,
        name: pdfName,
        relativePath: pdfName,
        generatedByRunId: run.id,
        owner: { type: 'session', id: run.session_id },
      }).file;
      for (const value of [file, pdf]) {
        artifacts.files.link(value.id, value.version.id, owner);
        store.db
          .prepare(
            "UPDATE file_versions SET parse_status='pending',preview_status='pending' WHERE id=?",
          )
          .run(value.version.id);
        artifacts.files.queueParse(value.version.id);
      }
      repo.record(file.id, file.version.id, owner, {
        schemaVersion: 1,
        kind: 'tapkit.slides',
        spec: draft.spec,
        preview: { kind: 'file', fileId: pdf.id, versionId: pdf.version.id },
        quality: { pages: rendered.pages, layoutVerified: true },
      });
      const ref = { kind: 'file' as const, fileId: file.id, versionId: file.version.id };
      committed(ref);
      return ref;
    })
    .immediate();
}
export function slidePage(
  artifacts: WorkArtifacts,
  run: WorkRun,
  fileId: string,
  versionId: string,
  slideId?: string,
) {
  const owner = { type: 'task' as const, id: run.task_id },
    record = new SlideRepository(artifacts.files).read(fileId, versionId, owner),
    file = artifacts.files.get(fileId, { versionId, owner });
  const origin = artifacts.files.store.db
    .prepare(
      'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=?',
    )
    .get(versionId) as { root_run_id: string } | undefined;
  if (origin?.root_run_id !== run.root_run_id) throw new StorageError('PERMISSION_DENIED');
  const hashes = slideHashes(record.spec),
    slide = slideId ? record.spec.slides.find((s) => s.id === slideId) : record.spec.slides[0];
  if (!slide) throw new StorageError('NOT_FOUND');
  artifacts.files.get(record.preview.fileId, { versionId: record.preview.versionId, owner });
  return {
    title: record.spec.title,
    aspectRatio: record.spec.aspectRatio,
    theme: record.spec.theme,
    revision: file.revision,
    versionId,
    current: file.currentVersionId === versionId,
    preview: record.preview,
    slide,
    slides: record.spec.slides.map((s) => ({
      id: s.id,
      title: s.title,
      layout: s.layout,
      hash: hashes[s.id]!,
    })),
  };
}
