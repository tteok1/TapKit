import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  z,
  PingRequestSchema,
  PingReplySchema,
  RequestSchema,
  ReplySchema,
  EventEnvelopeSchema,
  SaveApiKeySchema,
  SettingsGetSchema,
  SettingsSetSchema,
  ReplaySchema,
  IdSchema,
  StartLoginSchema,
  LoginIdSchema,
  AnswerLoginSchema,
  CheckProviderSchema,
  AccountIdSchema,
  FileGetSchema,
  ChatFileSelectionSchema,
  FileReplySchema,
  ArtifactAssetSchema,
  type TapKitBridge,
  type RequestOptions,
} from '@tapkit/contracts';
const invoke = async (command: string, options: RequestOptions, payload: unknown) =>
  ReplySchema.parse(
    await ipcRenderer.invoke(
      'tapkit:request',
      RequestSchema.parse({ ...options, protocolVersion: 1, command, payload }),
    ),
  );
const activeListeners = new Set<unknown>();
const bridge: TapKitBridge = Object.freeze<TapKitBridge>({
  windowSlot: process.argv.find((v) => v.startsWith('--tapkit-window-slot='))?.split('=')[1] ?? '0',
  newWindow: () => ipcRenderer.invoke('tapkit:new-window'),
  initialRoute: process.argv
    .find((v) => v.startsWith('--tapkit-initial-route='))
    ?.slice('--tapkit-initial-route='.length),
  openEntity: (entity) => ipcRenderer.invoke('tapkit:open-entity', entity),
  saveConversation: (value) => ipcRenderer.invoke('tapkit:save-conversation', value),
  openArtifactExternal: (file) => ipcRenderer.invoke('tapkit:open-artifact-external', file),
  copyText: (text) => ipcRenderer.invoke('tapkit:copy-text', z.string().max(100000).parse(text)),
  historyCommand: (options, command, payload) => invoke(command, options, payload),
  projectCommand: (options, command, payload) => invoke(command, options, payload),
  exportProject: (value) =>
    ipcRenderer.invoke(
      'tapkit:export-project',
      z.strictObject({ projectId: IdSchema, revision: z.number().int().positive() }).parse(value),
    ),
  fileCommand: (options, command, payload) => invoke(command, options, payload),
  artifactCommand: (options, command, payload) => invoke(command, options, payload),
  artifactUrl: async (asset) =>
    z
      .string()
      .regex(/^tapkit-artifact:\/\/asset\/[a-f0-9]{64}$/)
      .parse(await ipcRenderer.invoke('tapkit:artifact-url', ArtifactAssetSchema.parse(asset))),
  saveOriginal: async (file) =>
    ReplySchema.parse(await ipcRenderer.invoke('tapkit:save-original', FileGetSchema.parse(file))),
  chooseAvatar: async () => {
    const value: unknown = await ipcRenderer.invoke('tapkit:choose-avatar');
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('AVATAR_INVALID');
    if (!value.startsWith('data:image/webp;base64,')) return value;
    const image = new Image(),
      canvas = document.createElement('canvas');
    try {
      image.src = value;
      await image.decode();
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth > 4096 ||
        image.naturalHeight > 4096
      )
        throw new Error('AVATAR_INVALID');
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('AVATAR_INVALID');
      context.drawImage(image, 0, 0, 96, 96);
      const thumbnail = canvas.toDataURL('image/png');
      if (thumbnail.length > 65536) throw new Error('AVATAR_INVALID');
      return thumbnail;
    } finally {
      image.src = '';
      canvas.width = 0;
      canvas.height = 0;
    }
  },
  chooseDirectory: () => ipcRenderer.invoke('tapkit:choose-directory'),
  chooseFiles: async (folder = false) =>
    ReplySchema.parse(await ipcRenderer.invoke('tapkit:choose-files', z.boolean().parse(folder))),
  selectDroppedFiles: async (files) => {
    if (!Array.isArray(files) || !files.length || files.length > 20)
      throw new Error('VALIDATION_ERROR');
    // Electron validates native File objects; renderer-provided strings cannot mint grants.
    const paths = files.map((file) => webUtils.getPathForFile(file));
    if (paths.some((path) => !path)) throw new Error('VALIDATION_ERROR');
    return ReplySchema.parse(await ipcRenderer.invoke('tapkit:select-dropped-files', paths));
  },
  selectChatFiles: async (files) => {
    if (!Array.isArray(files) || !files.length || files.length > 20)
      throw new Error('VALIDATION_ERROR');
    // getPathForFile validates the native File brand even for pathless clipboard files.
    const paths = files.map((file) => webUtils.getPathForFile(file));
    const physical = paths.filter(Boolean);
    const virtualIndexes = paths.flatMap((path, index) => (path ? [] : [index]));
    if (!physical.length) return ChatFileSelectionSchema.parse({ selections: [], virtualIndexes });
    const reply = ReplySchema.parse(
      await ipcRenderer.invoke('tapkit:select-dropped-files', physical),
    );
    if (!reply.ok) throw new Error(reply.error.code);
    const data = FileReplySchema.parse(reply.data);
    if (!('selections' in data) || data.selections.length !== physical.length)
      throw new Error('INTERNAL_ERROR');
    return ChatFileSelectionSchema.parse({ selections: data.selections, virtualIndexes });
  },
  openPublicLink: (url) =>
    ipcRenderer.invoke('tapkit:open-public-link', z.string().max(4096).parse(url)),
  desktopCommand: (options, command, payload) => invoke(command, options, payload),
  chatCommand: (options, command, payload) => invoke(command, options, payload),
  modelCommand: (options, command, payload) => invoke(command, options, payload),
  listProviders: (options) => invoke('providers.list', options, {}),
  startLogin: (options, payload) =>
    invoke('providers.startLogin', options, StartLoginSchema.parse(payload)),
  loginStatus: (options, loginId) =>
    invoke('providers.loginStatus', options, LoginIdSchema.parse({ loginId })),
  answerLogin: (options, payload) =>
    invoke('providers.answerLogin', options, AnswerLoginSchema.parse(payload)),
  cancelLogin: (options, loginId) =>
    invoke('providers.cancelLogin', options, LoginIdSchema.parse({ loginId })),
  checkProvider: (options, payload) =>
    invoke('providers.check', options, CheckProviderSchema.parse(payload)),
  disconnectProvider: (options, accountId) =>
    invoke('providers.disconnect', options, AccountIdSchema.parse({ accountId })),
  ping: async (request) =>
    PingReplySchema.parse(
      await ipcRenderer.invoke('tapkit:ping', PingRequestSchema.parse(request)),
    ),
  bootstrap: (options) => invoke('app.bootstrap', options, {}),
  getSettings: (options, scope) =>
    invoke('settings.get', options, SettingsGetSchema.parse({ scope })),
  setSettings: (options, payload) =>
    invoke('settings.set', options, SettingsSetSchema.parse(payload)),
  saveApiKey: (options, payload) =>
    invoke('providers.saveApiKey', options, SaveApiKeySchema.parse(payload)),
  replayEvents: (options, payload) => invoke('events.replay', options, ReplaySchema.parse(payload)),
  subscribeEvents: async (options, payload, listener) => {
    let lastSeq = payload.afterSeq;
    const onEvent = (_event: unknown, raw: unknown) => {
      const event = EventEnvelopeSchema.safeParse(raw);
      if (event.success && event.data.seq > lastSeq) {
        lastSeq = event.data.seq;
        listener(event.data);
      }
    };
    activeListeners.add(onEvent);
    ipcRenderer.on('tapkit:event', onEvent);
    try {
      const reply = await invoke('events.subscribe', options, ReplaySchema.parse(payload));
      if (!reply.ok) throw new Error(reply.error.code);
    } catch (error) {
      activeListeners.delete(onEvent);
      ipcRenderer.removeListener('tapkit:event', onEvent);
      throw error;
    }
    return () => {
      activeListeners.delete(onEvent);
      ipcRenderer.removeListener('tapkit:event', onEvent);
      if (!activeListeners.size) ipcRenderer.send('tapkit:unsubscribe');
    };
  },
  backup: (options) => invoke('data.backup', options, {}),
  cancelJob: (options, jobId) => invoke('jobs.cancel', options, { jobId: IdSchema.parse(jobId) }),
});
contextBridge.exposeInMainWorld('tapkit', bridge);
