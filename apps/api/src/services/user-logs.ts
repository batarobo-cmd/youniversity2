import { eq, and, gte, lte, lt, desc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { activityEvents, loginEvents, securityEvents, courses, courseTranslations } from '../db/schema';

const RETENTION_MS = 183 * 24 * 60 * 60 * 1000; // ~6 months
let lastRetentionPurge = 0;

export function sixMonthsAgo(from = new Date()) {
  return new Date(from.getTime() - RETENTION_MS);
}

export async function ensureLogRetention() {
  if (Date.now() - lastRetentionPurge < 24 * 60 * 60 * 1000) return;
  lastRetentionPurge = Date.now();
  const cutoff = sixMonthsAgo();
  await db.delete(loginEvents).where(lt(loginEvents.createdAt, cutoff));
  await db.delete(activityEvents).where(lt(activityEvents.createdAt, cutoff));
  await db.delete(securityEvents).where(lt(securityEvents.createdAt, cutoff));
}

export type UserLogEntry = {
  id: string;
  kind: 'login' | 'activity';
  eventType: string;
  occurredAt: string;
  courseId?: string | null;
  courseTitle?: string | null;
  lessonId?: string | null;
  method?: string;
  payload?: Record<string, unknown>;
};

function parseDateStart(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEnd(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getUserLogs(
  userId: string,
  locale: string,
  options: { q?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
) {
  await ensureLogRetention();

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const retentionStart = sixMonthsAgo();
  const fromDate = parseDateStart(options.from) ?? retentionStart;
  const effectiveFrom = fromDate < retentionStart ? retentionStart : fromDate;
  const toDate = parseDateEnd(options.to);

  const activityConditions = [
    eq(activityEvents.userId, userId),
    gte(activityEvents.createdAt, effectiveFrom),
  ];
  if (toDate) activityConditions.push(lte(activityEvents.createdAt, toDate));

  const loginConditions = [eq(loginEvents.userId, userId), gte(loginEvents.createdAt, effectiveFrom)];
  if (toDate) loginConditions.push(lte(loginEvents.createdAt, toDate));

  const [activities, logins] = await Promise.all([
    db
      .select()
      .from(activityEvents)
      .where(and(...activityConditions))
      .orderBy(desc(activityEvents.createdAt))
      .limit(3000),
    db
      .select()
      .from(loginEvents)
      .where(and(...loginConditions))
      .orderBy(desc(loginEvents.createdAt))
      .limit(500),
  ]);

  const courseIds = [...new Set(activities.map((a) => a.courseId).filter(Boolean))] as string[];
  const courseTitleMap = new Map<string, string>();

  if (courseIds.length > 0) {
    const courseRows = await db.select().from(courses).where(inArray(courses.id, courseIds));
    const translations = await db
      .select()
      .from(courseTranslations)
      .where(and(inArray(courseTranslations.courseId, courseIds), eq(courseTranslations.locale, locale)));

    const translationMap = new Map(translations.map((t) => [t.courseId, t.title]));
    for (const course of courseRows) {
      courseTitleMap.set(course.id, translationMap.get(course.id) ?? course.slug);
    }
  }

  const activityItems: UserLogEntry[] = activities.map((a) => ({
    id: `activity-${a.id}`,
    kind: 'activity',
    eventType: a.eventType,
    occurredAt: a.createdAt.toISOString(),
    courseId: a.courseId,
    courseTitle: a.courseId ? courseTitleMap.get(a.courseId) ?? null : null,
    lessonId: a.lessonId,
    payload: a.payload as Record<string, unknown>,
  }));

  const loginItems: UserLogEntry[] = logins.map((l) => ({
    id: `login-${l.id}`,
    kind: 'login',
    eventType: 'auth.login',
    occurredAt: l.createdAt.toISOString(),
    method: l.method,
  }));

  let items = [...activityItems, ...loginItems];
  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const q = options.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((item) => {
      const haystack = [
        item.eventType,
        item.courseTitle ?? '',
        item.method ?? '',
        JSON.stringify(item.payload ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const total = items.length;
  const page = items.slice(offset, offset + limit);

  return { items: page, total, limit, offset, retentionFrom: retentionStart.toISOString() };
}
