import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { actionPlatformAdminOrFail, isActionFailure } from '$lib/server/actions';
import { requireAuthToken, requirePlatformAdmin, serverApiJson } from '$lib/server/api';
import { runServerApiMutation } from '$lib/server/mutations';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('admin:system');
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);

  const result = await serverApiJson<{ commandPaletteEnabled: boolean }>(
    fetch,
    token,
    '/api/admin/system-settings',
  );

  return {
    systemSettings: result.data,
    loadError: result.error,
  };
};

export const actions = {
  saveSettings: async ({ request, cookies, fetch }) => {
    const auth = await actionPlatformAdminOrFail(fetch, cookies);
    if (isActionFailure(auth)) return auth;
    const { token } = auth;

    const payloadRaw = (await request.formData()).get('payload')?.toString();
    if (!payloadRaw) return fail(400, { error: 'Neplatné údaje.' });

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return fail(400, { error: 'Neplatné údaje.' });
    }

    const mutation = await runServerApiMutation(fetch, token, '/api/admin/system-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (isActionFailure(mutation)) return mutation;

    return { success: true };
  },
};
