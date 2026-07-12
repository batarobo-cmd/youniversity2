import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { getStudentDashboard, getAdminDashboard, getStudentCourseOverview } from '../services/dashboard';
import { effectiveRole } from '../services/student-view';
import { db } from '../db';
import { users } from '../db/schema';
import { serializeUser } from '../services/user-serializer';
import { SUPPORTED_LOCALES } from '@youniversity2/shared';

const optionalProfileString = (max: number) => z.string().max(max).optional().nullable();

const profilePatchSchema = z.object({
  name: z.string().min(2).optional(),
  preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
  givenName: optionalProfileString(255),
  familyName: optionalProfileString(255),
  jobTitle: optionalProfileString(255),
  department: optionalProfileString(255),
  employeeId: optionalProfileString(64),
  companyName: optionalProfileString(255),
  officeLocation: optionalProfileString(255),
  mobilePhone: optionalProfileString(64),
  businessPhone: optionalProfileString(64),
  city: optionalProfileString(128),
  country: optionalProfileString(128),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export const dashboardRoutes = new Hono();

dashboardRoutes.use('*', authMiddleware);

dashboardRoutes.get('/', async (c) => {
  const user = c.get('user') as AuthUser;
  const locale = c.req.query('locale') ?? 'sk';
  const role = effectiveRole(user, c);

  if (role === 'student') {
    const data = await getStudentDashboard(user.id, locale);
    return c.json({ role: 'student', ...data });
  }

  const data = await getAdminDashboard(locale);
  return c.json({ role: user.role, ...data });
});

dashboardRoutes.get('/courses-overview', async (c) => {
  const user = c.get('user') as AuthUser;
  const locale = c.req.query('locale') ?? 'sk';
  const role = effectiveRole(user, c);

  if (role !== 'student') {
    return c.json({ error: 'Students only' }, 403);
  }

  const data = await getStudentCourseOverview(user.id, locale);
  return c.json(data);
});

dashboardRoutes.patch('/profile', async (c) => {
  const authUser = c.get('user') as AuthUser;
  const body = profilePatchSchema.safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (body.data.preferredLocale) updates.preferredLocale = body.data.preferredLocale;

  if (body.data.name) updates.name = body.data.name;
  const profileFields = [
    'givenName',
    'familyName',
    'jobTitle',
    'department',
    'employeeId',
    'companyName',
    'officeLocation',
    'mobilePhone',
    'businessPhone',
    'city',
    'country',
  ] as const;
  for (const field of profileFields) {
    if (body.data[field] !== undefined) {
      updates[field] = body.data[field] || null;
    }
  }

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
