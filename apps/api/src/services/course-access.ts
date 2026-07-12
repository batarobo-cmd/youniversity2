import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { courses, enrollments, certificates } from '../db/schema';
import type { AuthUser } from '../middleware/auth';
import { isCourseVisibleToStudents } from './course-visibility';
import { hasStaffPrivileges } from './student-view';

export function isStaff(user: AuthUser) {
  return user.role === 'admin' || user.role === 'instructor';
}

export function canStudentOpenCourse(enrollmentStatus: string | null | undefined): boolean {
  return enrollmentStatus === 'active' || enrollmentStatus === 'completed';
}

export async function hasEnrollmentCertificate(
  userId: string,
  courseId: string,
  _enrolledAt?: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
    .limit(1);
  return Boolean(row);
}

export function canStudentOpenEnrollment(
  enrollmentStatus: string,
  hasCertificate: boolean,
): boolean {
  if (enrollmentStatus === 'active') return true;
  if (enrollmentStatus === 'completed') return hasCertificate;
  return false;
}

export function isEnrollmentListedForStudent(status: string): boolean {
  return canStudentOpenCourse(status);
}

export async function getStudentEnrollment(userId: string, courseId: string) {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

export async function isCourseVisibleToStudent(courseId: string): Promise<boolean> {
  const [row] = await db
    .select({
      isPublished: courses.isPublished,
      startsAt: courses.startsAt,
      endsAt: courses.endsAt,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!row) return false;
  return isCourseVisibleToStudents(row);
}

export async function canStudentViewCourse(
  user: AuthUser,
  courseId: string,
  c: Context,
): Promise<boolean> {
  if (hasStaffPrivileges(user, c)) return true;
  if (!(await isCourseVisibleToStudent(courseId))) return false;

  const enrollment = await getStudentEnrollment(user.id, courseId);
  if (!enrollment) return false;

  if (enrollment.status === 'active') return true;

  if (enrollment.status === 'completed') {
    return hasEnrollmentCertificate(user.id, courseId, enrollment.enrolledAt);
  }

  return false;
}

export async function canStudentUpdateProgress(
  user: AuthUser,
  courseId: string,
  c: Context,
): Promise<boolean> {
  if (hasStaffPrivileges(user, c)) return true;
  if (!(await isCourseVisibleToStudent(courseId))) return false;

  const enrollment = await getStudentEnrollment(user.id, courseId);
  return enrollment?.status === 'active';
}
