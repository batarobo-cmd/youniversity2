import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/session';
import { readStudentViewCookie } from '$lib/server/api';
import { STUDENT_VIEW_DEPENDS } from '$lib/student-view';
import { dev } from '$app/environment';
import { execSync } from 'node:child_process';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_MAX_AGE = 60 * 60; // 1 hodina
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

function isAuthPath(pathname: string) {
  return pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/');
}

function resolveAppVersion() {
  // In local dev, resolve Git SHA on each request so new commits appear immediately.
  if (dev) {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      // fall through to build-time version
    }
  }
  return import.meta.env.VITE_APP_VERSION || 'dev';
}

async function fetchSessionUser(sessionId: string, fetch: typeof globalThis.fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${sessionId}` },
      });
      if (res.ok) return await res.json();
      if (res.status === 401) return { unauthorized: true as const };
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 120));
    }
  }
  return null;
}

export const load: LayoutServerLoad = async ({ cookies, url, fetch, depends }) => {
  depends(STUDENT_VIEW_DEPENDS);
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
    const result = await fetchSessionUser(sessionId, fetch);
    if (result && 'unauthorized' in result) {
      cookies.delete(SESSION_COOKIE, { path: '/', secure: COOKIE_SECURE, sameSite: 'lax' });
      redirect(303, '/');
    }
    if (result && !('unauthorized' in result)) {
      user = result;
      cookies.set(SESSION_COOKIE, sessionId, {
        path: '/',
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
      });
    }
  }

  return {
    token: sessionId,
    user,
    isAuthPage: isAuthPath(pathname),
    appVersion: resolveAppVersion(),
    studentViewMode: readStudentViewCookie(cookies),
  };
};
