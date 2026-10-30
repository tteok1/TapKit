import {
  DocumentSpecSchema,
  FileNameSchema,
  type DocumentSpec,
  type ResourceRef,
} from '@tapkit/contracts';
import {
  BlobStore,
  DocumentRepository,
  FileRepository,
  StorageError,
  WorkRepository,
  type WorkRun,
} from '@tapkit/storage';
import { canonicalHash } from '@tapkit/tools';
import {
  checkedDocumentImage,
  renderDocumentDraft,
  reviseDocumentSection,
  replaceDocumentFields,
} from '@tapkit/workflows';
import type { ChatService } from './chat-service';

type DocumentChat = Pick<ChatService, 'store' | 'material' | 'blobs'>;

/** Resolve only an explicitly selected fixed PNG version, after session/project checks. */
export async function resolveWorkDocumentImage(
  chat: DocumentChat,
  run: WorkRun,
  fileVersionId: string,
  guard: () => void,
) {
  guard();
  const repo = new WorkRepository(chat.store);
  const current = repo.row(run.id);
  if (current.task_version !== run.task_version || current.lease_epoch !== run.lease_epoch)
    throw new StorageError('CONFLICT');
  const matches = [
    ...new Map(
      repo
        .state(current)
        .definition.refs.filter(
          (ref) =>
            ref.kind === 'file' &&
            ref.versionId === fileVersionId &&
            !ref.locator &&
            !ref.selection,
        )
        .map((ref) => [canonicalHash(ref), ref]),
    ).values(),
  ];
  if (matches.length !== 1 || matches[0]!.kind !== 'file')
    throw new StorageError('PERMISSION_DENIED');
  const ref = matches[0]!;
  const material = await chat.material(ref, run.session_id);
  if (material.state !== 'unsupported' || !/\.png$/i.test(material.name))
    throw new StorageError('FORMAT_UNSUPPORTED');
  const files = new FileRepository(chat.store, chat.blobs);
  const file = files.get(ref.fileId, { versionId: ref.versionId });
  if (file.version.extension !== 'png' || file.version.sizeBytes > 128 * 1024)
    throw new StorageError('FORMAT_UNSUPPORTED');
  const { bytes } = await files.original(ref.fileId, { versionId: ref.versionId });
  try {
    checkedDocumentImage(bytes);
  } catch {
    throw new StorageError('FORMAT_UNSUPPORTED');
  }
  guard();
  const after = repo.row(run.id);
  if (after.task_version !== run.task_version || after.lease_epoch !== run.lease_epoch)
    throw new StorageError('CONFLICT');
  const again = await chat.material(ref, run.session_id);
  if (again.state !== 'unsupported' || again.name !== material.name)
    throw new StorageError('CONFLICT');
  guard();
  return bytes;
}

async function selectedMaterial(
  chat: DocumentChat,
  run: WorkRun,
  ref: ResourceRef,
  guard: () => void,
) {
  const repo = new WorkRepository(chat.store);
  guard();
  const current = repo.row(run.id);
  if (current.task_version !== run.task_version || current.lease_epoch !== run.lease_epoch)
    throw new StorageError('CONFLICT');
  const selected = repo
    .state(current)
    .definition.refs.some((candidate) => canonicalHash(candidate) === canonicalHash(ref));
  if (!selected) throw new StorageError('PERMISSION_DENIED');
  const material = await chat.material(ref, current.session_id);
  if (material.state !== 'ready' || !material.text?.trim())
    throw new StorageError('INDEX_NOT_READY');
  guard();
  const after = repo.row(run.id);
  if (after.task_version !== run.task_version || after.lease_epoch !== run.lease_epoch)
    throw new StorageError('CONFLICT');
  return material.name;
}

