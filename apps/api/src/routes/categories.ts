import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { courseCategories, courses } from '../db/schema';
import { authMiddleware, requireRole } from '../middleware/auth';
import { broadcastToAdmin } from '../realtime/hub';
import { WS_EVENTS } from '@youniversity2/shared';

export const categoryRoutes = new Hono();

categoryRoutes.use('*', authMiddleware);

categoryRoutes.get('/', requireRole('admin', 'instructor'), async (c) => {
  const list = await db
    .select()
    .from(courseCategories)
    .orderBy(asc(courseCategories.sortOrder), asc(courseCategories.name));
  return c.json(list);
});

categoryRoutes.post('/', requireRole('admin', 'instructor'), async (c) => {
  const body = z
    .object({
      slug: z.string().min(2).max(255),
      name: z.string().min(2).max(255),
      sortOrder: z.number().int().optional(),
      parentId: z.string().uuid().nullable().optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  if (body.data.parentId) {
    const [parent] = await db
      .select()
      .from(courseCategories)
      .where(eq(courseCategories.id, body.data.parentId))
      .limit(1);
    if (!parent) return c.json({ error: 'Parent category not found' }, 404);
  }

  const [category] = await db
    .insert(courseCategories)
    .values({
      slug: body.data.slug,
      name: body.data.name,
      sortOrder: body.data.sortOrder ?? 0,
      parentId: body.data.parentId ?? null,
    })
    .returning();

  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { categoryId: category.id, action: 'category_created' },
    timestamp: new Date().toISOString(),
  });

  return c.json(category, 201);
});

categoryRoutes.patch('/:id', requireRole('admin', 'instructor'), async (c) => {
  const id = c.req.param('id');
  const body = z
    .object({
      slug: z.string().min(2).max(255).optional(),
      name: z.string().min(2).max(255).optional(),
      sortOrder: z.number().int().optional(),
      parentId: z.string().uuid().nullable().optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  if (body.data.parentId === id) {
    return c.json({ error: 'Category cannot be its own parent' }, 400);
  }

  if (body.data.parentId) {
    const [parent] = await db
      .select()
      .from(courseCategories)
      .where(eq(courseCategories.id, body.data.parentId))
      .limit(1);
    if (!parent) return c.json({ error: 'Parent category not found' }, 404);
  }

  const [updated] = await db
    .update(courseCategories)
    .set(body.data)
    .where(eq(courseCategories.id, id))
    .returning();

  if (!updated) return c.json({ error: 'Category not found' }, 404);

  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { categoryId: id, action: 'category_updated' },
    timestamp: new Date().toISOString(),
  });

  return c.json(updated);
});

categoryRoutes.delete('/:id', requireRole('admin', 'instructor'), async (c) => {
  const id = c.req.param('id');

  const childCats = await db
    .select()
    .from(courseCategories)
    .where(eq(courseCategories.parentId, id))
    .limit(1);
  if (childCats.length > 0) {
    return c.json({ error: 'Category has subcategories' }, 409);
  }

  const linked = await db.select().from(courses).where(eq(courses.categoryId, id)).limit(1);
  if (linked.length > 0) {
    return c.json({ error: 'Category has courses assigned' }, 409);
  }

  const [deleted] = await db.delete(courseCategories).where(eq(courseCategories.id, id)).returning();
  if (!deleted) return c.json({ error: 'Category not found' }, 404);

  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { categoryId: id, action: 'category_deleted' },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});
