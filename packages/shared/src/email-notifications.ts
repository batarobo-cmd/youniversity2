import type { Locale } from './types';

/** Placeholders available in email templates. */
export const EMAIL_TEMPLATE_VARIABLES = [
  'userName',
  'userEmail',
  'courseTitle',
  'courseUrl',
  'platformName',
  'daysRemaining',
  'daysSinceEnrollment',
  'daysInactive',
  'certificateNumber',
  'enrollmentDate',
  'courseStartDate',
  'courseEndDate',
] as const;

export type EmailTemplateVariable = (typeof EMAIL_TEMPLATE_VARIABLES)[number];

export type EmailTemplateContent = {
  subject: string;
  bodyHtml: string;
};

export type NotificationTemplateConfig = EmailTemplateContent & {
  enabled: boolean;
};

export type CourseReminderTemplateConfig = NotificationTemplateConfig & {
  daysBefore?: number;
  daysAfterEnrollment?: number;
  daysInactive?: number;
  /** Minimum days between repeat sends (inactivity reminder only). */
  repeatEveryDays?: number;
};

/** Platform-wide transactional / lifecycle emails (LMS industry standard). */
export const PLATFORM_NOTIFICATION_IDS = [
  'account.welcome',
  'enrollment.created',
  'enrollment.removed',
  'course.published',
  'course.started',
  'course.ended',
  'progress.completed',
  'certificate.issued',
  'reminder.incomplete_global',
] as const;

export type PlatformNotificationId = (typeof PLATFORM_NOTIFICATION_IDS)[number];

/** Per-course reminder rules (overridable content, enable/disable per course). */
export const COURSE_REMINDER_IDS = [
  'reminder.before_start',
  'reminder.on_start',
  'reminder.no_progress',
  'reminder.inactivity',
  'reminder.before_end',
  'reminder.on_end',
] as const;

export type CourseReminderId = (typeof COURSE_REMINDER_IDS)[number];

export type PlatformNotificationMeta = {
  id: PlatformNotificationId;
  category: 'account' | 'enrollment' | 'course' | 'progress' | 'reminder';
  titleKey: string;
  descKey: string;
};

export type CourseReminderMeta = {
  id: CourseReminderId;
  titleKey: string;
  descKey: string;
  /** Platform notification replaced when this per-course reminder is enabled. */
  platformEquivalentId?: PlatformNotificationId;
  daysBeforeTarget?: 'start' | 'end';
  hasDaysAfterEnrollment?: boolean;
  hasDaysInactive?: boolean;
  hasRepeatEveryDays?: boolean;
};

export const PLATFORM_NOTIFICATION_META: PlatformNotificationMeta[] = [
  {
    id: 'account.welcome',
    category: 'account',
    titleKey: 'email.notify.accountWelcomeTitle',
    descKey: 'email.notify.accountWelcomeDesc',
  },
  {
    id: 'enrollment.created',
    category: 'enrollment',
    titleKey: 'email.notify.enrollmentCreatedTitle',
    descKey: 'email.notify.enrollmentCreatedDesc',
  },
  {
    id: 'enrollment.removed',
    category: 'enrollment',
    titleKey: 'email.notify.enrollmentRemovedTitle',
    descKey: 'email.notify.enrollmentRemovedDesc',
  },
  {
    id: 'course.published',
    category: 'course',
    titleKey: 'email.notify.coursePublishedTitle',
    descKey: 'email.notify.coursePublishedDesc',
  },
  {
    id: 'course.started',
    category: 'course',
    titleKey: 'email.notify.courseStartedTitle',
    descKey: 'email.notify.courseStartedDesc',
  },
  {
    id: 'course.ended',
    category: 'course',
    titleKey: 'email.notify.courseEndedTitle',
    descKey: 'email.notify.courseEndedDesc',
  },
  {
    id: 'progress.completed',
    category: 'progress',
    titleKey: 'email.notify.progressCompletedTitle',
    descKey: 'email.notify.progressCompletedDesc',
  },
  {
    id: 'certificate.issued',
    category: 'progress',
    titleKey: 'email.notify.certificateIssuedTitle',
    descKey: 'email.notify.certificateIssuedDesc',
  },
  {
    id: 'reminder.incomplete_global',
    category: 'reminder',
    titleKey: 'email.notify.incompleteGlobalTitle',
    descKey: 'email.notify.incompleteGlobalDesc',
  },
];

