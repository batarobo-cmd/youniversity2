import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { enrollments, courses, users } from '../db/schema';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { broadcastToCourse, broadcastToUser, broadcastToAdmin } from '../realtime/hub';
import { WS_EVENTS } from '@youniversity2/shared';

export const enrollmentRoutes = new Hono();

enrollmentRoutes.use('*', authMiddleware);

enrollmentRoutes.get('/', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.query('courseId');
  if (!courseId) return c.json({ error: 'courseId required' }, 400);

  const result = await db
    .select({
      enrollment: enrollments,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, courseId));

  return c.json(result);
});

enrollmentRoutes.post('/', requireRole('admin', 'instructor'), async (c) => {
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
    return c.json({ error: 'Already enrolled', enrollment: existing[0] }, 409);
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

  return c.json(enrollment, 201);
});

enrollmentRoutes.delete('/:id', requireRole('admin', 'instructor'), async (c) => {
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

  return c.json(enrollment);
});

enrollmentRoutes.get('/my', async (c) => {
  const user = c.get('user') as AuthUser;

  const result = await db.select().from(enrollments).where(eq(enrollments.userId, user.id));
  return c.json(result);
});
