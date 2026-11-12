import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '@tapkit/ui';
import {
  DEFAULT_SETTINGS,
  DesktopShortcutsSchema,
  PreferencesViewSchema,
  SettingsSetSchema,
  type SettingsValues,
} from '@tapkit/contracts';
import t from '../locales/desktop.zh-CN.json';
import { LocalAvatar } from './local-avatar';
import { MemoryManager } from './memory-ui';
import m from '../locales/memory.zh-CN.json';
import { settingCategories, SettingsNavigation } from './settings-navigation';
import { requestOptions } from './desktop-state';
import { HistorySettings } from './history-settings';
import { FutureFeatures, PlannedFeatures } from '../features/placeholders/PlannedFeatures';
import { DesktopPreferenceFields, ShortcutSettings } from '../features/settings/PreferenceFields';

const categoryKeys: Record<string, (keyof SettingsValues)[]> = {
  personal: ['personal'],
  personalization: ['personalization', 'memoryEnabled', 'historyEnabled'],
  general: ['desktop', 'network'],
  shortcuts: ['desktop'],
  privacy: ['desktop'],
};
const shortcutKeys = ['shortcuts', 'quickInputEnabled'] as const;
const permissionKeys = ['systemNotifications'] as const;

function preserveDesktopFields(page: string, desktop: SettingsValues['desktop']) {
  const keys = page === 'shortcuts' ? shortcutKeys : page === 'privacy' ? permissionKeys : [];
  return Object.fromEntries(keys.map((key) => [key, desktop[key]]));
}
export function DesktopSettings({
  page,
  values,
  profileId,
  revision,
  save,
  reload,
  onNavigate,
  projects,
}: {
  page: string;
  values: SettingsValues;
  profileId: string;
  revision: number;
  save: (
    patch: Partial<SettingsValues>,
    revision?: number,
    resetModelPreferencesAt?: number,
  ) => Promise<void>;
  reload: () => Promise<void>;
  onNavigate: (path: string) => void;
  projects: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState(values),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [reloadCount, setReloadCount] = useState(0),
    [confirmReset, setConfirmReset] = useState(false);
  const editingRevision = useRef(revision);
  const body = useRef<HTMLDivElement>(null);
  const search = useLocation().search;
  useEffect(() => {
    const field = new URLSearchParams(search).get('field');
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      const label = [...(body.current?.querySelectorAll('label') ?? [])].find((element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === field,
        ),
      );
      label?.control?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [page, search]);
  useEffect(() => {
    if (!dirty) {
      setDraft(values);
      editingRevision.current = revision;
    }
  }, [values, dirty, revision]);
  useEffect(() => {
    setDraft(values);
    setDirty(false);
    setNotice('');
    setConfirmReset(false);
    editingRevision.current = revision;
  }, [page]); // Switching sections discards unsaved edits.
  function update<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    if (!dirty) editingRevision.current = revision;
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setNotice('');
  }
  async function submit() {
    setBusy(true);
    setNotice('');
    try {
      const keys = categoryKeys[page] ?? [];
      const patch = Object.fromEntries(keys.map((key) => [key, draft[key]]));
      if (page === 'shortcuts' || page === 'privacy') {
        patch.desktop = { ...values.desktop, ...preserveDesktopFields(page, draft.desktop) };
      }
      if (
        page === 'shortcuts' &&
        !DesktopShortcutsSchema.safeParse(draft.desktop.shortcuts).success
      ) {
        setNotice('快捷键重复。每项操作需要使用不同的组合。');
        return;
      }
      SettingsSetSchema.shape.patch.parse(patch);
      await save(patch, editingRevision.current);
      setDirty(false);
      setConfirmReset(false);
      setNotice(t.saved);
    } catch (e) {
      setNotice(
        e instanceof Error && e.message === 'CONFLICT'
          ? t.conflict
          : '保存失败，请检查输入并重新加载。',
      );
    } finally {
      setBusy(false);
    }
  }
  function resetCategory() {
    editingRevision.current = revision;
    setDraft((current) => {
      const keys = categoryKeys[page] ?? [];
      const defaults = Object.fromEntries(keys.map((key) => [key, DEFAULT_SETTINGS[key]]));
      if (page === 'shortcuts' || page === 'privacy') {
        defaults.desktop = {
          ...values.desktop,
          ...preserveDesktopFields(page, DEFAULT_SETTINGS.desktop),
        };
      } else if (page === 'general') {
        defaults.desktop = {
          ...DEFAULT_SETTINGS.desktop,
          ...preserveDesktopFields('shortcuts', values.desktop),
          ...preserveDesktopFields('privacy', values.desktop),
        };
      }
      return { ...current, ...defaults };
    });
    setDirty(true);
    setNotice('已填入此类别的默认值。保存后生效。');
  }
  async function resetAll() {
    setBusy(true);
    try {
      const model = await window.tapkit.modelCommand(requestOptions(), 'models.preferences.get', {
        scope: { type: 'profile', id: profileId },
      });
      if (!model.ok) throw new Error(model.error.code);
      await save(DEFAULT_SETTINGS, revision, PreferencesViewSchema.parse(model.data).revision);
      setDirty(false);
      setConfirmReset(false);
      setNotice('已恢复全部本机偏好。');
    } catch (error) {
      setNotice(error instanceof Error && error.message === 'CONFLICT' ? t.conflict : t.error);
    } finally {
      setBusy(false);
    }
  }
  const personal = draft.personal,
    desktop = draft.desktop,
    custom = draft.personalization;
  const field = (
    label: string,
    key: 'nickname' | 'biography' | 'addressAs' | 'occupation' | 'interests',
    max: number,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={personal[key]}
        maxLength={max}
        onChange={(e) => update('personal', { ...personal, [key]: e.target.value })}
      />
    </label>
  );
  const select = (
    label: string,
    value: string,
    choices: [string, string][],
    change: (value: string) => void,
  ) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => change(e.target.value)}>
        {choices.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="desktop-settings">
      <h1>{settingCategories[page as keyof typeof settingCategories]?.title ?? t.settings}</h1>
      <p>{t.scope}</p>
      <SettingsNavigation page={page} />
      <div className="settings-body" ref={body}>
        {(page === 'archived' || page === 'trash') && (
          <HistorySettings key={page} state={page} projects={projects} onNavigate={onNavigate} />
        )}
        {page === 'personal' && (
          <>
            <div className="avatar-editor">
              {personal.avatar ? (
                <img src={personal.avatar} alt="本地头像" width="64" height="64" />
              ) : (
                <LocalAvatar />
              )}
              <button
                onClick={() =>
                  void window.tapkit
                    .chooseAvatar()
                    .then((avatar) => {
                      if (avatar) update('personal', { ...personal, avatar });
                    })
                    .catch(() =>
                      setNotice(
                        '头像未导入，请选择 5 MiB 以内、4096×4096 以内的 PNG、JPEG 或 WebP。',
                      ),
                    )
                }
              >
                选择头像
              </button>
              <button onClick={() => update('personal', { ...personal, avatar: null })}>
                移除头像
              </button>
            </div>
            <div className="settings-grid">
              {field('昵称', 'nickname', 40)}
              {field('称呼', 'addressAs', 40)}
              {field('个人简介', 'biography', 500)}
              {field('职业', 'occupation', 100)}
              {field('兴趣', 'interests', 500)}
              {select(
                '常用语言',
                personal.language,
                [
                  ['auto', '自动'],
                  ['zh-CN', '中文'],
                  ['en', '英语'],
                ],
                (v) => update('personal', { ...personal, language: v as typeof personal.language }),
              )}
            </div>
            <p>
              <Link to="/settings/agreement">{t.agreement}</Link> ·{' '}
              <Link to="/settings/privacy">{t.privacy}</Link>
            </p>
          </>
        )}
        {page === 'general' && (
          <div className="settings-grid">
            {select(
              '主题',
              desktop.theme,
              [
                ['system', '跟随系统'],
                ['light', '浅色'],
                ['dark', '深色'],
              ],
              (v) => update('desktop', { ...desktop, theme: v as typeof desktop.theme }),
            )}
            {select(
              '字体大小',
              desktop.fontSize,
              [
                ['small', '小'],
                ['normal', '标准'],
                ['large', '大'],
              ],
              (v) => update('desktop', { ...desktop, fontSize: v as typeof desktop.fontSize }),
            )}
            {select(
              '缩放',
              String(desktop.zoom),
              [
                ['0.75', '75%'],
                ['1', '100%'],
                ['1.25', '125%'],
                ['1.5', '150%'],
                ['2', '200%'],
              ],
              (v) => update('desktop', { ...desktop, zoom: Number(v) }),
            )}
            <label>
              界面语言
              <select disabled>
                <option>中文（其他语言规划中）</option>
              </select>
            </label>
            {(['enterSends', 'compact', 'showSuggestions', 'showPlanned'] as const).map(
              (key, i) => (
                <label className="check-label" key={key}>
                  <input
                    type="checkbox"
                    checked={desktop[key]}
                    onChange={(e) => update('desktop', { ...desktop, [key]: e.target.checked })}
                  />
                  {
                    [
                      '回车发送（关闭后使用 Ctrl+Enter）',
                      '紧凑侧栏与列表',
                      '显示首页示例',
                      '显示规划中入口',
                    ][i]
                  }
                </label>
              ),
            )}
            <label>
              默认下载位置
              <input readOnly value={desktop.defaultDirectory} placeholder="尚未选择" />
              <span className="action-group">
                <button
                  onClick={() =>
                    void window.tapkit
                      .chooseDirectory()
                      .then((path) => {
                        if (path) update('desktop', { ...desktop, defaultDirectory: path });
                      })
                      .catch(() => setNotice(t.error))
                  }
                >
                  选择目录
                </button>
                <button onClick={() => update('desktop', { ...desktop, defaultDirectory: '' })}>
                  清空目录
                </button>
              </span>
              <small>用于保存对话或下载原件时的初始位置，每次保存仍需确认。</small>
            </label>
            <DesktopPreferenceFields
              desktop={desktop}
              revision={revision}
              change={(value) => update('desktop', value)}
            />
            <Link to="/settings/models">设置默认模型</Link>
            {select(
              '模型网络代理',
              draft.network.mode,
              [
                ['environment', t.networkAuto],
                ['direct', '直连'],
                ['manual', '手动 HTTP / HTTPS 代理'],
              ],
              (v) =>
                update('network', {
                  ...draft.network,
                  mode: v as typeof draft.network.mode,
                  proxyURL: v === 'manual' ? draft.network.proxyURL : '',
                }),
            )}
            <small>{t.networkAutoHint}</small>
            <small>{t.networkSafetyHint}</small>
            <label>
              代理地址
              <input
                value={draft.network.proxyURL}
                disabled={draft.network.mode !== 'manual'}
                placeholder="http://127.0.0.1:7890"
                onChange={(e) => update('network', { ...draft.network, proxyURL: e.target.value })}
              />
              <small>不支持用户名、密码、查询参数；保存后用于后续请求。</small>
            </label>
          </div>
        )}
        {page === 'personalization' && (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={custom.enabled}
                onChange={(e) =>
                  update('personalization', { ...custom, enabled: e.target.checked })
                }
              />
              启用个性化
            </label>
            <p>关闭时保留已保存偏好；聊天与工作开放后读取有效偏好。</p>
            <fieldset disabled={!custom.enabled}>
              <label>
                长期自定义指令
                <textarea
                  rows={5}
                  maxLength={8000}
                  value={custom.instructions}
                  onChange={(e) =>
                    update('personalization', { ...custom, instructions: e.target.value })
                  }
                />
              </label>
              {(['chat', 'work'] as const).map((mode) => (
                <section key={mode} aria-label={mode === 'chat' ? '聊天默认偏好' : '工作默认偏好'}>
                  <h2>{mode === 'chat' ? '聊天' : '工作'}默认偏好</h2>
                  <div className="settings-grid">
                    {select(
                      '回答语言',
                      custom[mode].language,
                      [
                        ['auto', '自动'],
                        ['zh-CN', '中文'],
                        ['en', '英语'],
                      ],
                      (v) =>
                        update('personalization', {
                          ...custom,
                          [mode]: { ...custom[mode], language: v },
                        }),
                    )}
                    {select(
                      '回答篇幅',
                      custom[mode].length,
                      [
                        ['short', '简短'],
                        ['normal', '标准'],
                        ['long', '详细'],
                      ],
                      (v) =>
                        update('personalization', {
                          ...custom,
                          [mode]: { ...custom[mode], length: v },
                        }),
                    )}
                    {select(
                      '回答语气',
                      custom[mode].tone,
                      [
                        ['natural', '自然'],
                        ['professional', '专业'],
                        ['friendly', '亲切'],
                      ],
                      (v) =>
                        update('personalization', {
                          ...custom,
                          [mode]: { ...custom[mode], tone: v },
                        }),
                    )}
                    {select(
                      '回答排版',
                      custom[mode].format,
                      [
                        ['auto', '自动'],
                        ['plain', '纯文本'],
                        ['markdown', 'Markdown'],
                        ['json', 'JSON（发送时仍需模型支持）'],
                      ],
                      (v) =>
                        update('personalization', {
                          ...custom,
                          [mode]: { ...custom[mode], format: v },
                        }),
                    )}
                  </div>
                </section>
              ))}
            </fieldset>
          </>
        )}
        {page === 'personalization' && (
          <>
            <label>
              <input
                type="checkbox"
                aria-label={m.enabled}
                checked={draft.memoryEnabled}
                onChange={(e) => update('memoryEnabled', e.target.checked)}
              />
              {m.enabled}
            </label>
            <label>
              <input
                type="checkbox"
                aria-label={m.history}
                checked={draft.historyEnabled}
                onChange={(e) => update('historyEnabled', e.target.checked)}
              />
              {m.history}
            </label>
            <MemoryManager />
          </>
        )}
        {page === 'connections' && (
          <div className="connection-links">
            <p>
              连接由本地核心管理。添加账户后手动检测文本与工具能力；连接错误保留服务返回的诊断。
            </p>
            <Link to="/dev/api">API Key 账户</Link>
            <Link to="/dev/codex">Codex 订阅账户</Link>
            <Link to="/settings/models">模型与用量</Link>
          </div>
        )}
        {page === 'shortcuts' && (
          <ShortcutSettings
            key={reloadCount}
            desktop={desktop}
            revision={revision}
            change={(value) => update('desktop', value)}
          />
        )}
        {page === 'availability' && (
          <>
            <FutureFeatures />
            <PlannedFeatures pathname="" />
          </>
        )}
        {page === 'privacy' && (
          <article>
            <h2>文件、通知与外部请求</h2>
            <label className="check-label">
              <input
                type="checkbox"
                checked={desktop.systemNotifications}
                onChange={(event) =>
                  update('desktop', { ...desktop, systemNotifications: event.target.checked })
                }
              />
              允许 Windows 系统通知
            </label>
            <p>文件由你主动选择或导入，外部打开与下载均有明确入口。工作外部写入由审批记录管理。</p>
            <p>
              启用联网搜索后，搜索服务会收到查询词；打开网页时目标站点会收到普通网页请求。模型服务只接收该次请求所需的上下文。
            </p>
            <Link to="/settings/connections">管理模型账户与授权</Link>
            <p>
              个人资料、设置、会话记录和用量保存在本机应用数据目录。头像只保留静态缩略图。布局留在当前窗口的本地存储。
            </p>
            <p>
              API Key
              与订阅凭据通过主进程系统加密存储，不进入界面日志。配置或检测模型会向所选服务发送请求；你保存的
              Base URL 决定密钥的接收地址，请核对域名。
            </p>
            <p>首页示例和草稿由你确认后发送。启用个性化时，聊天与工作按该设置使用偏好。</p>
          </article>
        )}
        {page === 'agreement' && (
          <article>
            <h2>TapKit 本地使用说明</h2>
            <p>
              无需注册 TapKit
              账户。模型服务由你自行配置，第三方服务的账户权限、费用与条款由对应服务提供。
            </p>
            <p>
              规划中的能力不提供执行。请核对模型输出后使用。选择默认目录不会授予任意文件访问或外部发布权限。
            </p>
            <p>本页是当前版本的本地使用说明；没有另行收集注册资料或要求接受远程协议。</p>
          </article>
        )}
        {categoryKeys[page] && (
          <div className="settings-actions">
            <button disabled={busy || !dirty} onClick={() => void submit()}>
              {busy ? '保存中…' : t.save}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void reload()
                  .then(() => {
                    setDirty(false);
                    setReloadCount((count) => count + 1);
                    setNotice('已重新加载');
                  })
                  .catch(() => setNotice(t.error))
              }
            >
              重新加载设置
            </button>
            <button disabled={busy} onClick={resetCategory}>
              恢复此类别默认值
            </button>
          </div>
        )}
        {page === 'general' && (
          <div className="settings-reset">
            {confirmReset ? (
              <>
                <p>
                  这会重置本机个人资料、个性化、隐私、默认模型、预算和桌面偏好。连接账户、会话及文件会保留。
                </p>
                <button disabled={busy} onClick={() => void resetAll()}>
                  确认恢复全部本机偏好
                </button>
                <button disabled={busy} onClick={() => setConfirmReset(false)}>
                  取消
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => setConfirmReset(true)}>
                恢复全部本机偏好
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" aria-label="设置操作状态">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