export const COURSE_REMINDER_META: CourseReminderMeta[] = [
  {
    id: 'reminder.before_start',
    titleKey: 'email.reminder.beforeStartTitle',
    descKey: 'email.reminder.beforeStartDesc',
    daysBeforeTarget: 'start',
  },
  {
    id: 'reminder.on_start',
    titleKey: 'email.reminder.onStartTitle',
    descKey: 'email.reminder.onStartDesc',
    platformEquivalentId: 'course.started',
  },
  {
    id: 'reminder.no_progress',
    titleKey: 'email.reminder.noProgressTitle',
    descKey: 'email.reminder.noProgressDesc',
    hasDaysAfterEnrollment: true,
  },
  {
    id: 'reminder.inactivity',
    titleKey: 'email.reminder.inactivityTitle',
    descKey: 'email.reminder.inactivityDesc',
    hasDaysInactive: true,
    hasRepeatEveryDays: true,
  },
  {
    id: 'reminder.before_end',
    titleKey: 'email.reminder.beforeEndTitle',
    descKey: 'email.reminder.beforeEndDesc',
    daysBeforeTarget: 'end',
    platformEquivalentId: 'reminder.incomplete_global',
  },
  {
    id: 'reminder.on_end',
    titleKey: 'email.reminder.onEndTitle',
    descKey: 'email.reminder.onEndDesc',
    platformEquivalentId: 'course.ended',
  },
];

