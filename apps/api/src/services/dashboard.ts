import { eq, and, inArray, desc, count } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  courses,
  courseTranslations,
  courseModules,
  lessons,
  enrollments,
  lessonProgress,
  certificates,
  activityEvents,
} from '../db/schema';
import type { AuthUser } from '../middleware/auth';

async function getCourseProgressPercent(userId: string, courseId: string): Promise<number> {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) return 0;

  const allLessons = await db.select().from(lessons);
  const courseLessons = allLessons.filter((l) => moduleIds.includes(l.moduleId));
  if (courseLessons.length === 0) return 0;

  const lessonIds = courseLessons.map((l) => l.id);
  const progress = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));

  const completed = progress.filter((p) => p.isComplete).length;
  return Math.round((completed / courseLessons.length) * 100);
}

export async function getStudentDashboard(userId: string, locale: string) {
  const userEnrollments = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.enrolledAt));

  const courseIds = userEnrollments.map((e) => e.courseId);
  if (courseIds.length === 0) {
    return {
      stats: { active: 0, completed: 0, certificates: 0, avgProgress: 0 },
      activeCourses: [],
      completedCourses: [],
      calendarEvents: [],
      upcomingDeadlines: [],
      recentActivity: [],
    };
  }

  const courseRows = await db.select().from(courses).where(inArray(courses.id, courseIds));
  const translations = await db
    .select()
    .from(courseTranslations)
    .where(and(inArray(courseTranslations.courseId, courseIds), eq(courseTranslations.locale, locale)));

  const userCerts = await db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId));

  const certMap = new Map(userCerts.map((c) => [c.courseId, c]));

  const translationMap = new Map(translations.map((t) => [t.courseId, t]));
  const courseMap = new Map(courseRows.map((c) => [c.id, c]));

  const activeCourses = [];
  const completedCourses = [];
  const calendarEvents: Array<{
    id: string;
    courseId: string;
    title: string;
    date: string;
    type: 'start' | 'end' | 'deadline';
  }> = [];
  const upcomingDeadlines: Array<{
    courseId: string;
    title: string;
    expiresAt: string;
    daysLeft: number;
  }> = [];

  let totalProgress = 0;
  let activeCount = 0;

  for (const enrollment of userEnrollments) {
    const course = courseMap.get(enrollment.courseId);
    if (!course) continue;

    const translation = translationMap.get(enrollment.courseId);
    const title = translation?.title ?? course.slug;
    const progressPercent = await getCourseProgressPercent(userId, enrollment.courseId);

    const startDate = course.startsAt ?? enrollment.enrolledAt;
    const endDate = course.endsAt ?? enrollment.expiresAt;

    if (startDate) {
      calendarEvents.push({
        id: `${enrollment.id}-start`,
        courseId: course.id,
        title,
        date: startDate.toISOString(),
        type: 'start',
      });
    }
    if (endDate) {
      calendarEvents.push({
        id: `${enrollment.id}-end`,
        courseId: course.id,
        title,
        date: endDate.toISOString(),
        type: 'end',
      });
    }
    if (enrollment.expiresAt && enrollment.status === 'active') {
      const daysLeft = Math.ceil(
        (enrollment.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft >= 0 && daysLeft <= 30) {
        upcomingDeadlines.push({
          courseId: course.id,
          title,
          expiresAt: enrollment.expiresAt.toISOString(),
          daysLeft,
        });
      }
    }

    if (enrollment.status === 'completed') {
      const cert = certMap.get(enrollment.courseId);
      completedCourses.push({
        id: course.id,
        slug: course.slug,
        title,
        description: translation?.description ?? '',
        completedAt: enrollment.completedAt?.toISOString(),
        progressPercent: 100,
        certificate: cert
          ? {
              id: cert.id,
              certificateNumber: cert.certificateNumber,
              issuedAt: cert.issuedAt.toISOString(),
            }
          : null,
      });
    } else if (enrollment.status === 'active') {
      activeCount++;
      totalProgress += progressPercent;
      activeCourses.push({
        id: course.id,
        slug: course.slug,
        title,
        description: translation?.description ?? '',
        progressPercent,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        expiresAt: enrollment.expiresAt?.toISOString(),
        startsAt: startDate?.toISOString(),
        endsAt: endDate?.toISOString(),
      });
    }
  }

  upcomingDeadlines.sort((a, b) => a.daysLeft - b.daysLeft);

  const recentActivity = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(8);

  return {
    stats: {
      active: activeCount,
      completed: completedCourses.length,
      certificates: userCerts.length,
      avgProgress: activeCount > 0 ? Math.round(totalProgress / activeCount) : 0,
    },
    activeCourses,
    completedCourses,
    calendarEvents,
    upcomingDeadlines,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      courseId: a.courseId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export async function getAdminDashboard(locale: string) {
  const [courseCount] = await db.select({ value: count() }).from(courses);
  const [publishedCount] = await db
    .select({ value: count() })
    .from(courses)
    .where(eq(courses.isPublished, true));
  const [studentCount] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, 'student'));
  const [activeEnrollmentCount] = await db
    .select({ value: count() })
    .from(enrollments)
    .where(eq(enrollments.status, 'active'));
  const [completedCount] = await db
    .select({ value: count() })
    .from(enrollments)
    .where(eq(enrollments.status, 'completed'));

  const allCourses = await db.select().from(courses).orderBy(desc(courses.updatedAt)).limit(10);
  const courseIds = allCourses.map((c) => c.id);

  const translations =
    courseIds.length > 0
      ? await db
          .select()
          .from(courseTranslations)
          .where(
            and(inArray(courseTranslations.courseId, courseIds), eq(courseTranslations.locale, locale)),
          )
      : [];

  const translationMap = new Map(translations.map((t) => [t.courseId, t]));

  const enrollmentCounts =
    courseIds.length > 0
      ? await db
          .select({
            courseId: enrollments.courseId,
            total: count(),
          })
          .from(enrollments)
          .where(inArray(enrollments.courseId, courseIds))
          .groupBy(enrollments.courseId)
      : [];

  const enrollmentMap = new Map(enrollmentCounts.map((e) => [e.courseId, Number(e.total)]));

  const recentEnrollments = await db
    .select({
      enrollment: enrollments,
      user: { id: users.id, name: users.name, email: users.email },
      course: { id: courses.id, slug: courses.slug },
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .orderBy(desc(enrollments.enrolledAt))
    .limit(10);

  const recentActivity = await db
    .select({
      event: activityEvents,
      user: { name: users.name },
    })
    .from(activityEvents)
    .innerJoin(users, eq(activityEvents.userId, users.id))
    .orderBy(desc(activityEvents.createdAt))
    .limit(15);

  return {
    stats: {
      totalCourses: Number(courseCount.value),
      publishedCourses: Number(publishedCount.value),
      totalStudents: Number(studentCount.value),
      activeEnrollments: Number(activeEnrollmentCount.value),
      completedEnrollments: Number(completedCount.value),
    },
    courses: allCourses.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: translationMap.get(c.id)?.title ?? c.slug,
      isPublished: c.isPublished,
      enrollmentCount: enrollmentMap.get(c.id) ?? 0,
      startsAt: c.startsAt?.toISOString(),
      endsAt: c.endsAt?.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    recentEnrollments: recentEnrollments.map((r) => ({
      id: r.enrollment.id,
      status: r.enrollment.status,
      enrolledAt: r.enrollment.enrolledAt.toISOString(),
      userName: r.user.name,
      userEmail: r.user.email,
      courseId: r.course.id,
      courseSlug: r.course.slug,
    })),
    recentActivity: recentActivity.map((r) => ({
      id: r.event.id,
      eventType: r.event.eventType,
      userName: r.user.name,
      courseId: r.event.courseId,
      createdAt: r.event.createdAt.toISOString(),
    })),
  };
}
