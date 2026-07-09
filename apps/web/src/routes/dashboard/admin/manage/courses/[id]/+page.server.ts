import type { PageServerLoad } from './$types';
import { handleApiMutation, handleApiQuery } from '$lib/server/api-action';
import { requireAdmin, requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch, params, depends }) => {
  depends('course:edit');
  const { token, user } = await parent();
  requireAuthToken(token);
  requireAdmin(user);

  const locale = user?.preferredLocale ?? 'sk';
  const courseId = params.id;

  const course = await serverApiJson<Record<string, unknown>>(
    fetch,
    token,
    `/api/courses/${courseId}?locale=${locale}`,
  );

  const loadError = course.error ?? (course.data ? null : 'Nepodarilo sa načítať kurz.');

  return {
    course: course.data,
    loadError,
  };
};

export const actions = {
  apiQuery: ({ cookies, fetch, request }) => handleApiQuery(fetch, cookies, request, 'admin'),
  apiMutation: ({ cookies, fetch, request }) => handleApiMutation(fetch, cookies, request, 'admin'),
};