const SK_PLATFORM: Record<PlatformNotificationId, NotificationTemplateConfig> = {
  'account.welcome': {
    enabled: true,
    subject: 'Vitajte v {{platformName}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Váš účet bol úspešne vytvorený. Prihlásiť sa môžete kedykoľvek cez portál.</p><p>S pozdravom,<br/>{{platformName}}</p>',
  },
  'enrollment.created': {
    enabled: true,
    subject: 'Boli ste priradený do kurzu {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Boli ste zaregistrovaný do kurzu <strong>{{courseTitle}}</strong>.</p><p><a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
  'enrollment.removed': {
    enabled: true,
    subject: 'Odobratie z kurzu {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Vaše priradenie do kurzu <strong>{{courseTitle}}</strong> bolo ukončené.</p>',
  },
  'course.published': {
    enabled: true,
    subject: 'Kurz {{courseTitle}} je dostupný',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> je teraz publikovaný a pripravený.</p><p><a href="{{courseUrl}}">Prejsť do kurzu</a></p>',
  },
  'course.started': {
    enabled: true,
    subject: 'Kurz {{courseTitle}} sa začal',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> práve začal ({{courseStartDate}}).</p><p><a href="{{courseUrl}}">Pokračovať v učení</a></p>',
  },
  'course.ended': {
    enabled: true,
    subject: 'Kurz {{courseTitle}} sa skončil',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> sa skončil ({{courseEndDate}}).</p>',
  },
  'progress.completed': {
    enabled: true,
    subject: 'Gratulujeme — dokončili ste {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Úspešne ste dokončili kurz <strong>{{courseTitle}}</strong>.</p>',
  },
  'certificate.issued': {
    enabled: true,
    subject: 'Certifikát pre {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Váš certifikát <strong>{{certificateNumber}}</strong> pre kurz <strong>{{courseTitle}}</strong> je pripravený a nájdete ho v prílohe tohto e-mailu.</p><p>Po prihlásení do portálu je certifikát dostupný aj v kurze: <a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
  'reminder.incomplete_global': {
    enabled: false,
    subject: 'Pripomienka: dokončite kurz {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Ešte ste nedokončili kurz <strong>{{courseTitle}}</strong>. Zostáva vám {{daysRemaining}} dní.</p><p><a href="{{courseUrl}}">Pokračovať</a></p>',
  },
};

const EN_PLATFORM: Record<PlatformNotificationId, NotificationTemplateConfig> = {
  'account.welcome': {
    enabled: true,
    subject: 'Welcome to {{platformName}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>Your account has been created. You can sign in to the learning portal at any time.</p><p>Best regards,<br/>{{platformName}}</p>',
  },
  'enrollment.created': {
    enabled: true,
    subject: 'You were enrolled in {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>You have been enrolled in <strong>{{courseTitle}}</strong>.</p><p><a href="{{courseUrl}}">Open course</a></p>',
  },
  'enrollment.removed': {
    enabled: true,
    subject: 'Removed from {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>Your enrollment in <strong>{{courseTitle}}</strong> has ended.</p>',
  },
  'course.published': {
    enabled: true,
    subject: '{{courseTitle}} is now available',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> is published and ready.</p><p><a href="{{courseUrl}}">Go to course</a></p>',
  },
  'course.started': {
    enabled: true,
    subject: '{{courseTitle}} has started',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> has started ({{courseStartDate}}).</p><p><a href="{{courseUrl}}">Continue learning</a></p>',
  },
  'course.ended': {
    enabled: true,
    subject: '{{courseTitle}} has ended',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> has ended ({{courseEndDate}}).</p>',
  },
  'progress.completed': {
    enabled: true,
    subject: 'Congratulations — you completed {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>You successfully completed <strong>{{courseTitle}}</strong>.</p>',
  },
  'certificate.issued': {
    enabled: true,
    subject: 'Certificate for {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>Your certificate <strong>{{certificateNumber}}</strong> for <strong>{{courseTitle}}</strong> is ready and attached to this email.</p><p>After signing in, you can also access it in the course: <a href="{{courseUrl}}">Open course</a></p>',
  },
  'reminder.incomplete_global': {
    enabled: false,
    subject: 'Reminder: complete {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>You have not finished <strong>{{courseTitle}}</strong> yet. {{daysRemaining}} days remaining.</p><p><a href="{{courseUrl}}">Continue</a></p>',
  },
};

const SK_REMINDERS: Record<CourseReminderId, CourseReminderTemplateConfig> = {
  'reminder.before_start': {
    enabled: true,
    daysBefore: 3,
    subject: 'Kurz {{courseTitle}} začína o {{daysRemaining}} dní',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> začína {{courseStartDate}}. Pripravte sa včas.</p><p><a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
  'reminder.before_end': {
    enabled: true,
    daysBefore: 7,
    subject: 'Kurz {{courseTitle}} končí o {{daysRemaining}} dní',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> sa končí {{courseEndDate}}. Dokončite ho včas.</p><p><a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
  'reminder.no_progress': {
    enabled: true,
    daysAfterEnrollment: 7,
    subject: 'Začnite kurz {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Od priradenia do kurzu {{courseTitle}} uplynulo {{daysSinceEnrollment}} dní a ešte ste nezačali.</p><p><a href="{{courseUrl}}">Začať teraz</a></p>',
  },
  'reminder.inactivity': {
    enabled: false,
    daysInactive: 14,
    repeatEveryDays: 7,
    subject: 'Dlhšia neaktivita v kurze {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>V kurze {{courseTitle}} ste neboli aktívni {{daysInactive}} dní.</p><p><a href="{{courseUrl}}">Pokračovať</a></p>',
  },
  'reminder.on_start': {
    enabled: false,
    subject: 'Dnes začína kurz {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> dnes začína.</p><p><a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
  'reminder.on_end': {
    enabled: false,
    subject: 'Dnes končí kurz {{courseTitle}}',
    bodyHtml:
      '<p>Dobrý deň {{userName}},</p><p>Kurz <strong>{{courseTitle}}</strong> dnes končí. Dokončite ho, ak ešte nie je hotový.</p><p><a href="{{courseUrl}}">Otvoriť kurz</a></p>',
  },
};

const EN_REMINDERS: Record<CourseReminderId, CourseReminderTemplateConfig> = {
  'reminder.before_start': {
    enabled: true,
    daysBefore: 3,
    subject: '{{courseTitle}} starts in {{daysRemaining}} days',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> starts on {{courseStartDate}}. Get ready in time.</p><p><a href="{{courseUrl}}">Open course</a></p>',
  },
  'reminder.before_end': {
    enabled: true,
    daysBefore: 7,
    subject: '{{courseTitle}} ends in {{daysRemaining}} days',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> ends on {{courseEndDate}}. Please finish in time.</p><p><a href="{{courseUrl}}">Open course</a></p>',
  },
  'reminder.no_progress': {
    enabled: true,
    daysAfterEnrollment: 7,
    subject: 'Start {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>It has been {{daysSinceEnrollment}} days since you were enrolled in {{courseTitle}} and you have not started yet.</p><p><a href="{{courseUrl}}">Start now</a></p>',
  },
  'reminder.inactivity': {
    enabled: false,
    daysInactive: 14,
    repeatEveryDays: 7,
    subject: 'Extended inactivity in {{courseTitle}}',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>You have been inactive in {{courseTitle}} for {{daysInactive}} days.</p><p><a href="{{courseUrl}}">Continue</a></p>',
  },
  'reminder.on_start': {
    enabled: false,
    subject: '{{courseTitle}} starts today',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> starts today.</p><p><a href="{{courseUrl}}">Open course</a></p>',
  },
  'reminder.on_end': {
    enabled: false,
    subject: '{{courseTitle}} ends today',
    bodyHtml:
      '<p>Hello {{userName}},</p><p>The course <strong>{{courseTitle}}</strong> ends today. Complete it if you have not finished yet.</p><p><a href="{{courseUrl}}">Open course</a></p>',
  },
};

export function defaultPlatformNotifications(
  locale: Locale = 'sk',
): Record<PlatformNotificationId, NotificationTemplateConfig> {
  return locale === 'en' ? structuredClone(EN_PLATFORM) : structuredClone(SK_PLATFORM);
}

export function defaultCourseReminders(
  locale: Locale = 'sk',
): Record<CourseReminderId, CourseReminderTemplateConfig> {
  return locale === 'en' ? structuredClone(EN_REMINDERS) : structuredClone(SK_REMINDERS);
}

/** E-mail templates exist for sk/en; other UI locales fall back to sk. */
export function normalizeEmailLocale(locale?: string | null): 'sk' | 'en' {
  return locale === 'en' ? 'en' : 'sk';
}

export function platformNotificationTitleKey(id: PlatformNotificationId): string {
  return PLATFORM_NOTIFICATION_META.find((item) => item.id === id)?.titleKey ?? id;
}

export type CourseNotificationSettings = {
  reminders: Partial<Record<CourseReminderId, CourseReminderTemplateConfig>>;
};

export function emptyCourseNotificationSettings(): CourseNotificationSettings {
  return { reminders: {} };
}

/** Replace {{var}} placeholders in template strings. */
export function renderEmailTemplate(
  template: string,
  vars: Partial<Record<EmailTemplateVariable, string>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key as EmailTemplateVariable] ?? '');
}

const ALLOWED_TEMPLATE_VARS = new Set<string>(EMAIL_TEMPLATE_VARIABLES);

/** Find unknown {{variable}} names used in one or more template strings. */
export function findInvalidTemplateVariables(...templates: string[]): string[] {
  const invalid = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) {
      const name = match[1];
      if (!ALLOWED_TEMPLATE_VARS.has(name)) invalid.add(name);
    }
  }
  return [...invalid].sort();
}

export type EmailTemplateHealth = 'ok' | 'off' | 'error';

export function getEmailTemplateHealth(
  enabled: boolean,
  subject: string,
  bodyHtml: string,
): { health: EmailTemplateHealth; invalidVariables: string[] } {
  const invalidVariables = findInvalidTemplateVariables(subject, bodyHtml);
  if (!enabled) return { health: 'off', invalidVariables };
  if (invalidVariables.length > 0) return { health: 'error', invalidVariables };
  return { health: 'ok', invalidVariables: [] };
}
