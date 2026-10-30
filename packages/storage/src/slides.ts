import { SlideRecordSchema, type FileOwner } from '@tapkit/contracts';
import { StorageError } from './foundation';
import { FileRepository } from './files';
export class SlideRepository {
  constructor(readonly files: FileRepository) {}
  read(fileId: string, versionId: string, owner: FileOwner) {
    const file = this.files.get(fileId, { versionId, owner });
    if (file.kind !== 'artifact' || file.version.extension !== 'pptx')
      throw new StorageError('FORMAT_UNSUPPORTED');
    const row = this.files.store.db
      .prepare('SELECT spec_json FROM document_specs WHERE file_version_id=? AND profile_id=?')
      .get(versionId, this.files.store.profileId) as { spec_json: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return SlideRecordSchema.parse(JSON.parse(row.spec_json));
  }
  record(fileId: string, versionId: string, owner: FileOwner, raw: unknown) {
    if (!this.files.store.db.inTransaction) throw new StorageError('INTERNAL_ERROR');
    const value = SlideRecordSchema.parse(raw),
      file = this.files.get(fileId, { versionId, owner });
    if (
      file.kind !== 'artifact' ||
      file.version.extension !== 'pptx' ||
      file.currentVersionId !== versionId
    )
      throw new StorageError('CONFLICT');
    this.files.store.db
      .prepare(
        'INSERT INTO document_specs(file_version_id,profile_id,created_at,spec_json) VALUES(?,?,?,?)',
      )
      .run(versionId, this.files.store.profileId, this.files.store.now(), JSON.stringify(value));
  }
  assertBase(fileId: string, versionId: string, revision: number, owner: FileOwner) {
    if (!this.files.store.db.inTransaction) throw new StorageError('INTERNAL_ERROR');
    const file = this.files.get(fileId, { owner });
    if (file.currentVersionId !== versionId || file.revision !== revision)
      throw new StorageError('CONFLICT');
    this.read(fileId, versionId, owner);
    return file;
  }
}
