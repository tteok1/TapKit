import { useEffect, useState } from 'react';
import {
  DesktopShortcutSchema,
  DesktopShortcutsSchema,
  type SettingsValues,
} from '@tapkit/contracts';
import { currentWeek, formatDesktopDate } from './desktop-preferences';
import { shortcutNames } from '../help/HelpPage';
import { Link } from '@tapkit/ui';

type Desktop = SettingsValues['desktop'];
type Props = { desktop: Desktop; change: (value: Desktop) => void };

export function DesktopPreferenceFields({
  desktop,
  change,
  revision,
}: Props & { revision: number }) {
  const [environment, setEnvironment] =
    useState<Awaited<ReturnType<typeof window.tapkit.desktopEnvironment>>>();
  useEffect(() => {
    let alive = true;
    void window.tapkit
      .desktopEnvironment()
      .then((value) => {
        if (alive) setEnvironment(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [revision]);
  const select = <K extends keyof Desktop>(
    key: K,
    title: string,
    choices: [Desktop[K], string][],
  ) => (
    <label>
      {title}
      <select
        aria-label={title}
        value={String(desktop[key])}
        onChange={(event) => change({ ...desktop, [key]: event.target.value })}
      >
        {choices.map(([value, text]) => (
          <option key={String(value)} value={String(value)}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (key: keyof Desktop, title: string) => (
    <label className="check-label">
      <input
        type="checkbox"
        checked={Boolean(desktop[key])}
        onChange={(event) => change({ ...desktop, [key]: event.target.checked })}
      />
      {title}
    </label>
  );
  let example = '请输入有效的时区名称，例如 Asia/Shanghai。';
  try {
    example =
      '日期示例 ' +
      formatDesktopDate(Date.now(), desktop) +
      ' · 本周 ' +
      currentWeek(desktop).join(' 至 ');
  } catch {
    // Leave an actionable message while the time-zone input is incomplete.
  }
  return (
    <>
      {select('contentWidth', '内容宽度', [
        ['standard', '标准'],
        ['wide', '宽'],
        ['fluid', '随窗口'],
      ])}
      {select('startPage', '启动时打开', [
        ['home', '首页'],
        ['chats', '聊天'],
        ['work', '工作'],
        ['projects', '项目'],
        ['files', '文件'],
      ])}
      {select('defaultMode', '首页默认模式', [
        ['chat', '聊天'],
        ['work', '工作'],
      ])}
      {select('dateLocale', '日期地区', [
        ['system', '跟随系统'],
        ['zh-CN', '中国大陆'],
        ['en-US', '美国'],
        ['en-GB', '英国'],
      ])}
      {select('dateFormat', '日期格式', [
        ['short', '简短'],
        ['medium', '标准'],
        ['long', '详细'],
      ])}
      <label>
        时区
        <input
          value={desktop.timeZone}
          maxLength={80}
          list="desktop-timezones"
          onChange={(event) => change({ ...desktop, timeZone: event.target.value })}
        />
      </label>
      <datalist id="desktop-timezones">
        <option value="system" />
        {Intl.supportedValuesOf('timeZone').map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      {select('weekStart', '每周起始日', [
        ['system', '跟随地区'],
        ['monday', '星期一'],
        ['sunday', '星期日'],
      ])}
      <small role="status">{example}</small>
      {select('externalFiles', '外部打开文件', [
        ['open', '在默认应用打开'],
        ['reveal', '在文件资源管理器中显示'],
      ])}
      {toggle('autoPreview', '从会话定位文件时自动预览')}
      {toggle('showMessageTimes', '显示消息时间')}
      {toggle('showToolDetails', '展开工具过程详情')}
      {toggle('highContrast', '高对比度')}
      {toggle('reduceMotion', '减少动态效果')}
      {toggle('startOnLogin', '登录 Windows 时启动')}
      <small>
        {environment?.packaged
          ? '系统启动状态：' +
            { enabled: '已启用', disabled: '已关闭', unavailable: '无法确认' }[environment.login]
          : 'Windows 安装版应用此偏好。'}
      </small>
      {toggle('keepInTray', '关闭窗口时继续在托盘运行')}
      {toggle('showReleaseLink', '在帮助页显示版本记录入口')}
      <small>在版本记录中手动查看和获取更新。</small>
    </>
  );
}

export function ShortcutSettings({ desktop, change, revision }: Props & { revision: number }) {
  const [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    void window.tapkit
      .desktopEnvironment()
      .then(({ shortcut }) => {
        if (alive)
          setStatus(
            {
              registered: '系统快捷键已注册',
              conflict: '系统快捷键未注册。该组合可能已被其他应用占用，请更换后保存。',
              disabled: '系统快捷键已关闭',
            }[shortcut],
          );
      })
      .catch(() => {
        if (alive) setStatus('无法读取系统快捷键状态。');
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  const conflict = !DesktopShortcutsSchema.safeParse(desktop.shortcuts).success;
  return (
    <div className="shortcut-settings">
      <p>应用内快捷键在 TapKit 窗口使用。全局快速输入适用于 Windows 桌面。</p>
      {Object.entries(shortcutNames).map(([key, label]) => (
        <label key={key}>
          {label}
          <select
            aria-label={label}
            value={desktop.shortcuts[key as keyof Desktop['shortcuts']]}
            aria-invalid={conflict || undefined}
            onChange={(event) =>
              change({
                ...desktop,
                shortcuts: {
                  ...desktop.shortcuts,
                  [key]: DesktopShortcutSchema.parse(event.target.value),
                },
              })
            }
          >
            {DesktopShortcutSchema.options.map((shortcut) => (
              <option key={shortcut}>{shortcut}</option>
            ))}
          </select>
        </label>
      ))}
      {conflict && <p role="alert">快捷键重复。每项操作需要使用不同的组合。</p>}
      <label className="check-label">
        <input
          type="checkbox"
          checked={desktop.quickInputEnabled}
          onChange={(event) => change({ ...desktop, quickInputEnabled: event.target.checked })}
        />
        启用全局快速输入快捷键
      </label>
      <p role="status">{status}</p>
      <button
        onClick={() =>
          void window.tapkit.openQuickInput().catch(() => setStatus('无法打开快速输入。'))
        }
      >
        打开快速输入窗口
      </button>
      <Link to="/help">查看发送与关闭浮层快捷键</Link>
    </div>
  );
}
