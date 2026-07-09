import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { courses, enrollments } from '../db/schema';
import type { AuthUser } from '../middleware/auth';

export function isStaff(user: AuthUser) {
  return user.role === 'admin' || user.role === 'instructor';
}

const STUDENT_LISTED_STATUSES = new Set(['active', 'completed', 'failed', 'expired']);

export function isEnrollmentListedForStudent(status: string): boolean {
  return STUDENT_LISTED_STATUSES.has(status);
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
    .select({ isPublished: courses.isPublished })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return row?.isPublished === true;
}

export async function canStudentViewCourse(user: AuthUser, courseId: string): Promise<boolean> {
  if (isStaff(user)) return true;
  if (!(await isCourseVisibleToStudent(courseId))) return false;

  const enrollment = await getStudentEnrollment(user.id, courseId);
  if (!enrollment) return false;

  return isEnrollmentListedForStudent(enrollment.status);
}

export async function canStudentUpdateProgress(user: AuthUser, courseId: string): Promise<boolean> {
  if (isStaff(user)) return true;
  if (!(await isCourseVisibleToStudent(courseId))) return false;

  const enrollment = await getStudentEnrollment(user.id, courseId);
  return enrollment?.status === 'active';
}