/** Prepare only; references are checked again after serialization and before a future commit. */
export async function prepareWorkDocument(
  chat: DocumentChat,
  run: WorkRun,
  raw: unknown,
  guard: () => void,
  applyTaskOptions = true,
  layoutRepairAttempt = 0,
) {
  guard();
  const rawSpec = DocumentSpecSchema.parse(raw);
  const repo = new WorkRepository(chat.store);
  const definition = repo.state(repo.row(run.id)).definition;
  const options = applyTaskOptions ? definition.documentOptions : undefined;
  const fieldHints = {
    name: /姓名|作者|署名|\bname\b/i,
    date: /日期|\bdate\b/i,
    brand: /品牌|机构|公司|\bbrand\b/i,
  };
  const fields = { ...rawSpec.style.fields };
  if (applyTaskOptions) {
    for (const key of ['name', 'date', 'brand'] as const) {
      const supplied = options?.fields?.[key];
      fields[key] =
        supplied !== undefined
          ? supplied
          : fields[key] &&
              definition.goal.includes(fields[key]) &&
              fieldHints[key].test(definition.goal)
            ? fields[key]
            : '';
    }
  }
  const proposed = DocumentSpecSchema.parse({
    ...rawSpec,
    audience: applyTaskOptions ? definition.audience : rawSpec.audience,
    language: applyTaskOptions ? definition.language : rawSpec.language,
    style: {
      ...rawSpec.style,
      ...(options?.template ? { template: options.template } : {}),
      ...(options?.theme ? { theme: options.theme } : {}),
      ...(options?.tableOfContents !== undefined
        ? { tableOfContents: options.tableOfContents }
        : {}),
      ...(options?.pageNumbers !== undefined ? { pageNumbers: options.pageNumbers } : {}),
      fields,
    },
  });
  const citations = [];
  for (const citation of proposed.citations)
    citations.push({ ...citation, label: await selectedMaterial(chat, run, citation.ref, guard) });
  const spec = DocumentSpecSchema.parse({ ...proposed, citations });
  const authorize = async (ref: ResourceRef) => {
    const name = await selectedMaterial(chat, run, ref, guard);
    return spec.citations.some(
      (citation) => canonicalHash(citation.ref) === canonicalHash(ref) && citation.label === name,
    );
  };
  const output = await renderDocumentDraft(
    spec,
    authorize,
    (versionId) => resolveWorkDocumentImage(chat, run, versionId, guard),
    layoutRepairAttempt,
  );
  for (const citation of spec.citations)
    if (!(await authorize(citation.ref))) throw new StorageError('CONFLICT');
  for (const versionId of imageVersions(spec))
    await resolveWorkDocumentImage(chat, run, versionId, guard);
  guard();
  return { spec, ...output };
}

function imageVersions(spec: DocumentSpec) {
  return [
    ...new Set(
      spec.sections.flatMap((section) =>
        section.blocks.flatMap((block) => (block.type === 'image' ? [block.fileVersionId] : [])),
      ),
    ),
  ];
}

type DbStamp = { own: number; other: number };
function stamp(chat: DocumentChat): DbStamp {
  const own = chat.store.db.prepare('SELECT total_changes() AS n').get() as { n: number };
  return { own: own.n, other: chat.store.db.pragma('data_version', { simple: true }) as number };
}
function sameStamp(a: DbStamp, b: DbStamp) {
  return a.own === b.own && a.other === b.other;
}

/** Check all selected citations after staging. Any concurrent DB write invalidates the snapshot. */
async function stableSources(
  chat: DocumentChat,
  run: WorkRun,
  spec: DocumentSpec,
  guard: () => void,
) {
  const before = stamp(chat);
  for (const citation of spec.citations) {
    const name = await selectedMaterial(chat, run, citation.ref, guard);
    if (name !== citation.label) throw new StorageError('CONFLICT');
  }
  for (const versionId of imageVersions(spec))
    await resolveWorkDocumentImage(chat, run, versionId, guard);
  guard();
  const after = stamp(chat);
  if (!sameStamp(before, after)) throw new StorageError('CONFLICT');
  return after;
}

export async function verifyWorkDocumentSources(chat: DocumentChat, run: WorkRun, raw: unknown) {
  const spec = DocumentSpecSchema.parse(raw);
  const snapshot = await stableSources(chat, run, spec, () => {});
  return sameStamp(snapshot, stamp(chat));
}

