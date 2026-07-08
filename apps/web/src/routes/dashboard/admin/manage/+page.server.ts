import type { PageServerLoad } from './$types';
import { requireAdmin, requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requireAdmin(user);

  const locale = user?.preferredLocale ?? 'sk';

  const [cats, courses] = await Promise.all([
    serverApiJson<unknown[]>(fetch, token, '/api/categories'),
    serverApiJson<unknown[]>(fetch, token, `/api/courses?locale=${locale}`),
  ]);

  const loadError =
    cats.error ?? courses.error ?? (cats.data && courses.data ? null : 'Nepodarilo sa načítať kategórie a kurzy.');

  return {
    categories: cats.data ?? [],
    courses: courses.data ?? [],
    loadError,
  };
};
