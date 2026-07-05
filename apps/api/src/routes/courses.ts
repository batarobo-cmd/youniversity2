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
} from '../db/schema';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { SUPPORTED_LOCALES } from '@youniversity2/shared';
import { translateContent } from '../services/translation';
import { broadcastToCourse } from '../realtime/hub';

const createCourseSchema = z.object({
  slug: z.string().min(2).max(255),
  defaultLocale: z.enum(SUPPORTED_LOCALES).default('sk'),
  title: z.string().min(2),
  description: z.string().optional(),
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

  const { slug, defaultLocale, title, description } = body.data;

  const [course] = await db
    .insert(courses)
    .values({ slug, defaultLocale, createdById: user.id })
    .returning();

  await db.insert(courseTranslations).values({
    courseId: course.id,
    locale: defaultLocale,
    title,
    description: description ?? '',
    source: 'manual',
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
    type: 'course_updated',
    payload: { courseId, isPublished: updated.isPublished },
    timestamp: new Date().toISOString(),
  });

  return c.json(updated);
});
