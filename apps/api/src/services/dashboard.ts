import { eq, and, inArray, desc, count, gte, lte, or, ilike, isNotNull, sql } from 'drizzle-orm';
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
  loginEvents,
} from '../db/schema';
import type { AuthUser } from '../middleware/auth';
import { isCourseVisibleToStudents } from './course-visibility';
import { countsForCourseCompletion, isProgressFullyComplete } from './course-completion';

async function getCourseProgressPercent(userId: string, courseId: string): Promise<number> {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) return 0;

  const allLessons = await db.select().from(lessons);
  const courseLessons = allLessons.filter((l) => moduleIds.includes(l.moduleId) && countsForCourseCompletion(l));
  if (courseLessons.length === 0) return 100;

  const lessonIds = courseLessons.map((l) => l.id);
  const progress = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));

  const completed = progress.filter((p) => isProgressFullyComplete(p)).length;
  return Math.round((completed / courseLessons.length) * 100);
}

export type StudentCourseView = {
  id: string;
  slug: string;
  title: string;
  description: string;
  progressPercent: number;
  enrolledAt: string;
  expiresAt?: string;
  startsAt?: string;
  endsAt?: string;
  completedAt?: string;
  enrollmentStatus: string;
  certificate: {
    id: string;
    certificateNumber: string;
    issuedAt: string;
  } | null;
};

type CourseBucket = 'future' | 'active' | 'past';

function classifyCourseBucket(
  enrollment: { status: string; enrolledAt: Date; expiresAt: Date | null },
  course: { startsAt: Date | null; endsAt: Date | null },
  now: Date,
): CourseBucket {
  if (['completed', 'failed', 'expired'].includes(enrollment.status)) {
    return 'past';
  }

  const start = course.startsAt ?? enrollment.enrolledAt;
  const end = course.endsAt ?? enrollment.expiresAt ?? null;
  if (start > now) return 'future';
  if (end && end < now) return 'past';
  return 'active';
}

export async function getStudentCourseOverview(userId: string, locale: string) {
  const now = new Date();

  const userEnrollments = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.enrolledAt));

  if (userEnrollments.length === 0) {
    return {
      futureCourses: [] as StudentCourseView[],
      activeCourses: [] as StudentCourseView[],
      pastCourses: [] as StudentCourseView[],
      stats: { active: 0, completed: 0, certificates: 0, avgProgress: 0 },
    };
  }

  const courseIds = userEnrollments.map((e) => e.courseId);
  const courseRows = await db.select().from(courses).where(inArray(courses.id, courseIds));
  const translations = await db
    .select()
    .from(courseTranslations)
    .where(and(inArray(courseTranslations.courseId, courseIds), eq(courseTranslations.locale, locale)));

  const userCerts = await db.select().from(certificates).where(eq(certificates.userId, userId));
  const certMap = new Map(userCerts.map((c) => [c.courseId, c]));
  const translationMap = new Map(translations.map((t) => [t.courseId, t]));
  const courseMap = new Map(courseRows.map((c) => [c.id, c]));

  const futureCourses: StudentCourseView[] = [];
  const activeCourses: StudentCourseView[] = [];
  const pastCourses: StudentCourseView[] = [];

  let totalProgress = 0;
  let activeCount = 0;
  let completedCount = 0;

  for (const enrollment of userEnrollments) {
    if (['suspended', 'revoked'].includes(enrollment.status)) continue;

    const course = courseMap.get(enrollment.courseId);
    if (!course || !isCourseVisibleToStudents(course, now)) continue;

    const translation = translationMap.get(enrollment.courseId);
    const title = translation?.title ?? course.slug;
    const progressPercent =
      enrollment.status === 'completed'
        ? 100
        : await getCourseProgressPercent(userId, enrollment.courseId);
    const startDate = course.startsAt ?? enrollment.enrolledAt;
    const endDate = course.endsAt ?? enrollment.expiresAt;
    const cert = certMap.get(enrollment.courseId);

    const item: StudentCourseView = {
      id: course.id,
      slug: course.slug,
      title,
      description: translation?.description ?? '',
      progressPercent,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      expiresAt: enrollment.expiresAt?.toISOString(),
      startsAt: startDate?.toISOString(),
      endsAt: endDate?.toISOString(),
      completedAt: enrollment.completedAt?.toISOString(),
      enrollmentStatus: enrollment.status,
      certificate: cert
        ? {
            id: cert.id,
            certificateNumber: cert.certificateNumber,
            issuedAt: cert.issuedAt.toISOString(),
          }
        : null,
    };

    const bucket = classifyCourseBucket(enrollment, course, now);
    if (bucket === 'future') futureCourses.push(item);
    else if (bucket === 'active') {
      activeCourses.push(item);
      activeCount++;
      totalProgress += progressPercent;
    } else pastCourses.push(item);

    if (enrollment.status === 'completed') completedCount++;
  }

  return {
    futureCourses,
    activeCourses,
    pastCourses,
    stats: {
      active: activeCount,
      completed: completedCount,
      certificates: userCerts.length,
      avgProgress: activeCount > 0 ? Math.round(totalProgress / activeCount) : 0,
    },
  };
}

