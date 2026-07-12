import type { Context } from 'hono';
import type { UserRole } from '@youniversity2/shared';
import { STUDENT_VIEW_HEADER } from '@youniversity2/shared';
import type { AuthUser } from '../middleware/auth';
import { isStaff } from './course-access';

export function isStudentViewMode(c: Context): boolean {
  return c.req.header(STUDENT_VIEW_HEADER) === '1';
}

export function effectiveRole(user: AuthUser, c: Context): UserRole {
  if (isStaff(user) && isStudentViewMode(c)) return 'student';
  return user.role;
}

export function hasStaffPrivileges(user: AuthUser, c: Context): boolean {
  return isStaff(user) && !isStudentViewMode(c);
}
