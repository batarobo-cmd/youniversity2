import { eq } from 'drizzle-orm';
import {
  defaultPlatformNotifications,
  type NotificationTemplateConfig,
  type PlatformNotificationId,
  PLATFORM_NOTIFICATION_IDS,
} from '@youniversity2/shared';
import { db } from '../db';
import { emailSettings } from '../db/schema';

export type SmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  useStartTls: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export type EmailSettingsData = {
  smtp: SmtpSettings;
  platformNotifications: Record<PlatformNotificationId, NotificationTemplateConfig>;
  platformName: string;
};

export type AdminSmtpSettings = Omit<SmtpSettings, 'password'> & {
  hasPassword: boolean;
  configured: boolean;
};

export type AdminEmailSettings = {
  smtp: AdminSmtpSettings;
  platformNotifications: Record<PlatformNotificationId, NotificationTemplateConfig>;
  platformName: string;
};

const SETTINGS_ID = 1;

function defaultSmtp(): SmtpSettings {
  return {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    useStartTls: true,
    username: '',
    password: '',
    fromEmail: '',
    fromName: 'YOUniversity2',
    replyTo: '',
  };
}

function defaultSettings(): EmailSettingsData {
  return {
    smtp: defaultSmtp(),
    platformNotifications: defaultPlatformNotifications('sk'),
    platformName: 'YOUniversity2',
  };
}

async function readSettingsRow() {
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, SETTINGS_ID)).limit(1);
  return row;
}

const LEGACY_CERTIFICATE_ISSUED_BODIES = new Set([
  '<p>Dobrý deň {{userName}},</p><p>Váš certifikát <strong>{{certificateNumber}}</strong> pre kurz {{courseTitle}} je pripravený.</p><p><a href="{{courseUrl}}">Stiahnuť certifikát</a></p>',
  '<p>Hello {{userName}},</p><p>Your certificate <strong>{{certificateNumber}}</strong> for {{courseTitle}} is ready.</p><p><a href="{{courseUrl}}">Download certificate</a></p>',
  '<p>Dobrý deň {{userName}},</p><p>Váš certifikát <strong>{{certificateNumber}}</strong> pre kurz {{courseTitle}} je pripravený.</p><p>Certifikát nájdete v prílohe tohto e-mailu. Môžete si ho stiahnuť aj v portáli: <a href="{{courseUrl}}">{{courseUrl}}</a></p>',
  '<p>Hello {{userName}},</p><p>Your certificate <strong>{{certificateNumber}}</strong> for {{courseTitle}} is ready.</p><p>The certificate is attached to this email. You can also download it in the portal: <a href="{{courseUrl}}">{{courseUrl}}</a></p>',
]);

function resolveNotificationBodyHtml(
  id: PlatformNotificationId,
  bodyHtml: string | undefined,
  defaults: Record<PlatformNotificationId, NotificationTemplateConfig>,
): string {
  const trimmed = bodyHtml?.trim() ?? '';
  if (id === 'certificate.issued' && (!trimmed || LEGACY_CERTIFICATE_ISSUED_BODIES.has(trimmed))) {
    return defaults[id].bodyHtml;
  }
  return trimmed || defaults[id].bodyHtml;
}

function mergePlatformNotifications(
  stored: Partial<Record<PlatformNotificationId, NotificationTemplateConfig>> | undefined,
): Record<PlatformNotificationId, NotificationTemplateConfig> {
  const defaults = defaultPlatformNotifications('sk');
  const merged = { ...defaults };
  if (!stored) return merged;
  for (const id of PLATFORM_NOTIFICATION_IDS) {
    const patch = stored[id];
    if (!patch) continue;
    merged[id] = {
      enabled: patch.enabled ?? defaults[id].enabled,
      subject: patch.subject?.trim() || defaults[id].subject,
      bodyHtml: resolveNotificationBodyHtml(id, patch.bodyHtml, defaults),
    };
  }
  return merged;
}

