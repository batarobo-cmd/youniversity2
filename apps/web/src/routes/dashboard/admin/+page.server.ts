import type { PageServerLoad } from './$types';
import { requireAdmin, requireAuthToken, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requireAdmin(user);

  const locale = user?.preferredLocale ?? 'sk';
  const result = await serverApiJson<Record<string, unknown>>(
    fetch,
    token,
    `/api/dashboard?locale=${locale}`,
  );

  return {
    dashboard: result.data,
    loadError: result.error,
  };
};
