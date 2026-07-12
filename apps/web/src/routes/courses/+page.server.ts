import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAuthToken, serverApiJson, studentViewApiHeaders, readStudentViewCookie } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch, depends, cookies }) => {
  depends('student:courses');
  const { token, user } = await parent();
  requireAuthToken(token);
  const isStaff = user?.role === 'admin' || user?.role === 'instructor';
  if (isStaff && !readStudentViewCookie(cookies)) {
    redirect(303, '/dashboard');
  }

  const locale = user?.preferredLocale ?? 'sk';
  const studentView = studentViewApiHeaders(cookies);
  const result = await serverApiJson<{
    futureCourses: Array<Record<string, unknown>>;
    activeCourses: Array<Record<string, unknown>>;
    pastCourses: Array<Record<string, unknown>>;
  }>(fetch, token, `/api/dashboard/courses-overview?locale=${locale}`, undefined, studentView);

  return {
    overview: result.data ?? { futureCourses: [], activeCourses: [], pastCourses: [] },
    loadError: result.error,
  };
};
