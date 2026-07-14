import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { scormAttempts, scormPackages, lessons, lessonProgress, courseModules } from '../db/schema';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { canStudentUpdateProgress, canStudentViewCourse } from '../services/course-access';
import { evaluateCourseCompletion } from '../services/completion';
import { effectiveRole } from '../services/student-view';
import { captivateIndicatesComplete, scormCmiIndicatesComplete } from '@youniversity2/shared';

type ScormVersion = 'scorm_12' | 'scorm_2004';

function prepareScormCmiForResume(version: ScormVersion, cmi: Record<string, unknown>) {
  const next = { ...cmi };
  if (captivateIndicatesComplete(next)) return next;

  const suspendData = next['cmi.suspend_data'];
  const hasSuspendData = typeof suspendData === 'string' && suspendData.length > 0;
  const location12 = next['cmi.core.lesson_location'];
  const location2004 = next['cmi.location'];
  const hasLocation =
    (typeof location12 === 'string' && location12.length > 0) ||
    (typeof location2004 === 'string' && location2004.length > 0);

  if (!hasSuspendData && !hasLocation) return next;

  if (version === 'scorm_12') {
    const wasSuspended = next['cmi.core.exit'] === 'suspend';
    next['cmi.core.entry'] = 'resume';
    delete next['cmi.core.exit'];
    next['cmi.core.session_time'] = '0000:00:00.00';
    if (wasSuspended || hasSuspendData) {
      const status = String(next['cmi.core.lesson_status'] ?? '').toLowerCase();
      if (status !== 'passed' && status !== 'failed') {
        next['cmi.core.lesson_status'] = 'incomplete';
      }
    }
  } else {
    const wasSuspended = next['cmi.exit'] === 'suspend';
    next['cmi.entry'] = 'resume';
    delete next['cmi.exit'];
    next['cmi.session_time'] = 'PT0S';
    if (wasSuspended || hasSuspendData) {
      const completion = String(next['cmi.completion_status'] ?? '').toLowerCase();
      if (completion === 'completed') {
        next['cmi.completion_status'] = 'incomplete';
      }
    }
  }

  return next;
}

function scormDerivedProgress(
  version: ScormVersion,
  cmi: Record<string, unknown>,
  commit?: { terminated?: boolean },
) {
  let isComplete = false;
  let percentComplete: number | undefined;
  let score: number | undefined;
  const state: Record<string, unknown> = {};
  const terminated = commit?.terminated === true;

  if (version === 'scorm_12') {
    const lessonStatus = String((cmi['cmi.core.lesson_status'] ?? '') as string).toLowerCase();
    const exit = String((cmi['cmi.core.exit'] ?? '') as string).toLowerCase();
    const rawScore = Number(cmi['cmi.core.score.raw'] ?? NaN);
    const location = typeof cmi['cmi.core.lesson_location'] === 'string' ? (cmi['cmi.core.lesson_location'] as string) : undefined;
    const suspendData = typeof cmi['cmi.suspend_data'] === 'string' ? (cmi['cmi.suspend_data'] as string) : undefined;
    const suspended = exit === 'suspend' || !terminated;

    const captivateDone = captivateIndicatesComplete(cmi);
    const runtimeComplete = scormCmiIndicatesComplete(version, cmi);

    if (captivateDone || runtimeComplete) {
      isComplete = true;
      percentComplete = 100;
    } else {
      isComplete =
        !suspended &&
        (lessonStatus === 'passed' || (lessonStatus === 'completed' && terminated));
    }
    if (!Number.isNaN(rawScore)) score = Math.max(0, Math.min(100, Math.round(rawScore)));

    state.lesson_status = lessonStatus || undefined;
    if (location) state.location = location;
    if (suspendData) state.suspend_data = suspendData;
  } else {
    const completionStatus = String((cmi['cmi.completion_status'] ?? '') as string).toLowerCase();
    const successStatus = String((cmi['cmi.success_status'] ?? '') as string).toLowerCase();
    const exit = String((cmi['cmi.exit'] ?? '') as string).toLowerCase();
    const rawScore = Number(cmi['cmi.score.raw'] ?? NaN);
    const scaled = Number(cmi['cmi.score.scaled'] ?? NaN);
    const progressMeasure = Number(cmi['cmi.progress_measure'] ?? NaN);
    const location = typeof cmi['cmi.location'] === 'string' ? (cmi['cmi.location'] as string) : undefined;
    const suspendData = typeof cmi['cmi.suspend_data'] === 'string' ? (cmi['cmi.suspend_data'] as string) : undefined;
    const suspended = exit === 'suspend' || !terminated;

    const captivateDone = captivateIndicatesComplete(cmi);
    const runtimeComplete = scormCmiIndicatesComplete(version, cmi);

    if (captivateDone || runtimeComplete) {
      isComplete = true;
      percentComplete = 100;
    } else {
      isComplete =
        !suspended &&
        (successStatus === 'passed' || (completionStatus === 'completed' && terminated));
    }
    if (!Number.isNaN(rawScore)) score = Math.max(0, Math.min(100, Math.round(rawScore)));
    else if (!Number.isNaN(scaled)) score = Math.max(0, Math.min(100, Math.round(scaled * 100)));

    if (!isComplete && !Number.isNaN(progressMeasure)) {
      percentComplete = Math.max(0, Math.min(100, Math.round(progressMeasure * 100)));
    }

    state.completion_status = completionStatus || undefined;
    state.success_status = successStatus || undefined;
    if (location) state.location = location;
    if (suspendData) state.suspend_data = suspendData;
  }

  return { isComplete, percentComplete, score, state };
}

