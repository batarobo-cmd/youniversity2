import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { getStudentDashboard, getAdminDashboard, getStudentCourseOverview } from '../services/dashboard';
import { db } from '../db';
import { users } from '../db/schema';
import { serializeUser } from '../services/oauth';
import { SUPPORTED_LOCALES } from '@youniversity2/shared';

export const dashboardRoutes = new Hono();

dashboardRoutes.use('*', authMiddleware);

dashboardRoutes.get('/', async (c) => {
  const user = c.get('user') as AuthUser;
  const locale = c.req.query('locale') ?? 'sk';

  if (user.role === 'admin' || user.role === 'instructor') {
    const data = await getAdminDashboard(locale);
    return c.json({ role: user.role, ...data });
  }

  const data = await getStudentDashboard(user.id, locale);
  return c.json({ role: 'student', ...data });
});

dashboardRoutes.get('/courses-overview', async (c) => {
  const user = c.get('user') as AuthUser;
  const locale = c.req.query('locale') ?? 'sk';

  if (user.role === 'admin' || user.role === 'instructor') {
    return c.json({ error: 'Students only' }, 403);
  }

  const data = await getStudentCourseOverview(user.id, locale);
  return c.json(data);
});

dashboardRoutes.patch('/profile', async (c) => {
  const authUser = c.get('user') as AuthUser;
  const body = z
    .object({
      name: z.string().min(2).optional(),
      preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (body.data.name) updates.name = body.data.name;
  if (body.data.preferredLocale) updates.preferredLocale = body.data.preferredLocale;

  if (body.data.newPassword) {
    if (!user.passwordHash) {
      return c.json({ error: 'OAuth account — password change not available' }, 400);
    }
    if (!body.data.currentPassword || !(await bcrypt.compare(body.data.currentPassword, user.passwordHash))) {
      return c.json({ error: 'Incorrect current password' }, 401);
    }
    updates.passwordHash = await bcrypt.hash(body.data.newPassword, 12);
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, authUser.id)).returning();

  return c.json(serializeUser(updated));
});