export async function getEmailSettings(): Promise<EmailSettingsData> {
  const row = await readSettingsRow();
  if (!row) return defaultSettings();

  const stored = row.settings as Partial<EmailSettingsData>;
  const defaults = defaultSettings();

  return {
    platformName: stored.platformName?.trim() || defaults.platformName,
    platformNotifications: mergePlatformNotifications(stored.platformNotifications),
    smtp: {
      enabled: stored.smtp?.enabled ?? defaults.smtp.enabled,
      host: stored.smtp?.host?.trim() ?? defaults.smtp.host,
      port: stored.smtp?.port ?? defaults.smtp.port,
      secure: stored.smtp?.secure ?? defaults.smtp.secure,
      useStartTls: stored.smtp?.useStartTls ?? defaults.smtp.useStartTls,
      username: stored.smtp?.username?.trim() ?? defaults.smtp.username,
      password: stored.smtp?.password || defaults.smtp.password,
      fromEmail: stored.smtp?.fromEmail?.trim() ?? defaults.smtp.fromEmail,
      fromName: stored.smtp?.fromName?.trim() || defaults.smtp.fromName,
      replyTo: stored.smtp?.replyTo?.trim() ?? defaults.smtp.replyTo,
    },
  };
}

export async function getAdminEmailSettings(): Promise<AdminEmailSettings> {
  const settings = await getEmailSettings();
  const { password, ...smtpRest } = settings.smtp;
  const configured = Boolean(
    settings.smtp.host.trim() &&
      settings.smtp.fromEmail.trim() &&
      (settings.smtp.username.trim() ? password : true),
  );
  return {
    platformName: settings.platformName,
    platformNotifications: settings.platformNotifications,
    smtp: {
      ...smtpRest,
      password: '',
      hasPassword: Boolean(password),
      configured,
    },
  };
}

export function isEmailConfigured(settings: EmailSettingsData): boolean {
  return Boolean(
    settings.smtp.enabled &&
      settings.smtp.host.trim() &&
      settings.smtp.fromEmail.trim() &&
      (settings.smtp.username.trim() ? settings.smtp.password : true),
  );
}

export async function updateEmailSettings(
  patch: Partial<{
    platformName: string;
    smtp: Partial<SmtpSettings>;
    platformNotifications: Partial<Record<PlatformNotificationId, Partial<NotificationTemplateConfig>>>;
  }>,
): Promise<AdminEmailSettings> {
  const current = await getEmailSettings();

  const next: EmailSettingsData = {
    platformName: patch.platformName?.trim() || current.platformName,
    platformNotifications: { ...current.platformNotifications },
    smtp: {
      enabled: patch.smtp?.enabled ?? current.smtp.enabled,
      host: patch.smtp?.host?.trim() ?? current.smtp.host,
      port: patch.smtp?.port ?? current.smtp.port,
      secure: patch.smtp?.secure ?? current.smtp.secure,
      useStartTls: patch.smtp?.useStartTls ?? current.smtp.useStartTls,
      username: patch.smtp?.username?.trim() ?? current.smtp.username,
      password:
        patch.smtp?.password !== undefined && patch.smtp.password.trim()
          ? patch.smtp.password.trim()
          : current.smtp.password,
      fromEmail: patch.smtp?.fromEmail?.trim() ?? current.smtp.fromEmail,
      fromName: patch.smtp?.fromName?.trim() || current.smtp.fromName,
      replyTo: patch.smtp?.replyTo?.trim() ?? current.smtp.replyTo,
    },
  };

  if (patch.platformNotifications) {
    for (const id of PLATFORM_NOTIFICATION_IDS) {
      const item = patch.platformNotifications[id];
      if (!item) continue;
      next.platformNotifications[id] = {
        enabled: item.enabled ?? next.platformNotifications[id].enabled,
        subject: item.subject?.trim() || next.platformNotifications[id].subject,
        bodyHtml: item.bodyHtml?.trim() || next.platformNotifications[id].bodyHtml,
      };
    }
  }

  await db
    .insert(emailSettings)
    .values({ id: SETTINGS_ID, settings: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: emailSettings.id,
      set: { settings: next, updatedAt: new Date() },
    });

  return getAdminEmailSettings();
}
