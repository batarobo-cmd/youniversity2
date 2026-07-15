import { Hono } from 'hono';
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { enrollments, courses, users } from '../db/schema';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { broadcastToCourse, broadcastToUser, broadcastToAdmin } from '../realtime/hub';
import { WS_EVENTS } from '@youniversity2/shared';
import { recordUserActivity, getCourseTitle } from '../services/activity-log';
import { sendPlatformNotification } from '../services/email-notify';
import { clearCourseLessonProgress } from '../services/enrollment-progress';
import { resolveEnrollmentStatusOnRestore } from '../services/enrollment-achievement';

export const enrollmentRoutes = new Hono();

enrollmentRoutes.use('*', authMiddleware);

enrollmentRoutes.get('/', requireRole('admin'), async (c) => {
  const courseId = c.req.query('courseId');
  if (!courseId) return c.json({ error: 'courseId required' }, 400);

  const result = await db
    .select({
      enrollment: enrollments,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, courseId))
    .orderBy(desc(enrollments.enrolledAt));

  return c.json(result);
});

enrollmentRoutes.post('/', requireRole('admin'), async (c) => {
  const actor = c.get('user') as AuthUser;
  const body = z
    .object({
      userId: z.string().uuid(),
      courseId: z.string().uuid(),
      expiresAt: z.string().datetime().optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [course] = await db.select().from(courses).where(eq(courses.id, body.data.courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const existing = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, body.data.userId), eq(enrollments.courseId, body.data.courseId)))
    .limit(1);

  if (existing.length > 0) {
    const prev = existing[0];
    if (prev.status === 'active') {
      return c.json({ error: 'Already enrolled', enrollment: prev }, 409);
    }

    if (prev.status === 'revoked') {
      await clearCourseLessonProgress(body.data.userId, body.data.courseId);
    }

    const restored =
      prev.status === 'suspended' ? await resolveEnrollmentStatusOnRestore(prev) : null;

    const [enrollment] = await db
      .update(enrollments)
      .set(
        prev.status === 'revoked'
          ? {
              status: 'active',
              enrolledAt: new Date(),
              completedAt: null,
            }
          : {
              status: restored!.status,
              completedAt: restored!.completedAt,
            },
      )
      .where(eq(enrollments.id, prev.id))
      .returning();

    broadcastToUser(body.data.userId, {
      type: WS_EVENTS.ENROLLMENT_CHANGED,
      payload: { enrollment, action: 'reactivated' },
      timestamp: new Date().toISOString(),
    });

    broadcastToCourse(body.data.courseId, {
      type: WS_EVENTS.ENROLLMENT_CHANGED,
      payload: { enrollment, action: 'reactivated' },
      timestamp: new Date().toISOString(),
    });

    broadcastToAdmin({
      type: WS_EVENTS.ENROLLMENT_CHANGED,
      payload: { enrollment, action: 'reactivated' },
      timestamp: new Date().toISOString(),
    });

    const [student] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, body.data.userId))
      .limit(1);
    const courseTitle = await getCourseTitle(body.data.courseId);
    void recordUserActivity(actor.id, 'enrollment.reactivated', {
      courseId: body.data.courseId,
      payload: {
        studentName: student?.name,
        studentId: body.data.userId,
        courseTitle,
        courseId: body.data.courseId,
        previousStatus: prev.status,
      },
    });

    if (prev.status === 'revoked') {
      const progressMessage = {
        type: WS_EVENTS.PROGRESS_UPDATED,
        payload: { userId: body.data.userId, courseId: body.data.courseId, reset: true },
        timestamp: new Date().toISOString(),
      };
      broadcastToCourse(body.data.courseId, progressMessage);
      broadcastToAdmin(progressMessage);
      broadcastToUser(body.data.userId, progressMessage);
    }

    return c.json(enrollment, 200);
  }

  const [enrollment] = await db
    .insert(enrollments)
    .values({
      userId: body.data.userId,
      courseId: body.data.courseId,
      expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : undefined,
    })
    .returning();

  broadcastToUser(body.data.userId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'created' },
    timestamp: new Date().toISOString(),
  });

  broadcastToCourse(body.data.courseId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'created' },
    timestamp: new Date().toISOString(),
  });

  broadcastToAdmin({
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'created' },
    timestamp: new Date().toISOString(),
  });

  const [student] = await db
    .select({ name: users.name, email: users.email, preferredLocale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, body.data.userId))
    .limit(1);
  const courseTitle = await getCourseTitle(body.data.courseId);
  void recordUserActivity(actor.id, 'enrollment.created', {
    courseId: body.data.courseId,
    payload: {
      studentName: student?.name,
      studentId: body.data.userId,
      courseTitle,
      courseId: body.data.courseId,
    },
  });

  if (student?.email) {
    void sendPlatformNotification({
      notificationId: 'enrollment.created',
      to: student.email,
      userId: body.data.userId,
      courseId: body.data.courseId,
      userName: student.name,
      userEmail: student.email,
      locale: student.preferredLocale,
      courseTitle,
    });
  }

  return c.json(enrollment, 201);
});

