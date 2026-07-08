import type { PageServerLoad } from './$types';
import { requireAdmin, requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch, params }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requireAdmin(user);

  const locale = user?.preferredLocale ?? 'sk';
  const courseId = params.id;

  const [course, enrollments, certificates] = await Promise.all([
    serverApiJson<Record<string, unknown>>(fetch, token, `/api/courses/${courseId}?locale=${locale}`),
    serverApiJson<unknown[]>(fetch, token, `/api/enrollments?courseId=${courseId}`),
    serverApiJson<unknown[]>(fetch, token, `/api/courses/${courseId}/certificates`),
  ]);

  const loadError =
    course.error ??
    enrollments.error ??
    certificates.error ??
    (course.data ? null : 'Nepodarilo sa načítať kurz.');

  return {
    course: course.data,
    enrollments: enrollments.data ?? [],
    certificates: certificates.data ?? [],
    loadError,
  };
};
