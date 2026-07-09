import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { actionPlatformAdminOrFail, isActionFailure } from '$lib/server/actions';
import { requireAuthToken, requirePlatformAdmin, serverApiJson } from '$lib/server/api';
import { runServerApiMutation } from '$lib/server/mutations';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('admin:users');
  const { token, user } = await parent();
  requireAuthToken(token);
  requirePlatformAdmin(user);

  const result = await serverApiJson<unknown[]>(fetch, token, '/api/admin/users');

  return {
    users: result.data ?? [],
    loadError: result.error,
  };
};

export const actions = {
  saveUser: async ({ request, cookies, fetch }) => {
    const auth = await actionPlatformAdminOrFail(fetch, cookies);
    if (isActionFailure(auth)) return auth;
    const { token } = auth;

    const fd = await request.formData();
    const mode = fd.get('mode')?.toString();
    const id = fd.get('id')?.toString();
    const payloadRaw = fd.get('payload')?.toString();
    if (!payloadRaw) return fail(400, { error: 'Neplatné údaje.' });

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return fail(400, { error: 'Neplatné údaje.' });
    }

    let mutation;
    if (mode === 'create') {
      mutation = await runServerApiMutation(fetch, token, '/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else if (mode === 'update' && id) {
      mutation = await runServerApiMutation(fetch, token, `/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      return fail(400, { error: 'Neplatná operácia.' });
    }

    if (isActionFailure(mutation)) return mutation;

    return { success: true };
  },

  deleteUser: async ({ request, cookies, fetch }) => {
    const auth = await actionPlatformAdminOrFail(fetch, cookies);
    if (isActionFailure(auth)) return auth;
    const { token } = auth;

    const id = (await request.formData()).get('id')?.toString();
    if (!id) return fail(400, { error: 'Chýba ID používateľa.' });

    const mutation = await runServerApiMutation(fetch, token, `/api/admin/users/${id}`, {
      method: 'DELETE',
    });
    if (isActionFailure(mutation)) return mutation;

    return { success: true };
  },
};
