import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  courses,
  courseModules,
  moduleTranslations,
  lessons,
  lessonTranslations,
} from '../db/schema';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  WS_EVENTS,
  createActivitySchema,
  createModuleSchema,
  updateActivitySchema,
  updateModuleSchema,
} from '@youniversity2/shared';
import { broadcastToCourse, broadcastToAdmin } from '../realtime/hub';

function defaultTextTitle(content?: string) {
  const line = content?.trim().split('\n')[0]?.trim();
  if (line) return line.slice(0, 80);
  return 'Textové pole';
}

async function getModuleLessons(moduleId: string, excludeActivityId?: string) {
  const rows = await db.select().from(lessons).where(eq(lessons.moduleId, moduleId));
  return excludeActivityId ? rows.filter((row) => row.id !== excludeActivityId) : rows;
}

function validateModuleActivityRules(
  moduleLessons: Array<{ type: string }>,
  activityType: string,
) {
  const hasText = moduleLessons.some((lesson) => lesson.type === 'text');
  const hasNonText = moduleLessons.some((lesson) => lesson.type !== 'text');

  if (activityType === 'text') {
    if (hasText) return 'Module already has a text field';
    if (hasNonText) return 'Text field cannot be added to a module with activities';
  } else if (hasText) {
    return 'Remove the text field before adding activities';
  }
  return null;
}

export const courseContentRoutes = new Hono();

courseContentRoutes.use('*', authMiddleware);

async function getCourseLocale(courseId: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  return course?.defaultLocale ?? 'sk';
}

function notifyCourseUpdated(courseId: string) {
  const payload = { courseId };
  const ts = new Date().toISOString();
  broadcastToCourse(courseId, { type: WS_EVENTS.COURSE_UPDATED, payload, timestamp: ts });
  broadcastToAdmin({ type: WS_EVENTS.COURSE_UPDATED, payload, timestamp: ts });
}

function serializeActivity(
  lesson: typeof lessons.$inferSelect,
  translation?: typeof lessonTranslations.$inferSelect,
) {
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    type: lesson.type,
    sortOrder: lesson.sortOrder,
    isRequired: lesson.isRequired,
    config: lesson.config,
    title: translation?.title ?? 'Activity',
    content: translation?.content ?? '',
  };
}

courseContentRoutes.post('/courses/:courseId/modules', requireRole('admin'), async (c) => {
  const courseId = c.req.param('courseId');
  const body = createModuleSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const locale = course.defaultLocale;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId));

  const [module] = await db
    .insert(courseModules)
    .values({
      courseId,
      sortOrder: body.data.sortOrder ?? count,
    })
    .returning();

  await db.insert(moduleTranslations).values({
    moduleId: module.id,
    locale,
    title: body.data.title,
  });

  notifyCourseUpdated(courseId);
  return c.json({ ...module, title: body.data.title, activities: [] }, 201);
});

courseContentRoutes.patch('/modules/:moduleId', requireRole('admin'), async (c) => {
  const moduleId = c.req.param('moduleId');
  const body = updateModuleSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [existing] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  if (!existing) return c.json({ error: 'Module not found' }, 404);

  const locale = await getCourseLocale(existing.courseId);
  const updates: Partial<typeof courseModules.$inferInsert> = {};
  if (body.data.sortOrder !== undefined) updates.sortOrder = body.data.sortOrder;
  if (body.data.isRequired !== undefined) updates.isRequired = body.data.isRequired;

  const [updated] =
    Object.keys(updates).length > 0
      ? await db.update(courseModules).set(updates).where(eq(courseModules.id, moduleId)).returning()
      : [existing];

  if (body.data.title) {
    const [trans] = await db
      .select()
      .from(moduleTranslations)
      .where(and(eq(moduleTranslations.moduleId, moduleId), eq(moduleTranslations.locale, locale)))
      .limit(1);
    if (trans) {
      await db
        .update(moduleTranslations)
        .set({ title: body.data.title })
        .where(eq(moduleTranslations.id, trans.id));
    } else {
      await db.insert(moduleTranslations).values({
        moduleId,
        locale,
        title: body.data.title,
      });
    }
  }

  const [trans] = await db
    .select()
    .from(moduleTranslations)
    .where(and(eq(moduleTranslations.moduleId, moduleId), eq(moduleTranslations.locale, locale)))
    .limit(1);

  notifyCourseUpdated(existing.courseId);
  return c.json({ ...updated, title: trans?.title ?? body.data.title ?? 'Module' });
});

courseContentRoutes.delete('/modules/:moduleId', requireRole('admin'), async (c) => {
  const moduleId = c.req.param('moduleId');
  const [existing] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  if (!existing) return c.json({ error: 'Module not found' }, 404);

  await db.delete(courseModules).where(eq(courseModules.id, moduleId));
  notifyCourseUpdated(existing.courseId);
  return c.json({ ok: true });
});

