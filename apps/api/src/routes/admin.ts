import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users } from '../db/schema';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { USER_ROLES, SUPPORTED_LOCALES } from '@youniversity2/shared';

export const adminRoutes = new Hono();

adminRoutes.use('*', authMiddleware);

function serializeAdminUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
    avatarUrl: user.avatarUrl ?? undefined,
    oauthProvider: user.oauthProvider ?? undefined,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

adminRoutes.get('/students', requireRole('admin', 'instructor'), async (c) => {
  const students = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, 'student'))
    .orderBy(users.name);

  return c.json(students);
});

adminRoutes.get('/users', requireRole('admin'), async (c) => {
  const list = await db.select().from(users).orderBy(desc(users.createdAt));
  return c.json(list.map(serializeAdminUser));
});

adminRoutes.post('/users', requireRole('admin'), async (c) => {
  const body = z
    .object({
      email: z.string().email(),
      name: z.string().min(2).max(255),
      password: z.string().min(8),
      role: z.enum(USER_ROLES).default('student'),
      preferredLocale: z.enum(SUPPORTED_LOCALES).default('sk'),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

  const existing = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const [created] = await db
    .insert(users)
    .values({
      email: body.data.email,
      name: body.data.name,
      passwordHash,
      role: body.data.role,
      preferredLocale: body.data.preferredLocale,
    })
    .returning();

  return c.json(serializeAdminUser(created), 201);
});

adminRoutes.patch('/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const authUser = c.get('user') as AuthUser;

  const body = z
    .object({
      email: z.string().email().optional(),
      name: z.string().min(2).max(255).optional(),
      role: z.enum(USER_ROLES).optional(),
      preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
      password: z.string().min(8).optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return c.json({ error: 'User not found' }, 404);

  if (body.data.email && body.data.email !== existing.email) {
    const dup = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
    if (dup.length > 0) return c.json({ error: 'Email already registered' }, 409);
  }

  if (id === authUser.id && body.data.role && body.data.role !== 'admin') {
    return c.json({ error: 'Cannot change your own administrator role' }, 400);
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.email) updates.email = body.data.email;
  if (body.data.name) updates.name = body.data.name;
  if (body.data.role) updates.role = body.data.role;
  if (body.data.preferredLocale) updates.preferredLocale = body.data.preferredLocale;
  if (body.data.password) updates.passwordHash = await bcrypt.hash(body.data.password, 12);

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return c.json(serializeAdminUser(updated));
});

adminRoutes.delete('/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const authUser = c.get('user') as AuthUser;

  if (id === authUser.id) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
  if (!deleted) return c.json({ error: 'User not found' }, 404);

  return c.json({ ok: true });
});
