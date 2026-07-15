import {
  defaultPlatformNotifications,
  normalizeEmailLocale,
  type NotificationTemplateConfig,
  type PlatformNotificationId,
} from '@youniversity2/shared';
import type { EmailSettingsData } from './email-settings';

export function resolvePlatformNotificationTemplate(
  settings: EmailSettingsData,
  notificationId: PlatformNotificationId,
  userLocale?: string | null,
): NotificationTemplateConfig | null {
  const stored = settings.platformNotifications[notificationId];
  if (!stored?.enabled) return null;

  const locale = normalizeEmailLocale(userLocale);
  if (locale === 'en') {
    const en = defaultPlatformNotifications('en')[notificationId];
    return { enabled: true, subject: en.subject, bodyHtml: en.bodyHtml };
  }

  return {
    enabled: true,
    subject: stored.subject,
    bodyHtml: stored.bodyHtml,
  };
}
