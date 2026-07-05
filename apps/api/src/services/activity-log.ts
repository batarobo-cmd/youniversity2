import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { activityEvents, courses, courseTranslations } from '../db/schema';

export async function getCourseTitle(courseId: string, locale = 'sk') {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return courseId;
  const [translation] = await db
    .select()
    .from(courseTranslations)
    .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, locale)))
    .limit(1);
  return translation?.title ?? course.slug;
}

export async function recordUserActivity(
  userId: string,
  eventType: string,
  options: {
    courseId?: string | null;
    lessonId?: string | null;
    payload?: Record<string, unknown>;
  } = {},
) {
  try {
    await db.insert(activityEvents).values({
      userId,
      courseId: options.courseId ?? undefined,
      lessonId: options.lessonId ?? undefined,
      eventType,
      payload: options.payload ?? {},
    });
  } catch (err) {
    console.warn('[activity-log] failed to record:', (err as Error).message);
  }
}
