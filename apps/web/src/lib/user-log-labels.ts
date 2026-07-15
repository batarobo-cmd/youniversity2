import type { Locale } from '@youniversity2/shared';
import { t } from './i18n';

type LogEntry = {
  eventType: string;
  kind: 'login' | 'activity';
  method?: string;
  courseTitle?: string | null;
  payload?: Record<string, unknown>;
};

function loginMethodLabel(method: string, locale: Locale) {
  const map: Record<string, string> = {
    password: t('dash.loginMethodPassword', locale),
    oauth_google: t('dash.loginMethodGoogle', locale),
    oauth_microsoft: t('dash.loginMethodMicrosoft', locale),
  };
  return map[method] ?? method;
}

function eventBaseLabel(eventType: string, locale: Locale): string {
  const key = `admin.logEvent.${eventType}` as Parameters<typeof t>[0];
  const translated = t(key, locale);
  return translated !== key ? translated : eventType;
}

export function describeUserLog(entry: LogEntry, locale: Locale): string {
  const p = entry.payload ?? {};

  switch (entry.eventType) {
    case 'auth.login':
      return entry.method
        ? `${eventBaseLabel('auth.login', locale)} (${loginMethodLabel(entry.method, locale)})`
        : eventBaseLabel('auth.login', locale);

    case 'navigation.page': {
      const page = (p.pageTitle as string) || (p.path as string) || '—';
      return `${eventBaseLabel('navigation.page', locale)}: ${page}`;
    }

    case 'ui.click': {
      const label = (p.label as string) || '—';
      const path = p.path as string | undefined;
      return path
        ? `${eventBaseLabel('ui.click', locale)}: „${label}“ (${path})`
        : `${eventBaseLabel('ui.click', locale)}: „${label}“`;
    }

    case 'ui.form_submit': {
      const label = (p.label as string) || (p.formId as string) || '—';
      return `${eventBaseLabel('ui.form_submit', locale)}: „${label}“`;
    }

    case 'course.opened':
    case 'lesson.opened':
    case 'lesson.completed':
    case 'quiz.completed': {
      const base = eventBaseLabel(entry.eventType, locale);
      return entry.courseTitle ? `${base}: ${entry.courseTitle}` : base;
    }

    case 'user.created':
      return `${eventBaseLabel('user.created', locale)}: ${p.targetName ?? '—'} (${p.targetEmail ?? '—'})`;

    case 'user.updated':
      return `${eventBaseLabel('user.updated', locale)}: ${p.targetName ?? '—'}`;

    case 'user.deleted':
      return `${eventBaseLabel('user.deleted', locale)}: ${p.targetName ?? '—'} (${p.targetEmail ?? '—'})`;

    case 'user.suspended':
    case 'user.unsuspended':
      return `${eventBaseLabel(entry.eventType, locale)}: ${p.targetName ?? '—'} (${p.targetEmail ?? '—'})`;

    case 'enrollment.created':
    case 'enrollment.reactivated':
    case 'enrollment.revoked':
    case 'enrollment.suspended':
    case 'enrollment.unsuspended':
      return `${eventBaseLabel(entry.eventType, locale)}: ${p.studentName ?? '—'} → ${p.courseTitle ?? p.courseId ?? '—'}`;

    case 'course.created':
    case 'course.updated':
    case 'course.published':
    case 'course.unpublished':
    case 'course.deleted':
      return `${eventBaseLabel(entry.eventType, locale)}: ${p.courseTitle ?? p.courseSlug ?? '—'}`;

    case 'category.created':
    case 'category.updated':
    case 'category.deleted':
      return `${eventBaseLabel(entry.eventType, locale)}: ${p.categoryName ?? p.categorySlug ?? '—'}`;

    case 'auth.logout':
      return eventBaseLabel('auth.logout', locale);

    case 'reports.exported': {
      const section = (p.section as string) ?? '—';
      const format = (p.format as string) ?? '—';
      return `${eventBaseLabel('reports.exported', locale)}: ${section} (${format})`;
    }

    default: {
      const base = eventBaseLabel(entry.eventType, locale);
      const detail = entry.courseTitle || (p.label as string) || (p.targetName as string);
      return detail ? `${base}: ${detail}` : base;
    }
  }
}
