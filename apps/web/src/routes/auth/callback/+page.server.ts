import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/session';

const SESSION_MAX_AGE = 60 * 60;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

export const load: PageServerLoad = async ({ url, cookies }) => {
  const sessionId = url.searchParams.get('session');
  if (!sessionId) {
    redirect(303, '/?error=oauth_failed');
  }

  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
  });

  redirect(303, '/dashboard');
};