enrollmentRoutes.delete('/:id', requireRole('admin'), async (c) => {
  const actor = c.get('user') as AuthUser;
  const enrollmentId = c.req.param('id');

  const [enrollment] = await db
    .update(enrollments)
    .set({ status: 'revoked' })
    .where(eq(enrollments.id, enrollmentId))
    .returning();

  if (!enrollment) return c.json({ error: 'Enrollment not found' }, 404);

  broadcastToUser(enrollment.userId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'revoked' },
    timestamp: new Date().toISOString(),
  });

  broadcastToAdmin({
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'revoked' },
    timestamp: new Date().toISOString(),
  });

  const [student] = await db
    .select({ name: users.name, email: users.email, preferredLocale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, enrollment.userId))
    .limit(1);
  const courseTitle = await getCourseTitle(enrollment.courseId);
  void recordUserActivity(actor.id, 'enrollment.revoked', {
    courseId: enrollment.courseId,
    payload: {
      studentName: student?.name,
      studentId: enrollment.userId,
      courseTitle,
      courseId: enrollment.courseId,
    },
  });

  if (student?.email) {
    void sendPlatformNotification({
      notificationId: 'enrollment.removed',
      to: student.email,
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      userName: student.name,
      userEmail: student.email,
      locale: student.preferredLocale,
      courseTitle,
    });
  }

  return c.json(enrollment);
});

enrollmentRoutes.post('/:id/suspend', requireRole('admin'), async (c) => {
  const actor = c.get('user') as AuthUser;
  const enrollmentId = c.req.param('id');

  const [existing] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!existing) return c.json({ error: 'Enrollment not found' }, 404);

  if (!['active', 'completed', 'failed', 'expired'].includes(existing.status)) {
    return c.json({ error: 'Cannot suspend this enrollment' }, 400);
  }

  const [enrollment] = await db
    .update(enrollments)
    .set({ status: 'suspended' })
    .where(eq(enrollments.id, enrollmentId))
    .returning();

  broadcastToUser(enrollment.userId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'suspended' },
    timestamp: new Date().toISOString(),
  });

  broadcastToAdmin({
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'suspended' },
    timestamp: new Date().toISOString(),
  });

  const [student] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, enrollment.userId))
    .limit(1);
  const courseTitle = await getCourseTitle(enrollment.courseId);
  void recordUserActivity(actor.id, 'enrollment.suspended', {
    courseId: enrollment.courseId,
    payload: {
      studentName: student?.name,
      studentId: enrollment.userId,
      courseTitle,
      courseId: enrollment.courseId,
    },
  });

  return c.json(enrollment);
});

enrollmentRoutes.post('/:id/unsuspend', requireRole('admin'), async (c) => {
  const actor = c.get('user') as AuthUser;
  const enrollmentId = c.req.param('id');

  const [existing] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!existing) return c.json({ error: 'Enrollment not found' }, 404);

  if (existing.status !== 'suspended') {
    return c.json({ error: 'Enrollment is not suspended' }, 400);
  }

  const restored = await resolveEnrollmentStatusOnRestore(existing);

  const [enrollment] = await db
    .update(enrollments)
    .set({
      status: restored.status,
      completedAt: restored.completedAt,
    })
    .where(eq(enrollments.id, enrollmentId))
    .returning();

  broadcastToUser(enrollment.userId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'unsuspended' },
    timestamp: new Date().toISOString(),
  });

  broadcastToAdmin({
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment, action: 'unsuspended' },
    timestamp: new Date().toISOString(),
  });

  const [student] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, enrollment.userId))
    .limit(1);
  const courseTitle = await getCourseTitle(enrollment.courseId);
  void recordUserActivity(actor.id, 'enrollment.unsuspended', {
    courseId: enrollment.courseId,
    payload: {
      studentName: student?.name,
      studentId: enrollment.userId,
      courseTitle,
      courseId: enrollment.courseId,
    },
  });

  return c.json(enrollment);
});

enrollmentRoutes.delete('/:id/permanent', requireRole('admin'), async (c) => {
  const actor = c.get('user') as AuthUser;
  const enrollmentId = c.req.param('id');

  const [existing] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!existing) return c.json({ error: 'Enrollment not found' }, 404);

  const [deleted] = await db.delete(enrollments).where(eq(enrollments.id, enrollmentId)).returning();
  if (!deleted) return c.json({ error: 'Enrollment not found' }, 404);

  broadcastToUser(existing.userId, {
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment: deleted, action: 'deleted' },
    timestamp: new Date().toISOString(),
  });

  broadcastToAdmin({
    type: WS_EVENTS.ENROLLMENT_CHANGED,
    payload: { enrollment: deleted, action: 'deleted' },
    timestamp: new Date().toISOString(),
  });

  const [student] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, existing.userId))
    .limit(1);
  const courseTitle = await getCourseTitle(existing.courseId);
  void recordUserActivity(actor.id, 'enrollment.deleted', {
    courseId: existing.courseId,
    payload: {
      studentName: student?.name,
      studentId: existing.userId,
      courseTitle,
      courseId: existing.courseId,
    },
  });

  return c.json({ ok: true });
});

enrollmentRoutes.get('/my', async (c) => {
  const user = c.get('user') as AuthUser;

  const result = await db.select().from(enrollments).where(eq(enrollments.userId, user.id));
  return c.json(result);
});
