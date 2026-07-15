export type AdminSettingsSectionId = 'auth' | 'system' | 'contentBank' | 'email' | 'branding' | 'privacy';

export type AdminSettingsSection = {
  id: AdminSettingsSectionId;
  href: string;
  titleKey: string;
  descKey: string;
  icon: AdminSettingsSectionId;
  /** Sections with full UI implemented (others show planned-feature scaffold). */
  ready: boolean;
};

export const ADMIN_SETTINGS_SECTIONS: AdminSettingsSection[] = [
  {
    id: 'auth',
    href: '/dashboard/admin/settings/auth',
    titleKey: 'admin.settingsAuthTitle',
    descKey: 'admin.settingsAuthSub',
    icon: 'auth',
    ready: true,
  },
  {
    id: 'system',
    href: '/dashboard/admin/settings/system',
    titleKey: 'admin.settingsSystemTitle',
    descKey: 'admin.settingsSystemSub',
    icon: 'system',
    ready: true,
  },
  {
    id: 'contentBank',
    href: '/dashboard/admin/settings/content-bank',
    titleKey: 'admin.settingsContentBankTitle',
    descKey: 'admin.settingsContentBankSub',
    icon: 'contentBank',
    ready: true,
  },
  {
    id: 'email',
    href: '/dashboard/admin/settings/email',
    titleKey: 'admin.settingsEmailTitle',
    descKey: 'admin.settingsEmailSub',
    icon: 'email',
    ready: false,
  },
  {
    id: 'branding',
    href: '/dashboard/admin/settings/branding',
    titleKey: 'admin.settingsBrandingTitle',
    descKey: 'admin.settingsBrandingSub',
    icon: 'branding',
    ready: false,
  },
  {
    id: 'privacy',
    href: '/dashboard/admin/settings/privacy',
    titleKey: 'admin.settingsPrivacyTitle',
    descKey: 'admin.settingsPrivacySub',
    icon: 'privacy',
    ready: false,
  },
];

export function adminSettingsSectionForPath(pathname: string): AdminSettingsSection | undefined {
  return ADMIN_SETTINGS_SECTIONS.find(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
  );
}

export function isAdminSettingsPath(pathname: string): boolean {
  return pathname === '/dashboard/admin/settings' || pathname.startsWith('/dashboard/admin/settings/');
}
