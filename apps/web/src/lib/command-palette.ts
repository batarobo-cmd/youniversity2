import type { Locale } from '@youniversity2/shared';
import { getMainAdminNavTiles, getSettingsNavTiles } from './admin-nav';
import { t } from './i18n';

export type CommandPaletteItem = {
  id: string;
  label: string;
  group: string;
  href: string;
  keywords: string;
};

export function buildCommandPaletteItems(
  locale: Locale,
  options: { platformAdmin: boolean; studentMode: boolean },
): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard', locale),
      group: t('command.groupNav', locale),
      href: '/dashboard',
      keywords: 'dashboard prehľad home',
    },
    {
      id: 'courses',
      label: t('nav.courses', locale),
      group: t('command.groupNav', locale),
      href: '/courses',
      keywords: 'courses kurzy',
    },
    {
      id: 'profile',
      label: t('profile.menuSettings', locale),
      group: t('command.groupNav', locale),
      href: '/dashboard/profile',
      keywords: 'profile profil nastavenia account',
    },
  ];

  if (options.studentMode) return items;

  for (const tile of getMainAdminNavTiles(options.platformAdmin)) {
    items.push({
      id: tile.href,
      label: t(tile.titleKey, locale),
      group: t('command.groupAdmin', locale),
      href: tile.href,
      keywords: `${t(tile.titleKey, locale)} ${t(tile.descKey, locale)} admin`,
    });
  }

  if (options.platformAdmin) {
    for (const tile of getSettingsNavTiles()) {
      items.push({
        id: tile.href,
        label: t(tile.titleKey, locale),
        group: t('command.groupSettings', locale),
        href: tile.href,
        keywords: `${t(tile.titleKey, locale)} ${t(tile.descKey, locale)} settings nastavenia`,
      });
    }
  }

  return items;
}

export function filterCommandPaletteItems(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = `${item.label} ${item.group} ${item.keywords}`.toLowerCase();
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}
