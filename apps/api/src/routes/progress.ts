import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { lessonProgress, activityEvents, lessons, courseModules, courses } from '../db/schema';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { evaluateCourseCompletion } from '../services/completion';
import { broadcastToCourse } from '../realtime/hub';
import { canStudentViewCourse, canStudentUpdateProgress } from '../services/course-access';

export const progressRoutes = new Hono();

progressRoutes.use('*', authMiddleware);

const updateProgressSchema = z.object({
  lessonId: z.string().uuid(),
  percentComplete: z.number().min(0).max(100).optional(),
  isComplete: z.boolean().optional(),
  score: z.number().min(0).max(100).optional(),
});

progressRoutes.get('/course/:courseId', async (c) => {
  const user = c.get('user') as AuthUser;
  const courseId = c.req.param('courseId');

  if (!(await canStudentViewCourse(user, courseId))) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  const courseLessons =
    moduleIds.length > 0
      ? (await db.select().from(lessons)).filter((l) => moduleIds.includes(l.moduleId))
      : [];
  const lessonIds = courseLessons.map((l) => l.id);

  if (lessonIds.length === 0) return c.json([]);

  const progress = await db
    .select()
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, user.id));

  return c.json(progress.filter((p) => lessonIds.includes(p.lessonId)));
});

progressRoutes.post('/', async (c) => {
  const user = c.get('user') as AuthUser;
  const body = updateProgressSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const { lessonId, percentComplete, isComplete, score } = body.data;

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404);

  const [mod] = await db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).limit(1);
  if (!mod) return c.json({ error: 'Module not found' }, 404);

  if (!(await canStudentUpdateProgress(user, mod.courseId))) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lessonId)))
    .limit(1);

  let progress;
  if (existing) {
    const nextPercent =
      percentComplete !== undefined
        ? Math.max(existing.percentComplete, Math.round(percentComplete))
        : existing.percentComplete;
    const nextIsComplete =
      isComplete !== undefined ? existing.isComplete || isComplete : existing.isComplete;
    [progress] = await db
      .update(lessonProgress)
      .set({
        percentComplete: nextPercent,
        isComplete: nextIsComplete,
        score: score ?? existing.score,
        attempts: score !== undefined ? existing.attempts + 1 : existing.attempts,
        lastActivityAt: new Date(),
      })
      .where(eq(lessonProgress.id, existing.id))
      .returning();
  } else {
    [progress] = await db
      .insert(lessonProgress)
      .values({
        userId: user.id,
        lessonId,
        percentComplete: percentComplete ?? 0,
        isComplete: isComplete ?? false,
        score,
        attempts: score !== undefined ? 1 : 0,
      })
      .returning();
  }

  broadcastToCourse(mod.courseId, {
    type: 'progress_updated',
    payload: {
      userId: user.id,
      lessonId,
      courseId: mod.courseId,
      percentComplete: progress.percentComplete,
      isComplete: progress.isComplete,
      score: progress.score ?? undefined,
    },
    timestamp: new Date().toISOString(),
  });

  const completion = await evaluateCourseCompletion(user.id, mod.courseId);

  return c.json({ progress, completion });
});

progressRoutes.post('/activity', async (c) => {
  const user = c.get('user') as AuthUser;
  const body = z
    .object({
      eventType: z.string(),
      courseId: z.string().uuid().optional(),
      lessonId: z.string().uuid().optional(),
      payload: z.record(z.unknown()).optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  if (body.data.courseId && !(await canStudentViewCourse(user, body.data.courseId))) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const [event] = await db
    .insert(activityEvents)
    .values({
      userId: user.id,
      courseId: body.data.courseId,
      lessonId: body.data.lessonId,
      eventType: body.data.eventType,
      payload: body.data.payload ?? {},
    })
    .returning();

  if (body.data.courseId) {
    broadcastToCourse(body.data.courseId, {
      type: 'activity_broadcast',
      payload: {
        event: {
          ...event,
          createdAt: event.createdAt.toISOString(),
          payload: event.payload as Record<string, unknown>,
        },
        userName: user.name,
      },
      timestamp: new Date().toISOString(),
    });
  }

  return c.json(event, 201);
});

progressRoutes.get('/activity/course/:courseId', async (c) => {
  const courseId = c.req.param('courseId');
  const limit = Number(c.req.query('limit') ?? 50);

  const events = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.courseId, courseId))
    .orderBy(activityEvents.createdAt)
    .limit(limit);

  return c.json(events);
});
