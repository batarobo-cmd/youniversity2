import type { PageServerLoad } from './$types';
import { requireAuthToken, requirePlatformAdmin, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);

  const result = await serverApiJson<unknown[]>(fetch, token, '/api/admin/users');

  return {
    users: result.data ?? [],
    loadError: result.error,
  };
};
