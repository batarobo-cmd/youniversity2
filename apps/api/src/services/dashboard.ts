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
import { canStudentOpenCourse } from './course-access';
import { evaluateCourseCompletion } from './completion';

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
  certificates: Array<{
    id: string;
    certificateNumber: string;
    issuedAt: string;
  }>;
  canOpenCourse: boolean;
};

type CourseBucket = 'future' | 'active' | 'past';

function hasCourseAchievement(
  enrollment: { status: string; completedAt: Date | null },
  certCount: number,
  progressPercent: number,
): boolean {
  return (
    enrollment.status === 'completed' ||
    enrollment.completedAt != null ||
    certCount > 0 ||
    progressPercent >= 100
  );
}

function shouldListEnrollmentForStudent(status: string, hasAchievement: boolean): boolean {
  if (status === 'revoked') return hasAchievement;
  return true;
}

function displayEnrollmentStatus(
  enrollment: { status: string; completedAt: Date | null },
  certCount: number,
  progressPercent: number,
): string {
  if (
    hasCourseAchievement(enrollment, certCount, progressPercent) &&
    ['revoked', 'suspended'].includes(enrollment.status)
  ) {
    return 'completed';
  }
  return enrollment.status;
}

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

function resolveCourseBucket(
  enrollment: { status: string; enrolledAt: Date; expiresAt: Date | null; completedAt: Date | null },
  course: { startsAt: Date | null; endsAt: Date | null },
  now: Date,
  certCount: number,
  progressPercent: number,
): CourseBucket {
  if (
    hasCourseAchievement(enrollment, certCount, progressPercent) &&
    ['revoked', 'suspended'].includes(enrollment.status)
  ) {
    return 'past';
  }
  return classifyCourseBucket(enrollment, course, now);
}

function isCourseCompletedForStudent(course: StudentCourseView): boolean {
  return (
    course.enrollmentStatus === 'completed' ||
    course.certificates.length > 0 ||
    course.progressPercent >= 100
  );
}

