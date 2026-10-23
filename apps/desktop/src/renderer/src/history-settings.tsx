import { useState } from 'react';
import { HistoryList } from './history-ui';
import { UiIcon } from './ui-icon';

export function HistorySettings({
  state,
  projects,
  onNavigate,
}: {
  state: 'archived' | 'trash';
  projects: { id: string; name: string }[];
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [mode, setMode] = useState<'' | 'chat' | 'work'>(''),
    [project, setProject] = useState('');
  const title = state === 'archived' ? '已归档的聊天' : '回收站';
  return (
    <section className="history-settings" aria-label={title}>
      <div className="history-settings-filters">
        <label className="history-title-search">
          <UiIcon name="search" />
          <input
            type="search"
            aria-label={'搜索' + title}
            placeholder={'搜索' + title}
            maxLength={240}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="会话类型"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="">全部会话</option>
          <option value="chat">聊天</option>
          <option value="work">工作</option>
        </select>
        <select aria-label="所属项目" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">所有项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {state === 'trash' && (
        <p className="history-retention">会话在回收站保留 30 天；永久删除后无法恢复。</p>
      )}
      <HistoryList
        key={state}
        page
        stateFilter={state}
        query={query}
        modeFilter={mode || undefined}
        projectId={project || undefined}
        projects={projects}
        onNavigate={onNavigate}
      />
    </section>
  );
}
