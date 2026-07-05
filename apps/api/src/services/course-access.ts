import { eq } from 'drizzle-orm';
import { db } from '../db';
import { courses } from '../db/schema';
import type { AuthUser } from '../middleware/auth';

export function isStaff(user: AuthUser) {
  return user.role === 'admin' || user.role === 'instructor';
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
  return isCourseVisibleToStudent(courseId);
}
