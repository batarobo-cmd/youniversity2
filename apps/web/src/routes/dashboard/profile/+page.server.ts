import type { PageServerLoad } from './$types';
import { actionUserOrFail, isActionFailure } from '$lib/server/actions';
import { fail } from '@sveltejs/kit';
import type { User } from '@youniversity2/shared';
import { requireAuthToken, serverApiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ parent }) => {
  const { token, user } = await parent();
  requireAuthToken(token);
  return { profileUser: user };
};

export const actions = {
  saveProfile: async ({ request, cookies, fetch }) => {
    const auth = await actionUserOrFail(fetch, cookies);
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

    try {
      const res = await serverApiFetch(fetch, token, '/api/dashboard/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return fail(res.status, {
          error: (err as { error?: string }).error ?? `Chyba ${res.status}`,
        });
      }
      const user = (await res.json()) as User;
      return { success: true, user };
    } catch {
      return fail(503, { error: 'Nepodarilo sa spojiť so serverom.' });
    }
  },
};
