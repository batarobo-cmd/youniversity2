import { fail } from '@sveltejs/kit';
import { serverApiFetch } from '$lib/server/api';

export async function runServerApiMutation(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  try {
    const res = await serverApiFetch(fetch, token, path, init);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return fail(res.status, {
        error: (err as { error?: string }).error ?? `Chyba ${res.status}`,
      });
    }
    return { success: true as const };
  } catch {
    return fail(503, { error: 'Nepodarilo sa spojiť so serverom.' });
  }
}
