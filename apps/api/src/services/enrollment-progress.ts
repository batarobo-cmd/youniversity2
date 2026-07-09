import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import { courseModules, lessons, lessonProgress } from '../db/schema';

export async function clearCourseLessonProgress(userId: string, courseId: string) {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) return 0;

  const allLessons = await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds));
  const lessonIds = allLessons.filter((l) => l.type !== 'text').map((l) => l.id);
  if (lessonIds.length === 0) return 0;

  await db
    .delete(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));

  return lessonIds.length;
}

export function isLiveEnrollmentStatus(status: string | undefined): boolean {
  return status === 'active' || status === 'suspended';
}
