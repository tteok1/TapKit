import { ChatMaterialSchema, type ResourceRef } from '@tapkit/contracts';
import { FileRepository, StorageError, selectedMaterial } from '@tapkit/storage';
import { createHash } from 'node:crypto';

type SessionScope = { id: string; project_id: string | null };
type FileRef = Extract<ResourceRef, { kind: 'file' }>;
const legacyText =
  /^(txt|md|markdown|csv|tsv|json|log|py|js|ts|tsx|jsx|html|css|yaml|yml|xml|sql)$/;

/** Reads a fixed, authorized derived structure; never parses original Office/PDF on the host. */
export async function fileMaterial(
  files: FileRepository,
  ref: FileRef,
  session: () => SessionScope,
) {
  const scope = session();
  const get = () => {
    const current = session();
    if (current.project_id !== scope.project_id) throw new StorageError('CONFLICT');
    if (!scope.project_id) return files.get(ref.fileId, { versionId: ref.versionId });
    // An attachment uploaded to this conversation or explicitly linked to its project is allowed.
    // Guessing a file/version ID from another project does not grant project access.
    if (
      !files.store.db
        .prepare('SELECT id FROM projects WHERE id=? AND profile_id=? AND deleted_at IS NULL')
        .get(scope.project_id, files.store.profileId)
    )
      throw new StorageError('PERMISSION_DENIED');
    try {
      return files.get(ref.fileId, {
        versionId: ref.versionId,
        owner: { type: 'session', id: scope.id },
      });
    } catch (error) {
      if (!(error instanceof StorageError) || error.code !== 'PERMISSION_DENIED') throw error;
    }
    return files.get(ref.fileId, {
      versionId: ref.versionId,
      owner: { type: 'project', id: scope.project_id },
    });
  };
  const file = get();
  const status = file.version.parseStatus;
  const state =
    status === 'ready'
      ? 'ready'
      : status === 'unsupported'
        ? 'unsupported'
        : status === 'failed' || status === 'cancelled'
          ? 'failed'
          : 'parsing';
  if (state !== 'ready')
    return ChatMaterialSchema.parse({
      ref,
      name: file.version.name,
      source: '本地托管文件',
      state,
    });
  let text: string;
  if (file.version.parserVersion !== null) {
    const document = await files.parsed(ref.fileId, { versionId: ref.versionId });
    const after = get();
    if (after.version.parseStatus !== 'ready') throw new StorageError('INDEX_NOT_READY');
    if (
      after.version.parserVersion !== file.version.parserVersion ||
      document.parserVersion !== file.version.parserVersion
    )
      throw new StorageError('CONFLICT');
    if (document.quality.needsOcr) throw new StorageError('FORMAT_UNSUPPORTED');
    if (ref.locator) {
      const selected = selectedMaterial(document, ref.locator, ref.selection?.textRange);
      if (ref.selection && selected.hash !== ref.selection.selectedTextHash)
        throw new StorageError('CONFLICT');
      text = selected.text;
    } else {
      let size = 0;
      const parts: string[] = [];
      for (const block of document.blocks) {
        size += block.text.length + (parts.length ? 1 : 0);
        if (size > 100000) throw new StorageError('FILE_TOO_LARGE');
        parts.push(block.text);
      }
      if (!parts.length) throw new StorageError('FORMAT_UNSUPPORTED');
      text = parts.join('\n');
    }
  } else {
    // P02 text attachments remain readable. Missing parsed binary structures cannot fall back to
    // interpreting arbitrary original bytes as text just because their status was marked ready.
    if (!legacyText.test(file.version.extension)) throw new StorageError('FORMAT_UNSUPPORTED');
    if (file.version.sizeBytes > 400000) throw new StorageError('FILE_TOO_LARGE');
    const { bytes } = await files.original(ref.fileId, { versionId: ref.versionId });
    get();
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new StorageError('FORMAT_UNSUPPORTED');
    }
    if (text.includes('\u0000')) throw new StorageError('FORMAT_UNSUPPORTED');
    if (text.length > 100000) throw new StorageError('FILE_TOO_LARGE');
  }
  if (ref.locator && file.version.parserVersion === null) {
    if (ref.locator.kind !== 'text' || ref.locator.end > text.length)
      throw new StorageError('VALIDATION_ERROR');
    text = text.slice(ref.locator.start, ref.locator.end);
    if (ref.selection) {
      const range = ref.selection.textRange;
      if (range) {
        if (range.end > text.length) throw new StorageError('CONFLICT');
        text = text.slice(range.start, range.end);
      }
      if (createHash('sha256').update(text).digest('hex') !== ref.selection.selectedTextHash)
        throw new StorageError('CONFLICT');
    }
  }
  return ChatMaterialSchema.parse({
    ref,
    name: file.version.name,
    source: file.version.parserVersion ? '本地已读取文件' : '本地托管文本',
    state,
    text,
  });
}
