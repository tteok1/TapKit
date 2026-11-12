import { Link } from '@tapkit/ui';
import type { FeatureAvailability } from '@tapkit/contracts';
import t from '../../locales/experience.zh-CN.json';

export const plannedFeatures = [
  { path: '/planned/agents', ...t.agents },
  { path: '/planned/plugins', ...t.plugins },
  { path: '/planned/skills', ...t.skills },
  { path: '/planned/schedules', ...t.schedules },
];

const availability: { title: string; state: FeatureAvailability; platform?: string }[] = [
  { title: '全局快速输入', state: 'available', platform: t.desktop },
  ...plannedFeatures.map(({ title }) => ({ title, state: 'placeholder' as const })),
  ...t.future.map((title) => ({ title, state: 'hidden' as const })),
];

const stateLabels: Record<FeatureAvailability, string> = {
  available: t.available,
  placeholder: t.planned,
  hidden: t.hidden,
};

export function PlannedFeatures({ pathname }: { pathname: string }) {
  return (
    <nav className="planned-navigation" aria-label="规划中功能">
      {plannedFeatures.map(({ title, path }) => (
        <Link key={path} to={path} aria-current={path === pathname ? 'page' : undefined}>
          <span>{title}</span>
          <small>{t.planned}</small>
        </Link>
      ))}
    </nav>
  );
}

export function PlannedPage({ feature }: { feature: (typeof plannedFeatures)[number] }) {
  return (
    <section className="experience-page" aria-labelledby="planned-title">
      <h1 id="planned-title">{feature.title}</h1>
      <p className="feature-status">{t.planned}</p>
      <p>{feature.description}</p>
      <div className="action-group">
        <Link to="/chats">返回聊天</Link>
        <Link to="/projects">查看项目</Link>
      </div>
    </section>
  );
}

export function FutureFeatures() {
  return (
    <dl className="feature-list">
      {availability.map(({ title, state, platform }) => (
        <div key={title}>
          <dt>{title}</dt>
          <dd>
            {stateLabels[state]}
            {platform && ' · ' + platform}
          </dd>
        </div>
      ))}
    </dl>
  );
}
