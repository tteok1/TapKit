import { useEffect, useRef, useState } from 'react';
import { Link } from '@tapkit/ui';
import { DEFAULT_PERSONALIZATION, SettingsSetSchema, type SettingsValues } from '@tapkit/contracts';
import t from '../locales/desktop.zh-CN.json';
import { LocalAvatar } from './local-avatar';
export function DesktopSettings({
  page,
  values,
  revision,
  save,
  reload,
}: {
  page: string;
  values: SettingsValues;
  revision: number;
  save: (patch: Partial<SettingsValues>, revision?: number) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(values),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const editingRevision = useRef(revision);
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
      const keys =
        page === 'personal'
          ? ['personal']
          : page === 'personalization'
            ? ['personalization']
            : ['desktop', 'network'];
      const patch = Object.fromEntries(keys.map((k) => [k, draft[k as keyof SettingsValues]]));
      SettingsSetSchema.shape.patch.parse(patch);
      await save(patch, editingRevision.current);
      setDirty(false);
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
      <h1>{t[page as 'personal'] ?? t.settings}</h1>
      <p>{t.scope}</p>
      <nav className="settings-tabs" aria-label="设置分类">
        {(
          [
            'personal',
            'general',
            'personalization',
            'connections',
            'models',
            'privacy',
            'agreement',
          ] as const
        ).map((key) => (
          <Link key={key} to={'/settings/' + key} aria-current={page === key ? 'page' : undefined}>
            {t[key]}
          </Link>
        ))}
      </nav>
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
          {(['enterSends', 'compact', 'showSuggestions', 'showPlanned'] as const).map((key, i) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={desktop[key]}
                onChange={(e) => update('desktop', { ...desktop, [key]: e.target.checked })}
              />
              {['回车发送（聊天发送开放后生效）', '紧凑布局', '显示首页示例', '显示规划中入口'][i]}
            </label>
          ))}
          <label>
            默认目录
            <input readOnly value={desktop.defaultDirectory} placeholder="尚未选择" />
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
            <small>只保存偏好，实际文件访问仍需授权。</small>
          </label>
          {select(
            '模型网络代理',
            draft.network.mode,
            [
              ['environment', '继承环境'],
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
              onChange={(e) => update('personalization', { ...custom, enabled: e.target.checked })}
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
          <button
            onClick={() => update('personalization', structuredClone(DEFAULT_PERSONALIZATION))}
          >
            恢复个性化默认值
          </button>
        </>
      )}
      {page === 'connections' && (
        <div className="connection-links">
          <p>连接由本地核心管理。添加账户后手动检测文本与工具能力；连接错误保留服务返回的诊断。</p>
          <Link to="/dev/api">API Key 账户</Link>
          <Link to="/dev/codex">Codex 订阅账户</Link>
          <Link to="/settings/models">模型与用量</Link>
        </div>
      )}
      {page === 'privacy' && (
        <article>
          <h2>本地数据与外部请求</h2>
          <p>
            个人资料、设置、会话记录和用量保存在本机应用数据目录。头像只保留静态缩略图。布局留在当前窗口的本地存储。
          </p>
          <p>
            API Key
            与订阅凭据通过主进程系统加密存储，不进入界面日志。配置或检测模型会向所选服务发送请求；你保存的
            Base URL 决定密钥的接收地址，请核对域名。
          </p>
          <p>
            界面不会自动发送首页示例或草稿。当前个人资料不会自动提交给模型；未来聊天与工作使用个性化前需要按对应设置构建上下文。
          </p>
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
      {['personal', 'general', 'personalization'].includes(page) && (
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
                  setNotice('已重新加载');
                })
                .catch(() => setNotice(t.error))
            }
          >
            重新加载设置
          </button>
        </div>
      )}
      {notice && <p role={notice === t.saved ? 'status' : 'alert'}>{notice}</p>}
    </section>
  );
}
