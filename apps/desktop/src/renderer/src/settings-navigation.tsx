import { useState } from 'react';
import { Link } from '@tapkit/ui';
import t from '../locales/desktop.zh-CN.json';

export const settingCategories = {
  personal: { title: t.personal, words: '头像 昵称 个人资料' },
  general: {
    title: t.general,
    words:
      '外观 主题 字体 缩放 内容宽度 地区 日期 时区 每周起始日 首页 模式 发送 预览 下载 目录 外部打开 消息时间 工具过程 登录 后台 更新 代理 高对比 减少动效 通知',
  },
  shortcuts: { title: '快捷键', words: '按键 搜索 新建窗口 全局快速输入 冲突' },
  personalization: { title: t.personalization, words: '记忆 聊天历史 自定义指令 回答' },
  connections: { title: t.connections, words: 'API 账户 Codex 订阅' },
  models: { title: t.models, words: '默认模型 预算 费用' },
  archived: { title: t.archived, words: '归档 会话' },
  trash: { title: t.trash, words: '回收 还原 删除' },
  privacy: {
    title: t.privacy,
    words: '权限 文件 网络 通知 数据 备份 恢复 导出 导入 清理 迁移 临时聊天',
  },
  availability: { title: '未来能力', words: '规划中 插件 定时 智能体 模板 图片 语音 视频 屏幕' },
  agreement: { title: t.agreement, words: '协议 说明' },
};

const settingFields = {
  general: [
    '主题',
    '字体大小',
    '缩放',
    '内容宽度',
    '启动时打开',
    '首页默认模式',
    '日期地区',
    '日期格式',
    '时区',
    '每周起始日',
    '默认下载位置',
    '外部打开文件',
    '显示消息时间',
    '展开工具过程详情',
    '高对比度',
    '减少动态效果',
    '登录 Windows 时启动',
    '关闭窗口时继续在托盘运行',
    '模型网络代理',
  ],
  shortcuts: ['全局快速输入', '新建窗口', '新建聊天'],
  privacy: ['允许 Windows 系统通知', '保存聊天记录', '产品反馈默认附带脱敏诊断'],
} as const;

export function SettingsNavigation({ page }: { page: string }) {
  const [query, setQuery] = useState('');
  const terms = query.trim().toLowerCase().split(/\s+/);
  const includes = (value: string) => terms.every((term) => value.toLowerCase().includes(term));
  const fields = query.trim()
    ? Object.entries(settingFields).flatMap(([category, labels]) =>
        labels.filter(includes).map((label) => ({ category, label })),
      )
    : [];
  const matches = Object.entries(settingCategories).filter(([, { title, words }]) =>
    includes(title + ' ' + words),
  );
  return (
    <>
      <label className="settings-search">
        搜索设置
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <nav className="settings-tabs" aria-label={query ? '设置搜索结果' : '设置分类'}>
        {fields.map(({ category, label }) => (
          <Link
            key={category + label}
            to={'/settings/' + category + '?field=' + encodeURIComponent(label)}
            onClick={() => setQuery('')}
          >
            {label}
          </Link>
        ))}
        {matches.map(([key, { title }]) => (
          <Link
            key={key}
            to={'/settings/' + key}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => setQuery('')}
          >
            {title}
          </Link>
        ))}
      </nav>
      {!matches.length && !fields.length && <p role="status">没有匹配的设置。</p>}
    </>
  );
}