function documentBytes(
  prepared: Awaited<ReturnType<typeof prepareWorkDocument>>,
  format: 'docx' | 'md',
) {
  if (format === 'md') {
    const bytes = Buffer.from(prepared.markdown, 'utf8');
    if (!bytes.length || bytes.length > 400000) throw new StorageError('OUTPUT_LIMIT_REACHED');
    return { bytes, mime: 'text/markdown' };
  }
  if (prepared.docx.length > 100 * 1024 * 1024 || prepared.docx.subarray(0, 2).toString() !== 'PK')
    throw new StorageError('PARSE_FAILED');
  return {
    bytes: prepared.docx,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

/** Publishes a generated DOCX and its spec and receipt in one transaction. Parse is queued. */
export async function createWorkDocument(
  chat: DocumentChat,
  files: FileRepository,
  blobs: BlobStore,
  run: WorkRun,
  name: string,
  raw: unknown,
  guard: () => void,
  committed: (ref: ResourceRef) => void,
): Promise<ResourceRef> {
  if (files.store !== chat.store || files.blobs !== blobs)
    throw new StorageError('PERMISSION_DENIED');
  FileNameSchema.parse(name);
  const format = name.endsWith('.docx') ? 'docx' : name.endsWith('.md') ? 'md' : null;
  if (!format) throw new StorageError('FORMAT_UNSUPPORTED');
  if (format === 'md' && imageVersions(DocumentSpecSchema.parse(raw)).length)
    throw new StorageError('FORMAT_UNSUPPORTED');
  const prepared = await prepareWorkDocument(chat, run, raw, guard);
  const output = documentBytes(prepared, format);
  const blob = await blobs.put(output.bytes, output.mime);
  const snapshot = await stableSources(chat, run, prepared.spec, guard);
  return chat.store.db
    .transaction(() => {
      guard();
      if (!sameStamp(snapshot, stamp(chat))) throw new StorageError('CONFLICT');
      const owner = { type: 'session' as const, id: run.session_id };
      const file = files.importBlob({
        blobId: blob.id,
        name,
        relativePath: name,
        generatedByRunId: run.id,
        owner,
      }).file;
      chat.store.db
        .prepare(
          "UPDATE file_versions SET parse_status='pending',preview_status='pending' WHERE id=?",
        )
        .run(file.version.id);
      new DocumentRepository(files).record(file.id, file.version.id, owner, prepared.spec);
      files.link(file.id, file.version.id, { type: 'task', id: run.task_id });
      files.queueParse(file.version.id);
      const ref = { kind: 'file' as const, fileId: file.id, versionId: file.version.id };
      committed(ref);
      return ref;
    })
    .immediate();
}

/** The caller must bind this exact proposal to an approval before dispatching it. */
export async function reviseWorkDocument(
  chat: DocumentChat,
  files: FileRepository,
  blobs: BlobStore,
  run: WorkRun,
  input: {
    fileId: string;
    baseVersion: string;
    revision: number;
  } & (
    | { blockId: string; replacement: DocumentSpec['sections'][number] }
    | { fields: Partial<DocumentSpec['style']['fields']> }
  ),
  guard: () => void,
  committed: (ref: ResourceRef) => void,
): Promise<ResourceRef> {
  if (files.store !== chat.store || files.blobs !== blobs)
    throw new StorageError('PERMISSION_DENIED');
  guard();
  const owner = { type: 'session' as const, id: run.session_id };
  const file = files.get(input.fileId, { owner });
  if (file.currentVersionId !== input.baseVersion || file.revision !== input.revision)
    throw new StorageError('CONFLICT');
  const origin = chat.store.db
    .prepare(
      'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=? AND v.profile_id=?',
    )
    .get(input.baseVersion, chat.store.profileId) as { root_run_id: string } | undefined;
  if (!origin || origin.root_run_id !== run.root_run_id)
    throw new StorageError('PERMISSION_DENIED');
  const repository = new DocumentRepository(files);
  const original = repository.read(input.fileId, input.baseVersion, owner);
  const proposal =
    'fields' in input
      ? replaceDocumentFields(original, input.fields)
      : reviseDocumentSection(
          original,
          input.baseVersion,
          file.currentVersionId,
          input.blockId,
          input.replacement,
        );
  const prepared = await prepareWorkDocument(chat, run, proposal, guard, false);
  const format = file.version.extension;
  if (format !== 'docx' && format !== 'md') throw new StorageError('FORMAT_UNSUPPORTED');
  if (format === 'md' && imageVersions(prepared.spec).length)
    throw new StorageError('FORMAT_UNSUPPORTED');
  const output = documentBytes(prepared, format);
  const blob = await blobs.put(output.bytes, output.mime);
  const snapshot = await stableSources(chat, run, prepared.spec, guard);
  return chat.store.db
    .transaction(() => {
      guard();
      if (!sameStamp(snapshot, stamp(chat))) throw new StorageError('CONFLICT');
      repository.assertBase(input.fileId, input.baseVersion, input.revision, owner);
      const name = file.name.endsWith('.' + format) ? file.name : file.version.name;
      const updated = files.importBlob({
        blobId: blob.id,
        name,
        relativePath: name,
        replaceId: file.id,
        generatedByRunId: run.id,
        owner,
      }).file;
      chat.store.db
        .prepare(
          "UPDATE file_versions SET parse_status='pending',preview_status='pending' WHERE id=?",
        )
        .run(updated.version.id);
      repository.record(updated.id, updated.version.id, owner, prepared.spec);
      files.link(updated.id, updated.version.id, { type: 'task', id: run.task_id });
      files.queueParse(updated.version.id);
      const ref = { kind: 'file' as const, fileId: updated.id, versionId: updated.version.id };
      committed(ref);
      return ref;
    })
    .immediate();
}
