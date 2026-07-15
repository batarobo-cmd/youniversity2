import { ADMIN_SETTINGS_SECTIONS } from '$lib/admin-settings-sections';
import { isAdminSettingsPath } from '$lib/admin-settings-sections';

export type AdminNavIcon =
  | 'courses'
  | 'users'
  | 'settings'
  | 'auth'
  | 'system'
  | 'contentBank'
  | 'email'
  | 'branding'
  | 'reporting'
  | 'privacy';

export type AdminNavLevel = 'main' | 'settings';

export type AdminNavTile = {
  href: string;
  titleKey: string;
  descKey: string;
  icon: AdminNavIcon;
  matchPath: string;
  ready?: boolean;
  showStatus?: boolean;
};

export function getMainAdminNavTiles(platformAdmin: boolean): AdminNavTile[] {
  const items: AdminNavTile[] = [
    {
      href: '/dashboard/admin/manage',
      titleKey: 'admin.menuCoursesCategories',
      descKey: 'admin.manageSub',
      icon: 'courses',
      matchPath: '/dashboard/admin/manage',
    },
  ];

  if (!platformAdmin) return items;

  items.push(
    {
      href: '/dashboard/admin/users',
      titleKey: 'admin.menuUsers',
      descKey: 'admin.usersSub',
      icon: 'users',
      matchPath: '/dashboard/admin/users',
    },
    {
      href: '/dashboard/admin/settings',
      titleKey: 'admin.menuSettings',
      descKey: 'admin.settingsGroupSub',
      icon: 'settings',
      matchPath: '/dashboard/admin/settings',
    },
    {
      href: '/dashboard/admin/reporting',
      titleKey: 'admin.settingsReportingTitle',
      descKey: 'admin.settingsReportingSub',
      icon: 'reporting',
      matchPath: '/dashboard/admin/reporting',
      ready: true,
      showStatus: true,
    },
  );

  return items;
}

export function getSettingsNavTiles(): AdminNavTile[] {
  return ADMIN_SETTINGS_SECTIONS.map((section) => ({
    href: section.href,
    titleKey: section.titleKey,
    descKey: section.descKey,
    icon: section.icon,
    matchPath: section.href,
    ready: section.ready,
    showStatus: true,
  }));
}

export function getAdminNavTiles(platformAdmin: boolean, level: AdminNavLevel = 'main'): AdminNavTile[] {
  return level === 'settings' ? getSettingsNavTiles() : getMainAdminNavTiles(platformAdmin);
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/');
}

export function isAdminNavTileActive(pathname: string, tile: AdminNavTile): boolean {
  if (tile.matchPath === '/dashboard/admin/settings') {
    return isAdminSettingsPath(pathname);
  }
  return pathname === tile.matchPath || pathname.startsWith(`${tile.matchPath}/`);
}

export function isAdminNavActive(pathname: string, platformAdmin: boolean): boolean {
  if (!isAdminPath(pathname)) return false;
  const main = getMainAdminNavTiles(platformAdmin);
  if (main.some((tile) => isAdminNavTileActive(pathname, tile))) return true;
  if (isAdminSettingsPath(pathname)) return true;
  return false;
}

export function isAdminOverviewPath(pathname: string): boolean {
  return pathname === '/dashboard/admin';
}

export function getActiveAdminNavTile(pathname: string, platformAdmin: boolean): AdminNavTile | null {
  const tiles = getMainAdminNavTiles(platformAdmin);
  return tiles.find((tile) => isAdminNavTileActive(pathname, tile)) ?? null;
}

export { isAdminSettingsPath };
