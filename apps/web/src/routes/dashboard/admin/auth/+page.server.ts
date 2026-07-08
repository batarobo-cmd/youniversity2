import type { PageServerLoad } from './$types';
import { requireAuthToken, requirePlatformAdmin, serverApiJson } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);

  const result = await serverApiJson<Record<string, unknown>>(fetch, token, '/api/admin/auth-settings');

  return {
    authSettings: result.data,
    loadError: result.error,
  };
};
