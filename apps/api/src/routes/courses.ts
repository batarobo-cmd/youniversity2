import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import {
  courses,
  courseTranslations,
  courseModules,
  moduleTranslations,
  lessons,
  lessonTranslations,
  enrollments,
  completionRules,
  certificates,
  users,
} from '../db/schema';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { SUPPORTED_LOCALES } from '@youniversity2/shared';
import { translateContent } from '../services/translation';
import { broadcastToCourse, broadcastToAdmin } from '../realtime/hub';
import { WS_EVENTS } from '@youniversity2/shared';

const createCourseSchema = z.object({
  slug: z.string().min(2).max(255),
  defaultLocale: z.enum(SUPPORTED_LOCALES).default('sk'),
  title: z.string().min(2),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
});

export const courseRoutes = new Hono();

courseRoutes.use('*', authMiddleware);

courseRoutes.get('/', async (c) => {
  const user = c.get('user') as AuthUser;
  const locale = c.req.query('locale') ?? 'sk';

  if (user.role === 'student') {
    const result = await db
      .select({
        course: courses,
        translation: courseTranslations,
        enrollment: enrollments,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .leftJoin(
        courseTranslations,
        and(eq(courseTranslations.courseId, courses.id), eq(courseTranslations.locale, locale)),
      )
      .where(eq(enrollments.userId, user.id));

    return c.json(
      result.map((r) => ({
        ...r.course,
        title: r.translation?.title ?? r.course.slug,
        description: r.translation?.description ?? '',
        enrollment: r.enrollment,
      })),
    );
  }

  const allCourses = await db.select().from(courses);
  const translations = await db
    .select()
    .from(courseTranslations)
    .where(eq(courseTranslations.locale, locale));

  const translationMap = new Map(translations.map((t) => [t.courseId, t]));

  return c.json(
    allCourses.map((course) => ({
      ...course,
      title: translationMap.get(course.id)?.title ?? course.slug,
      description: translationMap.get(course.id)?.description ?? '',
    })),
  );
});

courseRoutes.patch('/:id', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const body = z
    .object({
      categoryId: z.string().uuid().nullable().optional(),
      slug: z.string().min(2).max(255).optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [updated] = await db
    .update(courses)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning();

  if (!updated) return c.json({ error: 'Course not found' }, 404);

  broadcastToCourse(courseId, {
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId },
    timestamp: new Date().toISOString(),
  });
  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId },
    timestamp: new Date().toISOString(),
  });

  return c.json(updated);
});

courseRoutes.get('/:id', async (c) => {
  const courseId = c.req.param('id');
  const locale = c.req.query('locale') ?? 'sk';

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const [translation] = await db
    .select()
    .from(courseTranslations)
    .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, locale)))
    .limit(1);

  const modules = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(courseModules.sortOrder);

  const moduleIds = modules.map((m) => m.id);
  const moduleTrans =
    moduleIds.length > 0
      ? await db
          .select()
          .from(moduleTranslations)
          .where(and(eq(moduleTranslations.locale, locale)))
      : [];

  const allLessons =
    moduleIds.length > 0
      ? await db.select().from(lessons).orderBy(lessons.sortOrder)
      : [];

  const courseLessons = allLessons.filter((l) => moduleIds.includes(l.moduleId));
  const lessonIds = courseLessons.map((l) => l.id);

  const lessonTrans =
    lessonIds.length > 0
      ? await db.select().from(lessonTranslations).where(eq(lessonTranslations.locale, locale))
      : [];

  const rules = await db.select().from(completionRules).where(eq(completionRules.courseId, courseId));

  return c.json({
    ...course,
    title: translation?.title ?? course.slug,
    description: translation?.description ?? '',
    modules: modules.map((mod) => ({
      ...mod,
      title: moduleTrans.find((t) => t.moduleId === mod.id)?.title ?? 'Module',
      lessons: courseLessons
        .filter((l) => l.moduleId === mod.id)
        .map((lesson) => ({
          ...lesson,
          title: lessonTrans.find((t) => t.lessonId === lesson.id)?.title ?? 'Lesson',
          content: lessonTrans.find((t) => t.lessonId === lesson.id)?.content,
        })),
    })),
    completionRules: rules,
  });
});

courseRoutes.post('/', requireRole('admin', 'instructor'), async (c) => {
  const user = c.get('user') as AuthUser;
  const body = createCourseSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
  }

  const { slug, defaultLocale, title, description, categoryId } = body.data;

  const [course] = await db
    .insert(courses)
    .values({ slug, defaultLocale, categoryId: categoryId ?? null, createdById: user.id })
    .returning();

  await db.insert(courseTranslations).values({
    courseId: course.id,
    locale: defaultLocale,
    title,
    description: description ?? '',
    source: 'manual',
  });

  broadcastToCourse(course.id, {
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId: course.id, action: 'created' },
    timestamp: new Date().toISOString(),
  });
  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId: course.id, action: 'created' },
    timestamp: new Date().toISOString(),
  });

  return c.json(course, 201);
});

