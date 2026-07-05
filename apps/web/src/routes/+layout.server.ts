import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_MAX_AGE = 60 * 60; // 1 hodina

function isAuthPath(pathname: string) {
  return pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/');
}

export const load: LayoutServerLoad = async ({ cookies, url, fetch }) => {
  const sessionId = cookies.get(SESSION_COOKIE) ?? null;
  const pathname = url.pathname;

  if (sessionId && isAuthPath(pathname)) {
    redirect(303, '/dashboard');
  }

  if (!sessionId && !isAuthPath(pathname)) {
    redirect(303, '/');
  }

  let user = null;
  if (sessionId) {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${sessionId}` },
      });
      if (res.ok) {
        user = await res.json();
        // Obnov cookie TTL pri každom SSR requeste
        cookies.set(SESSION_COOKIE, sessionId, {
          path: '/',
          maxAge: SESSION_MAX_AGE,
          httpOnly: true,
          sameSite: 'lax',
        });
      } else {
        cookies.delete(SESSION_COOKIE, { path: '/' });
        redirect(303, '/');
      }
    } catch {
      // API nedostupné — nechaj prejsť
    }
  }

  return { token: sessionId, user, isAuthPage: isAuthPath(pathname) };
};
