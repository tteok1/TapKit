import { z } from 'zod';
import type { StartLogin } from './providers';
import { IdSchema } from './identity';
import { FileGetSchema } from './files';
import {
  RequestSchema,
  SaveApiKeySchema,
  ReplySchema,
  EventEnvelopeSchema,
  type RequestOptions,
  type Reply,
  type EventEnvelope,
  type SettingsValues,
} from './foundation';
export * from './foundation';
export * from './resources';
export * from './providers';
export * from './models';
export * from './desktop';
export * from './chat';
export * from './history';
export * from './files';
export const PingRequestSchema = z.strictObject({ nonce: z.string().min(1).max(128) });
export const PingReplySchema = z.strictObject({
  nonce: z.string().min(1).max(128),
  process: z.literal('core'),
  sqliteVersion: z.string().min(1),
  electronVersion: z.string().min(1),
  nodeAbi: z.string().regex(/^\d+$/),
  corePid: z.number().int().positive(),
});
export const CoreCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('vault.reply'),
    id: z.string().uuid(),
    ok: z.boolean(),
    value: z.unknown(),
  }),
  z.strictObject({ type: z.literal('ping'), id: z.string().uuid(), payload: PingRequestSchema }),
  z.strictObject({ type: z.literal('shutdown') }),
  z.strictObject({ type: z.literal('window.closed'), windowId: z.string().regex(/^[0-9]{1,8}$/) }),
  z.strictObject({ type: z.literal('request'), id: z.string().uuid(), request: RequestSchema }),
  // Private Host -> Core grant; never accepted by the public request handler.
  z.strictObject({
    type: z.literal('files.export'),
    id: z.string().uuid(),
    requestId: IdSchema,
    windowId: z.string().regex(/^[0-9]{1,8}$/),
    file: FileGetSchema,
    targetPath: z.string().min(1).max(32767),
  }),
  z.strictObject({
    type: z.literal('files.select'),
    id: z.string().uuid(),
    requestId: IdSchema,
    windowId: z.string().regex(/^[0-9]{1,8}$/),
    paths: z.array(z.string().min(1).max(32767)).min(1).max(20),
    folder: z.boolean(),
  }),
]);
export const CoreEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('vault.request'),
    id: z.string().uuid(),
    operation: z.enum([
      'credential.read',
      'credential.write',
      'native.save',
      'native.load',
      'native.purge',
      'browser.open',
      'api-key.read',
      'api-key.delete',
    ]),
    accountId: z.string().uuid(),
    payload: z.unknown(),
  }),
  z.strictObject({ type: z.literal('unavailable'), code: z.literal('DATABASE_RECOVERY_REQUIRED') }),
  z.strictObject({
    type: z.literal('ready'),
    protocolVersion: z.literal(1),
    schemaVersion: z.literal(9),
  }),
  z.strictObject({ type: z.literal('pong'), id: z.string().uuid(), payload: PingReplySchema }),
  z.strictObject({ type: z.literal('reply'), id: z.string().uuid(), reply: ReplySchema }),
  z.strictObject({ type: z.literal('event'), event: EventEnvelopeSchema }),
]);
export type PingRequest = z.infer<typeof PingRequestSchema>;
export type PingReply = z.infer<typeof PingReplySchema>;
export interface TapKitBridge {
  readonly windowSlot: string;
  readonly initialRoute: string | undefined;
  newWindow(): Promise<void>;
  openEntity(entity: { type: 'session' | 'project'; id: string }): Promise<void>;
  saveConversation(value: { name: string; text: string }): Promise<boolean>;
  historyCommand(
    options: RequestOptions,
    command: import('./history').HistoryCommand,
    payload: unknown,
  ): Promise<Reply>;
  chooseAvatar(): Promise<string | null>;
  chooseDirectory(): Promise<string | null>;
  chooseFiles(folder?: boolean): Promise<Reply>;
  selectDroppedFiles(files: File[]): Promise<Reply>;
  selectChatFiles(
    files: File[],
  ): Promise<z.infer<typeof import('./files').ChatFileSelectionSchema>>;
  saveOriginal(file: z.infer<typeof FileGetSchema>): Promise<Reply>;
  fileCommand(
    options: RequestOptions,
    command: import('./files').FileCommand,
    payload: unknown,
  ): Promise<Reply>;
  openPublicLink(url: string): Promise<void>;
  chatCommand(
    options: RequestOptions,
    command: import('./chat').ChatCommand,
    payload: unknown,
  ): Promise<Reply>;
  desktopCommand(
    options: RequestOptions,
    command: import('./desktop').DesktopCommand,
    payload: unknown,
  ): Promise<Reply>;
  modelCommand(
    options: RequestOptions,
    command:
      | 'models.catalog'
      | 'models.preferences.get'
      | 'models.preferences.set'
      | 'models.preview'
      | 'models.diagnostic'
      | 'models.cancel'
      | 'usage.list',
    payload: unknown,
  ): Promise<Reply>;
  listProviders(options: RequestOptions): Promise<Reply>;
  startLogin(options: RequestOptions, payload: StartLogin): Promise<Reply>;
  loginStatus(options: RequestOptions, loginId: string): Promise<Reply>;
  answerLogin(
    options: RequestOptions,
    payload: { loginId: string; promptId: string; value: string },
  ): Promise<Reply>;
  cancelLogin(options: RequestOptions, loginId: string): Promise<Reply>;
  checkProvider(
    options: RequestOptions,
    payload: { accountId: string; modelId?: string },
  ): Promise<Reply>;
  disconnectProvider(options: RequestOptions, accountId: string): Promise<Reply>;
  ping(request: PingRequest): Promise<PingReply>;
  bootstrap(options: RequestOptions): Promise<Reply>;
  getSettings(options: RequestOptions, scope: { type: 'profile'; id: string }): Promise<Reply>;
  setSettings(
    options: RequestOptions,
    payload: { scope: { type: 'profile'; id: string }; patch: Partial<SettingsValues> },
  ): Promise<Reply>;
  saveApiKey(options: RequestOptions, payload: z.infer<typeof SaveApiKeySchema>): Promise<Reply>;
  replayEvents(
    options: RequestOptions,
    payload: { streamId: 'profile'; afterSeq: number; limit?: number },
  ): Promise<Reply>;
  subscribeEvents(
    options: RequestOptions,
    payload: { streamId: 'profile'; afterSeq: number },
    listener: (event: EventEnvelope) => void,
  ): Promise<() => void>;
  backup(options: RequestOptions): Promise<Reply>;
  cancelJob(options: RequestOptions, jobId: string): Promise<Reply>;
}
export { z } from 'zod';
export * from './persistence';

export * from './execution';
