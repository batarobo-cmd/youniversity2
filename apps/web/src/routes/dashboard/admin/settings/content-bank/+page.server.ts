import type { PageServerLoad } from './$types';
import { handleApiMutation, handleApiQuery } from '$lib/server/api-action';
import { requireAuthToken, requirePlatformAdmin } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);
  return {};
};

export const actions = {
  apiQuery: ({ cookies, fetch, request }) =>
    handleApiQuery(fetch, cookies, request, 'platformAdmin'),
  apiMutation: ({ cookies, fetch, request }) =>
    handleApiMutation(fetch, cookies, request, 'platformAdmin'),
};