export async function getStudentDashboard(userId: string, locale: string) {
  const overview = await getStudentCourseOverview(userId, locale);
  const currentYear = new Date().getFullYear();

  const completedThisYear = overview.pastCourses.filter((course) => {
    if (course.enrollmentStatus !== 'completed') return false;
    const doneAt = course.completedAt ?? course.certificate?.issuedAt;
    if (!doneAt) return false;
    return new Date(doneAt).getFullYear() === currentYear;
  });

  const courseIds = [
    ...overview.activeCourses,
    ...overview.futureCourses,
    ...overview.pastCourses,
  ].map((c) => c.id);

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

  for (const course of [...overview.futureCourses, ...overview.activeCourses]) {
    if (course.startsAt) {
      calendarEvents.push({
        id: `${course.id}-start`,
        courseId: course.id,
        title: course.title,
        date: course.startsAt,
        type: 'start',
      });
    }
    if (course.endsAt) {
      calendarEvents.push({
        id: `${course.id}-end`,
        courseId: course.id,
        title: course.title,
        date: course.endsAt,
        type: 'end',
      });
    }
    if (course.expiresAt) {
      const daysLeft = Math.ceil(
        (new Date(course.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft >= 0 && daysLeft <= 30) {
        upcomingDeadlines.push({
          courseId: course.id,
          title: course.title,
          expiresAt: course.expiresAt,
          daysLeft,
        });
      }
    }
  }

  upcomingDeadlines.sort((a, b) => a.daysLeft - b.daysLeft);

  const recentActivity =
    courseIds.length > 0
      ? await db
          .select()
          .from(activityEvents)
          .where(eq(activityEvents.userId, userId))
          .orderBy(desc(activityEvents.createdAt))
          .limit(8)
      : [];

  return {
    stats: overview.stats,
    activeCourses: overview.activeCourses,
    completedThisYear,
    currentYear,
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

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const topActiveRaw = await db
    .select({
      courseId: activityEvents.courseId,
      activityCount: count(),
      activeUsers: sql<number>`count(distinct ${activityEvents.userId})`.mapWith(Number),
    })
    .from(activityEvents)
    .where(and(isNotNull(activityEvents.courseId), gte(activityEvents.createdAt, oneHourAgo)))
    .groupBy(activityEvents.courseId)
    .orderBy(desc(count()))
    .limit(10);

  const activeCourseIds = topActiveRaw
    .map((r) => r.courseId)
    .filter((id): id is string => id !== null);

  const activeCourseRows =
    activeCourseIds.length > 0
      ? await db.select().from(courses).where(inArray(courses.id, activeCourseIds))
      : [];

  const activeCourseMap = new Map(activeCourseRows.map((c) => [c.id, c]));

  const activeTranslations =
    activeCourseIds.length > 0
      ? await db
          .select()
          .from(courseTranslations)
          .where(
            and(inArray(courseTranslations.courseId, activeCourseIds), eq(courseTranslations.locale, locale)),
          )
      : [];

  const activeTranslationMap = new Map(activeTranslations.map((t) => [t.courseId, t]));

  const enrollmentCounts =
    activeCourseIds.length > 0
      ? await db
          .select({
            courseId: enrollments.courseId,
            total: count(),
          })
          .from(enrollments)
          .where(inArray(enrollments.courseId, activeCourseIds))
          .groupBy(enrollments.courseId)
      : [];

  const enrollmentMap = new Map(enrollmentCounts.map((e) => [e.courseId, Number(e.total)]));

  const topCourses = topActiveRaw
    .map((row) => {
      const c = row.courseId ? activeCourseMap.get(row.courseId) : undefined;
      if (!c || !row.courseId) return null;
      return {
        id: c.id,
        slug: c.slug,
        title: activeTranslationMap.get(c.id)?.title ?? c.slug,
        isPublished: c.isPublished,
        enrollmentCount: enrollmentMap.get(c.id) ?? 0,
        activityCount: Number(row.activityCount),
        activeUsers: row.activeUsers,
        startsAt: c.startsAt?.toISOString(),
        endsAt: c.endsAt?.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const recentRegistrations = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);

  const recentLogins = await db
    .select({
      id: loginEvents.id,
      method: loginEvents.method,
      createdAt: loginEvents.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(loginEvents)
    .innerJoin(users, eq(loginEvents.userId, users.id))
    .orderBy(desc(loginEvents.createdAt))
    .limit(10);

  return {
    stats: {
      totalCourses: Number(courseCount.value),
      publishedCourses: Number(publishedCount.value),
      totalStudents: Number(studentCount.value),
      activeEnrollments: Number(activeEnrollmentCount.value),
      completedEnrollments: Number(completedCount.value),
    },
    courses: topCourses,
    recentRegistrations: recentRegistrations.map((r) => ({
      id: r.id,
      userName: r.name,
      userEmail: r.email,
      role: r.role,
      registeredAt: r.createdAt.toISOString(),
    })),
    recentLogins: recentLogins.map((r) => ({
      id: r.id,
      userName: r.userName,
      userEmail: r.userEmail,
      method: r.method,
      loggedInAt: r.createdAt.toISOString(),
    })),
  };
}
