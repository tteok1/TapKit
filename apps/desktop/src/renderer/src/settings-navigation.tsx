import { Link } from '@tapkit/ui';
import t from '../locales/desktop.zh-CN.json';

export function SettingsNavigation({ page }: { page: string }) {
  return (
    <nav className="settings-tabs" aria-label="设置分类">
      {(
        [
          'personal',
          'general',
          'personalization',
          'connections',
          'models',
          'archived',
          'trash',
          'privacy',
          'agreement',
        ] as const
      ).map((key) => (
        <Link key={key} to={'/settings/' + key} aria-current={page === key ? 'page' : undefined}>
          {t[key]}
        </Link>
      ))}
    </nav>
  );
}
