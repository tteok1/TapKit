import {
  ChatFileSelectionSchema,
  ChatMaterialSchema,
  FileReplySchema,
  SessionDetailsSchema,
  type FileOwner,
  type FileImportViewSchema,
  type ResourceRef,
  type TapKitBridge,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';

export async function chatFileOwner(
  bridge: Pick<TapKitBridge, 'historyCommand' | 'fileCommand'>,
  ref: Extract<ResourceRef, { kind: 'file' }>,
  sessionId: string,
): Promise<FileOwner | undefined> {
  const reply = await bridge.historyCommand(requestOptions(), 'sessions.get', { sessionId });
  if (!reply.ok) throw new Error(reply.error.code);
  const session = SessionDetailsSchema.parse(reply.data).session;
  const owner: FileOwner = { type: 'session', id: sessionId };
  const grant = await bridge.fileCommand(requestOptions(), 'files.get', {
    fileId: ref.fileId,
    versionId: ref.versionId,
    owner,
  });
  if (grant.ok) return owner;
  if (grant.error.code !== 'PERMISSION_DENIED') throw new Error(grant.error.code);
  // Ordinary chat allows explicitly selected profile files. A project chat
  // must keep the project grant through Host's pre/post export checks.
  return session.projectId ? { type: 'project', id: session.projectId } : undefined;
}

export type ChatImportView = z.infer<typeof FileImportViewSchema>;
export type ChatImportResult = {
  refs: ResourceRef[];
  errors: string[];
  cancelled: boolean;
};

// A Host rejection is terminal. Only preload-classified pathless files use the
// compatibility byte route; physical files never call File.arrayBuffer here.
export async function importChatFiles(
  bridge: Pick<TapKitBridge, 'selectChatFiles' | 'fileCommand' | 'chatCommand'>,
  files: File[],
  sessionId: string,
  signal: AbortSignal,
  onProgress: (view: ChatImportView) => void,
): Promise<ChatImportResult> {
  const result: ChatImportResult = { refs: [], errors: [], cancelled: false };
  let tokens: string[] = [];
  try {
    const selected = ChatFileSelectionSchema.parse(await bridge.selectChatFiles(files));
    tokens = selected.selections.map((s) => s.token);
    if (
      new Set(tokens).size !== tokens.length ||
      new Set(selected.virtualIndexes).size !== selected.virtualIndexes.length ||
      selected.virtualIndexes.some((i) => i >= files.length) ||
      tokens.length + selected.virtualIndexes.length !== files.length
    )
      throw new Error('VALIDATION_ERROR');
    if (signal.aborted) return { ...result, cancelled: true };
    if (tokens.length) {
      const options = requestOptions();
      let view: ChatImportView | undefined;
      let stopped = false,
        polling = false;
      const control = async (command: 'files.cancelImport' | 'files.importStatus') => {
        const reply = await bridge.fileCommand(requestOptions(), command, {
          importRequestId: options.requestId,
        });
        if (!reply.ok) throw new Error(reply.error.code);
        const data = FileReplySchema.parse(reply.data);
        if (!stopped && 'import' in data) {
          view = data.import;
          onProgress(view);
        }
      };
      // Cancellation can race the first IPC dispatch; polling retries it until
      // the batch returns, without retrying a source read or minting new tokens.
      const poll = async () => {
        if (stopped || polling) return;
        polling = true;
        try {
          await control(signal.aborted ? 'files.cancelImport' : 'files.importStatus');
        } catch {
          /* A request may not have reached Core yet. Final reply is authoritative. */
        } finally {
          polling = false;
        }
      };
      signal.addEventListener('abort', poll);
      const timer = setInterval(() => void poll(), 300);
      try {
        const reply = await bridge.fileCommand(options, 'files.import', {
          selectionTokens: tokens,
          destination: { type: 'session', id: sessionId },
          duplicate: 'keep',
        });
        if (!reply.ok) throw new Error(reply.error.code);
        const data = FileReplySchema.parse(reply.data);
        if (!('import' in data)) throw new Error('INTERNAL_ERROR');
        view = data.import;
        onProgress(view);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'INTERNAL_ERROR');
        await control('files.importStatus').catch(() => {});
      } finally {
        stopped = true;
        clearInterval(timer);
        signal.removeEventListener('abort', poll);
      }
      for (const item of view?.items ?? []) {
        if (item.status === 'imported' && item.fileId && item.versionId)
          result.refs.push({ kind: 'file', fileId: item.fileId, versionId: item.versionId });
        if (item.status === 'failed') result.errors.push(item.errorCode ?? 'INTERNAL_ERROR');
        if (item.status === 'cancelled') result.cancelled = true;
      }
    }
    for (const index of selected.virtualIndexes) {
      if (signal.aborted) break;
      try {
        const file = files[index]!;
        if (file.size > 100 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (signal.aborted) break;
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 16384)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
        const reply = await bridge.chatCommand(requestOptions(), 'inputs.attach', {
          sessionId,
          name: file.name,
          bytes: btoa(binary),
        });
        if (!reply.ok) throw new Error(reply.error.code);
        result.refs.push(ChatMaterialSchema.parse(reply.data).ref);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'INTERNAL_ERROR');
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'INTERNAL_ERROR');
  } finally {
    if (tokens.length)
      await bridge
        .fileCommand(requestOptions(), 'files.releaseSelection', {
          selectionTokens: tokens,
        })
        .catch(() => {});
  }
  result.cancelled ||= signal.aborted;
  return result;
}
