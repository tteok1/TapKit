import { DocumentSpecSchema, type DocumentSpec, type FileOwner } from '@tapkit/contracts';
import { StorageError } from './foundation';
import { FileRepository } from './files';

/** Document metadata is private to a fixed managed file version, never a second run state. */
export class DocumentRepository {
  constructor(readonly files: FileRepository) {}

  read(fileId: string, versionId: string, owner: FileOwner): DocumentSpec {
    const file = this.files.get(fileId, { versionId, owner });
    if (file.kind !== 'artifact' || !['docx', 'md'].includes(file.version.extension))
      throw new StorageError('FORMAT_UNSUPPORTED');
    const row = this.files.store.db
      .prepare('SELECT spec_json FROM document_specs WHERE file_version_id=? AND profile_id=?')
      .get(versionId, this.files.store.profileId) as { spec_json: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return DocumentSpecSchema.parse(JSON.parse(row.spec_json));
  }

  /** Call within the same transaction that imports a new immutable file version. */
  record(fileId: string, versionId: string, owner: FileOwner, raw: unknown) {
    if (!this.files.store.db.inTransaction) throw new StorageError('INTERNAL_ERROR');
    const spec = DocumentSpecSchema.parse(raw);
    const file = this.files.get(fileId, { versionId, owner });
    if (file.kind !== 'artifact' || !['docx', 'md'].includes(file.version.extension))
      throw new StorageError('FORMAT_UNSUPPORTED');
    if (file.currentVersionId !== versionId) throw new StorageError('CONFLICT');
    this.files.store.db
      .prepare(
        'INSERT INTO document_specs(file_version_id,profile_id,created_at,spec_json) VALUES(?,?,?,?)',
      )
      .run(versionId, this.files.store.profileId, this.files.store.now(), JSON.stringify(spec));
  }

  /** Must be checked under the same transaction as the subsequent replacement. */
  assertBase(fileId: string, versionId: string, revision: number, owner: FileOwner) {
    if (!this.files.store.db.inTransaction) throw new StorageError('INTERNAL_ERROR');
    const file = this.files.get(fileId, { owner });
    if (file.kind !== 'artifact' || !['docx', 'md'].includes(file.version.extension))
      throw new StorageError('FORMAT_UNSUPPORTED');
    if (file.currentVersionId !== versionId || file.revision !== revision)
      throw new StorageError('CONFLICT');
    this.read(fileId, versionId, owner);
    return file;
  }
}