courseRoutes.post('/:id/translate', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const body = z.object({ targetLocale: z.enum(SUPPORTED_LOCALES) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid locale' }, 400);

  const { targetLocale } = body.data;

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const [sourceTranslation] = await db
    .select()
    .from(courseTranslations)
    .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, course.defaultLocale)))
    .limit(1);

  if (!sourceTranslation) {
    return c.json({ error: 'Source translation not found' }, 404);
  }

  const existing = await db
    .select()
    .from(courseTranslations)
    .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, targetLocale)))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'Translation already exists', translation: existing[0] }, 409);
  }

  const translated = await translateContent({
    title: sourceTranslation.title,
    description: sourceTranslation.description,
    sourceLocale: course.defaultLocale,
    targetLocale,
  });

  const [newTranslation] = await db
    .insert(courseTranslations)
    .values({
      courseId,
      locale: targetLocale,
      title: translated.title,
      description: translated.description,
      source: 'ai',
    })
    .returning();

  broadcastToCourse(courseId, {
    type: 'course_updated',
    payload: { courseId, locale: targetLocale },
    timestamp: new Date().toISOString(),
  });

  return c.json(newTranslation, 201);
});

courseRoutes.patch('/:id/publish', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const body = z.object({ isPublished: z.boolean() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [updated] = await db
    .update(courses)
    .set({ isPublished: body.data.isPublished, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning();

  if (!updated) return c.json({ error: 'Course not found' }, 404);

  broadcastToCourse(courseId, {
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId, isPublished: updated.isPublished },
    timestamp: new Date().toISOString(),
  });
  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId, isPublished: updated.isPublished },
    timestamp: new Date().toISOString(),
  });

  return c.json(updated);
});

courseRoutes.patch('/:id/content', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const body = z
    .object({
      title: z.string().min(2).optional(),
      description: z.string().optional(),
      slug: z.string().min(2).max(255).optional(),
      locale: z.enum(SUPPORTED_LOCALES).optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const loc = body.data.locale ?? course.defaultLocale;

  if (body.data.slug) {
    await db.update(courses).set({ slug: body.data.slug, updatedAt: new Date() }).where(eq(courses.id, courseId));
  }

  if (body.data.title !== undefined || body.data.description !== undefined) {
    const [existing] = await db
      .select()
      .from(courseTranslations)
      .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, loc)))
      .limit(1);

    if (existing) {
      await db
        .update(courseTranslations)
        .set({
          title: body.data.title ?? existing.title,
          description: body.data.description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(courseTranslations.id, existing.id));
    } else if (body.data.title) {
      await db.insert(courseTranslations).values({
        courseId,
        locale: loc,
        title: body.data.title,
        description: body.data.description ?? '',
        source: 'manual',
      });
    }
  }

  broadcastToCourse(courseId, {
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

courseRoutes.get('/:id/certificates', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const rows = await db
    .select({
      id: certificates.id,
      certificateNumber: certificates.certificateNumber,
      issuedAt: certificates.issuedAt,
      pdfKey: certificates.pdfKey,
      userName: users.name,
      userEmail: users.email,
    })
    .from(certificates)
    .innerJoin(users, eq(certificates.userId, users.id))
    .where(eq(certificates.courseId, courseId))
    .orderBy(certificates.issuedAt);

  return c.json(rows);
});

courseRoutes.put('/:id/completion-rules', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const body = z
    .object({
      rules: z.array(
        z.object({
          type: z.enum([
            'all_lessons_complete',
            'video_watch_percent',
            'quiz_min_score',
            'lessons_in_order',
          ]),
          config: z.record(z.unknown()).default({}),
          isRequired: z.boolean().default(true),
        }),
      ),
      certificate: z
        .object({
          enabled: z.boolean(),
          titleTemplate: z.string().optional(),
        })
        .optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return c.json({ error: 'Course not found' }, 404);

  await db.delete(completionRules).where(eq(completionRules.courseId, courseId));

  const toInsert = body.data.rules.map((rule) => ({
    courseId,
    type: rule.type,
    config: rule.config,
    isRequired: rule.isRequired,
  }));

  if (body.data.certificate?.enabled) {
    const idx = toInsert.findIndex((r) => r.type === 'all_lessons_complete');
    if (idx >= 0) {
      toInsert[idx].config = { ...toInsert[idx].config, certificate: body.data.certificate };
    } else {
      toInsert.push({
        courseId,
        type: 'all_lessons_complete' as const,
        config: { certificate: body.data.certificate },
        isRequired: true,
      });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(completionRules).values(toInsert);
  }

  const rules = await db.select().from(completionRules).where(eq(completionRules.courseId, courseId));
  return c.json(rules);
});

courseRoutes.delete('/:id', requireRole('admin', 'instructor'), async (c) => {
  const courseId = c.req.param('id');
  const [deleted] = await db.delete(courses).where(eq(courses.id, courseId)).returning();
  if (!deleted) return c.json({ error: 'Course not found' }, 404);

  broadcastToAdmin({
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId, action: 'deleted' },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});
