import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('student:courses');
  const { token, user } = await parent();
  requireAuthToken(token);
  if (user?.role === 'admin' || user?.role === 'instructor') redirect(303, '/dashboard');

  const locale = user?.preferredLocale ?? 'sk';
  const result = await serverApiJson<{
    futureCourses: Array<Record<string, unknown>>;
    activeCourses: Array<Record<string, unknown>>;
    pastCourses: Array<Record<string, unknown>>;
  }>(fetch, token, `/api/dashboard/courses-overview?locale=${locale}`);

  return {
    overview: result.data ?? { futureCourses: [], activeCourses: [], pastCourses: [] },
    loadError: result.error,
  };
};
