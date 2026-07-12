import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  certificates,
  courseModules,
  lessons,
  lessonProgress,
  type enrollments,
} from '../db/schema';
import { countsForCourseCompletion, isProgressFullyComplete } from './course-completion';

export type ReportingProgressState = 'idle' | 'started' | 'completed';

export function filterCertificatesForAttempt<T extends { issuedAt: Date | string }>(
  certs: T[],
  enrolledAt: Date,
): T[] {
  const enrolledAtMs = enrolledAt.getTime();
  return certs.filter((cert) => new Date(cert.issuedAt).getTime() >= enrolledAtMs);
}

export async function hasCertificateForCurrentAttempt(
  userId: string,
  courseId: string,
  enrolledAt: Date,
): Promise<boolean> {
  const rows = await db
    .select({ issuedAt: certificates.issuedAt })
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)));

  return filterCertificatesForAttempt(rows, enrolledAt).length > 0;
}

export async function getEnrollmentProgressPercent(
  userId: string,
  courseId: string,
): Promise<number> {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) return 0;

  const allLessons = await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds));
  const courseLessons = allLessons.filter((l) => countsForCourseCompletion(l));
  if (courseLessons.length === 0) return 100;

  const lessonIds = courseLessons.map((l) => l.id);
  const progress = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));

  const completed = progress.filter((p) => isProgressFullyComplete(p)).length;
  return Math.round((completed / courseLessons.length) * 100);
}

export function getReportingProgressState(
  enrollment: Pick<typeof enrollments.$inferSelect, 'enrolledAt' | 'completedAt' | 'status'> | null,
  progressPercent: number,
  allCertificates: Array<{ issuedAt: Date | string }>,
): ReportingProgressState {
  if (!enrollment) {
    return allCertificates.length > 0 ? 'completed' : 'idle';
  }

  if (enrollment.status === 'completed') return 'completed';

  const attemptCerts = filterCertificatesForAttempt(allCertificates, enrollment.enrolledAt);

  if (enrollment.status === 'active') {
    if (progressPercent >= 100) return 'completed';
    if (progressPercent > 0) return 'started';
    return 'idle';
  }

  if (['suspended', 'revoked'].includes(enrollment.status)) {
    if (enrollment.completedAt != null || attemptCerts.length > 0 || progressPercent >= 100) {
      return 'completed';
    }
    if (progressPercent > 0) return 'started';
    return 'idle';
  }

  if (progressPercent >= 100) return 'completed';
  if (progressPercent > 0) return 'started';
  return 'idle';
}

export async function resolveEnrollmentStatusOnRestore(
  enrollment: typeof enrollments.$inferSelect,
): Promise<{ status: 'active' | 'completed'; completedAt: Date | null }> {
  if (enrollment.completedAt) {
    return { status: 'completed', completedAt: enrollment.completedAt };
  }

  const certRows = await db
    .select({ issuedAt: certificates.issuedAt })
    .from(certificates)
    .where(
      and(eq(certificates.userId, enrollment.userId), eq(certificates.courseId, enrollment.courseId)),
    )
    .orderBy(desc(certificates.issuedAt));

  const attemptCerts = filterCertificatesForAttempt(certRows, enrollment.enrolledAt);
  if (attemptCerts.length > 0) {
    return {
      status: 'completed',
      completedAt: new Date(attemptCerts[0].issuedAt),
    };
  }

  const progressPercent = await getEnrollmentProgressPercent(enrollment.userId, enrollment.courseId);
  if (progressPercent >= 100) {
    return { status: 'completed', completedAt: new Date() };
  }

  return { status: 'active', completedAt: null };
}
