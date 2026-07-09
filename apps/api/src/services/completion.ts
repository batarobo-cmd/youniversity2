import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  completionRules,
  courseModules,
  enrollments,
  lessonProgress,
  lessons,
  certificates,
} from '../db/schema';
import { broadcastToCourse, broadcastToUser } from '../realtime/hub';
import {
  countsForCourseCompletion,
  isProgressFullyComplete,
} from './course-completion';
import { allocateCertificateNumber } from './certificate-number';

export async function evaluateCourseCompletion(userId: string, courseId: string) {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  const courseLessons =
    moduleIds.length > 0
      ? (await db.select().from(lessons)).filter((l) => moduleIds.includes(l.moduleId))
      : [];

  const requiredLessons = courseLessons.filter((l) => countsForCourseCompletion(l));
  const lessonIds = requiredLessons.map((l) => l.id);

  const progress =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)))
      : [];

  const passed =
    requiredLessons.length === 0
      ? true
      : requiredLessons.every((lesson) => {
          const row = progress.find((p) => p.lessonId === lesson.id);
          return isProgressFullyComplete(row);
        });

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);

  if (!enrollment || ['completed', 'failed', 'suspended', 'revoked'].includes(enrollment.status)) {
    return { passed, enrollment };
  }

  if (!passed) return { passed, enrollment };

  const [updated] = await db
    .update(enrollments)
    .set({
      status: 'completed',
      completedAt: new Date(),
    })
    .where(eq(enrollments.id, enrollment.id))
    .returning();

  const rules = await db.select().from(completionRules).where(eq(completionRules.courseId, courseId));
  const certRule = rules.find(
    (rule) => (rule.config as { certificate?: { enabled?: boolean } })?.certificate?.enabled,
  );
  const certConfig = (certRule?.config as { certificate?: { enabled?: boolean; titleTemplate?: string } })
    ?.certificate;

  if (certConfig?.enabled) {
    const certNumber = await allocateCertificateNumber();
    await db.insert(certificates).values({
      userId,
      courseId,
      certificateNumber: certNumber,
    });
  }

  const payload = {
    userId,
    courseId,
    status: 'completed' as const,
    enrollmentId: updated.id,
  };

  broadcastToUser(userId, {
    type: 'completion_evaluated',
    payload,
    timestamp: new Date().toISOString(),
  });

  broadcastToCourse(courseId, {
    type: 'completion_evaluated',
    payload,
    timestamp: new Date().toISOString(),
  });

  return { passed, enrollment: updated };
}
