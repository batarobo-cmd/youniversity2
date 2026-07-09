import type { PageServerLoad } from './$types';
import { handleApiMutation, handleApiQuery } from '$lib/server/api-action';
import { requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch, params, depends }) => {
  depends('student:course');
  const { token, user } = await parent();
  requireAuthToken(token);

  const locale = user?.preferredLocale ?? 'sk';
  const courseId = params.id;

  const [course, progress] = await Promise.all([
    serverApiJson<Record<string, unknown>>(fetch, token, `/api/courses/${courseId}?locale=${locale}`),
    serverApiJson<unknown[]>(fetch, token, `/api/progress/course/${courseId}`),
  ]);

  return {
    course: course.data,
    progress: progress.data ?? [],
    loadError: course.error,
  };
};

export const actions = {
  apiQuery: ({ cookies, fetch, request }) => handleApiQuery(fetch, cookies, request, 'user'),
  apiMutation: ({ cookies, fetch, request }) => handleApiMutation(fetch, cookies, request, 'user'),
};
