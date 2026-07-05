import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { signToken } from '../middleware/auth';
import { SUPPORTED_LOCALES } from '@youniversity2/shared';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
  }

  const { email, password, name, preferredLocale } = body.data;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      preferredLocale: preferredLocale ?? 'sk',
      role: 'student',
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      preferredLocale: users.preferredLocale,
      createdAt: users.createdAt,
    });

  const token = await signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return c.json({
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferredLocale: user.preferredLocale,
      createdAt: user.createdAt.toISOString(),
    },
  }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const { email, password } = body.data;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return c.json({
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferredLocale: user.preferredLocale,
      createdAt: user.createdAt.toISOString(),
    },
  });
});