async function upsertLessonProgress(
  userId: string,
  lessonId: string,
  payload: { percentComplete?: number; isComplete?: boolean; score?: number; state?: Record<string, unknown> },
) {
  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .limit(1);

  if (existing) {
    const nextPercent =
      payload.percentComplete !== undefined
        ? payload.isComplete
          ? Math.max(existing.percentComplete, Math.round(payload.percentComplete))
          : Math.min(existing.percentComplete, Math.round(payload.percentComplete))
        : existing.percentComplete;
    const nextIsComplete =
      payload.isComplete !== undefined
        ? existing.isComplete || payload.isComplete
        : existing.isComplete;

    await db
      .update(lessonProgress)
      .set({
        percentComplete: nextPercent,
        isComplete: nextIsComplete,
        score: payload.score ?? existing.score,
        attempts: payload.score !== undefined ? existing.attempts + 1 : existing.attempts,
        progressState: payload.state ? { ...(existing.progressState ?? {}), scorm: payload.state } : existing.progressState,
        lastActivityAt: new Date(),
      })
      .where(eq(lessonProgress.id, existing.id));
  } else {
    await db.insert(lessonProgress).values({
      userId,
      lessonId,
      percentComplete: payload.percentComplete ?? 0,
      isComplete: payload.isComplete ?? false,
      score: payload.score,
      attempts: payload.score !== undefined ? 1 : 0,
      progressState: payload.state ? { scorm: payload.state } : {},
    });
  }
}

export const scormRoutes = new Hono();
scormRoutes.use('*', authMiddleware);

scormRoutes.post('/launch', async (c) => {
  const user = c.get('user') as AuthUser;
  const body = z
    .object({
      lessonId: z.string().uuid(),
      packageId: z.string().uuid(),
      scoId: z.string().min(1).max(255),
      version: z.enum(['scorm_12', 'scorm_2004']),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, body.data.lessonId)).limit(1);
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404);

  const [mod] = await db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).limit(1);
  if (!mod) return c.json({ error: 'Module not found' }, 404);

  if (!(await canStudentViewCourse(user, mod.courseId, c))) return c.json({ error: 'Course not found' }, 404);
  if (!(await canStudentUpdateProgress(user, mod.courseId, c))) return c.json({ error: 'Course not found' }, 404);

  const [pkg] = await db
    .select({ id: scormPackages.id, storagePrefix: scormPackages.storagePrefix })
    .from(scormPackages)
    .where(and(eq(scormPackages.id, body.data.packageId), eq(scormPackages.courseId, mod.courseId)))
    .limit(1);
  if (!pkg) return c.json({ error: 'SCORM package not found' }, 404);

  const [attempt] = await db
    .insert(scormAttempts)
    .values({
      userId: user.id,
      lessonId: body.data.lessonId,
      packageId: body.data.packageId,
      scoId: body.data.scoId,
      version: body.data.version,
      lastCommitAt: new Date(),
      cmi: {},
    })
    .onConflictDoUpdate({
      target: [scormAttempts.userId, scormAttempts.lessonId, scormAttempts.scoId],
      set: { lastCommitAt: new Date(), terminatedAt: null },
    })
    .returning();

  return c.json({
    attemptId: attempt.id,
    cmi: prepareScormCmiForResume(body.data.version, (attempt.cmi ?? {}) as Record<string, unknown>),
  });
});

scormRoutes.post('/commit', async (c) => {
  const user = c.get('user') as AuthUser;
  const body = z
    .object({
      attemptId: z.string().uuid(),
      cmi: z.record(z.unknown()),
      terminated: z.boolean().optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [attempt] = await db
    .select()
    .from(scormAttempts)
    .where(and(eq(scormAttempts.id, body.data.attemptId), eq(scormAttempts.userId, user.id)))
    .limit(1);
  if (!attempt) return c.json({ error: 'Attempt not found' }, 404);

  // Course access guard (avoid letting a user commit attempts from other courses via leaked attemptId)
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, attempt.lessonId)).limit(1);
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404);
  const [mod] = await db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).limit(1);
  if (!mod) return c.json({ error: 'Module not found' }, 404);
  if (!(await canStudentUpdateProgress(user, mod.courseId, c))) return c.json({ error: 'Course not found' }, 404);

  const nextCmi = { ...(attempt.cmi as Record<string, unknown>), ...(body.data.cmi ?? {}) };
  const terminatedAt = body.data.terminated ? new Date() : attempt.terminatedAt;

  const [updated] = await db
    .update(scormAttempts)
    .set({
      cmi: nextCmi,
      lastCommitAt: new Date(),
      terminatedAt,
    })
    .where(eq(scormAttempts.id, attempt.id))
    .returning();

  const derived = scormDerivedProgress(updated.version as ScormVersion, nextCmi, {
    terminated: body.data.terminated,
  });
  await upsertLessonProgress(user.id, updated.lessonId, {
    percentComplete: derived.percentComplete,
    isComplete: derived.isComplete,
    score: derived.score,
    state: { version: updated.version, ...derived.state },
  });

  const completion =
    effectiveRole(user, c) === 'student' ? await evaluateCourseCompletion(user.id, mod.courseId) : null;

  return c.json({ ok: true, derived, completion });
});

