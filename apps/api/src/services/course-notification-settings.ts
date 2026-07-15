import {
  COURSE_REMINDER_IDS,
  defaultCourseReminders,
  normalizeEmailLocale,
  type CourseNotificationSettings,
  type CourseReminderId,
  type CourseReminderTemplateConfig,
} from '@youniversity2/shared';
import type { Course } from '../db/schema';

export function parseCourseNotificationSettings(raw: unknown): CourseNotificationSettings {
  if (!raw || typeof raw !== 'object') return { reminders: {} };
  const reminders = (raw as CourseNotificationSettings).reminders;
  if (!reminders || typeof reminders !== 'object') return { reminders: {} };
  return { reminders: { ...reminders } };
}

export function mergeCourseReminder(
  course: Course,
  reminderId: CourseReminderId,
  userLocale?: string | null,
): CourseReminderTemplateConfig | null {
  const locale = normalizeEmailLocale(userLocale ?? course.defaultLocale);
  const stored = parseCourseNotificationSettings(course.notificationSettings).reminders[reminderId];
  const defaults = defaultCourseReminders(locale)[reminderId];
  if (!stored && !defaults.enabled) return null;

  const enabled = stored?.enabled ?? defaults.enabled;
  if (!enabled) return null;

  return {
    enabled: true,
    subject: stored?.subject?.trim() || defaults.subject,
    bodyHtml: stored?.bodyHtml?.trim() || defaults.bodyHtml,
    daysBefore: stored?.daysBefore ?? defaults.daysBefore,
    daysAfterEnrollment: stored?.daysAfterEnrollment ?? defaults.daysAfterEnrollment,
    daysInactive: stored?.daysInactive ?? defaults.daysInactive,
    repeatEveryDays: stored?.repeatEveryDays ?? defaults.repeatEveryDays,
  };
}

export function normalizeCourseNotificationSettings(
  patch: Partial<CourseNotificationSettings> | undefined,
  locale: 'sk' | 'en' = 'sk',
): CourseNotificationSettings {
  const defaults = defaultCourseReminders(locale);
  const next: CourseNotificationSettings = { reminders: {} };

  for (const id of COURSE_REMINDER_IDS) {
    const item = patch?.reminders?.[id];
    if (!item) continue;
    next.reminders[id] = {
      enabled: item.enabled ?? defaults[id].enabled,
      subject: item.subject?.trim() || defaults[id].subject,
      bodyHtml: item.bodyHtml?.trim() || defaults[id].bodyHtml,
      daysBefore: item.daysBefore ?? defaults[id].daysBefore,
      daysAfterEnrollment: item.daysAfterEnrollment ?? defaults[id].daysAfterEnrollment,
      daysInactive: item.daysInactive ?? defaults[id].daysInactive,
      repeatEveryDays: item.repeatEveryDays ?? defaults[id].repeatEveryDays,
    };
  }

  return next;
}
