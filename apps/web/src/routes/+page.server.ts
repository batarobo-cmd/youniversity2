import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { SESSION_COOKIE } from '$lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_MAX_AGE = 60 * 60;

function setSessionCookie(cookies: import('@sveltejs/kit').Cookies, sessionId: string) {
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
  });
  cookies.delete('yo2_token', { path: '/' });
}

export const actions = {
  login: async ({ request, cookies }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { error: 'Vyplňte e-mail a heslo', email });
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return fail(503, {
        error: 'Nepodarilo sa spojiť so serverom. Spustite API (bun run dev) a Docker.',
        email,
      });
    }

    const body = await res.json().catch(() => ({ error: 'Prihlásenie zlyhalo' }));

    if (!res.ok) {
      return fail(res.status, {
        error: (body as { error?: string }).error ?? 'Prihlásenie zlyhalo',
        email,
      });
    }

    const { sessionId } = body as { sessionId: string };
    setSessionCookie(cookies, sessionId);
    redirect(303, '/dashboard');
  },

  register: async ({ request, cookies }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();

    if (!email || !password || !name) {
      return fail(400, { error: 'Vyplňte všetky polia' });
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, preferredLocale: 'sk' }),
      });
    } catch {
      return fail(503, { error: 'Nepodarilo sa spojiť so serverom.' });
    }

    const body = await res.json().catch(() => ({ error: 'Registrácia zlyhala' }));
    if (!res.ok) {
      return fail(res.status, { error: (body as { error?: string }).error ?? 'Registrácia zlyhala' });
    }

    const { sessionId } = body as { sessionId: string };
    setSessionCookie(cookies, sessionId);
    redirect(303, '/dashboard');
  },
} satisfies Actions;
