import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isActionFailure, platformAdminOrFail, sessionTokenOrFail } from '$lib/server/actions';
import { requireAuthToken, requirePlatformAdmin, serverApiJson } from '$lib/server/api';
import { runServerApiMutation } from '$lib/server/mutations';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('admin:auth');
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);

  const result = await serverApiJson<Record<string, unknown>>(fetch, token, '/api/admin/auth-settings');

  return {
    authSettings: result.data,
    loadError: result.error,
  };
};

export const actions = {
  saveSettings: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    const denied = platformAdminOrFail(user);
    if (denied) return denied;

    const token = sessionTokenOrFail(cookies);
    if (isActionFailure(token)) return token;

    const payloadRaw = (await request.formData()).get('payload')?.toString();
    if (!payloadRaw) return fail(400, { error: 'Neplatné údaje.' });

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return fail(400, { error: 'Neplatné údaje.' });
    }

    const mutation = await runServerApiMutation(fetch, token, '/api/admin/auth-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (isActionFailure(mutation)) return mutation;

    const refreshed = await serverApiJson<Record<string, unknown>>(fetch, token, '/api/admin/auth-settings');
    if (refreshed.error) return fail(503, { error: refreshed.error });

    return { success: true, authSettings: refreshed.data };
  },
};
