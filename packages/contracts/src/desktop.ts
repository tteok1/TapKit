import { z } from 'zod';
import { IdSchema } from './identity';
import { AnswerPreferencesSchema } from './models';

export const PersonalSettingsSchema = z.strictObject({
  nickname: z.string().trim().min(1).max(40),
  avatar: z
    .string()
    .max(65536)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
    .refine((value) => {
      try {
        const bytes = atob(value.slice('data:image/png;base64,'.length));
        if (
          bytes.length < 24 ||
          [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => bytes.charCodeAt(i) !== n) ||
          bytes.slice(12, 16) !== 'IHDR'
        )
          return false;
        const size = (offset: number) =>
          [0, 1, 2, 3].reduce((total, i) => total * 256 + bytes.charCodeAt(offset + i), 0);
        return size(16) > 0 && size(16) <= 96 && size(20) > 0 && size(20) <= 96;
      } catch {
        return false;
      }
    })
    .nullable(),
  biography: z.string().max(500),
  addressAs: z.string().max(40),
  occupation: z.string().max(100),
  interests: z.string().max(500),
  language: z.enum(['auto', 'zh-CN', 'en']),
});
export const DEFAULT_PERSONAL = PersonalSettingsSchema.parse({
  nickname: '本地用户',
  avatar: null,
  biography: '',
  addressAs: '',
  occupation: '',
  interests: '',
  language: 'auto',
});
const AnswerSchema = AnswerPreferencesSchema;
export const DEFAULT_ANSWER = AnswerSchema.parse({
  language: 'auto',
  length: 'normal',
  tone: 'natural',
  format: 'auto',
});
export const PersonalizationSchema = z.strictObject({
  enabled: z.boolean(),
  instructions: z.string().max(8000),
  chat: AnswerSchema,
  work: AnswerSchema,
});
export const DEFAULT_PERSONALIZATION = PersonalizationSchema.parse({
  enabled: true,
  instructions: '',
  chat: DEFAULT_ANSWER,
  work: DEFAULT_ANSWER,
});
export const DesktopSettingsSchema = z.strictObject({
  theme: z.enum(['light', 'dark', 'system']),
  fontSize: z.enum(['small', 'normal', 'large']),
  zoom: z.number().min(0.75).max(2),
  enterSends: z.boolean(),
  compact: z.boolean(),
  showSuggestions: z.boolean(),
  showPlanned: z.boolean(),
  defaultDirectory: z.string().max(2048),
});
export const DEFAULT_DESKTOP = DesktopSettingsSchema.parse({
  theme: 'system',
  fontSize: 'normal',
  zoom: 1,
  enterSends: true,
  compact: false,
  showSuggestions: true,
  showPlanned: false,
  defaultDirectory: '',
});
export const NetworkSettingsSchema = z
  .strictObject({
    mode: z.enum(['environment', 'direct', 'manual']),
    proxyURL: z
      .string()
      .max(2048)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }),
  })
  .refine((value) => value.mode !== 'manual' || !!value.proxyURL);
export const DEFAULT_NETWORK = NetworkSettingsSchema.parse({ mode: 'environment', proxyURL: '' });
export const WindowLayoutSchema = z.strictObject({
  sidebarWidth: z.number().int().min(200).max(400),
  collapsed: z.boolean(),
  sidebarScroll: z.number().min(0).max(10000000).default(0),
  navigation: z
    .array(z.enum(['chats', 'work', 'projects', 'files', 'notifications']))
    .max(5)
    .refine((v) => new Set(v).size === v.length)
    .default(['chats', 'work', 'projects', 'files', 'notifications']),
  panelWidth: z.number().int().min(320).max(600),
  panelOpen: z.boolean(),
  route: z
    .string()
    .max(200)
    .regex(
      /^\/(?:settings(?:\/[a-z-]+)?|dev\/[a-z]+|sessions\/[0-9a-f-]+|chats|work|projects(?:\/[0-9a-f-]+)?|files|search|notifications)?$/,
    ),
  scroll: z
    .record(z.string().max(200), z.number().min(0).max(10000000))
    .refine((v) => Object.keys(v).length <= 50),
});
export const DEFAULT_LAYOUT = WindowLayoutSchema.parse({
  sidebarWidth: 260,
  collapsed: false,
  panelWidth: 440,
  panelOpen: false,
  route: '/',
  scroll: {},
});
export const SessionSummarySchema = z.strictObject({
  id: IdSchema,
  title: z.string().max(240),
  mode: z.enum(['chat', 'work']),
  revision: z.number().int().positive(),
  pinned: z.boolean(),
  unread: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});
export const WorkspaceViewSchema = z.strictObject({
  eventSeq: z.number().int().nonnegative().default(0),
  sessions: z.array(SessionSummarySchema).max(100),
  projects: z
    .array(
      z.strictObject({
        id: IdSchema,
        name: z.string().max(80),
        revision: z.number().int().positive().default(1),
        pinned: z.boolean().default(false),
      }),
    )
    .max(100),
  files: z
    .array(z.strictObject({ id: IdSchema, name: z.string().max(1024), status: z.string().max(80) }))
    .max(100),
  pendingApprovals: z.number().int().nonnegative(),
});
export const SessionCreateSchema = z.strictObject({
  projectId: IdSchema.optional(),
  mode: z.enum(['chat', 'work']),
  title: z.string().trim().min(1).max(200),
});
export const ProjectCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
export const PinSessionSchema = z.strictObject({ sessionId: IdSchema, pinned: z.boolean() });
export const CreatedEntitySchema = z.strictObject({ entityId: IdSchema });
export type DesktopCommand =
  'desktop.workspace' | 'sessions.create' | 'sessions.pin' | 'projects.create';
