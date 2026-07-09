import { fail, isActionFailure } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { ActionFailure } from '@sveltejs/kit';
import type { User } from '@youniversity2/shared';
import { SESSION_COOKIE } from '$lib/session';
import { serverApiJson } from '$lib/server/api';

export { isActionFailure };

export function sessionTokenOrFail(cookies: Cookies) {
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return fail(401, { error: 'Relácia vypršala. Prihláste sa znova.' });
  return token;
}

export function platformAdminOrFail(user: User | null | undefined) {
  if (user?.role !== 'admin') return fail(403, { error: 'Nedostatočné oprávnenie.' });
}

export function adminOrFail(user: User | null | undefined) {
  if (user?.role !== 'admin' && user?.role !== 'instructor') {
    return fail(403, { error: 'Nedostatočné oprávnenie.' });
  }
}

export type ActionAuth = { token: string; user: User };

async function actionUserOrFail(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
): Promise<ActionFailure<{ error?: string }> | ActionAuth> {
  const token = sessionTokenOrFail(cookies);
  if (isActionFailure(token)) return token;

  const me = await serverApiJson<User>(fetch, token, '/api/auth/me');
  if (me.error || !me.data) {
    return fail(401, { error: me.error ?? 'Relácia vypršala. Prihláste sa znova.' });
  }

  return { token, user: me.data };
}

/** Auth check for form actions — parent() is not available in actions. */
export async function actionPlatformAdminOrFail(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
): Promise<ActionFailure<{ error?: string }> | ActionAuth> {
  const auth = await actionUserOrFail(fetch, cookies);
  if (isActionFailure(auth)) return auth;
  if (auth.user.role !== 'admin') return fail(403, { error: 'Nedostatočné oprávnenie.' });
  return auth;
}

/** Auth check for form actions — parent() is not available in actions. */
export async function actionAdminOrFail(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
): Promise<ActionFailure<{ error?: string }> | ActionAuth> {
  const auth = await actionUserOrFail(fetch, cookies);
  if (isActionFailure(auth)) return auth;
  if (auth.user.role !== 'admin' && auth.user.role !== 'instructor') {
    return fail(403, { error: 'Nedostatočné oprávnenie.' });
  }
  return auth;
}
