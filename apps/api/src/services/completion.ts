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

export async function evaluateCourseCompletion(userId: string, courseId: string) {
  const rules = await db.select().from(completionRules).where(eq(completionRules.courseId, courseId));
  if (rules.length === 0) return null;

  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  const courseLessons =
    moduleIds.length > 0
      ? (await db.select().from(lessons)).filter((l) => moduleIds.includes(l.moduleId))
      : [];

  const requiredLessons = courseLessons.filter((l) => l.isRequired);
  const lessonIds = requiredLessons.map((l) => l.id);

  const progress =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)))
      : [];

  let passed = true;

  for (const rule of rules.filter((r) => r.isRequired)) {
    switch (rule.type) {
      case 'all_lessons_complete': {
        const allDone = requiredLessons.every((l) =>
          progress.some((p) => p.lessonId === l.id && p.isComplete),
        );
        if (!allDone) passed = false;
        break;
      }
      case 'video_watch_percent': {
        const minPercent = (rule.config as { minPercent?: number }).minPercent ?? 80;
        const videoLessons = requiredLessons.filter((l) => l.type === 'video');
        const videosOk = videoLessons.every((l) =>
          progress.some((p) => p.lessonId === l.id && p.percentComplete >= minPercent),
        );
        if (!videosOk) passed = false;
        break;
      }
      case 'quiz_min_score': {
        const minScore = (rule.config as { minScore?: number }).minScore ?? 70;
        const quizLessons = requiredLessons.filter((l) => l.type === 'quiz');
        const quizzesOk = quizLessons.every((l) =>
          progress.some((p) => p.lessonId === l.id && (p.score ?? 0) >= minScore),
        );
        if (!quizzesOk) passed = false;
        break;
      }
      case 'lessons_in_order': {
        for (let i = 0; i < requiredLessons.length; i++) {
          const prev = requiredLessons.slice(0, i);
          const current = requiredLessons[i];
          const prevDone = prev.every((l) => progress.some((p) => p.lessonId === l.id && p.isComplete));
          const currentStarted = progress.some((p) => p.lessonId === current.id);
          if (currentStarted && !prevDone) {
            passed = false;
            break;
          }
        }
        break;
      }
    }
  }

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);

  if (!enrollment || enrollment.status === 'completed' || enrollment.status === 'failed') {
    return { passed, enrollment };
  }

  const allRequiredDone = requiredLessons.every((l) =>
    progress.some((p) => p.lessonId === l.id && p.isComplete),
  );

  if (!allRequiredDone) return { passed, enrollment };

  const newStatus = passed ? 'completed' : 'failed';
  const [updated] = await db
    .update(enrollments)
    .set({
      status: newStatus,
      completedAt: new Date(),
    })
    .where(eq(enrollments.id, enrollment.id))
    .returning();

  if (passed) {
    const certNumber = `YO2-${Date.now()}-${userId.slice(0, 8).toUpperCase()}`;
    await db.insert(certificates).values({
      userId,
      courseId,
      certificateNumber: certNumber,
    });
  }

  const payload = {
    userId,
    courseId,
    status: newStatus as 'completed' | 'failed',
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
