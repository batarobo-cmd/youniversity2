import type { LayoutServerLoad } from './$types';
import { requireAuthToken, requirePlatformAdmin } from '$lib/server/api';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);
  return {};
};
