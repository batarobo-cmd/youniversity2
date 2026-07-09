import { fail } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { ActionFailure } from '@sveltejs/kit';
import type { User } from '@youniversity2/shared';
import { SESSION_COOKIE } from '$lib/session';

export function isActionFailure(result: unknown): result is ActionFailure<{ error?: string }> {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { type?: string }).type === 'failure'
  );
}

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