courseContentRoutes.post(
  '/modules/:moduleId/activities',
  requireRole('admin'),
  async (c) => {
    const moduleId = c.req.param('moduleId');
    const body = createActivitySchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

    const [module] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
    if (!module) return c.json({ error: 'Module not found' }, 404);

    const moduleLessons = await getModuleLessons(moduleId);
    const ruleError = validateModuleActivityRules(moduleLessons, body.data.type);
    if (ruleError) return c.json({ error: ruleError }, 400);

    const locale = await getCourseLocale(module.courseId);
    const existing = await db
      .select()
      .from(lessons)
      .where(eq(lessons.moduleId, moduleId))
      .orderBy(desc(lessons.sortOrder))
      .limit(1);

    const title =
      body.data.type === 'text' ? defaultTextTitle(body.data.content) : body.data.title;

    const [activity] = await db
      .insert(lessons)
      .values({
        moduleId,
        type: body.data.type,
        sortOrder: body.data.sortOrder ?? (existing[0]?.sortOrder ?? -1) + 1,
        isRequired: body.data.isRequired ?? true,
        config: body.data.config ?? {},
      })
      .returning();

    await db.insert(lessonTranslations).values({
      lessonId: activity.id,
      locale,
      title,
      content: body.data.content ?? '',
    });

    notifyCourseUpdated(module.courseId);
    return c.json(serializeActivity(activity, {
      id: '',
      lessonId: activity.id,
      locale,
      title,
      content: body.data.content ?? '',
      source: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    }), 201);
  },
);

courseContentRoutes.patch('/activities/:activityId', requireRole('admin'), async (c) => {
  const activityId = c.req.param('activityId');
  const body = updateActivitySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [existing] = await db.select().from(lessons).where(eq(lessons.id, activityId)).limit(1);
  if (!existing) return c.json({ error: 'Activity not found' }, 404);

  const [module] = await db.select().from(courseModules).where(eq(courseModules.id, existing.moduleId)).limit(1);
  if (!module) return c.json({ error: 'Module not found' }, 404);

  let targetModule = module;
  if (body.data.moduleId && body.data.moduleId !== existing.moduleId) {
    const [nextModule] = await db
      .select()
      .from(courseModules)
      .where(eq(courseModules.id, body.data.moduleId))
      .limit(1);
    if (!nextModule || nextModule.courseId !== module.courseId) {
      return c.json({ error: 'Target module not found' }, 404);
    }
    targetModule = nextModule;
  }

  const nextType = body.data.type ?? existing.type;
  const targetLessons = await getModuleLessons(
    targetModule.id,
    targetModule.id === existing.moduleId ? activityId : undefined,
  );
  const ruleError = validateModuleActivityRules(targetLessons, nextType);
  if (ruleError) return c.json({ error: ruleError }, 400);

  const locale = await getCourseLocale(module.courseId);
  const lessonUpdates: Partial<typeof lessons.$inferInsert> = {};
  if (body.data.type) lessonUpdates.type = body.data.type;
  if (body.data.moduleId) lessonUpdates.moduleId = body.data.moduleId;
  if (body.data.sortOrder !== undefined) lessonUpdates.sortOrder = body.data.sortOrder;
  if (body.data.isRequired !== undefined) lessonUpdates.isRequired = body.data.isRequired;
  if (body.data.config) lessonUpdates.config = body.data.config;

  const [updated] =
    Object.keys(lessonUpdates).length > 0
      ? await db.update(lessons).set(lessonUpdates).where(eq(lessons.id, activityId)).returning()
      : [existing];

  if (body.data.title !== undefined || body.data.content !== undefined) {
    const [trans] = await db
      .select()
      .from(lessonTranslations)
      .where(and(eq(lessonTranslations.lessonId, activityId), eq(lessonTranslations.locale, locale)))
      .limit(1);

    const nextType = body.data.type ?? updated.type;
    const nextContent = body.data.content !== undefined ? body.data.content : trans?.content;
    const nextTitle =
      body.data.title ??
      (nextType === 'text' ? defaultTextTitle(nextContent ?? '') : trans?.title);

    if (trans) {
      await db
        .update(lessonTranslations)
        .set({
          title: nextTitle ?? trans.title,
          content: body.data.content !== undefined ? body.data.content : trans.content,
          updatedAt: new Date(),
        })
        .where(eq(lessonTranslations.id, trans.id));
    } else if (nextTitle) {
      await db.insert(lessonTranslations).values({
        lessonId: activityId,
        locale,
        title: nextTitle,
        content: body.data.content ?? '',
      });
    }
  }

  const [trans] = await db
    .select()
    .from(lessonTranslations)
    .where(and(eq(lessonTranslations.lessonId, activityId), eq(lessonTranslations.locale, locale)))
    .limit(1);

  notifyCourseUpdated(targetModule.courseId);
  return c.json(serializeActivity(updated, trans));
});

courseContentRoutes.delete('/activities/:activityId', requireRole('admin'), async (c) => {
  const activityId = c.req.param('activityId');
  const [existing] = await db.select().from(lessons).where(eq(lessons.id, activityId)).limit(1);
  if (!existing) return c.json({ error: 'Activity not found' }, 404);

  const [module] = await db.select().from(courseModules).where(eq(courseModules.id, existing.moduleId)).limit(1);
  await db.delete(lessons).where(eq(lessons.id, activityId));
  if (module) notifyCourseUpdated(module.courseId);
  return c.json({ ok: true });
});

courseContentRoutes.post('/courses/:courseId/activities', requireRole('admin'), async (c) => {
  return c.json({ error: 'Activities must belong to a module. Create a module first.' }, 400);
});