export async function getStudentCourseOverview(userId: string, locale: string) {
  const now = new Date();

  const userEnrollments = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.enrolledAt));

  for (const enrollment of userEnrollments) {
    if (['active', 'completed'].includes(enrollment.status)) {
      await evaluateCourseCompletion(userId, enrollment.courseId);
    }
  }

  const userCerts = await db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.issuedAt));

  if (userEnrollments.length === 0 && userCerts.length === 0) {
    return {
      futureCourses: [] as StudentCourseView[],
      activeCourses: [] as StudentCourseView[],
      pastCourses: [] as StudentCourseView[],
      stats: { active: 0, completed: 0, certificates: 0, avgProgress: 0 },
    };
  }

  const certsByCourse = new Map<string, typeof userCerts>();
  for (const cert of userCerts) {
    const list = certsByCourse.get(cert.courseId) ?? [];
    list.push(cert);
    certsByCourse.set(cert.courseId, list);
  }

  const courseIds = [
    ...new Set([...userEnrollments.map((e) => e.courseId), ...userCerts.map((c) => c.courseId)]),
  ];
  const courseRows = await db.select().from(courses).where(inArray(courses.id, courseIds));
  const translations = await db
    .select()
    .from(courseTranslations)
    .where(and(inArray(courseTranslations.courseId, courseIds), eq(courseTranslations.locale, locale)));

  const translationMap = new Map(translations.map((t) => [t.courseId, t]));
  const courseMap = new Map(courseRows.map((c) => [c.id, c]));

  const futureCourses: StudentCourseView[] = [];
  const activeCourses: StudentCourseView[] = [];
  const pastCourses: StudentCourseView[] = [];

  let totalProgress = 0;
  let activeCount = 0;
  let completedCount = 0;

  const buildCourseView = async (
    courseId: string,
    enrollment: (typeof userEnrollments)[number] | null,
  ): Promise<StudentCourseView | null> => {
    const course = courseMap.get(courseId);
    if (!course || !isCourseVisibleToStudents(course, now)) return null;

    const translation = translationMap.get(courseId);
    const title = translation?.title ?? course.slug;
    const progressPercent =
      enrollment?.status === 'completed'
        ? 100
        : await getCourseProgressPercent(userId, courseId);
    const isOngoingEnrollment = enrollment?.status === 'active';
    const startDate = course.startsAt ?? enrollment?.enrolledAt ?? null;
    const endDate = course.endsAt ?? enrollment?.expiresAt ?? null;
    const courseCerts = certsByCourse.get(courseId) ?? [];
    const certItems = courseCerts.map((cert) => ({
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      issuedAt: cert.issuedAt.toISOString(),
    }));
    const enrollmentLike = enrollment ?? {
      status: 'revoked' as const,
      completedAt: null,
      enrolledAt: courseCerts[0]?.issuedAt ?? now,
      expiresAt: null,
    };
    const hasAchievement = hasCourseAchievement(enrollmentLike, certItems.length, progressPercent);

    if (enrollment && !shouldListEnrollmentForStudent(enrollment.status, hasAchievement)) {
      return null;
    }

    const displayProgressPercent = isOngoingEnrollment
      ? progressPercent
      : hasAchievement
        ? Math.max(progressPercent, 100)
        : progressPercent;
    const visibleCerts = isOngoingEnrollment ? [] : certItems;
    const enrolledAtMs = enrollment?.enrolledAt?.getTime() ?? 0;
    const currentAttemptCert = certItems
      .filter((cert) => new Date(cert.issuedAt).getTime() >= enrolledAtMs)
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];

    const completedAt =
      enrollment?.completedAt?.toISOString() ??
      currentAttemptCert?.issuedAt ??
      certItems[0]?.issuedAt ??
      undefined;

    return {
      id: course.id,
      slug: course.slug,
      title,
      description: translation?.description ?? '',
      progressPercent: displayProgressPercent,
      enrolledAt: (enrollment?.enrolledAt ?? courseCerts[0]?.issuedAt ?? now).toISOString(),
      expiresAt: enrollment?.expiresAt?.toISOString(),
      startsAt: startDate?.toISOString(),
      endsAt: endDate?.toISOString(),
      completedAt,
      enrollmentStatus: enrollment
        ? isOngoingEnrollment
          ? enrollment.status
          : displayEnrollmentStatus(enrollment, certItems.length, progressPercent)
        : 'completed',
      certificates: visibleCerts,
      certificate: visibleCerts[0] ?? null,
      canOpenCourse: enrollment ? canStudentOpenCourse(enrollment.status) : false,
    };
  };

  for (const enrollment of userEnrollments) {
    const item = await buildCourseView(enrollment.courseId, enrollment);
    if (!item) continue;

    const courseCerts = certsByCourse.get(enrollment.courseId) ?? [];
    const rawProgressPercent =
      enrollment.status === 'completed'
        ? 100
        : await getCourseProgressPercent(userId, enrollment.courseId);
    const hasAchievement = hasCourseAchievement(enrollment, courseCerts.length, rawProgressPercent);
    const bucket = resolveCourseBucket(
      enrollment,
      courseMap.get(enrollment.courseId)!,
      now,
      courseCerts.length,
      rawProgressPercent,
    );

    if (bucket === 'future') futureCourses.push(item);
    else if (bucket === 'active') {
      activeCourses.push(item);
      activeCount++;
      totalProgress += item.progressPercent;
    } else pastCourses.push(item);

    if (
      enrollment.status === 'completed' ||
      (['revoked', 'suspended'].includes(enrollment.status) && hasAchievement)
    ) {
      completedCount++;
    }
  }

  const listedCourseIds = new Set(
    [...futureCourses, ...activeCourses, ...pastCourses].map((course) => course.id),
  );

  for (const courseId of certsByCourse.keys()) {
    if (listedCourseIds.has(courseId)) continue;
    const item = await buildCourseView(courseId, null);
    if (!item) continue;
    pastCourses.push(item);
    completedCount++;
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
    if (!isCourseCompletedForStudent(course)) return false;
    const doneAt = course.completedAt ?? course.certificates[0]?.issuedAt ?? course.certificate?.issuedAt;
    if (!doneAt) return false;
    return new Date(doneAt).getFullYear() === currentYear;
  });

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

  return {
    stats: overview.stats,
    activeCourses: overview.activeCourses,
    completedThisYear,
    currentYear,
    calendarEvents,
    upcomingDeadlines,
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
